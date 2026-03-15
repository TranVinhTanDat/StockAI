import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mock Supabase so storage uses localStorage mode ───────────
vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => false,
  getSupabase: () => null,
}))

import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getAnalyses,
  saveAnalysis,
  getAlerts,
  addAlert,
  deleteAlert,
  updateAlert,
  getBalance,
  updateBalance,
} from '@/lib/storage'
import type { AnalysisResult } from '@/types'

// ── LocalStorage mock ─────────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })
Object.defineProperty(globalThis, 'window', { value: { localStorage: localStorageMock } })

// ── Sample data ───────────────────────────────────────────────
const SAMPLE_RESULT: AnalysisResult = {
  recommendation: 'MUA',
  confidence: 75,
  targetPrice: 85000,
  stopLoss: 72000,
  entryZone: { low: 76000, high: 79000 },
  holdingPeriod: '3-6 tháng',
  technicalScore: 7,
  fundamentalScore: 8,
  sentimentScore: 6,
  technical: 'RSI tích cực',
  fundamental: 'P/E hợp lý',
  sentiment: 'Thị trường tích cực',
  pros: ['Tăng trưởng doanh thu tốt'],
  risks: ['Rủi ro thị trường chung'],
  action: 'Mua trong vùng 76.000–79.000',
  nextReview: '2024-04-01',
}

// ── Watchlist ─────────────────────────────────────────────────
describe('Watchlist (localStorage mode)', () => {
  beforeEach(() => localStorageMock.clear())

  it('returns default list when empty', async () => {
    const list = await getWatchlist()
    expect(list.length).toBeGreaterThan(0)
    expect(list).toContain('FPT')
  })

  it('addToWatchlist adds a symbol', async () => {
    const before = await getWatchlist()
    await addToWatchlist('AAA')
    const after = await getWatchlist()
    expect(after).toContain('AAA')
    expect(after.length).toBe(before.length + 1)
  })

  it('addToWatchlist is idempotent (no duplicates)', async () => {
    await addToWatchlist('BBB')
    await addToWatchlist('BBB')
    const list = await getWatchlist()
    expect(list.filter(s => s === 'BBB').length).toBe(1)
  })

  it('removeFromWatchlist removes a symbol', async () => {
    await addToWatchlist('CCC')
    await removeFromWatchlist('CCC')
    const list = await getWatchlist()
    expect(list).not.toContain('CCC')
  })

  it('removing non-existent symbol does not throw', async () => {
    await expect(removeFromWatchlist('ZZZZZ')).resolves.not.toThrow()
  })
})

// ── Analyses ──────────────────────────────────────────────────
describe('Analyses (localStorage mode)', () => {
  beforeEach(() => localStorageMock.clear())

  it('returns empty list initially', async () => {
    const list = await getAnalyses()
    expect(list).toEqual([])
  })

  it('saveAnalysis persists and getAnalyses returns it', async () => {
    await saveAnalysis('FPT', SAMPLE_RESULT)
    const list = await getAnalyses()
    expect(list.length).toBe(1)
    expect(list[0].symbol).toBe('FPT')
    expect(list[0].recommendation).toBe('MUA')
    expect(list[0].confidence).toBe(75)
  })

  it('newest analysis appears first', async () => {
    await saveAnalysis('VNM', SAMPLE_RESULT)
    await saveAnalysis('HPG', SAMPLE_RESULT)
    const list = await getAnalyses()
    expect(list[0].symbol).toBe('HPG')
  })

  it('caps at 20 saved analyses', async () => {
    for (let i = 0; i < 25; i++) {
      await saveAnalysis(`SYM${i}`, SAMPLE_RESULT)
    }
    const list = await getAnalyses()
    expect(list.length).toBeLessThanOrEqual(20)
  })
})

// ── Alerts ────────────────────────────────────────────────────
describe('Alerts (localStorage mode)', () => {
  beforeEach(() => localStorageMock.clear())

  it('returns empty initially', async () => {
    expect(await getAlerts()).toEqual([])
  })

  it('addAlert and getAlerts returns it', async () => {
    await addAlert({
      user_id: 'test-user',
      symbol: 'FPT',
      condition: 'ABOVE',
      target_price: 100000,
      is_active: true,
    })
    const alerts = await getAlerts()
    expect(alerts.length).toBe(1)
    expect(alerts[0].symbol).toBe('FPT')
    expect(alerts[0].condition).toBe('ABOVE')
    expect(alerts[0].is_active).toBe(true)
  })

  it('updateAlert changes properties', async () => {
    await addAlert({
      user_id: 'test-user',
      symbol: 'VNM',
      condition: 'BELOW',
      target_price: 50000,
      is_active: true,
    })
    const [alert] = await getAlerts()
    await updateAlert(alert.id, { is_active: false })
    const updated = await getAlerts()
    expect(updated[0].is_active).toBe(false)
  })

  it('deleteAlert removes it', async () => {
    await addAlert({
      user_id: 'test-user',
      symbol: 'HPG',
      condition: 'ABOVE',
      target_price: 30000,
      is_active: true,
    })
    const [alert] = await getAlerts()
    await deleteAlert(alert.id)
    expect(await getAlerts()).toEqual([])
  })
})

// ── Balance ───────────────────────────────────────────────────
describe('Balance (localStorage mode)', () => {
  beforeEach(() => localStorageMock.clear())

  it('returns 500M default cash', async () => {
    const balance = await getBalance()
    expect(balance.cash).toBe(500_000_000)
  })

  it('updateBalance persists new cash', async () => {
    await updateBalance(300_000_000)
    const balance = await getBalance()
    expect(balance.cash).toBe(300_000_000)
  })
})
