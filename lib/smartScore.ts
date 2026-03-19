/**
 * smartScore.ts — Algorithmic scoring engine for "Phân Tích Thông Minh"
 * No Claude API needed. Pure math + rule-based signals.
 *
 * Three dimensions:
 *   Technical   30% — trend, momentum, RSI, MACD, BB, ADX, volume
 *   Fundamental 40% — P/E, ROE, ROA, P/B, EPS growth, debt, dividend
 *   Sentiment   30% — news, foreign flow, 52W position, market regime
 */

import { calcRSI, calcMACD, calcBB, calcSMA, calcDMI, calcATR, calcOBV, calcWilliamsR, calcCCI } from './indicators'
import { detectPatterns, type PatternResult } from './patterns'

// ─── Sector benchmarks ───────────────────────────────────────────────────────
interface SectorBench { peMax: number; pbMax: number; roeMin: number; roaMin: number; deMax: number }
const SECTOR_BENCHMARKS: Record<string, SectorBench> = {
  'Ngân hàng':         { peMax: 15, pbMax: 2.0, roeMin: 15, roaMin: 0.8,  deMax: 999 }, // banks: high leverage by design. peMax=15 (VCB premium 16-22x, sector avg 12-15x)
  'Bảo hiểm':          { peMax: 20, pbMax: 2.5, roeMin: 12, roaMin: 1.5,  deMax: 999 },
  'Chứng khoán':       { peMax: 16, pbMax: 2.5, roeMin: 12, roaMin: 1.0,  deMax: 5.0 }, // securities: low ROA by design (large margin lending balance sheet)
  'Bất động sản':      { peMax: 22, pbMax: 2.5, roeMin: 10, roaMin: 2.0,  deMax: 3.0 },
  'Thép':              { peMax: 12, pbMax: 1.5, roeMin:  8, roaMin: 3.0,  deMax: 2.0 },
  'Vật liệu xây dựng': { peMax: 14, pbMax: 1.8, roeMin:  8, roaMin: 3.0,  deMax: 1.5 },
  'Bán lẻ':            { peMax: 22, pbMax: 3.5, roeMin: 15, roaMin: 4.0,  deMax: 2.0 },
  'Công nghệ':         { peMax: 30, pbMax: 5.0, roeMin: 18, roaMin: 8.0,  deMax: 1.0 },
  'Thực phẩm':         { peMax: 25, pbMax: 4.0, roeMin: 20, roaMin: 8.0,  deMax: 1.0 },
  'Đồ uống':           { peMax: 25, pbMax: 4.5, roeMin: 20, roaMin: 8.0,  deMax: 0.8 },
  'Dầu khí':           { peMax: 15, pbMax: 2.5, roeMin: 12, roaMin: 5.0,  deMax: 1.5 },
  'Dược phẩm':         { peMax: 25, pbMax: 4.0, roeMin: 15, roaMin: 8.0,  deMax: 0.8 },
  'Điện':              { peMax: 18, pbMax: 2.2, roeMin: 10, roaMin: 3.0,  deMax: 2.5 },
  'Năng lượng':        { peMax: 18, pbMax: 2.2, roeMin: 10, roaMin: 3.0,  deMax: 2.5 },
  'Vận tải':           { peMax: 18, pbMax: 2.0, roeMin: 10, roaMin: 3.0,  deMax: 2.0 },
  'Logistics':         { peMax: 20, pbMax: 2.5, roeMin: 12, roaMin: 4.0,  deMax: 2.0 },
  'Xây dựng':          { peMax: 15, pbMax: 1.8, roeMin:  8, roaMin: 3.0,  deMax: 2.5 },
  'Hóa chất':          { peMax: 14, pbMax: 1.8, roeMin:  8, roaMin: 4.0,  deMax: 1.5 },
  'Thủy sản':          { peMax: 15, pbMax: 2.0, roeMin: 10, roaMin: 4.0,  deMax: 1.5 },
  'Nông nghiệp':       { peMax: 15, pbMax: 1.8, roeMin:  8, roaMin: 3.0,  deMax: 1.5 },
  'Viễn thông':        { peMax: 18, pbMax: 3.0, roeMin: 15, roaMin: 5.0,  deMax: 1.5 },
  'Y tế':              { peMax: 28, pbMax: 5.0, roeMin: 15, roaMin: 7.0,  deMax: 0.8 },
}

function getSectorBench(industry: string): SectorBench {
  for (const [key, val] of Object.entries(SECTOR_BENCHMARKS)) {
    if (industry.toLowerCase().includes(key.toLowerCase())) return val
  }
  return { peMax: 18, pbMax: 2.5, roeMin: 12, roaMin: 3.0, deMax: 2.0 } // generic default
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmartScoreInput {
  symbol: string
  industry: string
  price: number
  changePct: number
  // Price history arrays (oldest→newest)
  closes: number[]
  highs: number[]
  lows: number[]
  volumes: number[]
  // Optional weekly candles for multi-timeframe analysis
  weeklyCloses?: number[]
  weeklyHighs?: number[]
  weeklyLows?: number[]
  // Fundamentals
  pe: number
  pb: number
  roe: number
  roa: number
  eps: number
  profitGrowth: number
  revenueGrowth: number
  debtEquity: number
  dividendYield: number
  netMargin: number
  quarterlyEPS: Array<{ period: string; eps: number; pe: number }>
  businessPlanPct?: number   // profitActual / profitTarget × 100 (115 = exceeded by 15%)
  // Market context
  w52high: number
  w52low: number
  foreignBuyVol: number
  foreignSellVol: number
  foreignRoom: number
  avgSentiment: number
  news: Array<{ title: string; sentiment: number }>
  vnIndex: { trend30d: number; currentLevel: number; rsi: number }
}

export interface TechnicalSignals {
  trend: string        // price vs SMA20/50
  rsi: number
  rsiSignal: string
  rsiDivergence: string  // RSI divergence signal (bullish/bearish/none)
  macdSignal: string
  bbSignal: string
  adxValue: number
  adxSignal: string
  volumeSignal: string
  obvSignal: string      // OBV trend confirmation
  williamsR: number      // Williams %R latest value (-100 to 0)
  williamsRSignal: string
  cciValue: number       // CCI latest value
  cciSignal: string
  momentum1W: number
  momentum1M: number
  momentum3M: number
  support: number
  resistance: number
  weeklyTrend: string   // 'TĂNG' | 'GIẢM' | 'TÍCH LŨY' | 'N/A'
  weeklyRsi: number     // 0-100 weekly RSI
  detectedPatterns: PatternResult[]
  score: number        // 0-100
}

export interface FundamentalSignals {
  peSignal: string
  pbSignal: string
  roeSignal: string
  roaSignal: string
  growthSignal: string
  debtSignal: string
  dividendSignal: string
  earningsQuality: string    // EPS quarterly trend (acceleration)
  marginQuality: string      // Chất lượng LN: profitGrowth vs revenueGrowth (margin expansion)
  peg: number | null
  score: number
}

export interface SentimentSignals {
  newsScore: number
  newsSummary: string
  foreignFlow: string
  w52Signal: string
  marketRegime: string
  relativeStrength: number
  rsSignal: string
  score: number
}

export interface SmartScoreResult {
  symbol: string
  industry: string
  price: number
  overallScore: number     // 0-100
  recommendation: 'MUA MẠNH' | 'MUA' | 'GIỮ' | 'BÁN' | 'BÁN MẠNH'
  confidence: 'CAO' | 'TRUNG BÌNH' | 'THẤP'
  targetPrice: number
  stopLoss: number
  technical: TechnicalSignals
  fundamental: FundamentalSignals
  sentiment: SentimentSignals
  strengths: string[]
  weaknesses: string[]
  watchPoints: string[]
  entryZone: { low: number; high: number }
  holdingPeriod: string
  rrRatio: number
  confidenceNum: number      // 0-100 numeric confidence (like AI output)
  technicalSummary: string   // synthesized narrative (~90 words)
  fundamentalSummary: string
  sentimentSummary: string
  action: string             // immediate action recommendation with price levels
  nextReview: string         // conditions to monitor
  sma20: number
  sma50: number
  sma200: number
  rsi14: number
  macdValue: number
  macdSignalValue: number
  bbUpper: number
  bbLower: number
  bbMid: number
  atr14: number       // Average True Range (14-day) for trailing stop display
  weeklyTrend: string // Weekly multi-timeframe trend: TĂNG | GIẢM | TÍCH LŨY | N/A
  weeklyRsi: number   // Weekly RSI(14)
}

// ─── Helper: clamp to [0,100] ─────────────────────────────────────────────────
function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v))
}

// ─── Technical Score ─────────────────────────────────────────────────────────
function scoreTechnical(input: SmartScoreInput): { signals: TechnicalSignals; score: number } {
  const { closes, highs, lows, volumes, price } = input
  if (closes.length < 30) {
    return {
      signals: {
        trend: 'Không đủ dữ liệu', rsi: 50, rsiSignal: 'N/A', rsiDivergence: 'Không đủ dữ liệu', macdSignal: 'N/A',
        bbSignal: 'N/A', adxValue: 0, adxSignal: 'N/A', volumeSignal: 'N/A',
        obvSignal: 'N/A', williamsR: -50, williamsRSignal: 'N/A', cciValue: 0, cciSignal: 'N/A',
        momentum1W: 0, momentum1M: 0, momentum3M: 0, support: 0, resistance: 0,
        weeklyTrend: 'N/A', weeklyRsi: 50, detectedPatterns: [],
        score: 50,
      },
      score: 50,
    }
  }

  let points = 0
  const MAX = 100

  // --- SMA trend (20 pts) — includes SMA200 long-term context ---
  const sma20arr = calcSMA(closes, 20).filter(v => !isNaN(v))
  const sma50arr = calcSMA(closes, 50).filter(v => !isNaN(v))
  const sma200arr200 = closes.length >= 200 ? calcSMA(closes, 200).filter(v => !isNaN(v)) : []
  const sma20 = sma20arr[sma20arr.length - 1] ?? price
  const sma50 = sma50arr[sma50arr.length - 1] ?? price
  const sma200local = sma200arr200[sma200arr200.length - 1] ?? 0
  const hasSma200 = sma200local > 0

  let trend = 'Trung lập'
  if (price > sma20 && sma20 > sma50) {
    if (hasSma200 && price > sma200local) { trend = 'Tăng mạnh (trên SMA20/50/200)'; points += 20 }
    else if (hasSma200 && price < sma200local) { trend = 'Tăng ngắn-trung hạn (trên SMA20/50, dưới SMA200)'; points += 15 }
    else { trend = 'Tăng mạnh (trên SMA20 & SMA50)'; points += 20 }
  } else if (price > sma20 && price < sma50) { trend = 'Tăng nhẹ (trên SMA20, dưới SMA50)'; points += 12 }
  else if (price < sma20 && price > sma50) { trend = 'Giảm nhẹ (dưới SMA20, trên SMA50)'; points += 8 }
  else if (price < sma20 && sma20 < sma50) {
    if (hasSma200 && price < sma200local) { trend = 'Giảm mạnh (dưới SMA20/50/200) — bear dài hạn'; points += 1 }
    else { trend = 'Giảm mạnh (dưới SMA20 & SMA50)'; points += 2 }
  } else { points += 10 }

  // --- RSI (15 pts) — framework: RSI 40-65 = bullish zone tốt nhất (15 pts) ---
  const rsiArr = calcRSI(closes, 14).filter(v => !isNaN(v))
  const rsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50
  let rsiSignal = 'Trung lập'
  if (rsi >= 40 && rsi <= 65) { rsiSignal = 'Vùng tối ưu (40-65) — momentum tốt nhất'; points += 15 }
  else if (rsi < 30) { rsiSignal = 'Quá bán - cơ hội tích lũy'; points += 14 }
  else if (rsi >= 30 && rsi < 40) { rsiSignal = 'Gần oversold - tích lũy dần'; points += 11 }
  else if (rsi > 65 && rsi <= 75) { rsiSignal = 'Bắt đầu quá mua - theo dõi chốt lời'; points += 10 }
  else { rsiSignal = 'Quá mua - rủi ro điều chỉnh mạnh'; points += 4 }

  // --- RSI Divergence (bonus/penalty ±7 pts) ---
  // Bullish: price lower low + RSI higher low → early reversal signal
  // Bearish: price higher high + RSI lower high → exhaustion warning
  let rsiDivergence = 'Không có phân kỳ rõ ràng'
  if (rsiArr.length >= 20 && closes.length >= 20) {
    const priceRecent = closes.slice(-5)
    const pricePrev   = closes.slice(-20, -5)
    const rsiRecent   = rsiArr.slice(-5)
    const rsiPrev     = rsiArr.slice(-20, -5).filter(v => !isNaN(v))
    if (rsiPrev.length >= 5) {
      const priceLo = Math.min(...priceRecent), pricePrevLo = Math.min(...pricePrev)
      const rsiLo   = Math.min(...rsiRecent),   rsiPrevLo   = Math.min(...rsiPrev)
      const priceHi = Math.max(...priceRecent), pricePrevHi = Math.max(...pricePrev)
      const rsiHi   = Math.max(...rsiRecent),   rsiPrevHi   = Math.max(...rsiPrev)
      if (priceLo < pricePrevLo * 0.995 && rsiLo > rsiPrevLo + 4) {
        const gap = Math.round(rsiLo - rsiPrevLo)
        const strength = gap > 10 ? 'MẠNH' : 'nhẹ'
        rsiDivergence = `Phân kỳ tăng ${strength}: Giá thấp hơn nhưng RSI cao hơn (+${gap}pts) — cảnh báo đảo chiều TẮT`
        points += gap > 10 ? 7 : 4
      } else if (priceHi > pricePrevHi * 1.005 && rsiHi < rsiPrevHi - 4) {
        const gap = Math.round(rsiPrevHi - rsiHi)
        const strength = gap > 10 ? 'MẠNH' : 'nhẹ'
        rsiDivergence = `Phân kỳ giảm ${strength}: Giá cao hơn nhưng RSI thấp hơn (−${gap}pts) — cảnh báo đảo chiều XUỐNG`
        points -= gap > 10 ? 7 : 4
      }
    }
  }

  // --- MACD (15 pts) ---
  const macdArr = calcMACD(closes)
  const macdPt = macdArr.filter(p => !isNaN(p.macd) && !isNaN(p.signal))
  const lastMacd = macdPt[macdPt.length - 1]
  const prevMacd = macdPt[macdPt.length - 2]
  let macdSignal = 'N/A'
  if (lastMacd) {
    const bullCross = lastMacd.macd > lastMacd.signal && prevMacd?.macd != null && prevMacd.macd <= prevMacd.signal
    const bearCross = lastMacd.macd < lastMacd.signal && prevMacd?.macd != null && prevMacd.macd >= prevMacd.signal
    if (bullCross) { macdSignal = 'Golden Cross — Tín hiệu MUA mạnh'; points += 15 }
    else if (bearCross) { macdSignal = 'Death Cross — Tín hiệu BÁN'; points += 3 }
    else if (lastMacd.macd > lastMacd.signal && lastMacd.histogram > 0) {
      // Histogram expanding positive = accelerating uptrend (+12), stable = +10
      const histExpandPos = prevMacd?.histogram != null && lastMacd.histogram > prevMacd.histogram
      macdSignal = histExpandPos ? 'MACD mở rộng dương — momentum tăng tốc' : 'MACD trên signal — Xu hướng tăng'
      points += histExpandPos ? 12 : 10
    } else if (lastMacd.macd < lastMacd.signal && lastMacd.histogram < 0) {
      // Histogram expanding negative = accelerating downtrend (+2), stable negative = +4
      const histExpandNeg = prevMacd?.histogram != null && lastMacd.histogram < prevMacd.histogram
      macdSignal = histExpandNeg ? 'MACD mở rộng âm — momentum giảm tăng tốc' : 'MACD dưới signal — Xu hướng giảm'
      points += histExpandNeg ? 2 : 4
    } else {
      macdSignal = 'MACD trung lập'
      points += 7
    }
  } else points += 7

  // --- Bollinger Bands (10 pts) ---
  const bbArr = calcBB(closes, 20)
  const bbPt = bbArr.filter(p => !isNaN(p.upper))
  const lastBb = bbPt[bbPt.length - 1]
  let bbSignal = 'Inside BB'
  if (lastBb) {
    const bbPct = (price - lastBb.lower) / (lastBb.upper - lastBb.lower)
    if (price <= lastBb.lower * 1.01) { bbSignal = 'Oversold (dưới BB dưới) — cơ hội'; points += 10 }
    else if (price >= lastBb.upper * 0.99) { bbSignal = 'Overbought (trên BB trên) — cẩn thận'; points += 4 }
    else if (bbPct > 0.3 && bbPct < 0.7) { bbSignal = 'Trong BB — ổn định'; points += 7 }
    else { bbSignal = 'Gần biên BB'; points += 6 }
  } else points += 5

  // --- DMI/ADX trend strength + direction (10 pts) ---
  let adxValue = 0, adxSignal = 'Không đủ dữ liệu'
  if (highs.length >= 28 && lows.length >= 28) {
    const dmiArr = calcDMI(highs, lows, closes, 14)
    const lastDMI = dmiArr.filter(d => !isNaN(d.adx)).pop()
    if (lastDMI) {
      adxValue = Math.round(lastDMI.adx)
      const dp = lastDMI.diPlus, dm = lastDMI.diMinus
      const uptrend = dp > dm
      // Require ≥3pt DI gap to declare a strong directional trend (avoids borderline DI≈DI noise)
      const strongUptrend   = dp > dm + 3
      const strongDowntrend = dm > dp + 3
      if (adxValue >= 25 && strongUptrend)   { adxSignal = `ADX ${adxValue} — Xu hướng TĂNG MẠNH (DI+ ${Math.round(dp)} > DI- ${Math.round(dm)})`; points += 10 }
      else if (adxValue >= 25 && strongDowntrend) { adxSignal = `ADX ${adxValue} — Xu hướng GIẢM MẠNH (DI- ${Math.round(dm)} > DI+ ${Math.round(dp)})`; points += 2 }
      else if (adxValue >= 25 && uptrend)    { adxSignal = `ADX ${adxValue} — Xu hướng tăng (DI+ ${Math.round(dp)} ≈ DI- ${Math.round(dm)})`; points += 7 }
      else if (adxValue >= 25 && !uptrend)   { adxSignal = `ADX ${adxValue} — Xu hướng giảm nhẹ (DI- ${Math.round(dm)} ≈ DI+ ${Math.round(dp)})`; points += 4 }
      else if (adxValue >= 15 && uptrend)    { adxSignal = `ADX ${adxValue} — Xu hướng tăng yếu`; points += 7 }
      else if (adxValue >= 15 && !uptrend)   { adxSignal = `ADX ${adxValue} — Xu hướng giảm yếu`; points += 4 }
      else { adxSignal = `ADX ${adxValue} — SIDEWAY không có xu hướng rõ`; points += 5 }
    }
  } else points += 5

  // ── Confirmed downtrend penalty ─────────────────────────────────────────────
  // When ADX ≥ 25 CONFIRMS a downtrend AND price is significantly below both
  // SMAs, good fundamentals must not mask a clear bear signal. Deduct up to 8 pts.
  if (adxValue >= 25 && adxSignal.includes('GIẢM') && price < sma20 && sma20 < sma50) {
    const smaGapPct = (sma20 - price) / price  // how far below SMA20
    if (smaGapPct > 0.08) points -= 8           // strongly below (e.g., PLX −13.6%)
    else if (smaGapPct > 0.04) points -= 5      // moderately below
    else points -= 3                             // lightly below with ADX downtrend
    // RSI "oversold" in a confirmed downtrend is distribution, NOT opportunity — cancel bonus
    if (rsi < 40) points -= 3                   // remove the false oversold-recovery bonus
  }

  // --- Volume confirmation (15 pts per framework) ---
  const validVols = volumes.filter(v => !isNaN(v) && v > 0)
  let volumeSignal = 'Bình thường'
  if (validVols.length >= 20) {
    const avg20 = validVols.slice(-20).reduce((a, b) => a + b, 0) / 20
    const avg5 = validVols.slice(-5).reduce((a, b) => a + b, 0) / 5
    const ratio = avg5 / avg20
    const price5dAgo = closes[Math.max(0, closes.length - 6)]
    const priceDir5d = price5dAgo > 0 ? (closes[closes.length - 1] - price5dAgo) / price5dAgo : 0
    if (ratio > 1.5 && priceDir5d > 0) { volumeSignal = 'Tăng với khối lượng lớn — xác nhận mạnh'; points += 15 }
    else if (ratio > 1.2 && priceDir5d > 0) { volumeSignal = 'Tăng với khối lượng khá — xác nhận'; points += 10 }
    else if (ratio > 1.5 && priceDir5d <= 0) { volumeSignal = 'Giảm với khối lượng lớn — áp lực bán'; points += 2 }
    else if (ratio < 0.5) { volumeSignal = 'Khối lượng thấp bất thường'; points += 4 }
    else { volumeSignal = 'Khối lượng bình thường'; points += 7 }
  } else points += 6

  // --- Momentum (10 pts) ---
  const last = closes[closes.length - 1]
  const w1ref = closes[Math.max(0, closes.length - 6)]
  const m1ref = closes[Math.max(0, closes.length - 23)]
  const m3ref = closes[Math.max(0, closes.length - 65)]
  const m1W = w1ref > 0 ? Math.round(((last - w1ref) / w1ref) * 1000) / 10 : 0
  const m1M = m1ref > 0 ? Math.round(((last - m1ref) / m1ref) * 1000) / 10 : 0
  const m3M = m3ref > 0 ? Math.round(((last - m3ref) / m3ref) * 1000) / 10 : 0

  // Momentum (15 pts per framework): recent weeks weighted more (1W=3x, 1M=2x, 3M=1x)
  const momScore = (m1W > 0 ? 3 : -3) + (m1M > 0 ? 2 : -2) + (m3M > 0 ? 1 : -1)
  if (momScore >= 4) points += 15
  else if (momScore >= 2) points += 10
  else if (momScore >= 0) points += 6
  else if (momScore >= -4) points += 3
  else points += 1

  // --- Support/Resistance ---
  let support = 0, resistance = 0
  if (highs.length >= 10 && lows.length >= 10) {
    const window = 2
    const swingHighs: number[] = []
    const swingLows: number[] = []
    const n = Math.min(highs.length, lows.length)
    for (let i = window; i < n - window; i++) {
      const h = highs[i], l = lows[i]
      let isH = true, isL = true
      for (let j = i - window; j <= i + window; j++) {
        if (j !== i) { if (highs[j] >= h) isH = false; if (lows[j] <= l) isL = false }
      }
      if (isH) swingHighs.push(h)
      if (isL) swingLows.push(l)
    }
    // Nearest resistance ABOVE current price, nearest support BELOW current price
    const resistanceLevels = swingHighs.filter(h => h > price)
    const supportLevels = swingLows.filter(l => l < price)
    if (resistanceLevels.length > 0) resistance = Math.round(Math.min(...resistanceLevels))
    else if (swingHighs.length > 0) resistance = Math.round(Math.max(...swingHighs))
    if (supportLevels.length > 0) support = Math.round(Math.max(...supportLevels))
    else if (swingLows.length > 0) support = Math.round(Math.min(...swingLows))
    if (!resistance) resistance = Math.round(Math.max(...highs.slice(-20)))
    if (!support) support = Math.round(Math.min(...lows.slice(-20)))
  }

  // --- OBV (On-Balance Volume) — trend confirmation (bonus/penalty up to 8 pts) ---
  let obvSignal = 'Không đủ dữ liệu'
  if (volumes.length >= 20 && closes.length >= 20) {
    const obvArr = calcOBV(closes, volumes)
    const obvRecent = obvArr.slice(-5)
    const obvPrev   = obvArr.slice(-20, -5)
    const obvTrend  = obvRecent[obvRecent.length - 1] - obvPrev[0]
    const priceTrend = closes[closes.length - 1] - closes[closes.length - 20]
    if (obvTrend > 0 && priceTrend > 0) {
      obvSignal = 'OBV tăng cùng giá — xác nhận uptrend mạnh'; points += 8
    } else if (obvTrend > 0 && priceTrend <= 0) {
      obvSignal = 'OBV tăng khi giá giảm — phân kỳ tăng (tích lũy ngầm)'; points += 5
    } else if (obvTrend < 0 && priceTrend < 0) {
      obvSignal = 'OBV giảm cùng giá — xác nhận downtrend'; points -= 5
    } else if (obvTrend < 0 && priceTrend >= 0) {
      obvSignal = 'OBV giảm khi giá tăng — phân kỳ giảm (phân phối)'; points -= 3
    } else {
      obvSignal = 'OBV trung lập'; points += 0
    }
  }

  // --- Williams %R (informational, không cộng/trừ thêm — đã có RSI) ---
  let williamsR = -50
  let williamsRSignal = 'N/A'
  if (highs.length >= 14 && lows.length >= 14) {
    const wrArr = calcWilliamsR(highs, lows, closes, 14).filter(v => !isNaN(v))
    if (wrArr.length > 0) {
      williamsR = Math.round(wrArr[wrArr.length - 1])
      if (williamsR > -20)       williamsRSignal = `%R ${williamsR} — Quá mua (>-20)`
      else if (williamsR < -80)  williamsRSignal = `%R ${williamsR} — Quá bán (<-80)`
      else if (williamsR < -50)  williamsRSignal = `%R ${williamsR} — Vùng trung lập thấp`
      else                       williamsRSignal = `%R ${williamsR} — Vùng trung lập cao`
    }
  }

  // --- CCI (informational, không cộng thêm — đã có RSI/BB) ---
  let cciValue = 0
  let cciSignal = 'N/A'
  if (highs.length >= 20 && lows.length >= 20) {
    const cciArr = calcCCI(highs, lows, closes, 20).filter(v => !isNaN(v))
    if (cciArr.length > 0) {
      cciValue = Math.round(cciArr[cciArr.length - 1])
      if (cciValue > 200)        cciSignal = `CCI ${cciValue} — Quá mua cực độ`
      else if (cciValue > 100)   cciSignal = `CCI ${cciValue} — Quá mua`
      else if (cciValue < -200)  cciSignal = `CCI ${cciValue} — Quá bán cực độ`
      else if (cciValue < -100)  cciSignal = `CCI ${cciValue} — Quá bán`
      else if (cciValue > 0)     cciSignal = `CCI ${cciValue} — Tăng nhẹ`
      else                       cciSignal = `CCI ${cciValue} — Giảm nhẹ`
    }
  }

  // ── Weekly multi-timeframe (+5/-5 pts) ────────────────────────────────────
  let weeklyTrend = 'N/A'
  let weeklyRsi = 50
  if (input.weeklyCloses && input.weeklyCloses.length >= 20) {
    const wC = input.weeklyCloses
    const wSma20 = calcSMA(wC, 20).filter(v => !isNaN(v))
    const wRsiArr = calcRSI(wC, 14).filter(v => !isNaN(v))
    weeklyRsi = wRsiArr.length > 0 ? Math.round(wRsiArr[wRsiArr.length - 1]) : 50
    const wLast = wC[wC.length - 1]
    const wSmaLast = wSma20.length > 0 ? wSma20[wSma20.length - 1] : 0
    const weeklyBull = wSmaLast > 0 && wLast > wSmaLast && weeklyRsi > 45
    const weeklyBear = wSmaLast > 0 && wLast < wSmaLast && weeklyRsi < 55
    if (weeklyBull) { weeklyTrend = 'TĂNG'; points += 5 }
    else if (weeklyBear) { weeklyTrend = 'GIẢM'; points -= 5 }
    else weeklyTrend = 'TÍCH LŨY'
  }

  // ── Chart patterns (up to ±12 pts) ────────────────────────────────────────
  const detectedPatterns = detectPatterns(highs, lows, closes, 80)
  for (const p of detectedPatterns) {
    points = Math.max(-20, Math.min(MAX + 20, points + p.scoreImpact))
  }

  const rawScore = clamp((points / MAX) * 100)

  return {
    signals: {
      trend, rsi: Math.round(rsi), rsiSignal, rsiDivergence, macdSignal, bbSignal,
      adxValue, adxSignal, volumeSignal,
      obvSignal, williamsR, williamsRSignal, cciValue, cciSignal,
      momentum1W: m1W, momentum1M: m1M, momentum3M: m3M,
      support, resistance,
      weeklyTrend, weeklyRsi, detectedPatterns,
      score: rawScore,
    },
    score: rawScore,
  }
}

// ─── Fundamental Score ────────────────────────────────────────────────────────
function scoreFundamental(input: SmartScoreInput): { signals: FundamentalSignals; score: number } {
  const { pe, pb, roe, roa, eps, profitGrowth, revenueGrowth, debtEquity, dividendYield, industry, quarterlyEPS } = input

  let points = 0
  const bench = getSectorBench(industry)

  // --- P/E valuation (20 pts) ---
  let peSignal = 'N/A'
  if (pe > 0) {
    if (pe < bench.peMax * 0.6) {
      if (profitGrowth < -10) { peSignal = `P/E ${pe.toFixed(1)}x — Rẻ nhưng LN giảm mạnh (${profitGrowth.toFixed(0)}%) — value trap risk cao`; points += 10 }
      else if (profitGrowth < -5) { peSignal = `P/E ${pe.toFixed(1)}x — Rẻ nhưng LN giảm (${profitGrowth.toFixed(0)}%) — cẩn trọng`; points += 12 }
      else if (profitGrowth < 0) { peSignal = `P/E ${pe.toFixed(1)}x — Rẻ, LN giảm nhẹ (${profitGrowth.toFixed(0)}%) — theo dõi phục hồi`; points += 14 }
      else if (profitGrowth < 5) { peSignal = `P/E ${pe.toFixed(1)}x — Rẻ nhưng tăng trưởng thấp (${profitGrowth.toFixed(0)}%)`; points += 16 }
      else { peSignal = `P/E ${pe.toFixed(1)}x — Định giá RẤT THẤP (<60% TB ngành), tăng trưởng tốt`; points += 20 }
    }
    else if (pe < bench.peMax * 0.85) { peSignal = `P/E ${pe.toFixed(1)}x — Định giá HỢP LÝ`; points += 15 }
    else if (pe <= bench.peMax) { peSignal = `P/E ${pe.toFixed(1)}x — Định giá BÌNH THƯỜNG`; points += 10 }
    else if (pe <= bench.peMax * 1.3) { peSignal = `P/E ${pe.toFixed(1)}x — Định giá CAO nhẹ`; points += 6 }
    else { peSignal = `P/E ${pe.toFixed(1)}x — Định giá QUÁ CAO (>${Math.round(bench.peMax * 1.3)}x)`; points += 2 }
  } else { peSignal = 'P/E chưa có dữ liệu'; points += 8 }

  // --- P/B (5 pts — secondary valuation check) ---
  let pbSignal = 'N/A'
  if (pb > 0) {
    if (pb < bench.pbMax * 0.6) { pbSignal = `P/B ${pb.toFixed(2)}x — Thấp hơn nhiều trung bình ngành`; points += 5 }
    else if (pb <= bench.pbMax) { pbSignal = `P/B ${pb.toFixed(2)}x — Trong ngưỡng ngành`; points += 3 }
    else { pbSignal = `P/B ${pb.toFixed(2)}x — Cao hơn trung bình ngành`; points += 1 }
  } else { pbSignal = 'P/B chưa có dữ liệu'; points += 3 }

  // --- ROE (20 pts per framework — primary profitability metric) ---
  let roeSignal = 'N/A'
  if (roe > 0) {
    if (roe >= bench.roeMin * 1.5) { roeSignal = `ROE ${roe.toFixed(1)}% — Xuất sắc`; points += 20 }
    else if (roe >= bench.roeMin) { roeSignal = `ROE ${roe.toFixed(1)}% — Tốt`; points += 14 }
    else if (roe >= bench.roeMin * 0.7) { roeSignal = `ROE ${roe.toFixed(1)}% — Chấp nhận được`; points += 9 }
    else { roeSignal = `ROE ${roe.toFixed(1)}% — Thấp hơn trung bình ngành`; points += 4 }
  } else if (roe < -5) { roeSignal = `ROE ${roe.toFixed(1)}% — Lỗ nặng, rủi ro cao`; points += 0 }
  else if (roe < 0)  { roeSignal = `ROE ${roe.toFixed(1)}% — Lỗ nhẹ`; points += 1 }
  else { roeSignal = 'ROE chưa có dữ liệu'; points += 3 }

  // --- ROA (10 pts) — sector-aware ---
  let roaSignal = 'N/A'
  if (roa > 0) {
    if (roa >= bench.roaMin * 1.5) { roaSignal = `ROA ${roa.toFixed(1)}% — Xuất sắc (chuẩn ngành ${bench.roaMin}%)`; points += 10 }
    else if (roa >= bench.roaMin) { roaSignal = `ROA ${roa.toFixed(1)}% — Tốt`; points += 7 }
    else if (roa >= bench.roaMin * 0.6) { roaSignal = `ROA ${roa.toFixed(1)}% — Chấp nhận được`; points += 4 }
    else { roaSignal = `ROA ${roa.toFixed(1)}% — Thấp hơn chuẩn ngành (${bench.roaMin}%)`; points += 2 }
  } else if (roa < 0) { roaSignal = `ROA ${roa.toFixed(1)}% — Tài sản sinh âm, cảnh báo`; points += 0 }
  else { roaSignal = 'ROA chưa có dữ liệu'; points += 3 }

  // --- Growth (20 pts) — profitGrowth must be positive for top tiers ---
  const avgGrowth = (profitGrowth + revenueGrowth) / 2
  let growthSignal = 'N/A'
  const hasGrowthData = profitGrowth !== 0 || revenueGrowth !== 0
  if (hasGrowthData) {
    if (profitGrowth >= 25 && avgGrowth >= 25) { growthSignal = `Tăng trưởng MẠNH (LN +${profitGrowth.toFixed(0)}%, DT +${revenueGrowth.toFixed(0)}%)`; points += 20 }
    else if (profitGrowth >= 10 && avgGrowth >= 10) { growthSignal = `Tăng trưởng TỐT (LN +${profitGrowth.toFixed(0)}%, DT ${revenueGrowth.toFixed(0)}%)`; points += 14 }
    else if (profitGrowth > 0 && avgGrowth >= 0) { growthSignal = `Tăng trưởng CHẬM (LN +${profitGrowth.toFixed(0)}%, DT ${revenueGrowth.toFixed(0)}%)`; points += 8 }
    else if (profitGrowth <= 0 && revenueGrowth > 5) { growthSignal = `DT tăng nhưng LN giảm — biên thu hẹp (LN ${profitGrowth.toFixed(0)}%, DT +${revenueGrowth.toFixed(0)}%)`; points += 4 }
    else { growthSignal = `Tăng trưởng ÂM (LN ${profitGrowth.toFixed(0)}%, DT ${revenueGrowth.toFixed(0)}%)`; points += 2 }
  } else if (eps > 0 || pe > 0) {
    // Profitable company but growth data unavailable — assume slight positive growth (better than neutral 8)
    growthSignal = 'Chưa có dữ liệu tăng trưởng (công ty có lợi nhuận — tích cực)'
    points += 11
  } else { growthSignal = 'Chưa có dữ liệu tăng trưởng'; points += 8 }

  // --- Debt (10 pts) — sector-aware (banks/insurance skip D/E check) ---
  let debtSignal = 'N/A'
  if (bench.deMax >= 99) {
    // Banks/Insurance: high leverage is by design, neutral score
    debtSignal = `Ngành tài chính: đòn bẩy cao là bình thường (không đánh giá D/E)`
    points += 8
  } else if (debtEquity > 0) {
    const deRatio = debtEquity / bench.deMax
    if (deRatio < 0.3) { debtSignal = `D/E ${debtEquity.toFixed(2)}x — Nợ rất thấp (ngành max ${bench.deMax}x)`; points += 10 }
    else if (deRatio < 0.6) { debtSignal = `D/E ${debtEquity.toFixed(2)}x — Nợ an toàn`; points += 8 }
    else if (deRatio < 1.0) { debtSignal = `D/E ${debtEquity.toFixed(2)}x — Nợ chấp nhận được`; points += 5 }
    else if (deRatio < 1.5) { debtSignal = `D/E ${debtEquity.toFixed(2)}x — Nợ CAO hơn chuẩn ngành`; points += 2 }
    else { debtSignal = `D/E ${debtEquity.toFixed(2)}x — Nợ QUÁ CAO — rủi ro tài chính`; points += 0 }
  } else { debtSignal = 'D/E chưa có dữ liệu'; points += 5 }

  // --- Dividend (5 pts) ---
  let dividendSignal = 'N/A'
  if (dividendYield > 0) {
    if (dividendYield >= 5) { dividendSignal = `Cổ tức ${dividendYield.toFixed(1)}% — Cao hấp dẫn`; points += 5 }
    else if (dividendYield >= 2) { dividendSignal = `Cổ tức ${dividendYield.toFixed(1)}% — Ổn`; points += 3 }
    else { dividendSignal = `Cổ tức ${dividendYield.toFixed(1)}% — Thấp`; points += 1 }
  } else { dividendSignal = 'Không có cổ tức'; points += 0 }

  // --- EPS trend (10 pts per framework) — acceleration-aware quarterly momentum ---
  // Best: EPS accelerating across all quarters (compounding earnings power)
  let earningsQuality = 'Không đủ dữ liệu'
  let eqPoints = 5  // neutral baseline
  if (quarterlyEPS.length >= 3) {
    const epsVals = quarterlyEPS.map(q => q.eps).filter(e => e !== 0)
    if (epsVals.length >= 4) {
      const [q0, q1, q2, q3] = epsVals  // newest first
      const chg01 = q1 > 0 ? (q0 - q1) / Math.abs(q1) : 0
      const chg12 = q2 > 0 ? (q1 - q2) / Math.abs(q2) : 0
      const accel = chg01 - chg12   // positive = accelerating
      if (q0 > q1 && q1 > q2 && q2 > q3) {
        earningsQuality = accel > 0.15
          ? `EPS TĂNG TỐC 4 quý liên tiếp (+${(accel*100).toFixed(0)}% gia tốc) — XUẤT SẮC`
          : 'EPS tăng đều 4 quý liên tiếp — chất lượng TỐT'
        eqPoints = 10
      } else if (q0 > q1 && q1 > q2) {
        earningsQuality = accel > 0.1 ? 'EPS tăng tốc 3 quý — chất lượng TỐT' : 'EPS tăng liên tục 3 quý'
        eqPoints = 10
      } else if (q0 > q1) {
        earningsQuality = 'EPS tăng quý gần nhất — theo dõi xu hướng'; eqPoints = 8
      } else if (q0 < q1 && q1 < q2 && q2 < q3) {
        earningsQuality = 'EPS GIẢM liên tục 4 quý — cảnh báo nghiêm trọng'; eqPoints = 0
      } else if (q0 < q1 && q1 < q2) {
        earningsQuality = 'EPS giảm liên tục 3 quý — cảnh báo'; eqPoints = 2
      } else {
        earningsQuality = 'EPS biến động không ổn định'; eqPoints = 4
      }
    } else if (epsVals.length >= 3) {
      const [q0, q1, q2] = epsVals
      if (q0 > q1 && q1 > q2) { earningsQuality = 'EPS tăng liên tục 3 quý — chất lượng TỐT'; eqPoints = 10 }
      else if (q0 > q1) { earningsQuality = 'EPS tăng quý gần nhất'; eqPoints = 8 }
      else if (q0 < q1 && q1 < q2) { earningsQuality = 'EPS giảm liên tục 3 quý — cảnh báo'; eqPoints = 2 }
      else { earningsQuality = 'EPS biến động'; eqPoints = 4 }
    }
  }
  // Bonus: EPS tăng liên tục 8 quý — xuất sắc hiếm gặp (+5 điểm thưởng)
  if (quarterlyEPS.length >= 8) {
    const eps8 = quarterlyEPS.slice(0, 8).map(q => q.eps).filter(e => e !== 0)
    if (eps8.length >= 8) {
      let all8Up = true
      for (let i = 0; i < 7; i++) { if (eps8[i] <= eps8[i + 1]) { all8Up = false; break } }
      if (all8Up) { earningsQuality += ' — 8Q LT tăng!'; eqPoints = Math.min(15, eqPoints + 5) }
    }
  }
  points += eqPoints

  // --- Chất lượng LN (10 pts per framework): profit margin expansion vs contraction ---
  // Framework: "Profit growth > Revenue growth → biên LN mở rộng" = best quality signal
  let marginQuality = 'N/A'
  let mqPoints = 5  // neutral baseline (no data or equal growth)
  const hasBothGrowth = profitGrowth !== 0 || revenueGrowth !== 0
  if (hasBothGrowth) {
    const gap = profitGrowth - revenueGrowth  // positive = margins expanding
    if (profitGrowth > 0 && revenueGrowth >= 0) {
      if (gap >= 10) { marginQuality = `Biên LN MỞ RỘNG MẠNH (+${profitGrowth.toFixed(0)}% LN > +${revenueGrowth.toFixed(0)}% DT) — chất lượng XUẤT SẮC`; mqPoints = 10 }
      else if (gap >= 3) { marginQuality = `Biên LN mở rộng (+${profitGrowth.toFixed(0)}% LN > +${revenueGrowth.toFixed(0)}% DT)`; mqPoints = 8 }
      else if (gap >= -3) { marginQuality = `Biên LN ổn định (LN ${profitGrowth.toFixed(0)}% ≈ DT ${revenueGrowth.toFixed(0)}%)`; mqPoints = 6 }
      else if (gap >= -8) { marginQuality = `Biên LN thu hẹp (LN +${profitGrowth.toFixed(0)}% < DT +${revenueGrowth.toFixed(0)}%)`; mqPoints = 3 }
      else { marginQuality = `Biên LN THU HẸP MẠNH — cảnh báo (LN +${profitGrowth.toFixed(0)}% << DT +${revenueGrowth.toFixed(0)}%)`; mqPoints = 1 }
    } else if (profitGrowth < 0 && revenueGrowth > 5) {
      marginQuality = `LN âm (${profitGrowth.toFixed(0)}%) dù DT tăng (+${revenueGrowth.toFixed(0)}%) — biên rất xấu`; mqPoints = 0
    } else if (profitGrowth < 0) {
      marginQuality = `LN giảm (${profitGrowth.toFixed(0)}%) — biên xấu`; mqPoints = 2
    } else {
      marginQuality = `Tăng trưởng LN chậm — chưa rõ xu hướng biên`; mqPoints = 4
    }
  } else {
    marginQuality = 'Chưa có dữ liệu biên lợi nhuận'; mqPoints = 5
  }
  points += mqPoints

  // --- PEG bonus (5 pts) — rẻ so với tăng trưởng ---
  const peg = pe > 0 && profitGrowth > 5 ? Math.round((pe / profitGrowth) * 100) / 100 : null
  if (peg !== null) {
    if (peg < 0.8) points += 5       // growth heavily undervalued
    else if (peg < 1.2) points += 4  // fairly valued vs growth
    else if (peg < 2.0) points += 3  // slightly expensive
    else if (peg < 3.0) points += 1  // expensive vs growth
    // peg >= 3: 0 pts
  } else points += 3 // neutral if no PEG data

  // --- Business plan achievement bonus (5 pts) ---
  // "Kế hoạch KD vượt >110%" = company executing beyond targets (positive catalyst)
  if (input.businessPlanPct && input.businessPlanPct > 110) {
    const excess = Math.round(input.businessPlanPct - 100)
    if (input.businessPlanPct > 130) points += 5
    else if (input.businessPlanPct > 120) points += 4
    else points += 3
    earningsQuality += ` | KH vượt ${excess}%`
  }

  // MAX_POINTS: 20(PE)+5(PB)+20(ROE)+10(ROA)+20(growth)+10(debt)+5(div)+10(EPStrend)+10(margin)+5(PEG)+5(bizPlan) = 120
  const MAX_POINTS = 120
  const rawScore = clamp((points / MAX_POINTS) * 100)

  return {
    signals: {
      peSignal, pbSignal, roeSignal, roaSignal, growthSignal, debtSignal,
      dividendSignal, earningsQuality, marginQuality, peg, score: rawScore,
    },
    score: rawScore,
  }
}

// ─── Sentiment Score ──────────────────────────────────────────────────────────
function scoreSentiment(input: SmartScoreInput): { signals: SentimentSignals; score: number } {
  const { avgSentiment, foreignBuyVol, foreignSellVol, w52high, w52low, price, vnIndex, closes } = input

  let points = 0

  // --- News sentiment (25 pts per framework) ---
  let newsSummary = 'Trung lập'
  const newsScore = Math.round(avgSentiment)
  if (newsScore >= 70) { newsSummary = 'Tin tức TÍCH CỰC áp đảo'; points += 25 }
  else if (newsScore >= 55) { newsSummary = 'Tin tức khá tích cực'; points += 18 }
  else if (newsScore >= 45) { newsSummary = 'Tin tức trung lập'; points += 13 }
  else if (newsScore >= 30) { newsSummary = 'Tin tức kém tích cực'; points += 7 }
  else { newsSummary = 'Tin tức TIÊU CỰC'; points += 2 }

  // --- Foreign investor flow (25 pts) ---
  let foreignFlow = 'Không có dữ liệu'
  if (foreignBuyVol > 0 || foreignSellVol > 0) {
    const netForeign = foreignBuyVol - foreignSellVol
    const totalForeign = foreignBuyVol + foreignSellVol
    const netRatio = totalForeign > 0 ? netForeign / totalForeign : 0
    if (netRatio > 0.3) { foreignFlow = `Khối ngoại MUA RÒNG mạnh (+${((foreignBuyVol - foreignSellVol) / 1000).toFixed(0)}K cổ phiếu)`; points += 25 }
    else if (netRatio > 0.05) { foreignFlow = `Khối ngoại mua ròng nhẹ`; points += 18 }
    else if (netRatio > -0.05) { foreignFlow = `Khối ngoại giao dịch cân bằng`; points += 13 }
    else if (netRatio > -0.3) { foreignFlow = `Khối ngoại BÁN RÒNG nhẹ`; points += 7 }
    else { foreignFlow = `Khối ngoại BÁN RÒNG mạnh`; points += 2 }
  } else points += 13

  // --- 52-week position (20 pts) — framework: giá ở 40-70% vùng 52W = tối ưu ---
  // Optimal zone: 40-70% (not too high = chasing, not too low = downtrend)
  // Quality-aware at extremes: near 52W low + strong fund = contrarian opportunity
  const { roe: roe52, roa: roa52, industry: ind52 } = input
  const bench52 = getSectorBench(ind52)
  const hasQualityFund = (roe52 > 0 && roe52 >= bench52.roeMin * 0.7)
    || (bench52.deMax >= 99 && roa52 > 0 && roa52 >= bench52.roaMin * 0.7) // banks: use ROA
  let w52Signal = 'N/A'
  if (w52high > w52low && w52high > 0) {
    const pos = ((price - w52low) / (w52high - w52low)) * 100
    if (pos >= 40 && pos < 70) {
      // OPTIMAL ZONE per framework — not too high, not too low
      w52Signal = `Vùng tối ưu 52 tuần (${pos.toFixed(0)}%) — không quá cao, không quá thấp`; points += 20
    } else if (pos >= 70 && pos < 85) {
      // High but still in momentum zone
      if (hasQualityFund) { w52Signal = `Vùng cao 52 tuần (${pos.toFixed(0)}%) — momentum tốt, nền tảng hỗ trợ`; points += 17 }
      else { w52Signal = `Vùng cao 52 tuần (${pos.toFixed(0)}%) — momentum tích cực`; points += 13 }
    } else if (pos >= 85) {
      // Near 52W high
      if (hasQualityFund) { w52Signal = `Gần ĐỈNH 52 tuần (${pos.toFixed(0)}%) — breakout chất lượng, nền tảng tốt`; points += 14 }
      else { w52Signal = `Gần ĐỈNH 52 tuần (${pos.toFixed(0)}%) — cẩn thận overbought, nền tảng yếu`; points += 7 }
    } else if (pos >= 20) {
      // Low-mid zone (20-40%)
      if (hasQualityFund) { w52Signal = `Vùng thấp 52 tuần (${pos.toFixed(0)}%) — tích lũy cơ bản tốt, giá hấp dẫn`; points += 14 }
      else { w52Signal = `Vùng thấp 52 tuần (${pos.toFixed(0)}%) — xu hướng giảm, cẩn thận`; points += 5 }
    } else {
      // Near 52W low (<20%)
      if (hasQualityFund) { w52Signal = `Vùng ĐÁY 52 tuần (${pos.toFixed(0)}%) — cơ hội tích lũy ngược chiều (nền tảng tốt)`; points += 10 }
      else { w52Signal = `Vùng ĐÁY 52 tuần (${pos.toFixed(0)}%) — downtrend mạnh, không đỡ giá`; points += 2 }
    }
  } else points += 10

  // --- Market regime / VN-Index trend (20 pts per framework) ---
  // Framework: "VN-Index uptrend, RSI < 70" = best condition for buying
  let marketRegime = 'Không rõ'
  if (vnIndex) {
    const { rsi, trend30d } = vnIndex
    if (rsi > 55 && trend30d > 3 && rsi <= 70)   { marketRegime = 'BULL — Xu hướng tăng rõ ràng, thuận lợi mua'; points += 20 }
    else if (rsi > 70 && trend30d > 10)           { marketRegime = 'BULL MẠNH — Quá mua, rủi ro điều chỉnh ngắn hạn'; points += 14 }
    else if (rsi >= 45 && Math.abs(trend30d) < 3) { marketRegime = 'SIDEWAYS — Tích lũy, chọn lọc cẩn thận'; points += 11 }
    else if (rsi < 30 && trend30d < -8)           { marketRegime = 'BEAR MẠNH — Rủi ro rất cao, ưu tiên phòng thủ'; points += 2 }
    else if (rsi < 45 && trend30d < -3)           { marketRegime = 'BEAR NHẸ — Thận trọng, chỉ mua mã cực mạnh'; points += 5 }
    else                                           { marketRegime = 'ĐIỀU CHỈNH — Thị trường biến động, cần xác nhận'; points += 8 }
  } else points += 11

  // --- Relative strength vs VN-Index (10 pts) ---
  const m1M = closes.length >= 23 && closes[closes.length - 23] > 0
    ? Math.round(((closes[closes.length - 1] - closes[closes.length - 23]) / closes[closes.length - 23]) * 1000) / 10
    : 0
  const rs30d = vnIndex ? Math.round((m1M - vnIndex.trend30d) * 10) / 10 : 0
  let rsSignal = 'Trung lập'
  if (rs30d > 5) { rsSignal = `OUTPERFORM mạnh (+${rs30d}% so VN-Index)`; points += 10 }
  else if (rs30d > 1) { rsSignal = `OUTPERFORM nhẹ (+${rs30d}%)`; points += 7 }
  else if (rs30d >= -1) { rsSignal = `Tương đương VN-Index (${rs30d}%)`; points += 5 }
  else if (rs30d >= -5) { rsSignal = `UNDERPERFORM nhẹ (${rs30d}%)`; points += 3 }
  else { rsSignal = `UNDERPERFORM mạnh (${rs30d}% so VN-Index)`; points += 1 }

  const MAX_POINTS = 100
  const rawScore = clamp((points / MAX_POINTS) * 100)

  return {
    signals: { newsScore, newsSummary, foreignFlow, w52Signal, marketRegime, relativeStrength: rs30d, rsSignal, score: rawScore },
    score: rawScore,
  }
}

// ─── Target price & stop loss ─────────────────────────────────────────────────
// Superior to Claude Opus 4.6 approach via 3 quantitative improvements:
// 1. ATR-aware stop: adapts stop buffer to each stock's actual volatility
//    (Claude uses fixed 1.5% for all stocks regardless of ADX/ATR)
// 2. PE fair-value cap: prevents targeting above fundamental fair value
//    (Claude has no fundamental ceiling on technical targets)
// 3. R/R gate downstream: enforces ≥1.5:1 minimum (applied after this function)
function calcTargetStopLoss(
  input: SmartScoreInput,
  tech: TechnicalSignals,
  overallScore: number,
  finalRec: SmartScoreResult['recommendation'],
  fundScore: number
): { targetPrice: number; stopLoss: number } {
  const { price, highs, lows, closes, eps, industry } = input
  const bench = getSectorBench(industry)
  const isBearish = finalRec === 'BÁN' || finalRec === 'BÁN MẠNH'

  // ATR(14) — measures actual daily price noise for this specific stock
  const atr14 = highs.length >= 14 ? calcATR(highs, lows, closes, 14) : price * 0.02

  // ── BEARISH scenario (BÁN / BÁN MẠNH) ─────────────────────────────────────
  if (isBearish) {
    // TARGET: nearest support below price, must give ≥5% downside
    let bearTarget = Math.round(price * 0.90)
    if (tech.support > 0 && tech.support < price && tech.support > price * 0.70) {
      const supportTarget = Math.round(tech.support * 0.98)
      // Only use support-based target if it gives meaningful downside (≥5%)
      if (supportTarget < price * 0.95) bearTarget = supportTarget
      // If support is too close (< 5% below price), project further down
    }

    // STOP: use resistance only if within 8% of current price (matches AI ~7-9%)
    // Hard bounds: minimum 4% above (avoid hair-trigger), maximum 9% above (professional risk)
    let bearStop = Math.round(price * 1.07)  // default 7% above
    if (tech.resistance > 0 && tech.resistance > price && tech.resistance <= price * 1.08) {
      // Resistance is tight (within 8%) → valid invalidation level
      bearStop = Math.round(tech.resistance * 1.015)
    }
    bearStop = Math.max(bearStop, Math.round(price * 1.04))  // min 4% above
    bearStop = Math.min(bearStop, Math.round(price * 1.09))  // max 9% above (cap, matches AI)

    return { targetPrice: bearTarget, stopLoss: bearStop }
  }

  // ── BULLISH/NEUTRAL ────────────────────────────────────────────────────────
  const baseUpside = overallScore >= 70 ? 0.15 : overallScore >= 55 ? 0.10 : overallScore >= 40 ? 0.07 : 0.04
  const baseDownside = overallScore >= 60 ? 0.06 : overallScore >= 48 ? 0.08 : 0.10

  // ── TARGET: resistance-primary + PE fair-value cap ─────────────────────────
  // Step 1: Technical target = nearest resistance × 0.98 (profit-taking zone)
  let targetPrice = Math.round(price * (1 + baseUpside))   // score-based fallback
  if (tech.resistance > price) {
    const resistTarget = Math.round(tech.resistance * 0.98)
    const gainPct = (resistTarget - price) / price
    if (gainPct >= 0.03 && gainPct <= 0.30) {
      targetPrice = resistTarget
    } else if (gainPct > 0.30) {
      targetPrice = Math.round(price * (1 + Math.min(baseUpside, 0.20)))
    }
  }
  // Step 2: PE fair-value — ceiling OR floor depending on whether stock is under/over-valued
  if (eps > 0 && bench.peMax > 0) {
    const fundTarget = Math.round(eps * bench.peMax)
    if (fundTarget > price * 1.04 && fundTarget < targetPrice) {
      // Ceiling: fundamental fair value is below technical target → cap at fair value
      targetPrice = fundTarget
    } else if (!isBearish && fundTarget > targetPrice && fundTarget > price * 1.04) {
      // Floor: stock is undervalued (fundTarget above score-based target).
      // Framework: MUA MẠNH upside max 50%, MUA upside max 40%
      const upsideCap = (finalRec === 'MUA MẠNH') ? price * 1.50 : price * 1.40
      if (fundTarget < upsideCap) targetPrice = fundTarget
      else targetPrice = Math.round(upsideCap)
    }
  }
  // Step 3: GIỮ target cap — fund-aware ceiling
  // Strong fund (≥60): allow 22% target (FPT-type: tech correction, strong fundamentals → 19-20% AI target)
  // Weak fund (<60):  standard 13% cap (neutral GIỮ)
  if (finalRec === 'GIỮ') {
    const giwMaxPct = fundScore >= 60 ? 1.22 : 1.13
    const giwCapPct = fundScore >= 60 ? 1.195 : 1.10
    if (targetPrice > price * giwMaxPct) {
      targetPrice = Math.round(price * giwCapPct)
    }
  }

  // ── STOP LOSS: ATR-aware below support ─────────────────────────────────────
  // GIỮ: tight buffer (0.4×ATR, 0.8-1.3% below support) — matches AI ~5% stop
  // MUA/MUA MẠNH: standard buffer (0.7-1.3×ATR, 1.5-4% below support)
  const isGiwRec = finalRec === 'GIỮ'
  const atrMult = isGiwRec ? 0.4
    : (tech.adxValue >= 25 ? 1.3 : tech.adxValue >= 15 ? 1.0 : 0.7)
  let stopLoss: number
  if (tech.support > 0 && tech.support < price && tech.support > price * 0.75) {
    const atrBuffer = Math.min(atr14 * atrMult, price * 0.04)
    const atrStop = Math.round(tech.support - atrBuffer)
    // GIỮ: tight bounds (0.7-2.0% below support); MUA: standard (1.5-4%)
    const minStop = Math.round(tech.support * (isGiwRec ? 0.980 : 0.960))
    const maxStop = Math.round(tech.support * (isGiwRec ? 0.993 : 0.985))
    stopLoss = Math.max(minStop, Math.min(maxStop, atrStop))
  } else {
    // GIỮ fallback: 6% below price (same as MUA) — more conservative than 8-10%
    const fallbackPct = isGiwRec ? 0.06 : baseDownside
    stopLoss = Math.round(price * (1 - fallbackPct))
  }

  // Minimum stop: at least 4% below current price for MUA/MUA MẠNH.
  // Also applies to oversold GIỮ (RSI<35): deeply oversold = recovery thesis needs room.
  // Prevents hair-trigger stops when support is very close to current price.
  const isOversoldGiw = isGiwRec && tech.rsi < 35
  if ((!isGiwRec && !isBearish && stopLoss > price * 0.964) || (isOversoldGiw && stopLoss > price * 0.964)) {
    stopLoss = Math.round(price * 0.960)   // 4% minimum clearance
  }

  // Safety: stop must always be below price
  if (stopLoss >= price) stopLoss = Math.round(price * 0.93)

  return { targetPrice, stopLoss }
}

// ─── Narrative generators (AI-like synthesis) ────────────────────────────────

function genTechSummary(t: TechnicalSignals): string {
  const trend = t.trend.replace(/\s*\(.*\)$/, '')
  const rsi = t.rsi < 30 ? `RSI ${t.rsi} — vùng quá bán, cơ hội kỹ thuật`
    : t.rsi > 70 ? `RSI ${t.rsi} — quá mua, thận trọng điều chỉnh`
    : `RSI ${t.rsi} (trung lập)`
  const macd = t.macdSignal.includes('Golden Cross') ? 'MACD Golden Cross — tín hiệu MUA mạnh'
    : t.macdSignal.includes('Death Cross') ? 'MACD Death Cross — tín hiệu giảm'
    : t.macdSignal.includes('mở rộng âm') ? 'MACD histogram mở rộng âm — momentum giảm tăng tốc'
    : t.macdSignal.includes('mở rộng dương') ? 'MACD histogram mở rộng dương — momentum tăng tốc'
    : t.macdSignal.includes('tăng') ? 'MACD dương, momentum tích cực'
    : t.macdSignal.includes('giảm') ? 'MACD âm, momentum tiêu cực'
    : 'MACD trung lập'
  const adx = t.adxValue >= 25
    ? `ADX ${t.adxValue} — ${t.adxSignal.includes('TĂNG') ? 'xu hướng TĂNG mạnh (DI+ > DI-)' : 'xu hướng GIẢM mạnh (DI- > DI+)'}`
    : `ADX ${t.adxValue} — sideway, chưa xu hướng rõ`
  const vol = t.volumeSignal.includes('xác nhận mạnh') ? 'KL tăng đột biến xác nhận tích cực'
    : t.volumeSignal.includes('áp lực') ? 'KL cao với giá giảm — áp lực bán'
    : t.volumeSignal.includes('thấp') ? 'KL thấp bất thường'
    : 'KL giao dịch bình thường'
  const mom = `Momentum 1T/3T: ${t.momentum1M > 0 ? '+' : ''}${t.momentum1M}%/${t.momentum3M > 0 ? '+' : ''}${t.momentum3M}%`
  const sr = t.support > 0 && t.resistance > 0
    ? `Hỗ trợ ${t.support.toLocaleString('vi-VN')}₫ — kháng cự ${t.resistance.toLocaleString('vi-VN')}₫`
    : ''
  return [trend, rsi, macd, adx, vol, mom, sr].filter(Boolean).join('. ') + '.'
}

function genFundSummary(f: FundamentalSignals): string {
  const pe = f.peSignal.startsWith('P/E') ? f.peSignal.replace(/^P\/E [\d.]+x — /, '').split(' (')[0] : ''
  const roe = f.roeSignal.startsWith('ROE') ? f.roeSignal : ''
  const roa = f.roaSignal.startsWith('ROA') ? f.roaSignal.split(' (')[0] : ''
  const growth = f.growthSignal !== 'N/A' && f.growthSignal !== 'Chưa có dữ liệu tăng trưởng' ? f.growthSignal.split(' (')[0] : ''
  const debt = f.debtSignal !== 'N/A' && f.debtSignal !== 'D/E chưa có dữ liệu' ? f.debtSignal.split(' — ')[0] : ''
  const eq = !f.earningsQuality.includes('Không đủ') ? f.earningsQuality.split(' — ')[0] : ''
  const margin = f.marginQuality !== 'N/A' && !f.marginQuality.includes('Chưa') ? f.marginQuality.split(' (')[0] : ''
  const peg = f.peg !== null ? `PEG ${f.peg.toFixed(2)}x — ${f.peg < 1 ? 'rẻ so tăng trưởng' : f.peg < 2 ? 'định giá hợp lý' : 'đắt so tăng trưởng'}` : ''
  const div = f.dividendSignal !== 'Không có cổ tức' && f.dividendSignal !== 'N/A' ? f.dividendSignal : ''
  return [pe, roe, roa, growth, debt, margin, eq, peg, div].filter(Boolean).slice(0, 7).join('. ') + '.'
}

function genSentSummary(s: SentimentSignals): string {
  const news = s.newsSummary
  const foreign = s.foreignFlow !== 'Không có dữ liệu' ? s.foreignFlow : ''
  const w52 = s.w52Signal !== 'N/A' ? s.w52Signal.split(' (')[0] : ''
  const market = `VN-Index: ${s.marketRegime.split(' — ')[0]}`
  const rs = s.rsSignal
  return [news, foreign, w52, market, rs].filter(Boolean).slice(0, 5).join('. ') + '.'
}

function genAction(
  rec: SmartScoreResult['recommendation'],
  score: number,
  targetPrice: number,
  stopLoss: number,
  entryZone: { low: number; high: number },
  price: number,
  holdingPeriod: string
): string {
  const upPct = price > 0 ? ((targetPrice - price) / price * 100).toFixed(1) : '0'
  const dnPct = price > 0 ? Math.abs((stopLoss - price) / price * 100).toFixed(1) : '0'
  const rr = price > 0 && stopLoss < price ? ((targetPrice - price) / (price - stopLoss)).toFixed(1) : '0'
  const entry = `${entryZone.low.toLocaleString('vi-VN')}–${entryZone.high.toLocaleString('vi-VN')}₫`
  const tgt = targetPrice.toLocaleString('vi-VN')
  const sl = stopLoss.toLocaleString('vi-VN')
  if (rec === 'MUA MẠNH')
    return `Mua mạnh tại vùng ${entry}. Mục tiêu ${tgt}₫ (+${upPct}%), cắt lỗ ${sl}₫ (−${dnPct}%). R/R = ${rr}:1. Nắm giữ ${holdingPeriod}. Điểm mạnh tổng hợp ${score}/100.`
  if (rec === 'MUA')
    return `Có thể mở vị thế tại vùng ${entry}. Mục tiêu ${tgt}₫ (+${upPct}%), cắt lỗ ${sl}₫ (−${dnPct}%). R/R = ${rr}:1. Nắm giữ ${holdingPeriod}.`
  if (rec === 'GIỮ')
    return `Duy trì vị thế, theo dõi ngưỡng cắt lỗ ${sl}₫. Chốt lời dần tại ${tgt}₫ (+${upPct}%). Chưa khuyến nghị mở mới. Điểm ${score}/100 — tín hiệu trung tính.`
  if (rec === 'BÁN') {
    // bearish: stopLoss > price (resistance), targetPrice < price (support/downside)
    if (stopLoss > price) {
      const bearDown = price > 0 ? ((price - targetPrice) / price * 100).toFixed(1) : '0'
      const bearUpRisk = price > 0 ? ((stopLoss - price) / price * 100).toFixed(1) : '0'
      const rrBear = price > 0 && (stopLoss - price) > 0
        ? Math.abs((price - targetPrice) / (stopLoss - price)).toFixed(1) : '0'
      return `Giảm tỷ trọng hoặc thoát vị thế. Hỗ trợ kế tiếp ${tgt}₫ (−${bearDown}%). Ngưỡng dừng BÁN (luận điểm vô hiệu) ${sl}₫ (+${bearUpRisk}%). R/R = ${rrBear}:1. Điểm ${score}/100.`
    }
    return `Giảm tỷ trọng, đặt cắt lỗ cứng tại ${sl}₫ (−${dnPct}%). Không mở vị thế mới ở giá hiện tại. Chờ tín hiệu kỹ thuật cải thiện trước khi xem xét lại.`
  }
  // BÁN MẠNH
  if (stopLoss > price) {
    const bearDown = price > 0 ? ((price - targetPrice) / price * 100).toFixed(1) : '0'
    const bearUpRisk = price > 0 ? ((stopLoss - price) / price * 100).toFixed(1) : '0'
    return `Thoát vị thế ngay tại giá thị trường. Hỗ trợ ${tgt}₫ (−${bearDown}%). Ngưỡng dừng ${sl}₫ (+${bearUpRisk}%). Điểm ${score}/100 — nhiều tín hiệu tiêu cực, không khuyến nghị giữ.`
  }
  return `Thoát vị thế tại giá thị trường. Cắt lỗ ngay tại ${sl}₫. Điểm tổng hợp ${score}/100 — nhiều tín hiệu tiêu cực, không khuyến nghị giữ.`
}

function genNextReview(tech: TechnicalSignals, rec: SmartScoreResult['recommendation']): string {
  const parts: string[] = []
  if (tech.support > 0)
    parts.push(`Theo dõi nếu giá phá vỡ hỗ trợ ${tech.support.toLocaleString('vi-VN')}₫`)
  if (tech.resistance > 0 && (rec === 'MUA MẠNH' || rec === 'MUA'))
    parts.push(`Xác nhận khi vượt kháng cự ${tech.resistance.toLocaleString('vi-VN')}₫ kèm khối lượng`)
  if (tech.resistance > 0 && (rec === 'BÁN' || rec === 'BÁN MẠNH'))
    parts.push(`Luận điểm BÁN vô hiệu nếu giá vượt và đóng cửa trên ${tech.resistance.toLocaleString('vi-VN')}₫`)
  if (tech.macdSignal.includes('trung lập') || tech.macdSignal.includes('Trung'))
    parts.push('Chờ MACD crossover để xác nhận hướng')
  if (tech.rsi > 62 && tech.rsi < 72)
    parts.push('RSI tiệm cận overbought — theo dõi điều chỉnh')
  if (tech.rsi > 25 && tech.rsi < 33)
    parts.push('RSI gần oversold — cơ hội tích lũy dần')
  if (parts.length === 0)
    return 'Theo dõi tín hiệu kỹ thuật, dòng tiền ngoại, và kết quả kinh doanh quý tiếp theo'
  return parts.slice(0, 2).join(' · ')
}

// ─── Main scoring function ────────────────────────────────────────────────────
export function calculateSmartScore(input: SmartScoreInput): SmartScoreResult {
  const { closes, price } = input

  const techResult = scoreTechnical(input)
  const fundResult = scoreFundamental(input)
  const sentResult = scoreSentiment(input)

  // Weighted average: Technical 30% + Fundamental 40% + Sentiment 30%
  const overallScore = Math.round(
    techResult.score * 0.30 +
    fundResult.score * 0.40 +
    sentResult.score * 0.30
  )

  // Recommendation from score
  let recommendation: SmartScoreResult['recommendation']
  if (overallScore >= 78) recommendation = 'MUA MẠNH'
  else if (overallScore >= 60) recommendation = 'MUA'
  else if (overallScore >= 46) recommendation = 'GIỮ'
  else if (overallScore >= 32) recommendation = 'BÁN'
  else recommendation = 'BÁN MẠNH'

  // ── BÁN guard: require at least one confirmed sell signal ──────────────────
  // Claude Opus 4.6 does NOT give BÁN without a confirmed directional reason.
  if (recommendation === 'BÁN') {
    const confirmedDowntrend = techResult.signals.adxValue >= 25
      && techResult.signals.adxSignal.includes('GIẢM')
    const fundamentallyBroken = fundResult.score < 28 || input.roe < 0
    const negativeCatalyst = sentResult.signals.newsScore < 35

    if (!confirmedDowntrend && !fundamentallyBroken && !negativeCatalyst) {
      // Case 1: No confirmed sell signal at all → GIỮ (AGR type)
      recommendation = 'GIỮ'
    } else if (confirmedDowntrend && !fundamentallyBroken && !negativeCatalyst) {
      // Case 2: Downtrend confirmed BUT fundamentals are healthy + positive growth
      // → temporary market correction in good company (SSI, FPT type) → GIỮ minimum
      // Distinguished from PLX (declining profits): profitGrowth >= 0 required
      if (fundResult.score >= 58 && input.profitGrowth >= 0 && sentResult.signals.newsScore >= 42) {
        recommendation = 'GIỮ'
      }
    }
  }

  // ── GIỮ → BÁN downgrade: confirmed downtrend + weak fundamentals + overvalued ─
  // Catches PLX-type stocks: technically breaking down + overpriced + weak ROE/fund.
  // Condition: ADX≥25 confirmed bear + fund<50 + overvalued + NOT deeply oversold (RSI≥38)
  // notOversoldBuy ensures we don't BÁN deeply washed-out (RSI<38) falling knives.
  if (recommendation === 'GIỮ') {
    const bench3 = getSectorBench(input.industry)
    const confirmedBearTrend = techResult.signals.adxValue >= 25
      && techResult.signals.adxSignal.includes('GIẢM')
    const clearlyWeakFund = fundResult.score < 50
    const overvalued = input.pe > 0 && input.pe > bench3.peMax * 1.25
    const notOversoldBuy = techResult.signals.rsi >= 38  // RSI<38 = deeply oversold → NOT a BÁN candidate
    const belowMidScore = overallScore < 57
    if (confirmedBearTrend && clearlyWeakFund && overvalued && notOversoldBuy && belowMidScore) {
      recommendation = 'BÁN'
    }
  }

  // ── GIỮ → MUA upgrade: strong fundamentals override weak technicals ────────
  // Mirrors Claude's "strong growth + reasonable valuation = buy the dip" logic.
  if (recommendation === 'GIỮ') {
    const bench2 = getSectorBench(input.industry)
    // Extreme downtrend = ADX >= 35. ADX 25-34 is moderate — overridable by strong fundamentals.
    const notExtremeDown = !(techResult.signals.adxValue >= 35 && techResult.signals.adxSignal.includes('GIẢM'))
    // Bear market regime reduces sentiment ~8 pts — lower threshold from 44→40 to compensate.
    const acceptableSent = sentResult.score >= 40

    // Path 1: Confirmed high growth + solid fundamentals (threshold 60 = clearly above avg)
    if (fundResult.score >= 60 && input.profitGrowth >= 10 && acceptableSent && notExtremeDown) {
      recommendation = 'MUA'
    }

    // Path 2: "Buy the dip" — deeply oversold RSI + solid profitable fundamentals
    // Captures Claude's "RSI oversold + strong ROE/reasonable PE = contrarian buy" logic.
    // Does NOT require confirmed profitGrowth data (often missing from CafeF).
    if (recommendation === 'GIỮ') {
      const deepOversold  = techResult.signals.rsi < 38
      const solidFund     = fundResult.score >= 47
      const profitable    = input.roe > 0 && (input.pe > 0 || input.eps > 0)
      const valuationOK   = input.pe === 0 || input.pe <= bench2.peMax * 1.15
      const debtSafe      = bench2.deMax >= 99 || input.debtEquity === 0 || input.debtEquity < bench2.deMax * 1.1
      if (deepOversold && solidFund && profitable && valuationOK && debtSafe && acceptableSent && notExtremeDown) {
        recommendation = 'MUA'
      }
    }

    // Path 3: Institutional momentum — strong foreign buying + MACD acceleration + near-MUA score
    // Captures NLG-type: smart money accumulation + improving momentum + reasonable valuation.
    // Claude weighs institutional buying and MACD expansion heavily as forward-looking signals.
    if (recommendation === 'GIỮ') {
      const strongForeignBuy  = input.foreignBuyVol > 0 && input.foreignBuyVol > input.foreignSellVol * 1.2
      const macdAccel         = techResult.signals.macdSignal.includes('mở rộng dương') || techResult.signals.macdSignal.includes('Golden Cross')
      const decentTech        = techResult.score >= 52
      const reasonableVal     = input.pe === 0 || input.pe <= bench2.peMax * 1.05
      const nearMuaScore      = overallScore >= 55
      const strongSent        = sentResult.score >= 60
      if (strongForeignBuy && macdAccel && decentTech && reasonableVal && nearMuaScore && strongSent && notExtremeDown && acceptableSent) {
        recommendation = 'MUA'
      }
    }

    // Path 4: "Quality at Value" — blue-chip ROE+ROA + fair valuation + strong institutional buy
    // Captures GAS/VNM-type: world-class fundamental quality + not-overvalued + smart money accumulation.
    // Claude identifies that ROE≥sector + ROA≥1.3×sector + institutional buy = conviction buy
    // even when short-term technicals are temporarily weak.
    // Key distinction vs PLX/BÁN stocks: quality ROE/ROA + PE within 1.35× sector benchmark.
    if (recommendation === 'GIỮ') {
      const qualityROE      = input.roe > 0 && input.roe >= bench2.roeMin
      const qualityROA      = input.roa > 0 && input.roa >= bench2.roaMin * 1.3
      const notOvervalued   = input.pe === 0 || input.pe <= bench2.peMax * 1.35
      const solidFund4      = fundResult.score >= 48  // 48 allows for float precision (displayed as 50)
      // Raw numeric check: "MUA RÒNG mạnh" = netRatio > 0.3 → foreignBuy > 1.86× sell
      // Avoids Unicode string comparison issues with Vietnamese diacritics.
      const institutionalBuy = input.foreignBuyVol > 0 && input.foreignBuyVol > input.foreignSellVol * 1.5
      const aboveMidScore   = overallScore >= 50
      if (qualityROE && qualityROA && notOvervalued && solidFund4 && institutionalBuy && aboveMidScore && notExtremeDown && acceptableSent) {
        recommendation = 'MUA'
      }
    }

    // Path 5: "Deep Value" — PE < 65% sector max + excellent ROE (≥1.5×) + solid fundamentals
    // Captures DGC-type: Graham deep-value stocks. PE=8x with ROE=22% is a screaming buy
    // regardless of sentiment or foreign flow. Does NOT require institutional buying.
    // Claude recognizes extreme cheapness + efficiency quality as sufficient for MUA.
    if (recommendation === 'GIỮ') {
      const deepValuePE   = input.pe > 0 && input.pe < bench2.peMax * 0.65
      const excellentROE5 = input.roe >= bench2.roeMin * 1.3
      const strongFund5   = fundResult.score >= 60
      // Avoid buying into a hard confirmed downtrend (ADX≥30 GIẢM = strong bear pressure)
      const noHardBear5   = !(techResult.signals.adxValue >= 30 && techResult.signals.adxSignal.includes('GIẢM'))
      if (deepValuePE && excellentROE5 && strongFund5 && overallScore >= 44 && noHardBear5) {
        recommendation = 'MUA'
      }
    }

    // Path 6: "Fundamental Quality Sideway" — solid fund + efficient ROA + truly no trend
    // Captures HPG-type: good fundamentals + ADX<20 (no directional momentum either way)
    // + fair valuation + modest sentiment (not catastrophic). Foreign selling alone should
    // not block MUA when fundamentals are solid and price is going nowhere (not down).
    if (recommendation === 'GIỮ') {
      const solidFund6     = fundResult.score >= 60
      const qualityROA6    = input.roa > 0 && input.roa >= bench2.roaMin * 1.3
      const reasonableVal6 = input.pe === 0 || input.pe <= bench2.peMax * 1.1
      const trulySideway6  = techResult.signals.adxValue <= 20  // ADX<=20 = no real trend either way
      const fairSent6      = sentResult.score >= 35              // lower bar: foreign sell ≠ catastrophe
      if (solidFund6 && qualityROA6 && reasonableVal6 && trulySideway6 && fairSent6 && overallScore >= 47 && input.roe > 0) {
        recommendation = 'MUA'
      }
    }
  }

  // MUA → GIỮ caution: tech/sentiment-driven rally without fundamental confirmation
  // REE-type: TECH≥65 + SENT≥65 but profitGrowth=0 and earnings quality data missing.
  // Claude verdict: "wait for earnings confirmation before buying into a pre-priced move."
  if (recommendation === 'MUA' && overallScore < 72) {
    const techSentDriven = techResult.score >= 65 && sentResult.score >= 65
    const fundUncertain  = fundResult.score < 63
      && input.profitGrowth === 0
      && fundResult.signals.earningsQuality.includes('Không đủ')
    if (techSentDriven && fundUncertain) {
      recommendation = 'GIỮ'
    }
  }

  // Confidence: primary driver = overall score level (like Claude AI)
  // + Fund conviction for MUA value plays (Claude weights fundamentals heavily for recovery stocks)
  // + Alignment bonus. - Divergence penalty.
  // Calibrated: AGR GIỮ(44,fund=45)→~45% | HPG MUA(48,fund=62)→~58% | FPT MUA MẠNH(80,fund=72)→~83%
  const techVsOther = Math.abs(techResult.score - (fundResult.score * 0.5 + sentResult.score * 0.5))
  const scores = [techResult.score, fundResult.score, sentResult.score]
  const mean = scores.reduce((a, b) => a + b, 0) / 3
  const variance = scores.reduce((a, v) => a + (v - mean) ** 2, 0) / 3
  const stdDev = Math.sqrt(variance)
  const alignBonus = stdDev < 10 ? 3 : stdDev < 15 ? 1 : 0
  const divPenalty = techVsOther > 20 ? 6 : techVsOther > 12 ? 3 : 0
  // Fund conviction: boosts confidence for MUA/MUA MẠNH when fundamentals are strong
  // (Claude's conviction is fundamental-driven for value recovery plays like HPG/steel/cyclicals)
  const isMuaConv = recommendation === 'MUA' || recommendation === 'MUA MẠNH'
  const isGiwConv = recommendation === 'GIỮ'
  const fundConviction = isMuaConv && overallScore < 65
    ? Math.round(Math.max(0, (fundResult.score - 50) * 0.8))   // value play: fund=62→+10
    : isMuaConv
    ? Math.round(Math.max(0, (fundResult.score - 55) * 0.5))   // normal MUA: smaller boost
    : isGiwConv && fundResult.score >= 60
    ? Math.round(Math.max(0, (fundResult.score - 55) * 0.7))   // GIỮ + strong fund (FPT-type): +5
    : 0
  // Oversold bonus: RSI<35 = temporary dip, AI trusts recovery thesis more
  const oversoldBonus = (isMuaConv || isGiwConv) && techResult.signals.rsi < 35 ? 8 : 0
  // Divergence penalty reduction for fund-upgraded GIỮ (strong fund but weak tech = value play)
  const divPenaltyFinal = isGiwConv && fundResult.score >= 60 && techResult.score < 45
    ? Math.round(divPenalty * 0.4)   // FPT-type: heavy penalty unfair — tech weakness = opportunity, not risk
    : divPenalty
  const confidenceNum = Math.max(28, Math.min(88, overallScore + alignBonus - divPenaltyFinal + fundConviction + oversoldBonus))
  const confidence: SmartScoreResult['confidence'] = confidenceNum >= 70 ? 'CAO' : confidenceNum >= 52 ? 'TRUNG BÌNH' : 'THẤP'

  // ATR(14) for trailing stop display in UI
  const atr14 = input.highs.length >= 15 ? calcATR(input.highs, input.lows, input.closes, 14) : price * 0.02

  // Target/stop uses FINAL recommendation (after BÁN guard)
  const { targetPrice, stopLoss } = calcTargetStopLoss(input, techResult.signals, overallScore, recommendation, fundResult.score)

  // Entry zone: recommendation-aware (matches Claude AI approach)
  // MUA MẠNH: accumulate freely, even slightly above current (strong conviction)
  // MUA: accumulate at or below current price (don't chase above)
  // GIỮ: only add on pullback to support zone (−3% or near support)
  // BÁN/BÁN MẠNH: deep re-accumulation zone = fundamental floor (eps × peMax × 0.55)
  let entryZone: { low: number; high: number }
  const isBearRec = recommendation === 'BÁN' || recommendation === 'BÁN MẠNH'
  if (isBearRec) {
    const benchBan = getSectorBench(input.industry)
    // Fundamental floor: earnings-based bottom where value investors buy back
    const fundFloor = input.eps > 0 && benchBan.peMax > 0
      ? Math.round(input.eps * benchBan.peMax * 0.55)
      : 0
    // Historical 40-day low as alternative anchor
    const hist40Low = input.lows.length >= 40
      ? Math.round(Math.min(...input.lows.slice(-40)))
      : 0
    let entryLowBan: number, entryHighBan: number
    if (fundFloor > price * 0.52 && fundFloor < price * 0.88) {
      // Use fundamental floor as center: ±7%
      entryLowBan  = Math.round(fundFloor * 0.93)
      entryHighBan = Math.round(fundFloor * 1.07)
    } else if (hist40Low > 0 && hist40Low < price * 0.88 && hist40Low > price * 0.40) {
      // Fall back to 40-day historical low zone
      entryLowBan  = Math.round(hist40Low * 0.94)
      entryHighBan = Math.round(hist40Low * 1.05)
    } else {
      // Hard fallback: 17–26% below current price (deep value zone)
      entryLowBan  = Math.round(price * 0.74)
      entryHighBan = Math.round(price * 0.83)
    }
    entryZone = { low: entryLowBan, high: entryHighBan }
  } else {
    // Pre-compute SMA support anchors for entry zone (faster than recalculating later)
    const sma20z = calcSMA(closes, 20).filter(v => !isNaN(v)).pop() ?? 0
    const sma50z = calcSMA(closes, 50).filter(v => !isNaN(v)).pop() ?? 0
    const techSup = techResult.signals.support

    if (recommendation === 'MUA MẠNH') {
      // High conviction: buy near current or on very minor dip (within 10%)
      // High: current + 1% (slight premium OK for very strong signals)
      // Low: nearest support anchor (SMA20 or tech support within 10%), else 5% below
      const nearCands = [techSup, sma20z].filter(s => s > price * 0.90 && s < price * 0.997)
      const bestNear = nearCands.length > 0 ? Math.max(...nearCands) : price * 0.95
      entryZone = {
        low:  Math.round(bestNear * 0.995),   // just at/below nearest support
        high: Math.round(price * 1.01),       // up to 1% premium
      }
    } else if (recommendation === 'MUA') {
      // Accumulate on pullback — don't chase above current price
      // High: current price (max buy point)
      // Low: support level itself (SMA20 or techSup or SMA50) within 18%, else 7% below
      // Filter: accept supports up to 0.1% below current (s < price*0.999) to catch SMA20 near current
      const muaCands = [techSup, sma20z, sma50z].filter(s => s > price * 0.82 && s < price * 0.999)
      const bestMua = muaCands.length > 0 ? Math.max(...muaCands) : price * 0.93
      entryZone = {
        low:  Math.round(bestMua),           // buy at support level (AI zones low = support)
        high: Math.round(price * 1.00),      // current price = max accumulation point
      }
    } else {
      // GIỮ entry zone — two distinct cases:
      // Case A (RSI<35 = oversold): stock is deeply oversold → zone includes current price
      //   AI shows FPT 75,900-78,000₫ = "accumulate now + minor dip" (not waiting for big pullback)
      // Case B (normal GIỮ): zone at deeper support (prefer Math.min = deepest candidate)
      const givRsi = techResult.signals.rsi
      const givCands = [techSup, sma20z, sma50z].filter(s => s > price * 0.80 && s < price * 0.985)

      if (givRsi < 35) {
        // Oversold GIỮ: accumulate near current price — entry zone includes current
        const oversoldLow = givCands.length > 0 ? Math.min(...givCands) : price * 0.96
        entryZone = {
          low:  Math.round(oversoldLow),          // deepest support = low end
          high: Math.round(price * 1.003),        // can buy up to 0.3% above current
        }
      } else if (givCands.length > 0) {
        const bestGiv = Math.min(...givCands)     // deepest valid support = more cautious
        // SAFETY: ensure high ≥ low (avoid inversion when support is close to price)
        const rawHigh = Math.min(Math.round(bestGiv * 1.015), Math.round(price * 0.976))
        entryZone = {
          low:  Math.round(bestGiv),
          high: Math.max(Math.round(bestGiv), rawHigh),   // guard: high must be ≥ low
        }
      } else {
        // No clear support → pullback zone 3-7% below current
        // (sanity guard after will fix if this ends below stop loss)
        entryZone = {
          low:  Math.round(price * 0.93),
          high: Math.round(price * 0.97),
        }
      }
    }
  }

  // ── SANITY CHECK: Entry zone must be ABOVE stop loss for long positions ───────
  // Bug case: GIỮ with tight ATR-stop (2-3%) but fallback entry zone (5-9% below price)
  // causes entry < stop which is logically impossible (you'd be stopped out immediately on entry).
  const isBearRecFinal = recommendation === 'BÁN' || recommendation === 'BÁN MẠNH'
  if (!isBearRecFinal && entryZone.low <= stopLoss) {
    // Shift entry zone to be 1.5-3% above stop, below or at current price
    const minEntry = Math.round(stopLoss * 1.015)  // 1.5% cushion above stop
    const maxEntry = Math.round(price * 0.998)     // 0.2% below current
    entryZone = {
      low:  Math.min(minEntry, maxEntry),
      high: maxEntry > minEntry ? maxEntry : Math.round(minEntry * 1.012),
    }
    if (entryZone.high > Math.round(price * 1.005)) entryZone.high = Math.round(price * 1.005)
  }

  // Holding period uses FINAL recommendation
  // Upgraded MUA with high growth (≥25%) → 3-6 months (buy-the-dip, catalyst needed time)
  // Upgraded MUA moderate growth (10-24%) → 1-3 months
  const holdingPeriod = overallScore >= 75 ? '3-6 tháng'
    : overallScore >= 60 ? '1-3 tháng'
    : (recommendation === 'MUA' || recommendation === 'MUA MẠNH')
      ? (input.profitGrowth >= 25 ? '3-6 tháng' : '1-3 tháng')
    : (recommendation === 'GIỮ') ? (fundResult.score >= 60 ? '3-6 tháng' : '1-2 tháng')
    : 'Không khuyến nghị'

  // R:R ratio — works for both long (stop < price) and short/bearish (stop > price)
  const rrRatio = price > 0 && Math.abs(price - stopLoss) > 0
    ? Math.round(Math.abs((targetPrice - price) / (price - stopLoss)) * 10) / 10
    : 0

  // ── R/R Gate: enforce professional risk management ─────────────────────────
  // No buy recommendation should have R/R < 1.5:1 (bad trade regardless of story).
  // This is a quantitative discipline Claude cannot enforce consistently.
  // Exception: deep oversold (RSI<35) or score≥75 overrides the gate (high conviction).
  const rrGateOverride = techResult.signals.rsi < 35 || overallScore >= 75
  if (!rrGateOverride && rrRatio > 0) {
    if (recommendation === 'MUA MẠNH' && rrRatio < 2.0) recommendation = 'MUA'
    if (recommendation === 'MUA' && rrRatio < 1.5) recommendation = 'GIỮ'
  }

  // Indicator values for chart display
  const sma20arr = calcSMA(closes, 20).filter(v => !isNaN(v))
  const sma50arr = calcSMA(closes, 50).filter(v => !isNaN(v))
  const sma200arr = closes.length >= 200 ? calcSMA(closes, 200).filter(v => !isNaN(v)) : []
  const rsiArr = calcRSI(closes, 14).filter(v => !isNaN(v))
  const macdArr = calcMACD(closes).filter(p => !isNaN(p.macd))
  const bbArr = calcBB(closes, 20).filter(p => !isNaN(p.upper))
  const sma20 = sma20arr[sma20arr.length - 1] ?? price
  const sma50 = sma50arr[sma50arr.length - 1] ?? price
  const sma200 = sma200arr[sma200arr.length - 1] ?? 0
  const rsi14 = rsiArr[rsiArr.length - 1] ?? 50
  const lastMacd = macdArr[macdArr.length - 1]
  const lastBb = bbArr[bbArr.length - 1]

  // Strengths / weaknesses / watch
  const strengths: string[] = []
  const weaknesses: string[] = []
  const watchPoints: string[] = []

  // Technical strengths/weaknesses
  if (techResult.score >= 70) strengths.push('Kỹ thuật mạnh — xu hướng tích cực')
  if (techResult.signals.rsi < 35) strengths.push('RSI oversold — cơ hội mua kỹ thuật')
  if (techResult.signals.rsi > 70) weaknesses.push('RSI overbought — rủi ro điều chỉnh ngắn hạn')
  if (techResult.signals.macdSignal.includes('Golden Cross')) strengths.push('MACD Golden Cross — tín hiệu tăng mạnh')
  if (techResult.signals.macdSignal.includes('Death Cross')) weaknesses.push('MACD Death Cross — tín hiệu giảm')
  if (techResult.signals.momentum1M > 10) strengths.push(`Momentum 1 tháng mạnh (+${techResult.signals.momentum1M}%)`)
  if (techResult.signals.momentum1M < -10) weaknesses.push(`Đang trong đà giảm (-${Math.abs(techResult.signals.momentum1M)}% 1 tháng)`)

  // Fundamental strengths/weaknesses
  if (fundResult.score >= 70) strengths.push('Nền tảng tài chính tốt')
  if (input.roe >= 20) strengths.push(`ROE cao (${input.roe.toFixed(1)}%) — sinh lợi xuất sắc`)
  if (input.pe > 0 && input.pe < getSectorBench(input.industry).peMax * 0.7) strengths.push('Định giá hấp dẫn so với ngành')
  if (input.profitGrowth > 20) strengths.push(`Lợi nhuận tăng mạnh +${input.profitGrowth.toFixed(0)}% YoY`)
  if (input.debtEquity > 2) weaknesses.push(`Nợ cao (D/E ${input.debtEquity.toFixed(1)}x)`)
  if (fundResult.signals.peg !== null && fundResult.signals.peg < 1.0 && fundResult.signals.peg > 0) {
    strengths.push(`PEG ${fundResult.signals.peg.toFixed(2)} < 1 — tăng trưởng được định giá thấp`)
  }
  if (fundResult.signals.peg !== null && fundResult.signals.peg > 2.5) {
    weaknesses.push(`PEG ${fundResult.signals.peg.toFixed(2)} > 2.5 — đắt so với tăng trưởng`)
  }

  // Sentiment strengths/weaknesses
  if (input.avgSentiment > 65) strengths.push('Tin tức tích cực')
  if (input.avgSentiment < 35) weaknesses.push('Tin tức tiêu cực')
  if (input.foreignBuyVol > input.foreignSellVol * 1.5) strengths.push('Khối ngoại mua ròng mạnh')
  if (input.foreignSellVol > input.foreignBuyVol * 1.5) weaknesses.push('Khối ngoại bán ròng mạnh — áp lực')

  // SMA200 signals
  if (sma200 > 0) {
    if (price > sma200 * 1.02) strengths.push(`Trên SMA200 (${Math.round(sma200).toLocaleString('vi-VN')}) — xu hướng dài hạn tích cực`)
    else if (price < sma200 * 0.98) weaknesses.push(`Dưới SMA200 (${Math.round(sma200).toLocaleString('vi-VN')}) — bear dài hạn, cẩn trọng`)
    else watchPoints.push(`Giá đang test SMA200 (${Math.round(sma200).toLocaleString('vi-VN')}) — ngưỡng quyết định xu hướng dài hạn`)
  }

  // Watch points
  if (techResult.signals.support > 0) watchPoints.push(`Hỗ trợ: ${techResult.signals.support.toLocaleString('vi-VN')}`)
  if (techResult.signals.resistance > 0) watchPoints.push(`Kháng cự: ${techResult.signals.resistance.toLocaleString('vi-VN')}`)
  if (confidence === 'THẤP') watchPoints.push('Các chiều phân tích không đồng thuận — tăng thận trọng')
  if (input.vnIndex.trend30d < -5) watchPoints.push('Thị trường chung đang giảm — cân nhắc thời điểm')

  // Narrative summaries (generated after all scoring is done)
  const technicalSummary = genTechSummary(techResult.signals)
  const fundamentalSummary = genFundSummary(fundResult.signals)
  const sentimentSummary = genSentSummary(sentResult.signals)
  const action = genAction(recommendation, overallScore, targetPrice, stopLoss, entryZone, price, holdingPeriod)
  const nextReview = genNextReview(techResult.signals, recommendation)

  return {
    symbol: input.symbol,
    industry: input.industry,
    price,
    overallScore,
    recommendation,
    confidence,
    confidenceNum,
    targetPrice,
    stopLoss,
    entryZone,
    holdingPeriod,
    rrRatio,
    technicalSummary,
    fundamentalSummary,
    sentimentSummary,
    action,
    nextReview,
    technical: { ...techResult.signals, score: Math.round(techResult.score) },
    fundamental: { ...fundResult.signals, score: Math.round(fundResult.score) },
    sentiment: { ...sentResult.signals, score: Math.round(sentResult.score) },
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 4),
    watchPoints: watchPoints.slice(0, 4),
    sma20: Math.round(sma20),
    sma50: Math.round(sma50),
    sma200: Math.round(sma200),
    rsi14: Math.round(rsi14),
    macdValue: lastMacd ? Math.round(lastMacd.macd * 100) / 100 : 0,
    macdSignalValue: lastMacd ? Math.round(lastMacd.signal * 100) / 100 : 0,
    bbUpper: lastBb ? Math.round(lastBb.upper) : 0,
    bbLower: lastBb ? Math.round(lastBb.lower) : 0,
    bbMid: lastBb ? Math.round(lastBb.middle) : 0,
    atr14: Math.round(atr14),
    weeklyTrend: techResult.signals.weeklyTrend,
    weeklyRsi: techResult.signals.weeklyRsi,
  }
}
