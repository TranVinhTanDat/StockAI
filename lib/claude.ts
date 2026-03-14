import Anthropic from '@anthropic-ai/sdk'
import type { AnalysisResult } from '@/types'

function getClient(): Anthropic {
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY is not set')
  }
  return new Anthropic({ apiKey })
}

function sanitizeJSON(s: string): string {
  return s
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // curly double quotes → "
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // curly single quotes → '
    .replace(/,(\s*[}\]])/g, '$1')                 // trailing commas
    .replace(/\/\/[^\n]*/g, '')                    // line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')              // block comments
}

function extractJSONObject(text: string): string {
  // 1. Try direct parse (with sanitize)
  try { const t = sanitizeJSON(text.trim()); JSON.parse(t); return t } catch {}
  // 2. Code block with json tag
  const cb = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (cb) { try { const t = sanitizeJSON(cb[1]); JSON.parse(t); return t } catch {} }
  // 3. Any code block
  const cb2 = text.match(/```\s*([\s\S]*?)\s*```/)
  if (cb2) { try { const t = sanitizeJSON(cb2[1]); JSON.parse(t); return t } catch {} }
  // 4. Find outermost { ... } — handle nested braces
  let depth = 0, start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++ }
    else if (text[i] === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        const slice = sanitizeJSON(text.slice(start, i + 1))
        try { JSON.parse(slice); return slice } catch {}
        // reset and keep searching
        start = -1
      }
    }
  }
  throw new Error('Claude did not return valid JSON')
}

function extractJSONArray(text: string): string {
  // 1. Direct parse
  try { const t = sanitizeJSON(text.trim()); JSON.parse(t); return t } catch {}
  // 2. Code block
  const cb = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (cb) { try { const t = sanitizeJSON(cb[1]); JSON.parse(t); return t } catch {} }
  // 3. Find outermost [ ... ]
  let depth = 0, start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '[') { if (depth === 0) start = i; depth++ }
    else if (text[i] === ']') {
      depth--
      if (depth === 0 && start !== -1) {
        const slice = sanitizeJSON(text.slice(start, i + 1))
        try { JSON.parse(slice); return slice } catch {}
        start = -1
      }
    }
  }
  throw new Error('Claude did not return valid JSON array')
}

interface CurrentHolding {
  qty: number
  avgCost: number
  totalCost: number
}

interface AnalysisContext {
  symbol: string
  price: number
  changePct: number
  sma20: number
  sma50: number
  rsi: number
  macd: number
  signal: number
  bbUpper: number
  bbMid: number
  bbLower: number
  pe: number
  eps: number
  roe: number
  revenueGrowth: number
  profitGrowth: number
  debtEquity: number
  dividendYield: number
  tcbsRating: number
  tcbsRecommend: string
  topNews: Array<{ title: string; sentiment: number }>
  avgSentiment: number
  currentHolding?: CurrentHolding | null
}

export async function analyzeStock(
  ctx: AnalysisContext
): Promise<AnalysisResult> {
  const client = getClient()

  const bbPosition =
    ctx.bbUpper !== ctx.bbLower
      ? (
          ((ctx.price - ctx.bbLower) / (ctx.bbUpper - ctx.bbLower)) *
          100
        ).toFixed(0)
      : '50'

  const newsText = ctx.topNews
    .map(
      (n, i) =>
        `${i + 1}. ${n.title} [${n.sentiment > 0 ? '+' : ''}${n.sentiment}]`
    )
    .join('\n')

  const prompt = `Phân tích cổ phiếu ${ctx.symbol}:

GIÁ & KỸ THUẬT:
Giá: ${ctx.price}₫ | Thay đổi: ${ctx.changePct > 0 ? '+' : ''}${ctx.changePct.toFixed(2)}%
SMA20: ${ctx.sma20} | SMA50: ${ctx.sma50}
→ Giá ${ctx.price > ctx.sma20 ? 'TRÊN' : 'DƯỚI'} SMA20, ${ctx.price > ctx.sma50 ? 'TRÊN' : 'DƯỚI'} SMA50
RSI(14): ${ctx.rsi.toFixed(1)}
→ ${ctx.rsi > 70 ? 'QUÁ MUA' : ctx.rsi < 30 ? 'QUÁ BÁN' : 'TRUNG LẬP'}
MACD: ${ctx.macd.toFixed(2)} | Signal: ${ctx.signal.toFixed(2)}
→ ${ctx.macd > ctx.signal ? 'BULLISH' : 'BEARISH'} cross
BB: Upper=${ctx.bbUpper} Mid=${ctx.bbMid} Lower=${ctx.bbLower}
→ Giá ở ${bbPosition}% dải BB

CƠ BẢN (năm gần nhất):
P/E: ${ctx.pe.toFixed(1)} | EPS: ${ctx.eps}₫ | ROE: ${ctx.roe.toFixed(1)}%
Tăng trưởng DT: ${ctx.revenueGrowth.toFixed(1)}% | LN: ${ctx.profitGrowth.toFixed(1)}%
Debt/Equity: ${ctx.debtEquity.toFixed(2)} | Cổ tức: ${ctx.dividendYield.toFixed(1)}%
TCBS Rating: ${ctx.tcbsRating}/5 (${ctx.tcbsRecommend})

TIN TỨC 7 NGÀY:
${newsText || 'Không có tin nổi bật'}
Sentiment TB: ${ctx.avgSentiment.toFixed(0)}/100
${ctx.currentHolding ? `
DANH MỤC NHÀ ĐẦU TƯ:
Đang nắm giữ: ${ctx.currentHolding.qty.toLocaleString()} CP
Giá vốn TB: ${ctx.currentHolding.avgCost.toLocaleString()}₫
Tổng đầu tư: ${ctx.currentHolding.totalCost.toLocaleString()}₫
Lãi/lỗ chưa thực hiện: ${ctx.price > 0 ? ((ctx.price - ctx.currentHolding.avgCost) / ctx.currentHolding.avgCost * 100).toFixed(1) : 0}%
→ Phân tích hành động phù hợp dựa trên vị thế hiện tại: chốt lời một phần, giữ nguyên, hay tăng thêm.` : ''}
Trả về JSON:
{
  "recommendation": "MUA MẠNH|MUA|GIỮ|BÁN|BÁN MẠNH",
  "confidence": 75,
  "targetPrice": 95000,
  "stopLoss": 76000,
  "entryZone": {"low": 83000, "high": 86000},
  "holdingPeriod": "3-6 tháng",
  "technicalScore": 8,
  "fundamentalScore": 7,
  "sentimentScore": 6,
  "technical": "80 từ phân tích kỹ thuật",
  "fundamental": "80 từ phân tích cơ bản",
  "sentiment": "50 từ nhận định tâm lý",
  "pros": ["lý do 1", "lý do 2", "lý do 3"],
  "risks": ["rủi ro 1", "rủi ro 2"],
  "action": "40 từ hành động cụ thể nên làm ngay",
  "nextReview": "điều kiện hoặc thời điểm xem lại"
}`

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1500,
    system:
      'Bạn là chuyên gia phân tích chứng khoán CFA chuyên thị trường Việt Nam, 20 năm kinh nghiệm. Phân tích khách quan dựa trên số liệu thực tế. Luôn trả về JSON hợp lệ, không có text ngoài JSON.',
    messages: [{ role: 'user', content: prompt }],
  })

  const firstBlock = response.content?.[0]
  const text = firstBlock && firstBlock.type === 'text' ? firstBlock.text : ''

  if (!text) throw new Error('Claude returned empty response')

  return JSON.parse(extractJSONObject(text)) as AnalysisResult
}

interface OptimizeContext {
  holdings: Array<{
    symbol: string
    qty: number
    avgCost: number
    currentPrice: number
    industry: string
    weight: number
    pnlPct: number
  }>
  totalValue: number
}

export async function optimizePortfolio(
  ctx: OptimizeContext
): Promise<{ analysis: string; suggestions: string[]; rebalancePlan: string }> {
  const client = getClient()

  const holdingsText = ctx.holdings
    .map(
      (h) =>
        `${h.symbol} (${h.industry}): ${h.qty} CP, Giá vốn ${h.avgCost}₫, Giá hiện ${h.currentPrice}₫, Tỷ trọng ${h.weight.toFixed(1)}%, Lãi/lỗ ${h.pnlPct > 0 ? '+' : ''}${h.pnlPct.toFixed(1)}%`
    )
    .join('\n')

  const prompt = `Phân tích và tối ưu danh mục đầu tư:

DANH MỤC HIỆN TẠI (Tổng: ${ctx.totalValue.toLocaleString('vi-VN')}₫):
${holdingsText}

Trả về JSON:
{
  "analysis": "Nhận xét tổng quan về danh mục 100 từ",
  "suggestions": ["gợi ý 1", "gợi ý 2", "gợi ý 3", "gợi ý 4"],
  "rebalancePlan": "Kế hoạch tái cơ cấu cụ thể 100 từ"
}`

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1000,
    system:
      'Bạn là chuyên gia quản lý danh mục đầu tư CFA chuyên thị trường Việt Nam. Tư vấn khách quan. CHỈ trả về JSON thuần túy, KHÔNG có bất kỳ text nào khác, KHÔNG có markdown, KHÔNG có giải thích. Bắt đầu ngay bằng dấu { và kết thúc bằng dấu }.',
    messages: [{ role: 'user', content: prompt }],
  })

  const firstBlock2 = response.content?.[0]
  const text2 = firstBlock2 && firstBlock2.type === 'text' ? firstBlock2.text : ''

  if (!text2) throw new Error('Claude returned empty response')

  return JSON.parse(extractJSONObject(text2))
}

interface PredictStock {
  symbol: string
  price: number
  changePct: number
  pe: number
  eps: number
  roe: number
  revenueGrowth: number
  profitGrowth: number
  debtEquity: number
  rsi: number
  volume: number
}

interface PredictContext {
  style: 'safe' | 'balanced' | 'growth' | 'speculative'
  stocks: PredictStock[]
}

const STYLE_DESCRIPTIONS: Record<string, string> = {
  safe: 'Nhà đầu tư bảo thủ, an toàn: ưu tiên blue-chip, P/E < 15, ROE > 15%, D/E < 1, cổ tức > 3%, vốn hóa lớn, thanh khoản cao',
  balanced:
    'Nhà đầu tư cân bằng: P/E 10-20, ROE > 12%, tăng trưởng ổn định 10-20%, beta < 1.2',
  growth:
    'Nhà đầu tư tăng trưởng: ưu tiên tăng trưởng DT > 20%, LN > 15%, xu hướng kỹ thuật bullish, momentum mạnh',
  speculative:
    'Nhà đầu tư đầu cơ: RSI < 40 (quá bán), giá dưới SMA50, P/E thấp hơn ngành, tiềm năng phục hồi mạnh',
}

export async function predictStocks(
  ctx: PredictContext
): Promise<
  Array<{
    rank: number
    symbol: string
    score: number
    recommendation: string
    targetPrice: number
    currentPrice: number
    upsidePct: number
    reason: string
    keyMetrics: { pe: number; roe: number; growth: number }
    riskLevel: string
    entryZone: { low: number; high: number }
  }>
> {
  const client = getClient()

  const styleDesc = STYLE_DESCRIPTIONS[ctx.style] || STYLE_DESCRIPTIONS.balanced
  const timestamp = new Date().toLocaleString('vi-VN')

  const tableRows = ctx.stocks
    .map(
      (s, i) =>
        `${i + 1}. ${s.symbol} | ${s.price}₫ | ${s.changePct > 0 ? '+' : ''}${s.changePct.toFixed(1)}% | P/E:${s.pe.toFixed(1)} | EPS:${s.eps}₫ | ROE:${s.roe.toFixed(1)}% | DT_Growth:${s.revenueGrowth.toFixed(1)}% | LN_Growth:${s.profitGrowth.toFixed(1)}% | D/E:${s.debtEquity.toFixed(2)} | RSI:${s.rsi.toFixed(0)} | KL:${s.volume}`
    )
    .join('\n')

  const prompt = `DATA ${ctx.stocks.length} MÃ CỔ PHIẾU VN (${timestamp}):

${tableRows}

PHONG CÁCH ĐẦU TƯ: ${styleDesc}

Dựa trên data THẬT ở trên, chọn TOP 5-8 mã PHÙ HỢP NHẤT cho phong cách này.
Xếp hạng từ cao tới thấp. PHẢI dùng đúng tên field: "pe", "roe", "growth" trong keyMetrics.

Trả về JSON array:
[{
  "rank": 1,
  "symbol": "FPT",
  "score": 85,
  "recommendation": "MUA MẠNH",
  "targetPrice": 98000,
  "currentPrice": 85200,
  "upsidePct": 15.0,
  "reason": "50 từ phân tích tại sao mã này phù hợp dựa trên số liệu",
  "keyMetrics": {"pe": 18.5, "roe": 22.1, "growth": 25.3},
  "riskLevel": "THẤP",
  "entryZone": {"low": 83000, "high": 86000}
}]`

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    system:
      'Bạn là chuyên gia quản lý quỹ đầu tư CFA chuyên thị trường Việt Nam, 20 năm kinh nghiệm. Dựa trên data thật, chọn cổ phiếu tốt nhất. CHỈ trả về JSON array hợp lệ, KHÔNG có text nào khác.',
    messages: [{ role: 'user', content: prompt }],
  })

  const firstBlock = response.content?.[0]
  const text = firstBlock && firstBlock.type === 'text' ? firstBlock.text : ''

  if (!text) {
    throw new Error('Claude returned empty response')
  }

  return JSON.parse(extractJSONArray(text))
}
