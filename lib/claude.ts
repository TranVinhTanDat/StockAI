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
  // NOTE: Do NOT strip // or /* */ comments — they corrupt JSON string values
}

function extractJSONObject(text: string): string {
  // 0. XML tag <result>...</result>
  const xml = text.match(/<result>([\s\S]*?)<\/result>/)
  if (xml) { try { const t = sanitizeJSON(xml[1].trim()); JSON.parse(t); return t } catch {} }
  // 1. Try direct parse (with sanitize)
  try { const t = sanitizeJSON(text.trim()); JSON.parse(t); return t } catch {}
  // 2. Code block with json tag
  const cb = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (cb) { try { const t = sanitizeJSON(cb[1]); JSON.parse(t); return t } catch {} }
  // 3. Any code block
  const cb2 = text.match(/```\s*([\s\S]*?)\s*```/)
  if (cb2) { try { const t = sanitizeJSON(cb2[1]); JSON.parse(t); return t } catch {} }
  // 4. Find outermost { ... } — handle nested braces, skip strings
  const candidates: string[] = []
  let depth = 0, start = -1, inString = false, escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') { if (depth === 0) start = i; depth++ }
    else if (ch === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        candidates.push(text.slice(start, i + 1))
        start = -1
      }
      if (depth < 0) depth = 0
    }
  }
  for (const c of candidates) {
    try { const t = sanitizeJSON(c); JSON.parse(t); return t } catch {}
  }
  console.error('[extractJSONObject] raw text:', text.slice(0, 500))
  throw new Error('Claude did not return valid JSON')
}

function extractJSONArray(text: string): string {
  // 0. XML tag <result>...</result>
  const xml = text.match(/<result>([\s\S]*?)<\/result>/)
  if (xml) { try { const t = sanitizeJSON(xml[1].trim()); JSON.parse(t); return t } catch {} }
  // 1. Direct parse
  try { const t = sanitizeJSON(text.trim()); JSON.parse(t); return t } catch {}
  // 2. Code block
  const cb = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (cb) { try { const t = sanitizeJSON(cb[1]); JSON.parse(t); return t } catch {} }
  // 3. Find outermost [ ... ] — skip strings
  const candidates: string[] = []
  let depth = 0, start = -1, inString = false, escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '[') { if (depth === 0) start = i; depth++ }
    else if (ch === ']') {
      depth--
      if (depth === 0 && start !== -1) {
        candidates.push(text.slice(start, i + 1))
        start = -1
      }
      if (depth < 0) depth = 0
    }
  }
  for (const c of candidates) {
    try { const t = sanitizeJSON(c); JSON.parse(t); return t } catch {}
  }
  console.error('[extractJSONArray] raw text:', text.slice(0, 500))
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
  macdHistogram?: number
  bbUpper: number
  bbMid: number
  bbLower: number
  bbSignal?: string
  volumeSignal?: string
  pe: number
  eps: number
  roe: number
  roa?: number
  pb?: number
  revenueGrowth: number
  profitGrowth: number
  debtEquity: number
  dividendYield: number
  tcbsRating: number
  tcbsRecommend: string
  topNews: Array<{ title: string; sentiment: number }>
  avgSentiment: number
  currentHolding?: CurrentHolding | null
  vnIndex?: { trend30d: number; currentLevel: number; rsi: number }
  adx?: number
  adxTrend?: string
  momentum1W?: number
  momentum1M?: number
  momentum3M?: number
  w52position?: number
  w52high?: number
  w52low?: number
  foreignBuyVol?: number
  foreignSellVol?: number
  foreignNetVol?: number
  foreignRoom?: number
}

export async function analyzeStock(
  ctx: AnalysisContext
): Promise<AnalysisResult> {
  const client = getClient()

  const bbPosition =
    ctx.bbUpper !== ctx.bbLower
      ? (((ctx.price - ctx.bbLower) / (ctx.bbUpper - ctx.bbLower)) * 100).toFixed(0)
      : '50'

  const newsText = ctx.topNews
    .map((n, i) => `${i + 1}. ${n.title} [${n.sentiment > 0 ? '+' : ''}${n.sentiment}]`)
    .join('\n')

  const vnIndexBlock = ctx.vnIndex
    ? `\n▌ BỐI CẢNH THỊ TRƯỜNG (VN-Index):\nVN-Index: ${ctx.vnIndex.currentLevel.toLocaleString('vi-VN')} điểm | Xu hướng 30D: ${ctx.vnIndex.trend30d >= 0 ? '+' : ''}${ctx.vnIndex.trend30d.toFixed(1)}% | RSI: ${ctx.vnIndex.rsi} (${ctx.vnIndex.rsi > 70 ? 'Quá mua — thị trường có thể điều chỉnh' : ctx.vnIndex.rsi < 30 ? 'Quá bán — có thể phục hồi' : 'Trung lập'})\n→ Xét tác động xu hướng thị trường chung lên mã ${ctx.symbol}`
    : ''

  // Foreign flow block
  const foreignBlock = (() => {
    const net = ctx.foreignNetVol ?? 0
    const buy = ctx.foreignBuyVol ?? 0
    const sell = ctx.foreignSellVol ?? 0
    if (buy === 0 && sell === 0) return ''
    const netLabel = net > 0 ? `MUA RÒNG +${net.toLocaleString('vi-VN')}` : net < 0 ? `BÁN RÒNG ${net.toLocaleString('vi-VN')}` : 'Cân bằng'
    const roomStr = ctx.foreignRoom !== undefined ? ` | Room NN còn: ${ctx.foreignRoom.toFixed(1)}%` : ''
    return `\n▌ DÒNG TIỀN NGOẠI (hôm nay — tín hiệu quan trọng nhất TTCK VN):
NN mua: ${buy.toLocaleString('vi-VN')} CP | NN bán: ${sell.toLocaleString('vi-VN')} CP | Net: ${netLabel}${roomStr}`
  })()

  // Momentum block
  const momentumBlock = (() => {
    const w1 = ctx.momentum1W, m1 = ctx.momentum1M, m3 = ctx.momentum3M
    const w52 = ctx.w52position
    const parts: string[] = []
    if (w1 !== undefined) parts.push(`1 tuần: ${w1 >= 0 ? '+' : ''}${w1}%`)
    if (m1 !== undefined) parts.push(`1 tháng: ${m1 >= 0 ? '+' : ''}${m1}%`)
    if (m3 !== undefined) parts.push(`3 tháng: ${m3 >= 0 ? '+' : ''}${m3}%`)
    if (parts.length === 0) return ''
    const w52Str = w52 !== undefined
      ? `\n52W: Low=${ctx.w52low?.toLocaleString('vi-VN')}₫ / High=${ctx.w52high?.toLocaleString('vi-VN')}₫ → Giá hiện tại ở ${w52}% vùng 52 tuần`
      : ''
    return `\n▌ MOMENTUM ĐA KHUNG THỜI GIAN:
${parts.join(' | ')}${w52Str}`
  })()

  const prompt = `PHÂN TÍCH CHUYÊN SÂU CỔ PHIẾU ${ctx.symbol} — ${new Date().toLocaleDateString('vi-VN')}
${vnIndexBlock}${foreignBlock}${momentumBlock}

▌ KỸ THUẬT (90 ngày — dữ liệu thực):
Giá: ${ctx.price.toLocaleString('vi-VN')}₫ | Hôm nay: ${ctx.changePct > 0 ? '+' : ''}${ctx.changePct.toFixed(2)}%
SMA20: ${ctx.sma20.toLocaleString('vi-VN')} | SMA50: ${ctx.sma50.toLocaleString('vi-VN')}
→ Giá ${ctx.price > ctx.sma20 ? 'TRÊN' : 'DƯỚI'} SMA20, ${ctx.price > ctx.sma50 ? 'TRÊN' : 'DƯỚI'} SMA50
RSI(14): ${ctx.rsi.toFixed(1)} → ${ctx.rsi > 70 ? '⚠ QUÁ MUA' : ctx.rsi < 30 ? '🔻 QUÁ BÁN' : 'TRUNG LẬP'}
ADX(14): ${ctx.adx ?? 0} → ${ctx.adxTrend ?? 'N/A'} (>25=trend mạnh, <20=sideway)
MACD: ${ctx.macd.toFixed(2)} | Signal: ${ctx.signal.toFixed(2)}${ctx.macdHistogram !== undefined ? ` | Histogram: ${ctx.macdHistogram.toFixed(2)} (${ctx.macdHistogram > 0 ? 'tăng' : 'giảm'})` : ''}
BB(20,2): Upper=${ctx.bbUpper.toLocaleString('vi-VN')} Mid=${ctx.bbMid.toLocaleString('vi-VN')} Lower=${ctx.bbLower.toLocaleString('vi-VN')}
→ Giá ở ${bbPosition}% dải BB | ${ctx.bbSignal || 'Inside BB'}
Khối lượng: ${ctx.volumeSignal || 'Bình thường'}

▌ CƠ BẢN (số liệu mới nhất từ Simplize + báo cáo tài chính):
P/E: ${ctx.pe.toFixed(1)}x | P/B: ${(ctx.pb ?? 0).toFixed(2)}x | EPS: ${ctx.eps.toLocaleString('vi-VN')}₫
ROE: ${ctx.roe.toFixed(1)}% | ROA: ${(ctx.roa ?? 0).toFixed(1)}%
Tăng trưởng DT: ${ctx.revenueGrowth.toFixed(1)}% | Tăng trưởng LN: ${ctx.profitGrowth.toFixed(1)}%
Nợ/Vốn chủ: ${ctx.debtEquity.toFixed(2)} | Cổ tức: ${ctx.dividendYield.toFixed(1)}%

▌ TIN TỨC & TÂM LÝ (7 ngày gần nhất):
${newsText || 'Không có tin nổi bật'}
Sentiment trung bình: ${ctx.avgSentiment.toFixed(0)}/100
${ctx.currentHolding ? `
▌ VỊ THẾ TRONG DANH MỤC (QUAN TRỌNG — phải đề cập rõ trong field "action"):
Đang nắm giữ: ${ctx.currentHolding.qty.toLocaleString('vi-VN')} CP
Giá vốn TB: ${ctx.currentHolding.avgCost.toLocaleString('vi-VN')}₫
Tổng đầu tư: ${ctx.currentHolding.totalCost.toLocaleString('vi-VN')}₫
Lãi/lỗ chưa thực hiện: ${ctx.price > 0 ? ((ctx.price - ctx.currentHolding.avgCost) / ctx.currentHolding.avgCost * 100).toFixed(1) : 0}%
→ Field "action" BẮT BUỘC mở đầu: "Trong danh mục của bạn, bạn đang nắm giữ ${ctx.currentHolding.qty.toLocaleString('vi-VN')} CP ${ctx.symbol} với [lãi/lỗ X%]..." rồi khuyến nghị cụ thể dựa trên tất cả dữ liệu trên.` : ''}
▌ YÊU CẦU PHÂN TÍCH — PHẢI DỰA TRÊN SỐ LIỆU THỰC TẾ TRÊN:
1. Kỹ thuật: ADX (xu hướng mạnh/sideway?), RSI, MACD histogram tăng/giảm, BB, momentum đa khung
2. Dòng tiền: NN đang mua hay bán ròng? Ảnh hưởng thế nào?
3. Cơ bản: P/E + P/B định giá hợp lý/đắt/rẻ? ROE/ROA so ngành? Tăng trưởng bền vững?
4. Thị trường: VN-Index context, tương quan với mã
5. Hành động cụ thể: vùng giá vào/ra, target, stop loss, xét vị thế nếu có

Trả về JSON trong thẻ <result>:
<result>
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
  "technical": "90 từ: ADX xu hướng mạnh/yếu, RSI, MACD histogram, BB position, volume, momentum đa khung",
  "fundamental": "90 từ: định giá P/E+P/B so ngành, ROE+ROA, tăng trưởng, sức khỏe tài chính",
  "sentiment": "70 từ: dòng tiền NN (mua/bán ròng tác động), tin tức, VN-Index bối cảnh",
  "pros": ["lý do 1 (có số liệu cụ thể)", "lý do 2", "lý do 3"],
  "risks": ["rủi ro 1 (có số liệu)", "rủi ro 2"],
  "action": "60 từ: hành động ngay với giá cụ thể — vùng mua/bán, target, stop loss, xét vị thế và dòng tiền NN",
  "nextReview": "điều kiện kỹ thuật hoặc sự kiện cụ thể cần theo dõi"
}
</result>`

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    system:
      'Bạn là chuyên gia phân tích chứng khoán CFA Level 3, 20 năm kinh nghiệm thị trường Việt Nam. Phân tích sâu, khách quan, dựa hoàn toàn trên số liệu thực tế được cung cấp. Không được bịa đặt số liệu. QUAN TRỌNG: Chỉ trả về JSON hợp lệ trong thẻ <result>, không có text nào khác.',
    messages: [{ role: 'user', content: prompt }],
  })

  const firstBlock = response.content?.[0]
  const text = firstBlock && firstBlock.type === 'text' ? firstBlock.text : ''

  if (!text) throw new Error('Claude returned empty response')

  return JSON.parse(extractJSONObject(text)) as AnalysisResult
}

interface StockDetail {
  symbol: string
  qty: number
  avgCost: number
  currentPrice: number
  industry: string
  weight: number
  pnlPct: number
  // Technical
  rsi: number
  macdSignal: string
  macdHistogram?: number
  trend30d: number
  aboveSMA20: boolean
  aboveSMA50: boolean
  bbSignal?: string
  volumeSignal?: string
  adx?: number
  adxTrend?: string
  momentum1M?: number
  momentum3M?: number
  // Fundamental
  pe: number
  pb?: number
  roe: number
  roa?: number
  profitGrowth: number
  debtEquity: number
  dividendYield: number
  // Foreign flows
  foreignNetVol?: number
  foreignBuyVol?: number
  foreignSellVol?: number
  foreignRoom?: number
  // News
  recentNews?: string[]
}

interface VNIndexContext {
  trend30d: number
  currentLevel: number
  rsi: number
}

interface OptimizeContext {
  holdings: StockDetail[]
  totalValue: number
  cash: number
  vnIndex?: VNIndexContext
}

interface OptimizeResult {
  analysis: string
  marketContext: string
  stockRecommendations: Array<{
    symbol: string
    action: string
    reason: string
    riskLevel: string
    catalyst: string
  }>
  suggestions: string[]
  rebalancePlan: string
  riskWarnings: string[]
}

export async function optimizePortfolio(ctx: OptimizeContext): Promise<OptimizeResult> {
  const client = getClient()
  const today = new Date().toLocaleDateString('vi-VN')
  const totalAssets = ctx.totalValue + ctx.cash
  const cashRatio = totalAssets > 0 ? (ctx.cash / totalAssets * 100).toFixed(1) : '0'

  // Market context block
  const vnTrend = ctx.vnIndex?.trend30d ?? 0
  const marketContext = ctx.vnIndex
    ? `VN-Index: ${ctx.vnIndex.currentLevel.toLocaleString('vi-VN')} điểm | Xu hướng 30D: ${vnTrend >= 0 ? '+' : ''}${vnTrend.toFixed(1)}% | RSI(14): ${ctx.vnIndex.rsi} (${ctx.vnIndex.rsi > 70 ? 'Quá mua — thận trọng' : ctx.vnIndex.rsi < 30 ? 'Quá bán — có thể phục hồi' : 'Trung lập'})`
    : 'Không có dữ liệu VN-Index'

  // Sector concentration
  const sectorMap: Record<string, number> = {}
  ctx.holdings.forEach(h => {
    sectorMap[h.industry] = (sectorMap[h.industry] || 0) + h.weight
  })
  const sectorText = Object.entries(sectorMap)
    .sort(([,a],[,b]) => b - a)
    .map(([sec, w]) => `${sec}: ${w.toFixed(1)}%`)
    .join(' | ')

  const holdingsText = ctx.holdings.map(h => {
    const pnlSign = h.pnlPct >= 0 ? '+' : ''
    const trendSign = h.trend30d >= 0 ? '+' : ''
    const rsiLabel = h.rsi > 70 ? '⚠ Quá mua' : h.rsi < 30 ? '🔻 Quá bán' : 'Trung lập'
    const newsBlock = h.recentNews && h.recentNews.length > 0
      ? `\n  Tin tức: ${h.recentNews.slice(0, 2).map(n => `"${n.slice(0, 80)}"`).join(' | ')}`
      : ''
    const foreignNet = h.foreignNetVol ?? 0
    const foreignBlock = (h.foreignBuyVol || h.foreignSellVol)
      ? `\n  Dòng NN hôm nay: Mua=${(h.foreignBuyVol??0).toLocaleString()} | Bán=${(h.foreignSellVol??0).toLocaleString()} | Net=${foreignNet >= 0 ? '+' : ''}${foreignNet.toLocaleString()}${h.foreignRoom !== undefined ? ` | Room: ${h.foreignRoom.toFixed(1)}%` : ''}`
      : ''
    const momentum1Mstr = h.momentum1M !== undefined ? ` | 1T: ${h.momentum1M >= 0 ? '+' : ''}${h.momentum1M}%` : ''
    const momentum3Mstr = h.momentum3M !== undefined ? ` | 3T: ${h.momentum3M >= 0 ? '+' : ''}${h.momentum3M}%` : ''
    return `━━ [${h.symbol}] ${h.industry} ━━ ${h.weight.toFixed(1)}% danh mục
  Vị thế: ${h.qty.toLocaleString()} CP | Giá vốn: ${h.avgCost.toLocaleString()}đ → Hiện: ${h.currentPrice.toLocaleString()}đ | L/L: ${pnlSign}${h.pnlPct.toFixed(1)}%
  Kỹ thuật: RSI=${h.rsi} (${rsiLabel}) | ADX=${h.adx??0} (${h.adxTrend??'N/A'}) | MACD=${h.macdSignal}${h.macdHistogram ? ` hist=${h.macdHistogram}` : ''} | ${h.aboveSMA20 ? '↑SMA20' : '↓SMA20'} | ${h.aboveSMA50 ? '↑SMA50' : '↓SMA50'} | BB: ${h.bbSignal||'N/A'} | Vol: ${h.volumeSignal||'N/A'}
  Momentum: Trend90D: ${trendSign}${h.trend30d.toFixed(1)}%${momentum1Mstr}${momentum3Mstr}
  Cơ bản: P/E=${h.pe.toFixed(1)}x | P/B=${(h.pb??0).toFixed(2)}x | ROE=${h.roe.toFixed(1)}% | ROA=${(h.roa??0).toFixed(1)}% | Nợ/Vốn=${h.debtEquity.toFixed(2)} | Cổ tức=${h.dividendYield.toFixed(1)}%${foreignBlock}${newsBlock}`
  }).join('\n\n')

  const prompt = `PHÂN TÍCH DANH MỤC ĐẦU TƯ TOÀN DIỆN — ${today}

▌ BỐI CẢNH THỊ TRƯỜNG:
${marketContext}

▌ TỔNG QUAN TÀI SẢN:
CP: ${ctx.totalValue.toLocaleString('vi-VN')}đ | Tiền mặt: ${ctx.cash.toLocaleString('vi-VN')}đ | Tổng TS: ${totalAssets.toLocaleString('vi-VN')}đ
Tỷ lệ tiền mặt: ${cashRatio}% | Số mã: ${ctx.holdings.length}
Phân bổ ngành: ${sectorText}

▌ CHI TIẾT TỪNG MÃ (dữ liệu 90 ngày + real-time):
${holdingsText}

▌ YÊU CẦU PHÂN TÍCH — DỰA HOÀN TOÀN VÀO SỐ LIỆU THỰC TẾ TRÊN:
1. Kỹ thuật từng mã: ADX (xu hướng mạnh/sideway?), RSI, MACD, BB, momentum 1-3 tháng
2. Dòng tiền ngoại: NN đang mua/bán ròng mã nào? Tín hiệu gì? Room còn bao nhiêu?
3. Cơ bản: P/E + P/B định giá hợp lý không? ROE + ROA so ngành? Tăng trưởng bền vững?
4. Rủi ro tập trung ngành, mã đơn lẻ, tương quan
5. Bối cảnh VN-Index: bull/bear market, nên phòng thủ hay tấn công?
6. Chiến lược tái cơ cấu cụ thể: mã nào tăng/giảm tỷ trọng, tại sao, mức giá

Trả về JSON trong thẻ <result>:
<result>
{
  "analysis": "Nhận xét tổng quan 80-100 từ: hiệu quả danh mục, rủi ro tập trung, tương quan thị trường, điểm mạnh/yếu tổng thể",
  "marketContext": "40-50 từ: VN-Index đang ở đâu, ảnh hưởng thế nào đến danh mục này, nên phòng thủ hay tấn công",
  "stockRecommendations": [
    {
      "symbol": "MÃ_CP",
      "action": "GIỮ",
      "reason": "35-40 từ: phân tích kỹ thuật + cơ bản + tin tức cụ thể, lý do chính xác",
      "riskLevel": "Thấp|Trung bình|Cao",
      "catalyst": "20 từ: yếu tố chính tác động giá trong 1-3 tháng tới"
    }
  ],
  "suggestions": [
    "Gợi ý cụ thể 1 (có mã, số lượng hoặc % tỷ trọng rõ ràng)",
    "Gợi ý cụ thể 2",
    "Gợi ý cụ thể 3",
    "Gợi ý cụ thể 4"
  ],
  "rebalancePlan": "Kế hoạch tái cơ cấu 80-100 từ: thứ tự ưu tiên, mã cần giảm/tăng tỷ trọng, điều kiện kích hoạt, mức giá tham chiếu",
  "riskWarnings": [
    "Cảnh báo rủi ro 1 (cụ thể, có số liệu)",
    "Cảnh báo rủi ro 2"
  ]
}
</result>

Các action hợp lệ: MUA THÊM | GIỮ | CHỐT LỜI MỘT PHẦN | CHỐT LỜI | CẮT LỖ | BÁN TOÀN BỘ
riskLevel: Thấp | Trung bình | Cao`

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    system:
      'Bạn là chuyên gia quản lý danh mục CFA Level 3, 20 năm kinh nghiệm thị trường Việt Nam. Phân tích sâu, khách quan, dựa hoàn toàn vào số liệu thực tế được cung cấp. Không được bịa đặt số liệu. QUAN TRỌNG: Chỉ trả về JSON hợp lệ trong thẻ <result>, không có text nào khác.',
    messages: [{ role: 'user', content: prompt }],
  })

  const firstBlock2 = response.content?.[0]
  const text2 = firstBlock2 && firstBlock2.type === 'text' ? firstBlock2.text : ''

  if (!text2) throw new Error('Claude returned empty response')

  return JSON.parse(extractJSONObject(text2)) as OptimizeResult
}

interface PredictStock {
  symbol: string
  price: number
  changePct: number
  industry: string
  pe: number
  eps: number
  roe: number
  revenueGrowth: number
  profitGrowth: number
  debtEquity: number
  dividendYield: number
  rsi: number
  aboveSMA20: boolean
  aboveSMA50: boolean
  trend30d: number
  volume: number
}

export type InvestmentStyle = 'longterm' | 'dca' | 'swing' | 'dividend' | 'etf'

interface PredictContext {
  style: InvestmentStyle
  stocks: PredictStock[]
}

const STYLE_DESCRIPTIONS: Record<string, string> = {
  longterm:
    'Đầu tư dài hạn — Buy & Hold 3-5 năm: ưu tiên doanh nghiệp có nền tảng cơ bản vững chắc (ROE > 15%, tăng trưởng LN > 15%/năm liên tục), P/E hợp lý so ngành, D/E < 1, vị thế thị trường dẫn đầu ngành, quản trị tốt, hoạt động kinh doanh bền vững. Ưu tiên công ty có lợi thế cạnh tranh bền vững (moat), tăng trưởng đều đặn, ít bị ảnh hưởng chu kỳ kinh tế.',
  dca:
    'DCA — Bình quân giá vốn (đầu tư định kỳ hàng tháng): ưu tiên mã ổn định có xu hướng tăng dài hạn rõ ràng, thanh khoản tốt, biến động ngày thấp-trung bình, ngành ít bị ảnh hưởng chu kỳ. Phù hợp mua thêm đều đặn không cần lo biến động ngắn hạn. Tránh mã biến động cực mạnh hoặc có rủi ro cao.',
  swing:
    'Lướt sóng ngắn hạn 1-4 tuần: RSI đang ở vùng 30-55 (quá bán hoặc đang hồi phục), giá gần/vừa bật từ vùng hỗ trợ kỹ thuật, MACD có tín hiệu crossover bullish sắp xảy ra hoặc đang bullish, khối lượng tăng đột biến xác nhận momentum, xu hướng 30 ngày đang cải thiện. Risk/reward tối thiểu 1:2.',
  dividend:
    'Đầu tư cổ tức — thu nhập thụ động: ưu tiên mã có lịch sử trả cổ tức tiền mặt đều đặn và tăng, dividend yield > 4%, ROE > 12%, cashflow tự do dương và ổn định, tỷ lệ chi trả cổ tức bền vững (<70% lợi nhuận). Ưu tiên ngành bảo thủ: ngân hàng lớn, tiện ích, thực phẩm-đồ uống, bất động sản khu công nghiệp.',
  etf:
    'Theo chỉ số VN30/VN-Index (phong cách đầu tư ETF): ưu tiên cổ phiếu trụ cột đại diện thị trường — vốn hóa top 30 thị trường, thanh khoản cao nhất (KLGD hàng đầu), blue-chip ổn định kết quả kinh doanh, đóng góp trọng số lớn vào VN-Index, được các quỹ ETF nội và ngoại nắm giữ nhiều. Ưu tiên bluechip vốn hóa lớn trong các ngành trụ cột: ngân hàng, thép, bất động sản, công nghệ.',
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
        `${i + 1}. [${s.symbol}] ${s.industry}
   Giá: ${s.price}₫ (${s.changePct > 0 ? '+' : ''}${s.changePct.toFixed(1)}% hôm nay, xu hướng 30D: ${s.trend30d > 0 ? '+' : ''}${s.trend30d.toFixed(1)}%)
   Kỹ thuật: RSI=${s.rsi.toFixed(0)} | ${s.aboveSMA20 ? 'TRÊN' : 'DƯỚI'} SMA20 | ${s.aboveSMA50 ? 'TRÊN' : 'DƯỚI'} SMA50 | KL=${s.volume.toLocaleString()}
   Cơ bản: P/E=${s.pe.toFixed(1)}x | EPS=${s.eps}₫ | ROE=${s.roe.toFixed(1)}% | LN_Growth=${s.profitGrowth > 0 ? '+' : ''}${s.profitGrowth.toFixed(1)}% | DT_Growth=${s.revenueGrowth > 0 ? '+' : ''}${s.revenueGrowth.toFixed(1)}% | D/E=${s.debtEquity.toFixed(2)} | Cổ_tức=${s.dividendYield.toFixed(1)}%`
    )
    .join('\n')

  const prompt = `PHÂN TÍCH CHUYÊN SÂU ${ctx.stocks.length} MÃ CỔ PHIẾU VIỆT NAM (${timestamp})

═══════════════════════════════════════════
DỮ LIỆU THỰC TẾ TỪNG MÃ:
═══════════════════════════════════════════
${tableRows}

═══════════════════════════════════════════
PHONG CÁCH ĐẦU TƯ CẦN PHÂN TÍCH:
${styleDesc}
═══════════════════════════════════════════

NHIỆM VỤ: Với vai trò chuyên gia quản lý quỹ CFA, hãy:
1. Phân tích từng mã dựa trên dữ liệu KỸ THUẬT (RSI, SMA, xu hướng) và CƠ BẢN (P/E, ROE, tăng trưởng, cổ tức) thực tế ở trên
2. Chọn TOP 5-7 mã PHÙ HỢP NHẤT cho phong cách đầu tư này
3. Với mỗi mã được chọn: giải thích cụ thể TẠI SAO phù hợp dựa trên các con số thực tế
4. Xếp hạng từ phù hợp nhất → ít phù hợp nhất
5. Định giá target price dựa trên PE ngành, tăng trưởng dự phóng và kỹ thuật

PHÂN TÍCH PHẢI BAO GỒM:
- Phân tích kỹ thuật: xu hướng, RSI, SMA, momentum
- Phân tích cơ bản: định giá P/E, tăng trưởng, ROE, sức khỏe tài chính
- Đánh giá phù hợp với phong cách đầu tư
- Rủi ro chính cần lưu ý

PHẢI dùng đúng tên field: "pe", "roe", "growth" trong keyMetrics.

Trả về JSON array trong thẻ <result>:
<result>
[{
  "rank": 1,
  "symbol": "FPT",
  "score": 88,
  "recommendation": "MUA MẠNH",
  "targetPrice": 98000,
  "currentPrice": 85200,
  "upsidePct": 15.0,
  "reason": "Tăng trưởng LN 28% YoY vượt kỳ vọng. ROE 23% duy trì bền vững 5 năm. RSI 48 chưa quá mua, giá trên SMA20+SMA50 xác nhận xu hướng tăng. P/E 18x hợp lý cho tốc độ tăng trưởng. Thị trường IT đang mở rộng mạnh tại VN.",
  "keyMetrics": {"pe": 18.5, "roe": 22.1, "growth": 28.3},
  "riskLevel": "THẤP",
  "entryZone": {"low": 83000, "high": 87000}
}]
</result>`

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 5000,
    system:
      'Bạn là chuyên gia quản lý quỹ đầu tư CFA với 20 năm kinh nghiệm chuyên sâu tại thị trường chứng khoán Việt Nam (HOSE/HNX). Bạn thông thạo phân tích kỹ thuật, phân tích cơ bản, định giá doanh nghiệp, và chiến lược đầu tư đa phong cách. Phân tích khách quan dựa trên dữ liệu thực tế. QUAN TRỌNG: Chỉ được trả về JSON array hợp lệ trong thẻ <result></result>. Không có text, markdown hay giải thích nào ngoài thẻ đó.',
    messages: [{ role: 'user', content: prompt }],
  })

  const firstBlock = response.content?.[0]
  const text = firstBlock && firstBlock.type === 'text' ? firstBlock.text : ''

  if (!text) {
    throw new Error('Claude returned empty response')
  }

  return JSON.parse(extractJSONArray(text))
}
