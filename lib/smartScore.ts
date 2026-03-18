/**
 * smartScore.ts — Algorithmic scoring engine for "Phân Tích Thông Minh"
 * No Claude API needed. Pure math + rule-based signals.
 *
 * Three dimensions:
 *   Technical   30% — trend, momentum, RSI, MACD, BB, ADX, volume
 *   Fundamental 40% — P/E, ROE, ROA, P/B, EPS growth, debt, dividend
 *   Sentiment   30% — news, foreign flow, 52W position, market regime
 */

import { calcRSI, calcMACD, calcBB, calcSMA, calcEMA, calcADX } from './indicators'

// ─── Sector benchmarks (same as lib/claude.ts) ───────────────────────────────
const SECTOR_BENCHMARKS: Record<string, { peMax: number; pbMax: number; roeMin: number }> = {
  'Ngân hàng':         { peMax: 12, pbMax: 2.0, roeMin: 15 },
  'Bất động sản':      { peMax: 22, pbMax: 2.5, roeMin: 10 },
  'Thép':              { peMax: 12, pbMax: 1.5, roeMin:  8 },
  'Vật liệu xây dựng': { peMax: 14, pbMax: 1.8, roeMin:  8 },
  'Bán lẻ':            { peMax: 22, pbMax: 3.5, roeMin: 15 },
  'Công nghệ':         { peMax: 30, pbMax: 5.0, roeMin: 18 },
  'Thực phẩm':         { peMax: 25, pbMax: 4.0, roeMin: 20 },
  'Đồ uống':           { peMax: 25, pbMax: 4.5, roeMin: 20 },
  'Dầu khí':           { peMax: 15, pbMax: 2.5, roeMin: 12 },
  'Chứng khoán':       { peMax: 16, pbMax: 2.5, roeMin: 12 },
  'Dược phẩm':         { peMax: 25, pbMax: 4.0, roeMin: 15 },
  'Điện':              { peMax: 18, pbMax: 2.2, roeMin: 10 },
  'Năng lượng':        { peMax: 18, pbMax: 2.2, roeMin: 10 },
  'Vận tải':           { peMax: 18, pbMax: 2.0, roeMin: 10 },
  'Logistics':         { peMax: 20, pbMax: 2.5, roeMin: 12 },
  'Xây dựng':          { peMax: 15, pbMax: 1.8, roeMin:  8 },
  'Hóa chất':          { peMax: 14, pbMax: 1.8, roeMin:  8 },
  'Thủy sản':          { peMax: 15, pbMax: 2.0, roeMin: 10 },
  'Nông nghiệp':       { peMax: 15, pbMax: 1.8, roeMin:  8 },
  'Bảo hiểm':          { peMax: 20, pbMax: 2.5, roeMin: 12 },
  'Viễn thông':        { peMax: 18, pbMax: 3.0, roeMin: 15 },
  'Y tế':              { peMax: 28, pbMax: 5.0, roeMin: 15 },
}

function getSectorBench(industry: string) {
  for (const [key, val] of Object.entries(SECTOR_BENCHMARKS)) {
    if (industry.toLowerCase().includes(key.toLowerCase())) return val
  }
  return { peMax: 18, pbMax: 2.5, roeMin: 12 } // generic default
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
      macdSignal = 'MACD trên signal — Xu hướng tăng'
      points += 10
    } else if (lastMacd.macd < lastMacd.signal && lastMacd.histogram < 0) {
      macdSignal = 'MACD dưới signal — Xu hướng giảm'
      points += 4
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

  // --- ADX trend strength (10 pts) ---
  let adxValue = 0, adxSignal = 'Không đủ dữ liệu'
  if (highs.length >= 28 && lows.length >= 28) {
    const adxArr = calcADX(highs, lows, closes, 14).filter(v => !isNaN(v))
    if (adxArr.length > 0) {
      adxValue = Math.round(adxArr[adxArr.length - 1])
      if (adxValue >= 25) { adxSignal = 'Xu hướng MẠNH (ADX≥25)'; points += 10 }
      else if (adxValue >= 15) { adxSignal = 'Xu hướng YẾU (ADX 15-25)'; points += 6 }
      else { adxSignal = 'SIDEWAY — không có xu hướng rõ'; points += 3 }
    }
  } else points += 5

  // --- Volume confirmation (10 pts) ---
  const validVols = volumes.filter(v => !isNaN(v) && v > 0)
  let volumeSignal = 'Bình thường'
  if (validVols.length >= 20) {
    const avg20 = validVols.slice(-20).reduce((a, b) => a + b, 0) / 20
    const avg5 = validVols.slice(-5).reduce((a, b) => a + b, 0) / 5
    const ratio = avg5 / avg20
    if (ratio > 1.5 && (input.changePct > 0)) { volumeSignal = 'Tăng với khối lượng lớn — xác nhận mạnh'; points += 10 }
    else if (ratio > 1.5 && (input.changePct <= 0)) { volumeSignal = 'Giảm với khối lượng lớn — áp lực bán'; points += 2 }
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

  // Average momentum score: positive momentum gets higher points
  const momScore = (m1W > 0 ? 1 : -1) + (m1M > 0 ? 1 : -1) + (m3M > 0 ? 2 : -2)
  if (momScore >= 3) points += 10
  else if (momScore >= 1) points += 7
  else if (momScore === 0) points += 5
  else points += 2

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
    if (swingHighs.length > 0) resistance = Math.round(Math.max(...swingHighs))
    if (swingLows.length > 0) support = Math.round(Math.min(...swingLows))
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
    if (pe < bench.peMax * 0.6) { peSignal = `P/E ${pe.toFixed(1)}x — Định giá RẤT THẤP (<60% trung bình ngành)`; points += 20 }
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

  // --- ROA (10 pts) ---
  let roaSignal = 'N/A'
  if (roa > 0) {
    if (roa >= 5) { roaSignal = `ROA ${roa.toFixed(1)}% — Xuất sắc`; points += 10 }
    else if (roa >= 2) { roaSignal = `ROA ${roa.toFixed(1)}% — Tốt`; points += 7 }
    else if (roa > 0) { roaSignal = `ROA ${roa.toFixed(1)}% — Thấp`; points += 3 }
  } else { roaSignal = 'ROA chưa có dữ liệu'; points += 5 }

  // --- Growth (20 pts) ---
  const avgGrowth = (profitGrowth + revenueGrowth) / 2
  let growthSignal = 'N/A'
  if (profitGrowth > 0 || revenueGrowth > 0) {
    if (avgGrowth >= 25) { growthSignal = `Tăng trưởng MẠNH (LN ${profitGrowth > 0 ? '+' : ''}${profitGrowth.toFixed(0)}%, DT ${revenueGrowth > 0 ? '+' : ''}${revenueGrowth.toFixed(0)}%)`; points += 20 }
    else if (avgGrowth >= 10) { growthSignal = `Tăng trưởng TỐT (LN ${profitGrowth.toFixed(0)}%, DT ${revenueGrowth.toFixed(0)}%)`; points += 14 }
    else if (avgGrowth >= 0) { growthSignal = `Tăng trưởng CHẬM (LN ${profitGrowth.toFixed(0)}%, DT ${revenueGrowth.toFixed(0)}%)`; points += 8 }
    else { growthSignal = `Tăng trưởng ÂM — cần theo dõi`; points += 2 }
  } else { growthSignal = 'Chưa có dữ liệu tăng trưởng'; points += 8 }

  // --- Debt (10 pts) ---
  let debtSignal = 'N/A'
  if (debtEquity > 0) {
    if (debtEquity < 0.3) { debtSignal = `D/E ${debtEquity.toFixed(2)}x — Nợ rất thấp`; points += 10 }
    else if (debtEquity < 0.8) { debtSignal = `D/E ${debtEquity.toFixed(2)}x — Nợ an toàn`; points += 8 }
    else if (debtEquity < 1.5) { debtSignal = `D/E ${debtEquity.toFixed(2)}x — Nợ chấp nhận được`; points += 5 }
    else if (debtEquity < 3) { debtSignal = `D/E ${debtEquity.toFixed(2)}x — Nợ CAO`; points += 2 }
    else { debtSignal = `D/E ${debtEquity.toFixed(2)}x — Nợ RẤT CAO — rủi ro tài chính`; points += 0 }
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

  // --- PEG ---
  const peg = pe > 0 && profitGrowth > 5 ? Math.round((pe / profitGrowth) * 100) / 100 : null

  const MAX_POINTS = 95 // 20+10+15+10+20+10+5+5 = 95
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
    if (pos <= 25) { w52Signal = `Vùng ĐÁY 52 tuần (${pos.toFixed(0)}%) — thường là vùng tích lũy tốt`; points += 18 }
    else if (pos <= 45) { w52Signal = `Vùng THẤP 52 tuần (${pos.toFixed(0)}%)`; points += 14 }
    else if (pos <= 65) { w52Signal = `Vùng GIỮA 52 tuần (${pos.toFixed(0)}%)`; points += 10 }
    else if (pos <= 80) { w52Signal = `Gần đỉnh 52 tuần (${pos.toFixed(0)}%)`; points += 7 }
    else { w52Signal = `Vùng ĐỈNH 52 tuần (${pos.toFixed(0)}%) — cẩn thận rủi ro điều chỉnh`; points += 4 }
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
function calcTargetStopLoss(input: SmartScoreInput, tech: TechnicalSignals, overallScore: number): { targetPrice: number; stopLoss: number } {
  const { price, closes } = input
  // Upside potential proportional to score
  const upsideMult = overallScore >= 70 ? 0.15 : overallScore >= 55 ? 0.10 : overallScore >= 40 ? 0.05 : 0.02
  const downside = overallScore >= 60 ? 0.06 : overallScore >= 45 ? 0.08 : 0.12

  // Use resistance as ceiling for target if reasonable
  let targetPrice = Math.round(price * (1 + upsideMult))
  if (tech.resistance > price && tech.resistance < price * 1.3) {
    targetPrice = Math.round(Math.max(tech.resistance * 0.98, targetPrice))
  }

  // Use support as floor for stop if reasonable
  let stopLoss = Math.round(price * (1 - downside))
  if (tech.support > 0 && tech.support < price && tech.support > price * 0.8) {
    stopLoss = Math.round(Math.min(tech.support * 1.02, stopLoss))
  }

  return { targetPrice, stopLoss }
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
  else if (overallScore >= 45) recommendation = 'GIỮ'
  else if (overallScore >= 30) recommendation = 'BÁN'
  else recommendation = 'BÁN MẠNH'

  // Confidence: how aligned are the 3 scores?
  const scores = [techResult.score, fundResult.score, sentResult.score]
  const mean = scores.reduce((a, b) => a + b, 0) / 3
  const variance = scores.reduce((a, v) => a + (v - mean) ** 2, 0) / 3
  const stdDev = Math.sqrt(variance)
  const confidence: SmartScoreResult['confidence'] = stdDev < 12 ? 'CAO' : stdDev < 22 ? 'TRUNG BÌNH' : 'THẤP'

  const { targetPrice, stopLoss } = calcTargetStopLoss(input, techResult.signals, overallScore)

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

  return {
    symbol: input.symbol,
    industry: input.industry,
    price,
    overallScore,
    recommendation,
    confidence,
    targetPrice,
    stopLoss,
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
