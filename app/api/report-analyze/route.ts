import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '@/lib/requireAuth'

export const maxDuration = 45

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

/** Fetch PDF as base64. Transforms cafef.vn → cafefnew.mediacdn.vn CDN. */
async function fetchPdfBase64(url: string): Promise<string | null> {
  const pdfUrl = url.replace(/^https?:\/\/cafef\.vn\//i, 'https://cafefnew.mediacdn.vn/')
  try {
    const res = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockAI/1.0)' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength > 10 * 1024 * 1024) return null // skip >10MB
    return Buffer.from(buf).toString('base64')
  } catch {
    return null
  }
}

/** Fetch HTML page and extract clean text (for non-PDF URLs). */
async function fetchHtmlContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockAI/1.0)' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const html = await res.text()
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s{3,}/g, '\n\n')
      .trim()
      .slice(0, 6000)
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const { error } = await requireAuth(request)
  if (error) return error

  if (!process.env.CLAUDE_API_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const { url, title, symbol, reportType, date } = await request.json()

  if (!title) {
    return NextResponse.json({ error: 'Missing title' }, { status: 400 })
  }

  const isPdf = /\.pdf(\?.*)?$/i.test(url || '')

  // Try to get content: PDF first (via document API), then HTML
  let pdfBase64: string | null = null
  let htmlContent: string | null = null

  if (url) {
    if (isPdf) {
      pdfBase64 = await fetchPdfBase64(url)
    } else {
      htmlContent = await fetchHtmlContent(url)
    }
  }

  const hasContent = !!(pdfBase64 || (htmlContent && htmlContent.length > 200))

  const baseInfo = `Mã: ${symbol || 'N/A'} | Tiêu đề: ${title} | Loại: ${reportType || 'BCPT'} | Ngày: ${date || 'N/A'} | Nguồn: Vietcap/CafeF`

  const prompt = pdfBase64
    ? `Đọc toàn bộ file PDF báo cáo phân tích chứng khoán đính kèm và phân tích chuyên sâu.\n${baseInfo}`
    : hasContent
    ? `Phân tích báo cáo chứng khoán sau:\n${baseInfo}\n\nNỘI DUNG:\n${htmlContent}`
    : `Phân tích dựa trên tiêu đề báo cáo:\n${baseInfo}`

  const jsonTemplate = `{
  "summary": "Tóm tắt toàn diện 3-4 câu bao gồm: luận điểm chính, kết quả kinh doanh, triển vọng",
  "keyPoints": ["≥4 điểm phân tích quan trọng với số liệu cụ thể"],
  "recommendation": "MUA MẠNH | MUA | GIỮ | BÁN | BÁN MẠNH | KHÔNG RÕ",
  "targetPrice": 0,
  "sentiment": "TÍCH CỰC | TRUNG TÍNH | TIÊU CỰC",
  "riskFactors": ["≥3 rủi ro cụ thể với tác động định lượng nếu có"],
  "catalysts": ["≥3 động lực tăng giá cụ thể"],
  "conclusion": "Nhận xét tổng quan cho nhà đầu tư: nên làm gì, cần chú ý gì, thời điểm nào"
}`

  try {
    const userContent: Anthropic.MessageParam['content'] = pdfBase64
      ? [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          } as Anthropic.DocumentBlockParam,
          { type: 'text', text: `${prompt}\n\nTrả về JSON theo format:\n${jsonTemplate}` },
        ]
      : `${prompt}\n\nTrả về JSON theo format:\n${jsonTemplate}`

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      system: `Bạn là chuyên gia phân tích chứng khoán CFA Vietnam với 15 năm kinh nghiệm. Phân tích báo cáo một cách khách quan, chính xác, chuyên sâu với số liệu cụ thể. Nếu có file PDF đính kèm, hãy đọc toàn bộ nội dung và phân tích chi tiết. CHỈ trả về JSON hợp lệ theo format, KHÔNG có text nào khác.`,
      messages: [{ role: 'user', content: userContent }],
    })

    const block = response.content?.[0]
    const text = block?.type === 'text' ? block.text : ''
    if (!text) throw new Error('Empty response')

    let jsonStr = ''
    const cb = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (cb) jsonStr = cb[1].trim()
    if (!jsonStr) {
      let depth = 0, start = -1
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') { if (!depth) start = i; depth++ }
        else if (text[i] === '}') { depth--; if (!depth && start !== -1) { jsonStr = text.slice(start, i + 1); break } }
      }
    }
    if (!jsonStr) throw new Error('Không thể trích xuất JSON')

    const parsed = JSON.parse(jsonStr)
    return NextResponse.json({
      ...parsed,
      hasFullContent: hasContent,
      readPdf: !!pdfBase64,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
