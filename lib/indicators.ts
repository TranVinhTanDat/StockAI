import type { MACDPoint, BBPoint } from '@/types'

// ADX — Average Directional Index (trend strength)
// Returns array of ADX values (NaN until sufficient data). period=14 standard.
export function calcADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number[] {
  const n = Math.min(highs.length, lows.length, closes.length)
  const result = new Array(n).fill(NaN) as number[]
  if (n < 2 * period) return result

  const tr: number[] = []
  const pdm: number[] = []
  const mdm: number[] = []
  for (let i = 1; i < n; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1]
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
    const up = h - highs[i - 1]
    const dn = lows[i - 1] - l
    pdm.push(up > dn && up > 0 ? up : 0)
    mdm.push(dn > up && dn > 0 ? dn : 0)
  }
  if (tr.length < period) return result

  let satr = tr.slice(0, period).reduce((a, b) => a + b, 0)
  let spdm = pdm.slice(0, period).reduce((a, b) => a + b, 0)
  let smdm = mdm.slice(0, period).reduce((a, b) => a + b, 0)

  const dx: number[] = []
  const pushDX = () => {
    const pdi = satr > 0 ? 100 * spdm / satr : 0
    const mdi = satr > 0 ? 100 * smdm / satr : 0
    const s = pdi + mdi
    dx.push(s > 0 ? 100 * Math.abs(pdi - mdi) / s : 0)
  }
  pushDX()
  for (let i = period; i < tr.length; i++) {
    satr = satr - satr / period + tr[i]
    spdm = spdm - spdm / period + pdm[i]
    smdm = smdm - smdm / period + mdm[i]
    pushDX()
  }
  if (dx.length < period) return result

  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period
  let ri = 2 * period
  if (ri < n) result[ri] = adx
  for (let i = period; i < dx.length; i++) {
    adx = (adx * (period - 1) + dx[i]) / period
    ri++
    if (ri < n) result[ri] = adx
  }
  return result
}

export function calcSMA(data: number[], period: number): number[] {
  const result: number[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN)
      continue
    }
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j]
    }
    result.push(sum / period)
  }
  return result
}

export function calcEMA(data: number[], period: number): number[] {
  const result: number[] = []
  const multiplier = 2 / (period + 1)

  let smaSum = 0
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      smaSum += data[i]
      result.push(NaN)
      continue
    }
    if (i === period - 1) {
      smaSum += data[i]
      result.push(smaSum / period)
      continue
    }
    const prev = result[i - 1]
    result.push((data[i] - prev) * multiplier + prev)
  }
  return result
}

export function calcRSI(data: number[], period: number = 14): number[] {
  const result: number[] = []

  if (data.length < period + 1) {
    return data.map(() => NaN)
  }

  // Calculate price changes
  const changes: number[] = []
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i] - data[i - 1])
  }

  // First value is always NaN (no previous price)
  result.push(NaN)

  // First `period` values are NaN
  for (let i = 0; i < period - 1; i++) {
    result.push(NaN)
  }

  // Initial average gain/loss using SMA
  let avgGain = 0
  let avgLoss = 0
  for (let i = 0; i < period; i++) {
    const change = changes[i]
    if (change > 0) avgGain += change
    else avgLoss += Math.abs(change)
  }
  avgGain /= period
  avgLoss /= period

  // First RSI value
  if (avgLoss === 0) {
    result.push(100)
  } else {
    result.push(100 - 100 / (1 + avgGain / avgLoss))
  }

  // Subsequent RSI values using Wilder smoothing
  for (let i = period; i < changes.length; i++) {
    const change = changes[i]
    const currentGain = change > 0 ? change : 0
    const currentLoss = change < 0 ? Math.abs(change) : 0

    avgGain = (avgGain * (period - 1) + currentGain) / period
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period

    if (avgLoss === 0) {
      result.push(100)
    } else {
      result.push(100 - 100 / (1 + avgGain / avgLoss))
    }
  }

  return result
}

export function calcMACD(
  data: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDPoint[] {
  const emaFast = calcEMA(data, fastPeriod)
  const emaSlow = calcEMA(data, slowPeriod)

  const macdLine: number[] = []
  for (let i = 0; i < data.length; i++) {
    if (isNaN(emaFast[i]) || isNaN(emaSlow[i])) {
      macdLine.push(NaN)
    } else {
      macdLine.push(emaFast[i] - emaSlow[i])
    }
  }

  const validMacd = macdLine.filter((v) => !isNaN(v))
  const signalLine = calcEMA(validMacd, signalPeriod)

  const result: MACDPoint[] = []
  let validIdx = 0
  for (let i = 0; i < data.length; i++) {
    if (isNaN(macdLine[i])) {
      result.push({ macd: NaN, signal: NaN, histogram: NaN })
    } else {
      const sig = signalLine[validIdx] ?? NaN
      result.push({
        macd: macdLine[i],
        signal: sig,
        histogram: isNaN(sig) ? NaN : macdLine[i] - sig,
      })
      validIdx++
    }
  }
  return result
}

// ATR — Average True Range (measures volatility, used for target/stop sizing)
export function calcATR(highs: number[], lows: number[], closes: number[], period = 14): number {
  const n = Math.min(highs.length, lows.length, closes.length)
  if (n < 2) return 0
  const tr: number[] = []
  for (let i = 1; i < n; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1]
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }
  if (tr.length === 0) return 0
  const slice = tr.slice(-Math.min(period, tr.length))
  return slice.reduce((a, b) => a + b, 0) / slice.length
}

// calcDMI — ADX with DI+/DI- direction (fixes ADX-only which has no direction info)
export function calcDMI(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): Array<{ adx: number; diPlus: number; diMinus: number }> {
  const n = Math.min(highs.length, lows.length, closes.length)
  const nan = { adx: NaN, diPlus: NaN, diMinus: NaN }
  const result = Array.from({ length: n }, () => ({ ...nan }))
  if (n < 2 * period + 1) return result

  const tr: number[] = [], pdm: number[] = [], mdm: number[] = []
  for (let i = 1; i < n; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1]
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
    const up = h - highs[i - 1], dn = lows[i - 1] - l
    pdm.push(up > dn && up > 0 ? up : 0)
    mdm.push(dn > up && dn > 0 ? dn : 0)
  }

  let satr = tr.slice(0, period).reduce((a, b) => a + b, 0)
  let spdm = pdm.slice(0, period).reduce((a, b) => a + b, 0)
  let smdm = mdm.slice(0, period).reduce((a, b) => a + b, 0)

  const dxArr: number[] = []
  const diPlusArr: number[] = []
  const diMinusArr: number[] = []

  const pushEntry = () => {
    const pdi = satr > 0 ? 100 * spdm / satr : 0
    const mdi = satr > 0 ? 100 * smdm / satr : 0
    const s = pdi + mdi
    dxArr.push(s > 0 ? 100 * Math.abs(pdi - mdi) / s : 0)
    diPlusArr.push(pdi)
    diMinusArr.push(mdi)
  }

  pushEntry()
  for (let i = period; i < tr.length; i++) {
    satr = satr - satr / period + tr[i]
    spdm = spdm - spdm / period + pdm[i]
    smdm = smdm - smdm / period + mdm[i]
    pushEntry()
  }

  if (dxArr.length < period) return result

  let adx = dxArr.slice(0, period).reduce((a, b) => a + b, 0) / period
  let ri = 2 * period
  if (ri < n) result[ri] = { adx, diPlus: diPlusArr[0], diMinus: diMinusArr[0] }

  for (let i = period; i < dxArr.length; i++) {
    adx = (adx * (period - 1) + dxArr[i]) / period
    ri++
    if (ri < n) result[ri] = { adx, diPlus: diPlusArr[i], diMinus: diMinusArr[i] }
  }
  return result
}

export function calcBB(
  data: number[],
  period: number = 20,
  multiplier: number = 2
): BBPoint[] {
  const sma = calcSMA(data, period)
  const result: BBPoint[] = []

  for (let i = 0; i < data.length; i++) {
    if (isNaN(sma[i])) {
      result.push({ upper: NaN, middle: NaN, lower: NaN })
      continue
    }

    let sumSquaredDiff = 0
    for (let j = i - period + 1; j <= i; j++) {
      sumSquaredDiff += Math.pow(data[j] - sma[i], 2)
    }
    const stdDev = Math.sqrt(sumSquaredDiff / period)

    result.push({
      upper: sma[i] + multiplier * stdDev,
      middle: sma[i],
      lower: sma[i] - multiplier * stdDev,
    })
  }
  return result
}

// OBV — On-Balance Volume (cumulative volume trend confirmation)
// Rising OBV = accumulation (confirm uptrend); Falling OBV = distribution (confirm downtrend)
export function calcOBV(closes: number[], volumes: number[]): number[] {
  const n = Math.min(closes.length, volumes.length)
  const result: number[] = []
  let obv = 0
  for (let i = 0; i < n; i++) {
    if (i === 0) { result.push(0); continue }
    if (closes[i] > closes[i - 1]) obv += volumes[i]
    else if (closes[i] < closes[i - 1]) obv -= volumes[i]
    result.push(obv)
  }
  return result
}

// Williams %R — fast overbought/oversold oscillator (range: -100 to 0)
// Overbought: > -20 (near 0); Oversold: < -80 (near -100)
export function calcWilliamsR(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  const n = Math.min(highs.length, lows.length, closes.length)
  const result = new Array(n).fill(NaN) as number[]
  for (let i = period - 1; i < n; i++) {
    const hh = Math.max(...highs.slice(i - period + 1, i + 1))
    const ll = Math.min(...lows.slice(i - period + 1, i + 1))
    result[i] = hh === ll ? -50 : ((hh - closes[i]) / (hh - ll)) * -100
  }
  return result
}

// CCI — Commodity Channel Index (period=20, typical price based)
// Overbought: > +100; Oversold: < -100
export function calcCCI(highs: number[], lows: number[], closes: number[], period = 20): number[] {
  const n = Math.min(highs.length, lows.length, closes.length)
  const result = new Array(n).fill(NaN) as number[]
  for (let i = period - 1; i < n; i++) {
    const tpSlice: number[] = []
    for (let j = i - period + 1; j <= i; j++) {
      tpSlice.push((highs[j] + lows[j] + closes[j]) / 3)
    }
    const tp = (highs[i] + lows[i] + closes[i]) / 3
    const meanTP = tpSlice.reduce((a, b) => a + b, 0) / period
    const meanDev = tpSlice.reduce((s, v) => s + Math.abs(v - meanTP), 0) / period
    result[i] = meanDev === 0 ? 0 : (tp - meanTP) / (0.015 * meanDev)
  }
  return result
}
