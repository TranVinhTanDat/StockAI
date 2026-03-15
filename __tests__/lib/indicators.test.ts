import { describe, it, expect } from 'vitest'
import { calcSMA, calcEMA, calcRSI, calcMACD, calcBB } from '@/lib/indicators'

// ── Helpers ──────────────────────────────────────────────────
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
const close = (prices: number[]) => prices

// ── calcSMA ───────────────────────────────────────────────────
describe('calcSMA', () => {
  it('returns NaN for indices before period', () => {
    const result = calcSMA([10, 20, 30, 40, 50], 3)
    expect(isNaN(result[0])).toBe(true)
    expect(isNaN(result[1])).toBe(true)
  })

  it('returns correct SMA-3 values', () => {
    const result = calcSMA([10, 20, 30, 40, 50], 3)
    expect(result[2]).toBeCloseTo(20)   // (10+20+30)/3
    expect(result[3]).toBeCloseTo(30)   // (20+30+40)/3
    expect(result[4]).toBeCloseTo(40)   // (30+40+50)/3
  })

  it('period=1 equals input', () => {
    const data = [5, 10, 15]
    const result = calcSMA(data, 1)
    expect(result).toEqual(data)
  })

  it('returns array of same length', () => {
    const data = range(50)
    expect(calcSMA(data, 20).length).toBe(50)
  })
})

// ── calcEMA ───────────────────────────────────────────────────
describe('calcEMA', () => {
  it('returns NaN for first period-1 values', () => {
    const result = calcEMA(range(10), 5)
    for (let i = 0; i < 4; i++) expect(isNaN(result[i])).toBe(true)
  })

  it('first valid EMA equals SMA of first period', () => {
    const data = [2, 4, 6, 8, 10]
    const result = calcEMA(data, 5)
    // First EMA = SMA = (2+4+6+8+10)/5 = 6
    expect(result[4]).toBeCloseTo(6)
  })

  it('EMA reacts faster to new price than SMA', () => {
    // Flat data then spike
    const data = Array(20).fill(100) as number[]
    data.push(200) // sudden spike
    const ema = calcEMA(data, 10)
    const sma = calcSMA(data, 10)
    const lastIdx = data.length - 1
    // EMA should be higher than SMA after spike (more reactive)
    expect(ema[lastIdx]).toBeGreaterThan(sma[lastIdx])
  })
})

// ── calcRSI ───────────────────────────────────────────────────
describe('calcRSI', () => {
  it('returns all NaN when data too short', () => {
    const result = calcRSI([10, 20, 30], 14)
    expect(result.every(isNaN)).toBe(true)
  })

  it('RSI is between 0 and 100', () => {
    const data = range(30).map(i => 100 + Math.sin(i) * 10)
    const result = calcRSI(data, 14)
    const valid = result.filter(v => !isNaN(v))
    valid.forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    })
  })

  it('returns RSI=100 for constantly rising prices', () => {
    const rising = range(30)
    const result = calcRSI(rising, 14)
    const valid = result.filter(v => !isNaN(v))
    // All gains, no losses → RSI should be 100
    valid.forEach(v => expect(v).toBe(100))
  })

  it('returns correct length', () => {
    const data = range(30)
    expect(calcRSI(data, 14).length).toBe(30)
  })
})

// ── calcMACD ──────────────────────────────────────────────────
describe('calcMACD', () => {
  it('returns same length array', () => {
    const data = range(60)
    expect(calcMACD(data).length).toBe(60)
  })

  it('early values are NaN (need enough data for EMA26)', () => {
    const data = range(60)
    const result = calcMACD(data)
    // First 25 values should have NaN macd
    expect(isNaN(result[0].macd)).toBe(true)
    expect(isNaN(result[24].macd)).toBe(true)
  })

  it('histogram = macd - signal when both valid', () => {
    const data = range(60)
    const result = calcMACD(data)
    const valid = result.filter(p => !isNaN(p.macd) && !isNaN(p.signal))
    valid.forEach(p => {
      expect(p.histogram).toBeCloseTo(p.macd - p.signal, 8)
    })
  })
})

// ── calcBB ────────────────────────────────────────────────────
describe('calcBB', () => {
  it('returns same length array', () => {
    const data = range(50)
    expect(calcBB(data, 20).length).toBe(50)
  })

  it('upper > middle > lower for non-flat data', () => {
    const data = range(30).map(i => 100 + Math.sin(i) * 5)
    const result = calcBB(data, 20)
    const valid = result.filter(p => !isNaN(p.upper))
    valid.forEach(p => {
      expect(p.upper).toBeGreaterThan(p.middle)
      expect(p.middle).toBeGreaterThan(p.lower)
    })
  })

  it('bands collapse to middle when data is flat', () => {
    const flat = Array(30).fill(100) as number[]
    const result = calcBB(flat, 20)
    const valid = result.filter(p => !isNaN(p.upper))
    valid.forEach(p => {
      expect(p.upper).toBeCloseTo(100)
      expect(p.middle).toBeCloseTo(100)
      expect(p.lower).toBeCloseTo(100)
    })
  })
})
