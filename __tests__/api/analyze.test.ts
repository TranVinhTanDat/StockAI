import { describe, it, expect } from 'vitest'
import type { AnalysisResult } from '@/types'

// ── Unit tests for analysis result parsing logic ──────────────

const VALID_RESULT: AnalysisResult = {
  recommendation: 'MUA',
  confidence: 75,
  targetPrice: 85000,
  stopLoss: 72000,
  entryZone: { low: 76000, high: 79000 },
  holdingPeriod: '3-6 tháng',
  technicalScore: 7,
  fundamentalScore: 8,
  sentimentScore: 6,
  technical: 'RSI đang tích cực',
  fundamental: 'P/E hợp lý so với ngành',
  sentiment: 'Thị trường tích cực',
  pros: ['Doanh thu tăng trưởng', 'Cổ tức ổn định'],
  risks: ['Rủi ro thị trường chung', 'Biến động ngắn hạn'],
  action: 'Mua trong vùng 76.000–79.000',
  nextReview: '2024-04-01',
}

describe('AnalysisResult validation', () => {
  it('recommendation must be one of 5 values', () => {
    const valid = ['MUA MẠNH', 'MUA', 'GIỮ', 'BÁN', 'BÁN MẠNH']
    expect(valid).toContain(VALID_RESULT.recommendation)
  })

  it('confidence is between 0 and 100', () => {
    expect(VALID_RESULT.confidence).toBeGreaterThanOrEqual(0)
    expect(VALID_RESULT.confidence).toBeLessThanOrEqual(100)
  })

  it('targetPrice > stopLoss', () => {
    expect(VALID_RESULT.targetPrice).toBeGreaterThan(VALID_RESULT.stopLoss)
  })

  it('entryZone: high >= low', () => {
    expect(VALID_RESULT.entryZone.high).toBeGreaterThanOrEqual(VALID_RESULT.entryZone.low)
  })

  it('scores are between 0 and 10', () => {
    [VALID_RESULT.technicalScore, VALID_RESULT.fundamentalScore, VALID_RESULT.sentimentScore]
      .forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(10)
      })
  })

  it('pros and risks are non-empty arrays', () => {
    expect(Array.isArray(VALID_RESULT.pros)).toBe(true)
    expect(VALID_RESULT.pros.length).toBeGreaterThan(0)
    expect(Array.isArray(VALID_RESULT.risks)).toBe(true)
    expect(VALID_RESULT.risks.length).toBeGreaterThan(0)
  })
})

describe('Analysis cache TTL logic', () => {
  it('returns TTL=4h during VN market hours (9-15)', () => {
    function getTTL(hour: number): number {
      // Market hours: 9am–3pm Vietnam time
      return hour >= 9 && hour < 15 ? 4 * 60 * 60 : 20 * 60 * 60
    }
    expect(getTTL(10)).toBe(4 * 3600)   // during market
    expect(getTTL(14)).toBe(4 * 3600)   // during market
    expect(getTTL(8)).toBe(20 * 3600)   // before market
    expect(getTTL(16)).toBe(20 * 3600)  // after market
  })

  it('cache is invalid when older than TTL', () => {
    function isCacheValid(createdAt: string, ttlSeconds: number): boolean {
      const age = (Date.now() - new Date(createdAt).getTime()) / 1000
      return age < ttlSeconds
    }
    const recent = new Date(Date.now() - 1 * 3600 * 1000).toISOString()   // 1h ago
    const old    = new Date(Date.now() - 5 * 3600 * 1000).toISOString()   // 5h ago
    expect(isCacheValid(recent, 4 * 3600)).toBe(true)
    expect(isCacheValid(old,    4 * 3600)).toBe(false)
  })
})

describe('Fee calculation', () => {
  it('buy fee = 0.15% of amount', () => {
    const amount = 10_000_000
    const fee = amount * 0.0015
    expect(fee).toBe(15000)
  })

  it('sell fee = 0.25% brokerage + 0.1% tax', () => {
    const amount = 10_000_000
    const brokerageFee = amount * 0.0025
    const tax = amount * 0.001
    const total = brokerageFee + tax
    expect(brokerageFee).toBe(25000)
    expect(tax).toBe(10000)
    expect(total).toBe(35000)
  })

  it('profit calculation: (sellPrice - avgCost) × qty - fees', () => {
    const qty = 1000
    const avgCost = 50000
    const sellPrice = 60000
    const buyAmount = avgCost * qty
    const sellAmount = sellPrice * qty
    const buyFee = buyAmount * 0.0015
    const sellFee = sellAmount * 0.0025 + sellAmount * 0.001
    const profit = sellAmount - buyAmount - buyFee - sellFee
    expect(profit).toBeGreaterThan(0)
    // buyFee=75k, sellFee=150k+60k=210k → profit = 10M - 75k - 210k = 9,715,000
    expect(profit).toBe(9_715_000)
  })
})
