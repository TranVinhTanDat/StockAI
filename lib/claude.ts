import Anthropic from '@anthropic-ai/sdk'
import type { AnalysisResult } from '@/types'

function getClient(): Anthropic {
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY is not set')
  }
  return new Anthropic({ apiKey })
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
    model: 'claude-opus-4-5-20250514',
    max_tokens: 1500,
    system:
      'Bạn là chuyên gia phân tích chứng khoán CFA chuyên thị trường Việt Nam, 20 năm kinh nghiệm. Phân tích khách quan dựa trên số liệu thực tế. Luôn trả về JSON hợp lệ, không có text ngoài JSON.',
    messages: [{ role: 'user', content: prompt }],
  })

  const firstBlock = response.content?.[0]
  const text = firstBlock && firstBlock.type === 'text' ? firstBlock.text : ''

  if (!text) {
    throw new Error('Claude returned empty response')
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Claude did not return valid JSON')
  }

  return JSON.parse(jsonMatch[0]) as AnalysisResult
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
    model: 'claude-opus-4-5-20250514',
    max_tokens: 1000,
    system:
      'Bạn là chuyên gia quản lý danh mục đầu tư CFA chuyên thị trường Việt Nam. Tư vấn khách quan. Trả về JSON hợp lệ.',
    messages: [{ role: 'user', content: prompt }],
  })

  const firstBlock2 = response.content?.[0]
  const text = firstBlock2 && firstBlock2.type === 'text' ? firstBlock2.text : ''

  if (!text) {
    throw new Error('Claude returned empty response')
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Claude did not return valid JSON')
  }

  return JSON.parse(jsonMatch[0])
}
