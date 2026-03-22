import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '@/lib/requireAuth'

export const maxDuration = 60

function getClient() {
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) throw new Error('CLAUDE_API_KEY is not set')
  return new Anthropic({ apiKey })
}

/** Fetch PDF as base64. Transforms cafef.vn → cafefnew.mediacdn.vn CDN. */
async function fetchPdfBase64(url: string): Promise<string | null> {
  const pdfUrl = url.replace(/^https?:\/\/cafef\.vn\//i, 'https://cafefnew.mediacdn.vn/')
  try {
    const res = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockAI/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength > 1.5 * 1024 * 1024) return null // skip >1.5MB
    return Buffer.from(buf).toString('base64')
  } catch {
    return null
  }
}

/** Fetch HTML page and extract clean text. */
async function fetchHtmlContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const cleaned = html
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
    return cleaned.length > 300 ? cleaned : null
  } catch {
    return null
  }
}

// ── Recommendation normalizer ──────────────────────────────────────────────────
const REC_MAP: Record<string, string> = {
  'MUA MẠNH': 'MUA MẠNH', 'MUA': 'MUA', 'GIỮ': 'GIỮ', 'BÁN': 'BÁN', 'BÁN MẠNH': 'BÁN MẠNH',
  'KHẢ QUAN': 'MUA', 'TÍCH CỰC': 'MUA', 'TRUNG LẬP': 'GIỮ', 'TRUNG TÍNH': 'GIỮ', 'KÉM KHẢ QUAN': 'BÁN',
  'OUTPERFORM': 'MUA', 'OVERWEIGHT': 'MUA', 'BUY': 'MUA MẠNH', 'STRONG BUY': 'MUA MẠNH',
  'ADD': 'MUA', 'ACCUMULATE': 'MUA',
  'NEUTRAL': 'GIỮ', 'HOLD': 'GIỮ', 'MARKET PERFORM': 'GIỮ', 'EQUAL WEIGHT': 'GIỮ',
  'UNDERPERFORM': 'BÁN', 'UNDERWEIGHT': 'BÁN', 'SELL': 'BÁN MẠNH', 'REDUCE': 'BÁN',
}

/**
 * Parse structured metadata from report titles. Handles:
 * 1. "[ACB/MUA +26.9%/ Giá MT: VND 30,400] - Theme"   (bracket format)
 * 2. "ACB - OUTPERFORM - Theme"                          (dash format)
 * 3. "ACB [BUY, TP: 45,000] Theme"                      (mixed)
 */
function parseTitleMetadata(title: string, symbolHint?: string) {
  const result = {
    ticker: symbolHint || '',
    recommendation: '',
    targetPrice: null as number | null,
    upside: '',
    theme: title,
  }

  const t = title.trim()
  const tUp = t.toUpperCase()

  // Extract ticker from bracket or dash format
  const bracketTicker = t.match(/\[([A-Z]{2,5})\s*[/|-]/)
  if (bracketTicker) result.ticker = bracketTicker[1]
  if (!result.ticker) {
    const dashTicker = t.match(/^([A-Z]{2,5})\s*[-–—]/)
    if (dashTicker) result.ticker = dashTicker[1]
  }
  if (!result.ticker && symbolHint) result.ticker = symbolHint

  // Match recommendation (longest keys first to avoid partial matches)
  const recKeys = Object.keys(REC_MAP).sort((a, b) => b.length - a.length)
  for (const key of recKeys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(tUp)) {
      result.recommendation = REC_MAP[key]
      break
    }
  }

  // Upside/downside percentage
  const upsideMatch = t.match(/([+-]\d+\.?\d*)\s*%/)
  if (upsideMatch) result.upside = upsideMatch[1] + '%'

  // Target price
  const tpMatch = t.match(
    /(?:Giá MT[:\s]+|TP[:\s]+|Target[:\s]+|Giá mục tiêu[:\s]+)(?:VND|vnd)?\s*([\d,.]+)/i
  )
  if (tpMatch) {
    result.targetPrice = parseInt(tpMatch[1].replace(/[.,]/g, '')) || null
  }

  // Theme (text after bracket block or after second dash)
  const themeMatch = t.match(/\]\s*[-–—]?\s*(.+)$/) ||
                     t.match(/^[A-Z]{2,5}\s*[-–—]\s*(?:[A-Z\s]+)[-–—]\s*(.+)$/i)
  if (themeMatch) result.theme = themeMatch[1].trim()

  return result
}

// ── Tool schema for structured output ─────────────────────────────────────────
const ANALYZE_TOOL: Anthropic.Tool = {
  name: 'analyze_report',
  description: 'Output a structured analysis of a Vietnamese stock analyst report',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: {
        type: 'string',
        description: 'Tóm tắt 3-4 câu về luận điểm chính, kết quả kinh doanh và triển vọng của công ty',
      },
      keyPoints: {
        type: 'array',
        items: { type: 'string' },
        description: '4-5 điểm phân tích quan trọng có số liệu cụ thể (tỷ lệ tăng trưởng, NIM, ROE, v.v.)',
      },
      recommendation: {
        type: 'string',
        enum: ['MUA MẠNH', 'MUA', 'GIỮ', 'BÁN', 'BÁN MẠNH', 'KHÔNG RÕ'],
        description: 'Khuyến nghị đầu tư',
      },
      targetPrice: {
        type: 'number',
        description: 'Giá mục tiêu tính bằng VND (ví dụ: 30400 hoặc 30400000). Nếu không có thì để 0',
      },
      sentiment: {
        type: 'string',
        enum: ['TÍCH CỰC', 'TRUNG TÍNH', 'TIÊU CỰC'],
        description: 'Quan điểm tổng thể về cổ phiếu',
      },
      riskFactors: {
        type: 'array',
        items: { type: 'string' },
        description: '3-4 rủi ro cụ thể với tác động định lượng nếu có',
      },
      catalysts: {
        type: 'array',
        items: { type: 'string' },
        description: '3-4 động lực tăng giá cụ thể trong 6-12 tháng tới',
      },
      conclusion: {
        type: 'string',
        description: 'Nhận xét tổng quan cho nhà đầu tư: nên làm gì, thời điểm nào, rủi ro cần theo dõi',
      },
    },
    required: ['summary', 'keyPoints', 'recommendation', 'targetPrice', 'sentiment', 'riskFactors', 'catalysts', 'conclusion'],
  },
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

  let pdfBase64: string | null = null
  let htmlContent: string | null = null

  if (url) {
    if (isPdf) {
      pdfBase64 = await fetchPdfBase64(url)
    } else {
      htmlContent = await fetchHtmlContent(url)
    }
  }

  const hasContent = !!(pdfBase64 || htmlContent)

  // Parse structured metadata from the title
  const meta = parseTitleMetadata(title, symbol)
  const effectiveSymbol = meta.ticker || symbol || 'N/A'

  // Build context block
  const contextLines: string[] = [
    `Mã chứng khoán: ${effectiveSymbol}`,
    `Tiêu đề báo cáo: ${title}`,
    `Nguồn phân tích: ${reportType || 'Công ty chứng khoán'}`,
    `Ngày phát hành: ${date || 'N/A'}`,
  ]
  if (meta.recommendation) contextLines.push(`Khuyến nghị (trích từ tiêu đề): ${meta.recommendation}`)
  if (meta.upside)          contextLines.push(`Upside/Downside: ${meta.upside}`)
  if (meta.targetPrice)     contextLines.push(`Giá mục tiêu: ${meta.targetPrice.toLocaleString('vi-VN')} VND`)
  if (meta.theme !== title) contextLines.push(`Chủ đề chính: ${meta.theme}`)

  const contextBlock = contextLines.join('\n')

  let prompt: string
  if (pdfBase64) {
    prompt = `Đọc toàn bộ file PDF báo cáo phân tích chứng khoán đính kèm và phân tích chi tiết.\n\nThông tin báo cáo:\n${contextBlock}`
  } else if (hasContent) {
    prompt = `Phân tích báo cáo chứng khoán dưới đây.\n\nThông tin báo cáo:\n${contextBlock}\n\nNỘI DUNG TRANG:\n${htmlContent}`
  } else {
    prompt = `Là chuyên gia phân tích chứng khoán CFA Vietnam, hãy phân tích chuyên sâu và chi tiết về cổ phiếu ${effectiveSymbol} dựa trên thông tin sau:

${contextBlock}

Sử dụng kiến thức của bạn về ${effectiveSymbol}, tình hình tài chính, ngành nghề kinh doanh và thị trường Việt Nam để cung cấp phân tích toàn diện. Đưa ra các luận điểm cụ thể về định giá, tăng trưởng, rủi ro và cơ hội đầu tư.`
  }

  try {
    const userContent: Anthropic.MessageParam['content'] = pdfBase64
      ? [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          } as Anthropic.DocumentBlockParam,
          { type: 'text', text: prompt },
        ]
      : prompt

    // Use tool_use to guarantee structured JSON output — no string parsing needed
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: `Bạn là chuyên gia phân tích chứng khoán CFA Vietnam với 15 năm kinh nghiệm. Phân tích khách quan, chuyên sâu với số liệu cụ thể. Luôn sử dụng tool analyze_report để output kết quả phân tích.`,
      tools: [ANALYZE_TOOL],
      tool_choice: { type: 'tool', name: 'analyze_report' },
      messages: [{ role: 'user', content: userContent }],
    })

    // Extract from tool_use block — always valid JSON, no parsing needed
    const toolUseBlock = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (!toolUseBlock?.input) {
      return NextResponse.json(buildFallback(effectiveSymbol, title, reportType, meta, hasContent))
    }

    const parsed = toolUseBlock.input as Record<string, unknown>

    // Override with title metadata if Claude missed them
    if ((!parsed.recommendation || parsed.recommendation === 'KHÔNG RÕ') && meta.recommendation) {
      parsed.recommendation = meta.recommendation
    }
    if ((!parsed.targetPrice || parsed.targetPrice === 0) && meta.targetPrice) {
      parsed.targetPrice = meta.targetPrice
    }
    // Auto-derive sentiment from recommendation
    if (!parsed.sentiment || parsed.sentiment === 'TRUNG TÍNH') {
      const rec = String(parsed.recommendation || '')
      if (rec.includes('MUA')) parsed.sentiment = 'TÍCH CỰC'
      else if (rec.includes('BÁN')) parsed.sentiment = 'TIÊU CỰC'
    }

    return NextResponse.json({ ...parsed, hasFullContent: hasContent, readPdf: !!pdfBase64 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function buildFallback(
  sym: string,
  title: string,
  reportType: string | undefined,
  meta: ReturnType<typeof parseTitleMetadata>,
  hasContent: boolean
) {
  const rec = meta.recommendation || 'KHÔNG RÕ'
  const sentiment = rec === 'MUA' || rec === 'MUA MẠNH' ? 'TÍCH CỰC'
    : rec === 'BÁN' || rec === 'BÁN MẠNH' ? 'TIÊU CỰC' : 'TRUNG TÍNH'

  return {
    summary: meta.recommendation
      ? `${sym}: Khuyến nghị ${rec}${meta.upside ? ` với tiềm năng ${meta.upside}` : ''}${meta.targetPrice ? `, giá mục tiêu ${meta.targetPrice.toLocaleString('vi-VN')} VND` : ''}. ${meta.theme !== title ? meta.theme : ''}`
      : `Báo cáo phân tích ${sym} từ ${reportType || 'công ty chứng khoán'}. ${meta.theme !== title ? `Chủ đề: ${meta.theme}` : title}`,
    keyPoints: [
      meta.recommendation ? `Khuyến nghị: ${rec}` : `Tiêu đề: ${title}`,
      meta.targetPrice ? `Giá mục tiêu: ${meta.targetPrice.toLocaleString('vi-VN')} VND` : 'Xem chi tiết tại báo cáo gốc',
      meta.upside ? `Upside/Downside: ${meta.upside}` : '',
      meta.theme !== title ? `Luận điểm: ${meta.theme}` : '',
    ].filter(Boolean),
    recommendation: rec,
    targetPrice: meta.targetPrice || null,
    sentiment,
    riskFactors: [],
    catalysts: [],
    conclusion: `Xem bản gốc để có phân tích đầy đủ về ${sym}.`,
    hasFullContent: hasContent,
    readPdf: false,
    fromTitleOnly: true,
  }
}
