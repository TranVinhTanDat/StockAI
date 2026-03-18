/**
 * smartScore.ts — Algorithmic scoring engine for "Phân Tích Thông Minh"
 * No Claude API needed. Pure math + rule-based signals.
 *
 * Three dimensions:
 *   Technical   30% — trend, momentum, RSI, MACD, BB, ADX, volume
 *   Fundamental 40% — P/E, ROE, ROA, P/B, EPS growth, debt, dividend
 *   Sentiment   30% — news, foreign flow, 52W position, market regime
 */

import { calcRSI, calcMACD, calcBB, calcSMA, calcEMA, calcDMI, calcATR } from './indicators'

// ─── Sector benchmarks ───────────────────────────────────────────────────────
interface SectorBench { peMax: number; pbMax: number; roeMin: number; roaMin: number; deMax: number }
const SECTOR_BENCHMARKS: Record<string, SectorBench> = {
  'Ngân hàng':         { peMax: 12, pbMax: 2.0, roeMin: 15, roaMin: 0.8,  deMax: 999 }, // banks: high leverage by design, skip debt check
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
  macdSignal: string
  bbSignal: string
  adxValue: number
  adxSignal: string
  volumeSignal: string
  momentum1W: number
  momentum1M: number
  momentum3M: number
  support: number
  resistance: number
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
  earningsQuality: string
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
        trend: 'Không đủ dữ liệu', rsi: 50, rsiSignal: 'N/A', macdSignal: 'N/A',
        bbSignal: 'N/A', adxValue: 0, adxSignal: 'N/A', volumeSignal: 'N/A',
        momentum1W: 0, momentum1M: 0, momentum3M: 0, support: 0, resistance: 0, score: 50,
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

  // --- RSI (15 pts) ---
  const rsiArr = calcRSI(closes, 14).filter(v => !isNaN(v))
  const rsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50
  let rsiSignal = 'Trung lập'
  if (rsi < 30) { rsiSignal = 'Quá bán - cơ hội mua'; points += 13 }
  else if (rsi < 40) { rsiSignal = 'Gần oversold - tích lũy'; points += 10 }
  else if (rsi >= 40 && rsi <= 60) { rsiSignal = 'Trung lập'; points += 8 }
  else if (rsi > 60 && rsi <= 70) { rsiSignal = 'Tăng momentum'; points += 12 }
  else { rsiSignal = 'Quá mua - rủi ro điều chỉnh'; points += 5 }


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
  let bbUpper = 0, bbLower = 0, bbMid = 0
  if (lastBb) {
    bbUpper = lastBb.upper
    bbLower = lastBb.lower
    bbMid = lastBb.middle
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
      const uptrend = lastDMI.diPlus > lastDMI.diMinus
      if (adxValue >= 25 && uptrend) { adxSignal = `ADX ${adxValue} — Xu hướng TĂNG MẠNH (DI+ ${Math.round(lastDMI.diPlus)} > DI- ${Math.round(lastDMI.diMinus)})`; points += 10 }
      else if (adxValue >= 25 && !uptrend) { adxSignal = `ADX ${adxValue} — Xu hướng GIẢM MẠNH (DI- ${Math.round(lastDMI.diMinus)} > DI+ ${Math.round(lastDMI.diPlus)})`; points += 2 }
      else if (adxValue >= 15 && uptrend) { adxSignal = `ADX ${adxValue} — Xu hướng tăng yếu`; points += 7 }
      else if (adxValue >= 15 && !uptrend) { adxSignal = `ADX ${adxValue} — Xu hướng giảm yếu`; points += 4 }
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

  // --- Volume confirmation (10 pts) ---
  const validVols = volumes.filter(v => !isNaN(v) && v > 0)
  let volumeSignal = 'Bình thường'
  if (validVols.length >= 20) {
    const avg20 = validVols.slice(-20).reduce((a, b) => a + b, 0) / 20
    const avg5 = validVols.slice(-5).reduce((a, b) => a + b, 0) / 5
    const ratio = avg5 / avg20
    const price5dAgo = closes[Math.max(0, closes.length - 6)]
    const priceDir5d = price5dAgo > 0 ? (closes[closes.length - 1] - price5dAgo) / price5dAgo : 0
    if (ratio > 1.5 && priceDir5d > 0) { volumeSignal = 'Tăng với khối lượng lớn — xác nhận mạnh'; points += 10 }
    else if (ratio > 1.5 && priceDir5d <= 0) { volumeSignal = 'Giảm với khối lượng lớn — áp lực bán'; points += 2 }
    else if (ratio < 0.5) { volumeSignal = 'Khối lượng thấp bất thường'; points += 4 }
    else { volumeSignal = 'Khối lượng bình thường'; points += 6 }
  } else points += 5

  // --- Momentum (10 pts) ---
  const last = closes[closes.length - 1]
  const w1ref = closes[Math.max(0, closes.length - 6)]
  const m1ref = closes[Math.max(0, closes.length - 23)]
  const m3ref = closes[Math.max(0, closes.length - 65)]
  const m1W = w1ref > 0 ? Math.round(((last - w1ref) / w1ref) * 1000) / 10 : 0
  const m1M = m1ref > 0 ? Math.round(((last - m1ref) / m1ref) * 1000) / 10 : 0
  const m3M = m3ref > 0 ? Math.round(((last - m3ref) / m3ref) * 1000) / 10 : 0

  // Momentum: recent weeks weighted more (1W=3x, 1M=2x, 3M=1x)
  const momScore = (m1W > 0 ? 3 : -3) + (m1M > 0 ? 2 : -2) + (m3M > 0 ? 1 : -1)
  if (momScore >= 4) points += 10
  else if (momScore >= 2) points += 7
  else if (momScore >= 0) points += 5
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

  const rawScore = clamp((points / MAX) * 100)

  return {
    signals: {
      trend, rsi: Math.round(rsi), rsiSignal, macdSignal, bbSignal,
      adxValue, adxSignal, volumeSignal,
      momentum1W: m1W, momentum1M: m1M, momentum3M: m3M,
      support, resistance, score: rawScore,
    },
    score: rawScore,
  }
}

// ─── Fundamental Score ────────────────────────────────────────────────────────
function scoreFundamental(input: SmartScoreInput): { signals: FundamentalSignals; score: number } {
  const { pe, pb, roe, roa, eps, profitGrowth, revenueGrowth, debtEquity, dividendYield, netMargin, industry, quarterlyEPS } = input

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

  // --- P/B (10 pts) ---
  let pbSignal = 'N/A'
  if (pb > 0) {
    if (pb < bench.pbMax * 0.6) { pbSignal = `P/B ${pb.toFixed(2)}x — Thấp hơn nhiều trung bình ngành`; points += 10 }
    else if (pb <= bench.pbMax) { pbSignal = `P/B ${pb.toFixed(2)}x — Trong ngưỡng ngành`; points += 7 }
    else { pbSignal = `P/B ${pb.toFixed(2)}x — Cao hơn trung bình ngành`; points += 3 }
  } else { pbSignal = 'P/B chưa có dữ liệu'; points += 5 }

  // --- ROE (15 pts) ---
  let roeSignal = 'N/A'
  if (roe > 0) {
    if (roe >= bench.roeMin * 1.5) { roeSignal = `ROE ${roe.toFixed(1)}% — Xuất sắc`; points += 15 }
    else if (roe >= bench.roeMin) { roeSignal = `ROE ${roe.toFixed(1)}% — Tốt`; points += 11 }
    else if (roe >= bench.roeMin * 0.7) { roeSignal = `ROE ${roe.toFixed(1)}% — Chấp nhận được`; points += 7 }
    else { roeSignal = `ROE ${roe.toFixed(1)}% — Thấp hơn trung bình ngành`; points += 3 }
  } else { roeSignal = 'ROE chưa có dữ liệu'; points += 5 }

  // --- ROA (10 pts) — sector-aware ---
  let roaSignal = 'N/A'
  if (roa > 0) {
    if (roa >= bench.roaMin * 1.5) { roaSignal = `ROA ${roa.toFixed(1)}% — Xuất sắc (chuẩn ngành ${bench.roaMin}%)`; points += 10 }
    else if (roa >= bench.roaMin) { roaSignal = `ROA ${roa.toFixed(1)}% — Tốt`; points += 7 }
    else if (roa >= bench.roaMin * 0.6) { roaSignal = `ROA ${roa.toFixed(1)}% — Chấp nhận được`; points += 4 }
    else { roaSignal = `ROA ${roa.toFixed(1)}% — Thấp hơn chuẩn ngành (${bench.roaMin}%)`; points += 2 }
  } else { roaSignal = 'ROA chưa có dữ liệu'; points += 5 }

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

  // --- Earnings quality (5 pts) ---
  let earningsQuality = 'Không đủ dữ liệu'
  let eqPoints = 3
  if (quarterlyEPS.length >= 3) {
    const epsVals = quarterlyEPS.map(q => q.eps).filter(e => e !== 0)
    if (epsVals.length >= 3) {
      const latest = epsVals[0], prev = epsVals[1], pprev = epsVals[2]
      if (latest > prev && prev > pprev) { earningsQuality = 'EPS tăng liên tục 3 quý — chất lượng TỐT'; eqPoints = 5 }
      else if (latest > prev) { earningsQuality = 'EPS tăng quý gần nhất'; eqPoints = 4 }
      else if (latest < prev && prev < pprev) { earningsQuality = 'EPS giảm liên tục 3 quý — cảnh báo'; eqPoints = 1 }
      else { earningsQuality = 'EPS biến động'; eqPoints = 2 }
    }
  }
  points += eqPoints

  // --- Net margin (5 pts) ---
  if (netMargin > 0) {
    if (netMargin >= 20) points += 5
    else if (netMargin >= 10) points += 3
    else if (netMargin >= 5) points += 2
    else points += 1
  }

  // --- PEG scoring (5 pts) ---
  const peg = pe > 0 && profitGrowth > 5 ? Math.round((pe / profitGrowth) * 100) / 100 : null
  if (peg !== null) {
    if (peg < 0.8) points += 5       // growth heavily undervalued
    else if (peg < 1.2) points += 4  // fairly valued vs growth
    else if (peg < 2.0) points += 3  // slightly expensive
    else if (peg < 3.0) points += 1  // expensive vs growth
    // peg >= 3: 0 pts
  } else points += 3 // neutral if no PEG data

  const MAX_POINTS = 105 // 20+10+15+10+20+10+5+5+5+5 = 105
  const rawScore = clamp((points / MAX_POINTS) * 100)

  return {
    signals: {
      peSignal, pbSignal, roeSignal, roaSignal, growthSignal, debtSignal,
      dividendSignal, earningsQuality, peg, score: rawScore,
    },
    score: rawScore,
  }
}

// ─── Sentiment Score ──────────────────────────────────────────────────────────
function scoreSentiment(input: SmartScoreInput): { signals: SentimentSignals; score: number } {
  const { news, avgSentiment, foreignBuyVol, foreignSellVol, w52high, w52low, price, vnIndex, closes } = input

  let points = 0

  // --- News sentiment (30 pts) ---
  let newsSummary = 'Trung lập'
  const newsScore = Math.round(avgSentiment)
  if (newsScore >= 70) { newsSummary = 'Tin tức TÍCH CỰC áp đảo'; points += 30 }
  else if (newsScore >= 55) { newsSummary = 'Tin tức khá tích cực'; points += 20 }
  else if (newsScore >= 45) { newsSummary = 'Tin tức trung lập'; points += 15 }
  else if (newsScore >= 30) { newsSummary = 'Tin tức kém tích cực'; points += 8 }
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

  // --- 52-week position (20 pts) ---
  let w52Signal = 'N/A'
  if (w52high > w52low && w52high > 0) {
    const pos = ((price - w52low) / (w52high - w52low)) * 100
    // Academic: 52W high breakout = strong bullish momentum; 52W low = potential downtrend, not automatic value
    if (pos >= 85) { w52Signal = `Vùng ĐỈNH 52 tuần (${pos.toFixed(0)}%) — momentum breakout mạnh`; points += 14 }
    else if (pos >= 65) { w52Signal = `Gần đỉnh 52 tuần (${pos.toFixed(0)}%) — momentum tích cực`; points += 11 }
    else if (pos >= 40) { w52Signal = `Vùng GIỮA 52 tuần (${pos.toFixed(0)}%)`; points += 8 }
    else if (pos >= 20) { w52Signal = `Vùng THẤP 52 tuần (${pos.toFixed(0)}%) — dưới midpoint, xu hướng yếu`; points += 5 }
    else { w52Signal = `Vùng ĐÁY 52 tuần (${pos.toFixed(0)}%) — cẩn trọng downtrend mạnh`; points += 3 }
  } else points += 10

  // --- Market regime (15 pts) ---
  let marketRegime = 'Không rõ'
  if (vnIndex) {
    const { rsi, trend30d } = vnIndex
    if (rsi > 70 && trend30d > 10) { marketRegime = 'BULL MẠNH — Quá mua, rủi ro điều chỉnh'; points += 8 }
    else if (rsi > 55 && trend30d > 3) { marketRegime = 'BULL — Xu hướng tăng rõ ràng'; points += 14 }
    else if (rsi >= 45 && Math.abs(trend30d) < 3) { marketRegime = 'SIDEWAYS — Tích lũy, chọn lọc cẩn thận'; points += 10 }
    else if (rsi < 30 && trend30d < -8) { marketRegime = 'BEAR MẠNH — Rủi ro cao, phòng thủ'; points += 4 }
    else if (rsi < 45 && trend30d < -3) { marketRegime = 'BEAR NHẸ — Thận trọng, chỉ mua mã cực mạnh'; points += 6 }
    else { marketRegime = 'ĐIỀU CHỈNH — Biến động, theo dõi xác nhận'; points += 8 }
  } else points += 10

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
function calcTargetStopLoss(
  input: SmartScoreInput,
  tech: TechnicalSignals,
  overallScore: number,
  finalRec: SmartScoreResult['recommendation']
): { targetPrice: number; stopLoss: number } {
  const { price, highs, lows, closes } = input
  const isBearish = finalRec === 'BÁN' || finalRec === 'BÁN MẠNH'

  // ── BEARISH scenario (BÁN / BÁN MẠNH) ─────────────────────────────────────
  // Target = downside support level; StopLoss = upside resistance (thesis invalidation)
  if (isBearish) {
    // Downside target: use support or -10% default
    let bearTarget = Math.round(price * 0.90)
    if (tech.support > 0 && tech.support < price && tech.support > price * 0.78) {
      bearTarget = Math.round(tech.support * 0.98)  // 2% below support
    }
    // Upside stop: above resistance or +8% default
    let bearStop = Math.round(price * 1.08)
    if (tech.resistance > 0 && tech.resistance > price && tech.resistance < price * 1.25) {
      bearStop = Math.round(tech.resistance * 1.02)  // 2% above resistance
    }
    return { targetPrice: bearTarget, stopLoss: bearStop }
  }

  // ── BULLISH/NEUTRAL scenario (GIỮ / MUA / MUA MẠNH: score ≥ 46) ───────────
  // ATR-based volatility scaling — cap at 1.5x to prevent unreasonably wide stops
  const atr = (highs.length >= 14 && lows.length >= 14)
    ? calcATR(highs, lows, closes, 14)
    : price * 0.02
  const atrPct = atr / price
  // Scale: 2% ATR = neutral (×1), 4% ATR = wider (×1.5 max) — was ×2.5, caused -20% stops
  const atrScale = Math.max(1, Math.min(1.5, atrPct / 0.02))

  // Base upside/downside proportional to score, scaled by volatility
  const baseUpside = overallScore >= 70 ? 0.15 : overallScore >= 55 ? 0.10 : overallScore >= 40 ? 0.07 : 0.04
  const baseDownside = overallScore >= 60 ? 0.06 : overallScore >= 48 ? 0.08 : 0.10
  const adjustedUpside = Math.min(baseUpside * atrScale, 0.25)   // hard cap +25%
  const adjustedDownside = Math.min(baseDownside * atrScale, 0.12) // hard cap -12%

  // Target: use resistance as ceiling if within range
  let targetPrice = Math.round(price * (1 + adjustedUpside))
  if (tech.resistance > price && tech.resistance < price * (1 + adjustedUpside * 2)) {
    targetPrice = Math.round(Math.max(tech.resistance * 0.98, targetPrice))
  }

  // Stop loss: place BELOW support (1.5% buffer below), not above it
  let stopLoss = Math.round(price * (1 - adjustedDownside))
  if (tech.support > 0 && tech.support < price && tech.support > price * 0.75) {
    const stopBelowSupport = Math.round(tech.support * 0.985)
    stopLoss = Math.max(stopBelowSupport, stopLoss) // tighter of the two (closer to price)
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
  const eq = !f.earningsQuality.includes('Không đủ') ? f.earningsQuality : ''
  const peg = f.peg !== null ? `PEG ${f.peg.toFixed(2)}x — ${f.peg < 1 ? 'rẻ so tăng trưởng' : f.peg < 2 ? 'định giá hợp lý' : 'đắt so tăng trưởng'}` : ''
  const div = f.dividendSignal !== 'Không có cổ tức' && f.dividendSignal !== 'N/A' ? f.dividendSignal : ''
  return [pe, roe, roa, growth, debt, eq, peg, div].filter(Boolean).slice(0, 6).join('. ') + '.'
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
  const { closes, highs, lows, volumes, price } = input

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
  else if (overallScore >= 62) recommendation = 'MUA'
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

  // ── GIỮ → MUA upgrade: strong fundamentals override weak technicals ────────
  // Mirrors Claude's "strong growth + reasonable valuation = buy the dip" logic.
  // Applies to both naturally-GIỮ stocks and BÁN-overridden-to-GIỮ stocks (SSI type).
  if (recommendation === 'GIỮ') {
    const veryStrongFund    = fundResult.score >= 68
    const highGrowth        = input.profitGrowth >= 10   // double-digit profit growth
    // Lowered 50→44: SSI-type stocks in correction have sentiment 44-49 due to 52W/RS drag.
    // News >= 42 is already confirmed by BÁN guard Case 2; don't double-penalize via total score.
    const acceptableSent    = sentResult.score >= 44
    // Extreme downtrend = ADX >= 35 (very strong bear). ADX 25-34 = moderate, overridable by strong fundamentals.
    const notExtremeDown    = !(techResult.signals.adxValue >= 35 && techResult.signals.adxSignal.includes('GIẢM'))
    if (veryStrongFund && highGrowth && acceptableSent && notExtremeDown) {
      recommendation = 'MUA'
    }
  }

  // Confidence: how aligned are the 3 scores?
  const scores = [techResult.score, fundResult.score, sentResult.score]
  const mean = scores.reduce((a, b) => a + b, 0) / 3
  const variance = scores.reduce((a, v) => a + (v - mean) ** 2, 0) / 3
  const stdDev = Math.sqrt(variance)
  const confidence: SmartScoreResult['confidence'] = stdDev < 12 ? 'CAO' : stdDev < 22 ? 'TRUNG BÌNH' : 'THẤP'
  // Numeric confidence 0-100 (mirrors AI output style)
  const confidenceNum = stdDev < 12 ? Math.round(70 + (12 - stdDev) * 1.5)
    : stdDev < 22 ? Math.round(55 + (22 - stdDev) * 1.5)
    : Math.max(30, Math.round(55 - (stdDev - 22) * 1.2))

  // Target/stop uses FINAL recommendation (after BÁN guard)
  const { targetPrice, stopLoss } = calcTargetStopLoss(input, techResult.signals, overallScore, recommendation)

  // Entry zone: near support, just below current price
  const entryLow = techResult.signals.support > 0 && techResult.signals.support > price * 0.85
    ? Math.round(techResult.signals.support * 1.005)
    : Math.round(price * 0.97)
  const entryHigh = Math.round(price * 1.01)
  const entryZone = { low: Math.min(entryLow, entryHigh), high: Math.max(entryLow, entryHigh) }

  // Holding period uses FINAL recommendation
  // Note: MUA via upgrade (overallScore < 62) still needs a holding period
  const holdingPeriod = overallScore >= 75 ? '3-6 tháng'
    : overallScore >= 62 ? '1-3 tháng'
    : (recommendation === 'MUA' || recommendation === 'MUA MẠNH') ? '1-3 tháng'
    : (recommendation === 'GIỮ') ? '2-4 tuần'
    : 'Không khuyến nghị'

  // R:R ratio — works for both long (stop < price) and short/bearish (stop > price)
  const rrRatio = price > 0 && Math.abs(price - stopLoss) > 0
    ? Math.round(Math.abs((targetPrice - price) / (price - stopLoss)) * 10) / 10
    : 0

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
  }
}
