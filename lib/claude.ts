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

// ─── Sector P/E benchmarks (HOSE/HNX — dữ liệu trung bình ngành Việt Nam) ──────

const SECTOR_PE_BENCHMARKS: Record<string, string> = {
  'Ngân hàng':          'P/E TB: 8–12x | P/B TB: 1.0–2.0x | ROE TB: 15–20% | ROA TB: 1–2%',
  'Bất động sản':       'P/E TB: 12–22x | P/B TB: 0.8–2.5x | ROE TB: 10–18%',
  'Thép':               'P/E TB: 6–12x  | P/B TB: 0.7–1.5x | ROE TB: 8–15% (chu kỳ cao)',
  'Vật liệu xây dựng':  'P/E TB: 8–14x  | P/B TB: 0.8–1.8x | ROE TB: 8–14%',
  'Bán lẻ':             'P/E TB: 12–22x | P/B TB: 1.5–3.5x | ROE TB: 15–25%',
  'Công nghệ':          'P/E TB: 15–30x | P/B TB: 2.0–5.0x | ROE TB: 18–30%',
  'Thực phẩm':          'P/E TB: 15–25x | P/B TB: 2.0–4.0x | ROE TB: 20–30%',
  'Đồ uống':            'P/E TB: 15–25x | P/B TB: 2.0–4.5x | ROE TB: 20–35%',
  'Dầu khí':            'P/E TB: 8–15x  | P/B TB: 1.0–2.5x | ROE TB: 12–18%',
  'Chứng khoán':        'P/E TB: 8–16x  | P/B TB: 1.0–2.5x | ROE TB: 12–20%',
  'Dược phẩm':          'P/E TB: 15–25x | P/B TB: 2.0–4.0x | ROE TB: 15–25%',
  'Điện':               'P/E TB: 12–18x | P/B TB: 1.0–2.2x | ROE TB: 10–16%',
  'Năng lượng':         'P/E TB: 10–18x | P/B TB: 1.0–2.2x | ROE TB: 10–18%',
  'Vận tải':            'P/E TB: 10–18x | P/B TB: 0.8–2.0x | ROE TB: 10–18%',
  'Logistics':          'P/E TB: 12–20x | P/B TB: 1.0–2.5x | ROE TB: 12–20%',
  'Xây dựng':           'P/E TB: 8–15x  | P/B TB: 0.8–1.8x | ROE TB: 8–15%',
  'Hóa chất':           'P/E TB: 8–14x  | P/B TB: 0.8–1.8x | ROE TB: 8–14%',
  'Thủy sản':           'P/E TB: 8–15x  | P/B TB: 0.8–2.0x | ROE TB: 10–18%',
  'Nông nghiệp':        'P/E TB: 8–15x  | P/B TB: 0.8–1.8x | ROE TB: 8–15%',
  'Bảo hiểm':           'P/E TB: 12–20x | P/B TB: 1.0–2.5x | ROE TB: 12–20%',
  'Viễn thông':         'P/E TB: 10–18x | P/B TB: 1.5–3.0x | ROE TB: 15–22%',
  'Y tế':               'P/E TB: 15–28x | P/B TB: 2.0–5.0x | ROE TB: 15–25%',
}

function getSectorBenchmark(industry: string): string {
  if (!industry) return ''
  for (const [key, val] of Object.entries(SECTOR_PE_BENCHMARKS)) {
    if (industry.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(industry.toLowerCase().split(' ')[0])) {
      return `▌ ĐỊNH GIÁ THAM CHIẾU NGÀNH "${industry}":\n${val}\n→ Dùng để đánh giá P/E, P/B, ROE của ${industry} so với trung bình ngành`
    }
  }
  return ''
}

function getMarketRegime(vnIndex?: { trend30d: number; currentLevel: number; rsi: number }): string {
  if (!vnIndex) return ''
  const { rsi, trend30d } = vnIndex
  let regime: string
  if      (rsi > 70 && trend30d > 10) regime = '🔥 BULL MẠNH — thị trường quá mua, rủi ro điều chỉnh ngắn hạn cao'
  else if (rsi > 55 && trend30d > 3)  regime = '📈 BULL — xu hướng tăng rõ ràng, thuận lợi cho mua'
  else if (rsi >= 45 && rsi <= 55 && Math.abs(trend30d) < 3) regime = '↔ TÍCH LŨY/SIDEWAYS — thị trường chưa có hướng rõ, chọn lọc cẩn thận'
  else if (rsi < 30 && trend30d < -8) regime = '🔻 BEAR MẠNH — rủi ro cao, ưu tiên phòng thủ, tăng tiền mặt'
  else if (rsi < 45 && trend30d < -3) regime = '⚠ BEAR NHẸ — thị trường giảm, thận trọng, chỉ mua mã cực mạnh'
  else                                 regime = '🔄 ĐIỀU CHỈNH — thị trường biến động, theo dõi tín hiệu xác nhận'
  return `→ Chế độ thị trường: ${regime}`
}

interface AnalysisContext {
  symbol: string
  industry?: string
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
  // Support/Resistance từ dữ liệu nến thực tế
  support?: number
  resistance?: number
  support2?: number
  resistance2?: number
  // Net profit margin (biên lợi nhuận ròng)
  netMargin?: number
  // Quarterly EPS trend (4 quarters, newest first) — shows earnings acceleration/deceleration
  quarterlyEPS?: Array<{ period: string; eps: number; pe: number }>
  // Latest analyst report PDF (base64) for deep analysis
  reportPdfBase64?: string
  reportTitle?: string
  // Derived valuation metrics
  peg?: number       // PE / profitGrowth — định giá tương đối vs tốc độ tăng trưởng
  rs30d?: number     // stock 30D return - VN-Index 30D return (outperform/underperform)
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
    ? `\n▌ BỐI CẢNH THỊ TRƯỜNG (VN-Index):\nVN-Index: ${ctx.vnIndex.currentLevel.toLocaleString('vi-VN')} điểm | Xu hướng 30D: ${ctx.vnIndex.trend30d >= 0 ? '+' : ''}${ctx.vnIndex.trend30d.toFixed(1)}% | RSI: ${ctx.vnIndex.rsi} (${ctx.vnIndex.rsi > 70 ? 'Quá mua — thị trường có thể điều chỉnh' : ctx.vnIndex.rsi < 30 ? 'Quá bán — có thể phục hồi' : 'Trung lập'})\n${getMarketRegime(ctx.vnIndex)}\n→ Xét tác động xu hướng thị trường chung lên mã ${ctx.symbol}`
    : ''

  // Sector P/E benchmark block
  const sectorBlock = ctx.industry ? `\n${getSectorBenchmark(ctx.industry)}` : ''

  // Foreign flow block with interpretation thresholds
  const foreignBlock = (() => {
    const net = ctx.foreignNetVol ?? 0
    const buy = ctx.foreignBuyVol ?? 0
    const sell = ctx.foreignSellVol ?? 0
    if (buy === 0 && sell === 0) return ''
    const netLabel = net > 0 ? `MUA RÒNG +${net.toLocaleString('vi-VN')}` : net < 0 ? `BÁN RÒNG ${net.toLocaleString('vi-VN')}` : 'Cân bằng'
    const roomStr = ctx.foreignRoom !== undefined ? ` | Room NN còn: ${ctx.foreignRoom.toFixed(1)}%` : ''
    const absNet = Math.abs(net)
    const interpretation = absNet > 500_000 ? (net > 0 ? '→ Tín hiệu tích lũy mạnh từ tổ chức nước ngoài' : '→ Áp lực bán ròng mạnh từ khối ngoại, cảnh báo đảo chiều')
      : absNet > 100_000 ? (net > 0 ? '→ Khối ngoại đang mua tích lũy vừa' : '→ Khối ngoại đang thoát hàng vừa')
      : '→ Giao dịch ngoại không đáng kể phiên này'
    return `\n▌ DÒNG TIỀN NGOẠI (hôm nay — tín hiệu quan trọng nhất TTCK VN):
NN mua: ${buy.toLocaleString('vi-VN')} CP | NN bán: ${sell.toLocaleString('vi-VN')} CP | Net: ${netLabel}${roomStr}
${interpretation}`
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

  // Format helper: show N/A for zero/missing fundamental data
  const fmt0 = (v: number, suffix: string, decimals = 1) =>
    v !== 0 ? v.toFixed(decimals) + suffix : 'N/A'
  const fmtGrowth = (v: number) =>
    v !== 0 ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : 'N/A'

  // Quarterly EPS trend block — shows earnings acceleration/deceleration
  const quarterlyEPSBlock = (() => {
    const q = ctx.quarterlyEPS
    if (!q || q.length < 2) return ''
    const rows = q.map(r =>
      `  ${r.period}: EPS=${r.eps > 0 ? r.eps.toLocaleString('vi-VN') + '₫' : 'N/A'}${r.pe > 0 ? ` | P/E=${r.pe.toFixed(1)}x` : ''}`
    ).join('\n')
    const oldest = q[q.length - 1].eps, newest = q[0].eps
    const epsChg = oldest > 0 && newest > 0 ? Math.round(((newest - oldest) / Math.abs(oldest)) * 100) : 0
    const trend = epsChg > 20 ? `→ ⬆ EPS TĂNG TỐC +${epsChg}% — tín hiệu tăng trưởng lợi nhuận RẤT MẠNH`
      : epsChg > 5 ? `→ ↑ EPS tăng nhẹ +${epsChg}% qua các quý`
      : epsChg < -20 ? `→ ⬇ EPS SUY GIẢM ${epsChg}% — CẢNH BÁO tăng trưởng lợi nhuận yếu`
      : epsChg < -5 ? `→ ↓ EPS giảm nhẹ ${epsChg}%`
      : `→ ↔ EPS ổn định (biến động <5%)`
    return `\n▌ XU HƯỚNG EPS THEO QUÝ (4 quý gần nhất — phân tích gia tốc lợi nhuận):\n${rows}\n${trend}\n→ Xét: EPS đang tăng tốc hay giảm tốc? P/E đang co lại (tích cực) hay mở rộng?`
  })()

  // Support/Resistance block from actual candle data
  const srBlock = (ctx.support && ctx.resistance)
    ? `\n▌ VÙNG HỖ TRỢ/KHÁNG CỰ (20 phiên — dùng để xác định entryZone/targetPrice/stopLoss):
Kháng cự: ${ctx.resistance2 ? ctx.resistance2.toLocaleString('vi-VN') + '₫ (gần)  → ' : ''}${ctx.resistance.toLocaleString('vi-VN')}₫ (mạnh)
Hỗ trợ:   ${ctx.support2 ? ctx.support2.toLocaleString('vi-VN') + '₫ (gần)  → ' : ''}${ctx.support.toLocaleString('vi-VN')}₫ (mạnh)
→ entryZone phải nằm trong khoảng hỗ trợ gần~mạnh, stopLoss dưới hỗ trợ mạnh, target gần kháng cự`
    : ''

  const prompt = `PHÂN TÍCH CHUYÊN SÂU CỔ PHIẾU ${ctx.symbol} — ${new Date().toLocaleDateString('vi-VN')}
${vnIndexBlock}${sectorBlock}${foreignBlock}${momentumBlock}${srBlock}

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

${quarterlyEPSBlock}
▌ CƠ BẢN (số liệu mới nhất từ Simplize + báo cáo tài chính):
P/E: ${fmt0(ctx.pe, 'x')} | P/B: ${fmt0(ctx.pb ?? 0, 'x', 2)} | EPS: ${ctx.eps > 0 ? ctx.eps.toLocaleString('vi-VN') + '₫' : 'N/A'}
ROE: ${fmt0(ctx.roe, '%')} | ROA: ${fmt0(ctx.roa ?? 0, '%')}${ctx.netMargin ? ` | Biên LN ròng: ${ctx.netMargin.toFixed(1)}%` : ''}
Tăng trưởng DT: ${fmtGrowth(ctx.revenueGrowth)} | Tăng trưởng LN: ${fmtGrowth(ctx.profitGrowth)}
Nợ/Vốn chủ: ${ctx.debtEquity > 0 ? ctx.debtEquity.toFixed(2) : 'N/A'} | Cổ tức: ${fmt0(ctx.dividendYield, '%')}
${(ctx.peg !== undefined || ctx.rs30d !== undefined) ? `
▌ ĐỊNH GIÁ TƯƠNG ĐỐI & SỨC MẠNH TƯƠNG ĐỐI:${ctx.peg !== undefined ? `
PEG Ratio = P/E (${ctx.pe.toFixed(1)}x) / Tăng trưởng LN (${ctx.profitGrowth.toFixed(1)}%) = ${ctx.peg.toFixed(2)}x → ${ctx.peg < 0.8 ? '🟢 RẺ SO VỚI TĂNG TRƯỞNG (PEG < 0.8 — cơ hội mua tốt)' : ctx.peg < 1.5 ? '✅ Định giá hợp lý (PEG 0.8-1.5)' : ctx.peg < 2.5 ? '⚠ Hơi đắt so tăng trưởng (PEG 1.5-2.5)' : '🔴 ĐẮTS so tăng trưởng (PEG > 2.5 — cần thận trọng)'}` : ''}${ctx.rs30d !== undefined ? `
Relative Strength vs VN-Index (30 ngày): ${ctx.rs30d >= 0 ? '+' : ''}${ctx.rs30d.toFixed(1)}% → ${ctx.rs30d > 5 ? '🚀 OUTPERFORM MẠNH — cổ phiếu dẫn đầu thị trường' : ctx.rs30d > 0 ? '📈 Outperform nhẹ — tốt hơn thị trường' : ctx.rs30d > -5 ? '📉 Underperform nhẹ — yếu hơn thị trường' : '⚠ UNDERPERFORM MẠNH — cổ phiếu tụt hậu thị trường'}` : ''}${ctx.profitGrowth !== 0 && ctx.revenueGrowth !== 0 ? `
Chất lượng LN: TT_LN ${ctx.profitGrowth >= 0 ? '+' : ''}${ctx.profitGrowth.toFixed(1)}% ${ctx.profitGrowth > ctx.revenueGrowth ? '> TT_DT ' + (ctx.revenueGrowth >= 0 ? '+' : '') + ctx.revenueGrowth.toFixed(1) + '% → Biên LợiNhuận đang MỞ RỘNG ✓ (doanh nghiệp hiệu quả hơn)' : '< TT_DT ' + (ctx.revenueGrowth >= 0 ? '+' : '') + ctx.revenueGrowth.toFixed(1) + '% → Biên LợiNhuận THU HẸP ⚠ (chi phí tăng nhanh hơn doanh thu)'}` : ''}` : ''}

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
4. PEG & RS: PEG ratio đang hấp dẫn không? Cổ phiếu outperform hay underperform thị trường? Biên LN mở rộng hay thu hẹp?
5. Thị trường: VN-Index context, tương quan với mã
6. Hành động cụ thể: vùng giá vào/ra, target, stop loss, xét vị thế nếu có

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

  // Build message content — use document API when analyst report PDF is available
  const pdfNote = ctx.reportPdfBase64
    ? `\n\n▌ BÁO CÁO PHÂN TÍCH CHUYÊN GIA (đính kèm PDF — ĐỌC TOÀN BỘ):\nTiêu đề: "${ctx.reportTitle || 'Báo cáo phân tích mới nhất'}"\n→ Kết hợp nội dung PDF với tất cả dữ liệu kỹ thuật + cơ bản ở trên. Ưu tiên target price và khuyến nghị từ chuyên gia nếu hợp lý với tín hiệu kỹ thuật.`
    : ''

  const fullPrompt = prompt + pdfNote

  const userContent: Anthropic.MessageParam['content'] = ctx.reportPdfBase64
    ? [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: ctx.reportPdfBase64 },
        } as Anthropic.DocumentBlockParam,
        { type: 'text', text: fullPrompt },
      ]
    : fullPrompt

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 3500,
    system:
      'Bạn là chuyên gia phân tích chứng khoán CFA Level 3, 20 năm kinh nghiệm thị trường Việt Nam. Phân tích sâu, khách quan, dựa hoàn toàn trên số liệu thực tế được cung cấp. Không được bịa đặt số liệu. Khi fundamental data = N/A, không suy diễn từ giá trị đó. QUAN TRỌNG: Chỉ trả về JSON hợp lệ trong thẻ <result>, không có text nào khác.',
    messages: [{ role: 'user', content: userContent }],
  })

  const firstBlock = response.content?.[0]
  const text = firstBlock && firstBlock.type === 'text' ? firstBlock.text : ''

  if (!text) throw new Error('Claude returned empty response')

  // Try parse — if fails, retry once with explicit correction prompt
  try {
    return JSON.parse(extractJSONObject(text)) as AnalysisResult
  } catch {
    const retryResponse = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      system: 'Bạn là chuyên gia phân tích chứng khoán. Chỉ trả về JSON hợp lệ trong thẻ <result>, không có text nào khác.',
      messages: [
        { role: 'user', content: userContent },
        { role: 'assistant', content: text },
        { role: 'user', content: 'Response của bạn không phải JSON hợp lệ. Hãy trả về CHỈ JSON object trong thẻ <result>...</result>, không kèm text nào khác.' },
      ],
    })
    const retryBlock = retryResponse.content?.[0]
    const retryText = retryBlock && retryBlock.type === 'text' ? retryBlock.text : ''
    if (!retryText) throw new Error('Claude retry returned empty response')
    return JSON.parse(extractJSONObject(retryText)) as AnalysisResult
  }
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
  revenueGrowth?: number
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
  // Derived metrics
  peg?: number
  rs30d?: number
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
    const pegStr2 = h.peg !== undefined ? ` | PEG=${h.peg.toFixed(2)}x${h.peg < 1 ? '🟢' : h.peg > 2.5 ? '🔴' : ''}` : ''
    const rs30dStr = h.rs30d !== undefined ? ` | RS_vs_VNI=${h.rs30d >= 0 ? '+' : ''}${h.rs30d.toFixed(1)}%${h.rs30d > 3 ? '🚀' : h.rs30d < -3 ? '⚠' : ''}` : ''
    return `━━ [${h.symbol}] ${h.industry} ━━ ${h.weight.toFixed(1)}% danh mục
  Vị thế: ${h.qty.toLocaleString()} CP | Giá vốn: ${h.avgCost.toLocaleString()}đ → Hiện: ${h.currentPrice.toLocaleString()}đ | L/L: ${pnlSign}${h.pnlPct.toFixed(1)}%
  Kỹ thuật: RSI=${h.rsi} (${rsiLabel}) | ADX=${h.adx??0} (${h.adxTrend??'N/A'}) | MACD=${h.macdSignal}${h.macdHistogram ? ` hist=${h.macdHistogram}` : ''} | ${h.aboveSMA20 ? '↑SMA20' : '↓SMA20'} | ${h.aboveSMA50 ? '↑SMA50' : '↓SMA50'} | BB: ${h.bbSignal||'N/A'} | Vol: ${h.volumeSignal||'N/A'}
  Momentum: Trend30D: ${trendSign}${h.trend30d.toFixed(1)}%${momentum1Mstr}${momentum3Mstr}${rs30dStr}
  Cơ bản: P/E=${h.pe > 0 ? h.pe.toFixed(1) + 'x' : 'N/A'} | P/B=${(h.pb??0) > 0 ? (h.pb??0).toFixed(2) + 'x' : 'N/A'} | ROE=${h.roe > 0 ? h.roe.toFixed(1) + '%' : 'N/A'} | ROA=${(h.roa??0) > 0 ? (h.roa??0).toFixed(1) + '%' : 'N/A'} | TT_LN=${h.profitGrowth ? (h.profitGrowth >= 0 ? '+' : '') + h.profitGrowth.toFixed(1) + '%' : 'N/A'}${h.revenueGrowth ? ' | TT_DT=' + (h.revenueGrowth >= 0 ? '+' : '') + h.revenueGrowth.toFixed(1) + '%' : ''}${h.debtEquity > 0 ? ' | Nợ/Vốn=' + h.debtEquity.toFixed(2) : ''}${h.dividendYield > 0 ? ' | Cổ tức=' + h.dividendYield.toFixed(1) + '%' : ''}${pegStr2}${foreignBlock}${newsBlock}`
  }).join('\n\n')

  // Sector benchmarks for each unique industry in portfolio
  const uniqueIndustries = Array.from(new Set(ctx.holdings.map(h => h.industry).filter(Boolean)))
  const sectorBenchmarkBlock = uniqueIndustries.length > 0
    ? `\n▌ BENCHMARK NGÀNH (để đánh giá định giá):\n${uniqueIndustries.map(ind => getSectorBenchmark(ind)).filter(Boolean).join('\n')}`
    : ''

  const marketRegimeBlock = ctx.vnIndex ? `\n${getMarketRegime(ctx.vnIndex)}` : ''

  const prompt = `PHÂN TÍCH DANH MỤC ĐẦU TƯ TOÀN DIỆN — ${today}

▌ BỐI CẢNH THỊ TRƯỜNG:
${marketContext}${marketRegimeBlock}
${sectorBenchmarkBlock}

▌ TỔNG QUAN TÀI SẢN:
CP: ${ctx.totalValue.toLocaleString('vi-VN')}đ | Tiền mặt: ${ctx.cash.toLocaleString('vi-VN')}đ | Tổng TS: ${totalAssets.toLocaleString('vi-VN')}đ
Tỷ lệ tiền mặt: ${cashRatio}% | Số mã: ${ctx.holdings.length}
Phân bổ ngành: ${sectorText}

▌ CHI TIẾT TỪNG MÃ (dữ liệu 90 ngày + real-time):
${holdingsText}

▌ YÊU CẦU PHÂN TÍCH — DỰA HOÀN TOÀN VÀO SỐ LIỆU THỰC TẾ TRÊN:
1. Kỹ thuật từng mã: ADX (xu hướng mạnh/sideway?), RSI, MACD, BB, momentum 1-3 tháng
2. PEG & RS từng mã: mã nào rẻ so tăng trưởng (PEG < 1)? Mã nào đang dẫn đầu thị trường (RS > 0)?
3. Dòng tiền ngoại: NN đang mua/bán ròng mã nào? Tín hiệu gì? Room còn bao nhiêu?
4. Cơ bản: P/E + P/B so benchmark ngành (từ bảng trên), ROE + ROA có vượt TB ngành không? Tăng trưởng bền vững?
5. Rủi ro tập trung ngành, mã đơn lẻ, tương quan
6. Bối cảnh VN-Index + market regime: nên phòng thủ hay tấn công? Portfolio beta cao hay thấp?
7. Chiến lược tái cơ cấu cụ thể: mã nào tăng/giảm tỷ trọng, tại sao, mức giá

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
  // Technical
  rsi: number
  macdSignal: string
  macdHistogram: number
  aboveSMA20: boolean
  aboveSMA50: boolean
  bbSignal: string
  volumeSignal: string
  adx: number
  adxTrend: string
  trend30d: number
  momentum1M: number
  momentum3M: number
  volume: number
  // Support / Resistance
  support?: number
  resistance?: number
  support2?: number
  resistance2?: number
  // 52-week position
  w52high?: number
  w52low?: number
  w52position?: number
  // Fundamental
  pe: number
  eps: number
  roe: number
  roa: number
  pb: number
  revenueGrowth: number
  profitGrowth: number
  debtEquity: number
  dividendYield: number
  // Foreign investor flows
  foreignBuyVol: number
  foreignSellVol: number
  foreignNetVol: number
  foreignRoom?: number
  // Derived metrics
  peg?: number
  rs30d?: number
  // News headlines
  newsHeadlines?: string[]
}

export type InvestmentStyle = 'longterm' | 'dca' | 'swing' | 'dividend' | 'etf'

interface PredictContext {
  style: InvestmentStyle
  stocks: PredictStock[]
  vnIndex?: { trend30d: number; currentLevel: number; rsi: number }
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

  const vnBlock = ctx.vnIndex
    ? `\n▌ BỐI CẢNH THỊ TRƯỜNG (VN-Index):\nVN-Index: ${ctx.vnIndex.currentLevel.toLocaleString('vi-VN')} điểm | Xu hướng 30D: ${ctx.vnIndex.trend30d >= 0 ? '+' : ''}${ctx.vnIndex.trend30d.toFixed(1)}% | RSI: ${ctx.vnIndex.rsi} (${ctx.vnIndex.rsi > 70 ? 'Quá mua — thận trọng' : ctx.vnIndex.rsi < 30 ? 'Quá bán — có thể phục hồi' : 'Trung lập'})\n${getMarketRegime(ctx.vnIndex)}\n`
    : ''

  // Sector benchmarks for all unique industries in the stock list
  const uniqueInds = Array.from(new Set(ctx.stocks.map(s => s.industry).filter(i => i && i !== 'Khác')))
  const sectorBenchBlock = uniqueInds.length > 0
    ? `\n▌ BENCHMARK NGÀNH (so sánh định giá):\n${uniqueInds.map(ind => getSectorBenchmark(ind)).filter(Boolean).join('\n')}\n`
    : ''

  const tableRows = ctx.stocks
    .map((s, i) => {
      const foreignNet = s.foreignNetVol
      const foreignStr = (s.foreignBuyVol > 0 || s.foreignSellVol > 0)
        ? `\n   Dòng NN: Mua=${s.foreignBuyVol.toLocaleString('vi-VN')} | Bán=${s.foreignSellVol.toLocaleString('vi-VN')} | Net=${foreignNet >= 0 ? '+' : ''}${foreignNet.toLocaleString('vi-VN')}${s.foreignRoom !== undefined ? ` | Room: ${s.foreignRoom.toFixed(1)}%` : ''}`
        : ''
      const srStr = (s.support && s.resistance)
        ? `\n   S/R: Hỗ trợ=${s.support2 ? s.support2.toLocaleString('vi-VN') + '→' : ''}${s.support.toLocaleString('vi-VN')}₫ | Kháng cự=${s.resistance2 ? s.resistance2.toLocaleString('vi-VN') + '→' : ''}${s.resistance.toLocaleString('vi-VN')}₫`
        : ''
      const w52Str = (s.w52high && s.w52low)
        ? `\n   52W: Low=${s.w52low.toLocaleString('vi-VN')}₫ / High=${s.w52high.toLocaleString('vi-VN')}₫ → Giá ở ${s.w52position ?? 50}% vùng 52 tuần`
        : ''
      const pegStr = s.peg !== undefined ? ` | PEG=${s.peg.toFixed(2)}x${s.peg < 1 ? '🟢' : s.peg < 2 ? '' : '🔴'}` : ''
      const rsStr2 = s.rs30d !== undefined ? ` | RS_vs_VNI=${s.rs30d >= 0 ? '+' : ''}${s.rs30d.toFixed(1)}%${s.rs30d > 3 ? '🚀' : s.rs30d < -3 ? '⚠' : ''}` : ''
      const newsStr = s.newsHeadlines && s.newsHeadlines.length > 0
        ? `\n   Tin tức: ${s.newsHeadlines.slice(0, 2).map(h => `"${h.slice(0, 90)}"`).join(' | ')}`
        : ''
      return `${i + 1}. [${s.symbol}] ${s.industry}
   Giá: ${s.price.toLocaleString('vi-VN')}₫ (${s.changePct > 0 ? '+' : ''}${s.changePct.toFixed(1)}% hôm nay, Trend30D: ${s.trend30d >= 0 ? '+' : ''}${s.trend30d.toFixed(1)}%)
   Kỹ thuật: RSI=${s.rsi} | ADX=${s.adx} (${s.adxTrend}) | MACD=${s.macdSignal} hist=${s.macdHistogram} | ${s.aboveSMA20 ? '↑SMA20' : '↓SMA20'} | ${s.aboveSMA50 ? '↑SMA50' : '↓SMA50'} | BB: ${s.bbSignal} | Vol: ${s.volumeSignal}
   Momentum: 1T=${s.momentum1M >= 0 ? '+' : ''}${s.momentum1M}% | 3T=${s.momentum3M >= 0 ? '+' : ''}${s.momentum3M}% | KL=${s.volume.toLocaleString('vi-VN')}${srStr}${w52Str}
   Cơ bản: P/E=${s.pe.toFixed(1)}x | P/B=${s.pb.toFixed(2)}x | EPS=${s.eps.toLocaleString('vi-VN')}₫ | ROE=${s.roe.toFixed(1)}% | ROA=${s.roa.toFixed(1)}% | LN_Growth=${s.profitGrowth >= 0 ? '+' : ''}${s.profitGrowth.toFixed(1)}% | DT_Growth=${s.revenueGrowth >= 0 ? '+' : ''}${s.revenueGrowth.toFixed(1)}%${s.dividendYield > 0 ? ` | Cổ tức=${s.dividendYield.toFixed(1)}%` : ''}${s.debtEquity > 0 ? ` | Nợ/Vốn=${s.debtEquity.toFixed(2)}x` : ''}${pegStr}${rsStr2}${foreignStr}${newsStr}`
    })
    .join('\n')

  const prompt = `PHÂN TÍCH CHUYÊN SÂU ${ctx.stocks.length} MÃ CỔ PHIẾU VIỆT NAM (${timestamp})
${vnBlock}${sectorBenchBlock}
═══════════════════════════════════════════
DỮ LIỆU THỰC TẾ TỪNG MÃ (90 ngày lịch sử):
═══════════════════════════════════════════
${tableRows}

═══════════════════════════════════════════
PHONG CÁCH ĐẦU TƯ CẦN PHÂN TÍCH:
${styleDesc}
═══════════════════════════════════════════

NHIỆM VỤ: Với vai trò chuyên gia quản lý quỹ CFA, hãy:
1. Phân tích từng mã dựa trên dữ liệu KỸ THUẬT (ADX xu hướng, RSI, MACD, BB, momentum) và CƠ BẢN (P/E, P/B, ROE, ROA, tăng trưởng) thực tế ở trên
2. Xét tác động dòng tiền nước ngoài (NN mua/bán ròng) — tín hiệu quan trọng nhất TTCK VN
3. Chọn TOP 5-7 mã PHÙ HỢP NHẤT cho phong cách đầu tư này
4. Với mỗi mã: giải thích cụ thể TẠI SAO phù hợp dựa trên các con số thực tế
5. Xếp hạng từ phù hợp nhất → ít phù hợp nhất
6. Định giá target price dựa trên PE ngành, tăng trưởng dự phóng và kỹ thuật

PHÂN TÍCH PHẢI BAO GỒM (scoring = 30% kỹ thuật + 40% cơ bản + 30% momentum/tin tức/dòng tiền):
- ADX: xu hướng mạnh/sideway? RSI/MACD có đáng tin không?
- MACD histogram: đang tăng hay giảm? momentum ngắn hạn
- BB: giá đang overbought/oversold/trong dải?
- Momentum 1T/3T: ngắn hạn vs dài hạn khớp nhau không?
- PEG: < 1.0 = rẻ so tăng trưởng (ưu tiên cao), 1-2 = hợp lý, > 2 = đắt
- Relative Strength (RS): cổ phiếu outperform hay underperform VN-Index? (tín hiệu chọn lọc quan trọng)
- Chất lượng LN: biên LN mở rộng (LN_Growth > DT_Growth) hay thu hẹp?
- Dòng NN: smart money đang mua hay bán mã này?
- Bối cảnh VN-Index: thị trường chung hỗ trợ hay cản trở?
- Tin tức: có sự kiện catalyst tích cực/tiêu cực nào không?
- Cơ bản: P/E+P/B định giá hợp lý? ROE+ROA so ngành? Tăng trưởng bền vững?

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
    max_tokens: 4000,
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

// ─── Chat AI ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatStockContext {
  symbol: string
  price: number
  changePct: number
  style?: InvestmentStyle
  // Technical
  rsi: number
  macd: number
  signal: number
  macdHistogram: number
  sma20: number
  sma50: number
  aboveSMA20: boolean
  aboveSMA50: boolean
  bbUpper: number
  bbMid: number
  bbLower: number
  bbSignal: string
  volumeSignal: string
  adx: number
  adxTrend: string
  momentum1M: number
  momentum3M: number
  trend30d: number
  support: number
  resistance: number
  support2: number
  resistance2: number
  // Fundamental
  pe: number
  pb: number
  eps: number
  roe: number
  roa: number
  revenueGrowth: number
  profitGrowth: number
  dividendYield: number
  // Foreign flows
  foreignBuyVol: number
  foreignSellVol: number
  foreignNetVol: number
  foreignRoom?: number
  // News
  newsHeadlines: string[]
  // Market
  vnIndex?: { trend30d: number; currentLevel: number; rsi: number }
  // Additional depth fields (match analyzeStock)
  momentum1W?: number
  w52position?: number
  w52high?: number
  w52low?: number
  debtEquity?: number
  netMargin?: number
  quarterlyEPS?: Array<{ period: string; eps: number; pe: number }>
  // Analyst report PDF for deep analysis
  reportPdfBase64?: string
  reportTitle?: string
  // Derived valuation metrics
  peg?: number
  rs30d?: number
}

export async function chatStockAnalysis(
  ctx: ChatStockContext,
  messages: ChatMessage[]
): Promise<string> {
  const client = getClient()
  const today = new Date().toLocaleDateString('vi-VN')
  const styleDesc = ctx.style ? STYLE_DESCRIPTIONS[ctx.style] : null

  const fmt0 = (v: number, suffix: string, d = 1) => v !== 0 ? v.toFixed(d) + suffix : 'N/A'
  const fmtGrowth = (v: number) => v !== 0 ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : 'N/A'

  const vnBlock = ctx.vnIndex
    ? `${ctx.vnIndex.currentLevel.toLocaleString('vi-VN')} điểm | Xu hướng 30D: ${ctx.vnIndex.trend30d >= 0 ? '+' : ''}${ctx.vnIndex.trend30d.toFixed(1)}% | RSI: ${ctx.vnIndex.rsi} (${ctx.vnIndex.rsi > 70 ? 'Quá mua ⚠' : ctx.vnIndex.rsi < 30 ? 'Quá bán 🔻' : 'Trung lập'})`
    : 'Không có dữ liệu'

  const foreignNet = ctx.foreignNetVol
  const foreignBlock = (ctx.foreignBuyVol > 0 || ctx.foreignSellVol > 0)
    ? `Mua: ${ctx.foreignBuyVol.toLocaleString('vi-VN')} CP | Bán: ${ctx.foreignSellVol.toLocaleString('vi-VN')} CP | Net: ${foreignNet >= 0 ? '+' : ''}${foreignNet.toLocaleString('vi-VN')}${ctx.foreignRoom !== undefined ? ` | Room: ${ctx.foreignRoom.toFixed(1)}%` : ''}`
    : 'Không có dữ liệu hôm nay'

  const newsText = ctx.newsHeadlines.length > 0
    ? ctx.newsHeadlines.slice(0, 5).map((h, i) => `${i + 1}. ${h}`).join('\n')
    : 'Không có tin nổi bật'

  const srText = (ctx.support && ctx.resistance)
    ? `Kháng cự: ${ctx.resistance2 > 0 ? ctx.resistance2.toLocaleString('vi-VN') + '₫ (gần) → ' : ''}${ctx.resistance.toLocaleString('vi-VN')}₫ | Hỗ trợ: ${ctx.support2 > 0 ? ctx.support2.toLocaleString('vi-VN') + '₫ (gần) → ' : ''}${ctx.support.toLocaleString('vi-VN')}₫`
    : ''

  const w52Block = (ctx.w52high && ctx.w52low && ctx.w52position !== undefined)
    ? `52 tuần: Low=${ctx.w52low.toLocaleString('vi-VN')}₫ / High=${ctx.w52high.toLocaleString('vi-VN')}₫ → Giá đang ở ${ctx.w52position}% vùng 52 tuần (0%=đáy 52T, 100%=đỉnh 52T)`
    : ''

  const momentum1WStr = ctx.momentum1W !== undefined ? ` | 1 tuần=${ctx.momentum1W >= 0 ? '+' : ''}${ctx.momentum1W}%` : ''

  const systemPrompt = `Bạn là chuyên gia phân tích chứng khoán CFA Level 3, 20 năm kinh nghiệm tại thị trường chứng khoán Việt Nam. Đang tư vấn đầu tư về mã **${ctx.symbol}** — ${today}.

Dưới đây là toàn bộ dữ liệu THỰC TẾ cập nhật (90 ngày lịch sử + realtime):

▌ GIÁ HIỆN TẠI:
${ctx.price.toLocaleString('vi-VN')}₫ | Hôm nay: ${ctx.changePct >= 0 ? '+' : ''}${ctx.changePct.toFixed(2)}%
${w52Block}

▌ KỸ THUẬT (90 ngày dữ liệu thực — VPS):
RSI(14): ${ctx.rsi.toFixed(0)} → ${ctx.rsi > 70 ? 'Quá mua ⚠' : ctx.rsi < 30 ? 'Quá bán 🔻' : 'Trung lập'}
ADX(14): ${ctx.adx} → ${ctx.adxTrend} (>25=xu hướng mạnh, <20=sideway)
MACD: ${ctx.macd.toFixed(2)} | Signal: ${ctx.signal.toFixed(2)} | Histogram: ${ctx.macdHistogram.toFixed(2)} (${ctx.macdHistogram > 0 ? 'tăng ↑ momentum bullish' : 'giảm ↓ momentum bearish'})
SMA20: ${ctx.sma20.toLocaleString('vi-VN')}₫ (giá ${ctx.aboveSMA20 ? 'TRÊN ↑' : 'DƯỚI ↓'}) | SMA50: ${ctx.sma50.toLocaleString('vi-VN')}₫ (${ctx.aboveSMA50 ? 'TRÊN ↑' : 'DƯỚI ↓'})
BB(20,2): Upper=${ctx.bbUpper.toLocaleString('vi-VN')} / Mid=${ctx.bbMid.toLocaleString('vi-VN')} / Lower=${ctx.bbLower.toLocaleString('vi-VN')} → ${ctx.bbSignal}
Khối lượng: ${ctx.volumeSignal}
Momentum:${momentum1WStr} | 1 tháng=${ctx.momentum1M >= 0 ? '+' : ''}${ctx.momentum1M}% | 3 tháng=${ctx.momentum3M >= 0 ? '+' : ''}${ctx.momentum3M}% | Trend 30D=${ctx.trend30d >= 0 ? '+' : ''}${ctx.trend30d.toFixed(1)}%
${srText ? `Hỗ trợ/Kháng cự (20 phiên): ${srText}` : ''}
${(() => {
    const q = ctx.quarterlyEPS
    if (!q || q.length < 2) return ''
    const rows = q.map(r => `  ${r.period}: EPS=${r.eps > 0 ? r.eps.toLocaleString('vi-VN') + '₫' : 'N/A'}${r.pe > 0 ? ` | P/E=${r.pe.toFixed(1)}x` : ''}`).join('\n')
    const oldest = q[q.length - 1].eps, newest = q[0].eps
    const epsChg = oldest > 0 && newest > 0 ? Math.round(((newest - oldest) / Math.abs(oldest)) * 100) : 0
    const trend = epsChg > 20 ? `→ ⬆ EPS TĂNG TỐC +${epsChg}%` : epsChg > 5 ? `→ ↑ +${epsChg}%` : epsChg < -20 ? `→ ⬇ EPS SUY GIẢM ${epsChg}%` : epsChg < -5 ? `→ ↓ ${epsChg}%` : `→ ↔ ổn định`
    return `▌ EPS THEO QUÝ (4 quý gần nhất):\n${rows}\n${trend}\n\n`
  })()}▌ CƠ BẢN (Simplize + CafeF — dữ liệu mới nhất):
P/E: ${fmt0(ctx.pe, 'x')} | P/B: ${fmt0(ctx.pb, 'x', 2)} | EPS: ${ctx.eps > 0 ? ctx.eps.toLocaleString('vi-VN') + '₫' : 'N/A'}
ROE: ${fmt0(ctx.roe, '%')} | ROA: ${fmt0(ctx.roa, '%')}${ctx.netMargin ? ` | Biên LN ròng: ${ctx.netMargin.toFixed(1)}%` : ''}${ctx.debtEquity !== undefined && ctx.debtEquity > 0 ? ` | Nợ/Vốn: ${ctx.debtEquity.toFixed(2)}x` : ''}
Tăng trưởng Doanh thu: ${fmtGrowth(ctx.revenueGrowth)} | Tăng trưởng Lợi nhuận: ${fmtGrowth(ctx.profitGrowth)}
Cổ tức: ${fmt0(ctx.dividendYield, '%')}${(ctx.peg !== undefined || ctx.rs30d !== undefined) ? `

▌ ĐỊNH GIÁ TƯƠNG ĐỐI & SỨC MẠNH TƯƠNG ĐỐI:${ctx.peg !== undefined ? `
PEG Ratio = P/E / TT_LN = ${ctx.peg.toFixed(2)}x → ${ctx.peg < 0.8 ? '🟢 RẺ SO VỚI TĂNG TRƯỞNG (cơ hội mua tốt)' : ctx.peg < 1.5 ? '✅ Định giá hợp lý' : ctx.peg < 2.5 ? '⚠ Hơi đắt' : '🔴 ĐẮTS so tăng trưởng'}` : ''}${ctx.rs30d !== undefined ? `
RS vs VN-Index (30 ngày): ${ctx.rs30d >= 0 ? '+' : ''}${ctx.rs30d.toFixed(1)}% → ${ctx.rs30d > 5 ? '🚀 OUTPERFORM MẠNH' : ctx.rs30d > 0 ? '📈 Outperform nhẹ' : ctx.rs30d > -5 ? '📉 Underperform nhẹ' : '⚠ UNDERPERFORM MẠNH'}` : ''}${ctx.revenueGrowth !== 0 && ctx.profitGrowth !== 0 ? `
Chất lượng LN: ${ctx.profitGrowth > ctx.revenueGrowth ? '✓ Biên LN MỞ RỘNG (LN tăng nhanh hơn DT — hiệu quả cải thiện)' : '⚠ Biên LN THU HẸP (LN tăng chậm hơn DT — chi phí leo thang)'}` : ''}` : ''}

▌ DÒNG TIỀN NGOẠI (tín hiệu quan trọng TTCK VN):
${foreignBlock}

▌ TIN TỨC GẦN ĐÂY (7 ngày):
${newsText}

▌ VN-INDEX (bối cảnh thị trường):
${vnBlock}
${styleDesc ? `\n▌ PHONG CÁCH ĐẦU TƯ ĐANG ĐƯỢC HỎI: ${ctx.style?.toUpperCase()}\n${styleDesc}\n` : ''}${ctx.reportPdfBase64 ? `\n▌ BÁO CÁO PHÂN TÍCH CHUYÊN GIA (đã đính kèm PDF — tham khảo khi trả lời):\nTiêu đề: "${ctx.reportTitle || 'Báo cáo phân tích mới nhất'}"\n→ Kết hợp nội dung PDF với dữ liệu kỹ thuật + cơ bản ở trên\n` : ''}
QUY TẮC TRẢ LỜI — PHÂN TÍCH CHUYÊN SÂU:
- Phân tích SÂU và CHI TIẾT, dựa HOÀN TOÀN trên số liệu THỰC TẾ ở trên
- Trả lời bằng tiếng Việt, CỤ THỂ với con số thực (không chung chung)
- Khi N/A thì nói rõ không có dữ liệu, KHÔNG được bịa số
- Dùng markdown ĐẦY ĐỦ: **bold** cho điểm quan trọng, ## cho tiêu đề phần, bullet points (- ) cho danh sách
- BẮT BUỘC đề cập: ADX (xu hướng mạnh/sideway?), dòng tiền NN (mua/bán ròng bao nhiêu CP?), momentum 1T/3T khi relevant
- Khi hỏi về định giá: BẮT BUỘC đề cập PEG ratio (< 1 = rẻ, > 2 = đắt) và RS vs thị trường
- Khi hỏi về timing: BẮT BUỘC đề cập RS (đang outperform hay underperform?), chất lượng lợi nhuận (biên LN mở rộng hay thu hẹp?)
- Khi nói về giá: luôn kèm vùng giá cụ thể (vùng hỗ trợ, kháng cự, vùng mua)
- Cuối câu trả lời: tóm tắt **Kết luận** 1-2 dòng + gợi ý 1-2 câu hỏi follow-up phù hợp`

  // Build Anthropic messages — inject PDF as document block on first message if available
  const anthropicMessages: Anthropic.MessageParam[] = []
  const isFirstQuestion = messages.length === 1

  if (ctx.reportPdfBase64 && isFirstQuestion && messages[0]?.role === 'user') {
    // First question: attach PDF as document context
    anthropicMessages.push({
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: ctx.reportPdfBase64 },
        } as Anthropic.DocumentBlockParam,
        { type: 'text', text: messages[0].content },
      ],
    })
  } else {
    // Multi-turn or no PDF: plain messages
    for (const m of messages) {
      anthropicMessages.push({ role: m.role, content: m.content })
    }
  }

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 3000,
    system: systemPrompt,
    messages: anthropicMessages,
  })

  const firstBlock = response.content?.[0]
  return firstBlock && firstBlock.type === 'text' ? firstBlock.text : 'Không thể tạo phân tích lúc này. Vui lòng thử lại.'
}
