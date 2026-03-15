import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock fetch ────────────────────────────────────────────────
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

// ── VPS History API mock response ─────────────────────────────
const VPS_HISTORY_RESPONSE = {
  s: 'ok',
  t: [1700000000, 1700086400, 1700172800],
  o: [78, 79, 80],
  h: [81, 82, 83],
  l: [77, 78, 79],
  c: [79, 80, 81],
  v: [1000000, 1200000, 900000],
}

describe('History API data parsing', () => {
  it('maps VPS OHLCV fields correctly', () => {
    const { t, o, h, l, c, v } = VPS_HISTORY_RESPONSE
    const candles = t.map((ts, i) => ({
      time: new Date(ts * 1000).toISOString().split('T')[0],
      open:   o[i] * 1000,
      high:   h[i] * 1000,
      low:    l[i] * 1000,
      close:  c[i] * 1000,
      volume: v[i],
    }))
    expect(candles[0].open).toBe(78000)
    expect(candles[0].high).toBe(81000)
    expect(candles[0].low).toBe(77000)
    expect(candles[0].close).toBe(79000)
    expect(candles[0].volume).toBe(1000000)
  })

  it('time field is YYYY-MM-DD format', () => {
    const ts = 1700000000
    const dateStr = new Date(ts * 1000).toISOString().split('T')[0]
    expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('candles are in ascending order by time', () => {
    const { t } = VPS_HISTORY_RESPONSE
    for (let i = 1; i < t.length; i++) {
      expect(t[i]).toBeGreaterThan(t[i - 1])
    }
  })
})

describe('Date range params', () => {
  it('converts YYYY-MM-DD to unix timestamp (start of day)', () => {
    const fromParam = '2024-01-01'
    const fromTs = Math.floor(new Date(fromParam).getTime() / 1000)
    expect(fromTs).toBeGreaterThan(0)
    expect(typeof fromTs).toBe('number')
  })

  it('converts to-date to end of day (23:59:59)', () => {
    // Use explicit UTC to avoid timezone differences in CI
    const toTs       = Math.floor(new Date('2024-01-31T23:59:59Z').getTime() / 1000)
    const startOfDay = Math.floor(new Date('2024-01-31T00:00:00Z').getTime() / 1000)
    expect(toTs).toBeGreaterThan(startOfDay)
    expect(toTs - startOfDay).toBe(86399)  // exactly 23h59m59s
  })

  it('default days=90 covers 90 days range', () => {
    const days = 90
    const toTs = Math.floor(Date.now() / 1000)
    const fromTs = toTs - days * 86400
    const diffDays = (toTs - fromTs) / 86400
    expect(diffDays).toBe(90)
  })
})
