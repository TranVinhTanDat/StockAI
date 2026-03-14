import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 45

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

async function tryFetchContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockAI/1.0)' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    // Skip PDFs — can't extract text easily
    if (ct.includes('pdf') || url.toLowerCase().endsWith('.pdf')) return null
    const html = await res.text()
    // Strip HTML tags and scripts
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
  if (!process.env.CLAUDE_API_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const { url, title, symbol, reportType, date } = await request.json()

  if (!title) {
    return NextResponse.json({ error: 'Missing title' }, { status: 400 })
  }

  // Try to fetch article content
  const articleContent = url ? await tryFetchContent(url) : null

  const hasContent = articleContent && articleContent.length > 200

  const prompt = hasContent
    ? `Phân tích báo cáo chứng khoán sau từ Vietcap Securities về mã ${symbol || 'N/A'}:

TIÊU ĐỀ: ${title}
LOẠI: ${reportType || 'Báo cáo phân tích'}
NGÀY: ${date || 'N/A'}

NỘI DUNG BÁO CÁO:
${articleContent}

Hãy phân tích chi tiết và trả về JSON:`
    : `Phân tích báo cáo chứng khoán từ Vietcap Securities:

TIÊU ĐỀ: ${title}
MÃ: ${symbol || 'N/A'}
LOẠI: ${reportType || 'Báo cáo phân tích'}
NGÀY: ${date || 'N/A'}

Dựa trên tiêu đề và loại báo cáo, hãy phân tích và trả về JSON:`

  const jsonTemplate = `{
  "summary": "Tóm tắt nội dung chính của báo cáo trong 2-3 câu",
  "keyPoints": ["Điểm quan trọng 1", "Điểm quan trọng 2", "Điểm quan trọng 3"],
  "recommendation": "MUA MẠNH | MUA | GIỮ | BÁN | BÁN MẠNH | KHÔNG RÕ",
  "targetPrice": null,
  "sentiment": "TÍCH CỰC | TRUNG TÍNH | TIÊU CỰC",
  "riskFactors": ["Rủi ro 1", "Rủi ro 2"],
  "catalysts": ["Động lực tăng 1", "Động lực tăng 2"],
  "conclusion": "Nhận xét tổng quan cho nhà đầu tư cá nhân trong 2-3 câu"
}`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: `Bạn là chuyên gia phân tích chứng khoán CFA Việt Nam. Phân tích báo cáo một cách khách quan, chính xác. CHỈ trả về JSON hợp lệ theo format được cung cấp, KHÔNG có text nào khác ngoài JSON.`,
      messages: [
        {
          role: 'user',
          content: `${prompt}\n\n${jsonTemplate}`,
        },
      ],
    })

    const block = response.content?.[0]
    const text = block?.type === 'text' ? block.text : ''
    if (!text) throw new Error('Empty response')

    // Extract JSON robustly
    let jsonStr = text.trim()
    const cb = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (cb) jsonStr = cb[1]
    else {
      // Find outermost { }
      let depth = 0, start = -1
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') { if (!depth) start = i; depth++ }
        else if (text[i] === '}') { depth--; if (!depth && start !== -1) { jsonStr = text.slice(start, i + 1); break } }
      }
    }

    const parsed = JSON.parse(jsonStr)
    return NextResponse.json({
      ...parsed,
      hasFullContent: hasContent,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
