import type { MACDPoint, BBPoint } from '@/types'

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
