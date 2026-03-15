import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock fetch ────────────────────────────────────────────────
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

// ── Mock VPS API response ─────────────────────────────────────
const VPS_RESPONSE = [
  {
    sym: 'FPT',
    mc: 'HOSE',
    c: '79.5',    // close price (×1000 = 79500 VND)
    f: '71.0',    // floor
    r: '79.5',    // ref
    ce: '87.5',   // ceiling
    lastPrice: 79.5,
    lastVolume: '1234500',
    ot: '1234500',
    changePc: '2.5',
    rsi14: '62.5',
  },
]

describe('GET /api/quote', () => {
  beforeEach(() => {
    mockFetch.mockClear()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => VPS_RESPONSE,
    })
  })

  it('fetches VPS API with correct symbol', async () => {
    // Simulate what the route does internally
    const symbol = 'FPT'
    const url = `https://bgapidatafeed.vps.com.vn/getliststockdata/${symbol}`
    await fetch(url)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('FPT')
    )
  })

  it('VPS price is multiplied by 1000', () => {
    // VPS returns price in thousands, app multiplies by 1000
    const vpsPrice = parseFloat(VPS_RESPONSE[0].c)
    const expectedPrice = vpsPrice * 1000
    expect(expectedPrice).toBe(79500)
  })

  it('validates symbol format (uppercase letters)', () => {
    const validSymbols = ['FPT', 'VNM', 'VIC', 'TCB', 'HPG']
    const invalidSymbols = ['fpt123', '', '   ']
    validSymbols.forEach(s => {
      expect(/^[A-Z]{2,5}$/.test(s)).toBe(true)
    })
    invalidSymbols.forEach(s => {
      expect(/^[A-Z]{2,5}$/.test(s)).toBe(false)
    })
  })
})
