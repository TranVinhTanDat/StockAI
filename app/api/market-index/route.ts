import { NextResponse } from 'next/server'
import { POPULAR_SYMBOLS } from '@/lib/utils'
import type { MarketIndexData } from '@/types'

const VPS_QUOTE_URL = 'https://bgapidatafeed.vps.com.vn/getliststockdata'
const VPS_HISTORY_URL = 'https://histdatafeed.vps.com.vn/tradingview/history'

async function fetchIndexFromVPS(symbol: string, fallback: number): Promise<{
  value: number
  change: number
  changePct: number
  volume: number
}> {
  try {
    const toTs = Math.floor(Date.now() / 1000)
    const fromTs = toTs - 5 * 86400
    const res = await fetch(
      `${VPS_HISTORY_URL}?symbol=${symbol}&resolution=D&from=${fromTs}&to=${toTs}`,
      { next: { revalidate: 60 }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) throw new Error('VPS fetch failed')
    const data = await res.json()
    if (data.s !== 'ok' || !data.c || data.c.length < 2) throw new Error('No data')

    const n = data.c.length
    const value = data.c[n - 1]
    const prevClose = data.c[n - 2]
    const change = value - prevClose
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0
    const volume = data.v ? data.v[n - 1] : 0

    return { value, change, changePct, volume }
  } catch {
    return { value: fallback, change: 0, changePct: 0, volume: 0 }
  }
}

async function fetchVNIndex() {
  return fetchIndexFromVPS('VNINDEX', 1250)
}

async function fetchHNXIndex() {
  return fetchIndexFromVPS('HNXINDEX', 230)
}

async function fetchBreadth(): Promise<{
  advancing: number
  declining: number
  unchanged: number
}> {
  // Use VPS batch endpoint — ONE request for all symbols instead of 20 individual calls
  // This avoids the 40-connection storm that causes VPS rate-limiting / ConnectTimeoutError
  const symbolList = POPULAR_SYMBOLS.join(',')
  try {
    const res = await fetch(`${VPS_QUOTE_URL}/${symbolList}`, {
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 30 },
    })
    if (!res.ok) throw new Error(`VPS batch quote HTTP ${res.status}`)
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error('Unexpected response')

    let advancing = 0, declining = 0, unchanged = 0
    for (const q of data) {
      const price = (q.lastPrice || 0) * 1000
      const ref   = (q.r || 0) * 1000
      const pct   = ref > 0 ? ((price - ref) / ref) * 100 : 0
      if      (pct >  0.3) advancing++
      else if (pct < -0.3) declining++
      else                  unchanged++
    }
    return { advancing, declining, unchanged }
  } catch {
    return { advancing: 5, declining: 3, unchanged: 2 }
  }
}

export async function GET() {
  try {
    const [vnindex, hnxindex, breadth] = await Promise.all([
      fetchVNIndex(),
      fetchHNXIndex(),
      fetchBreadth(),
    ])

    const result: MarketIndexData = {
      vnindex,
      hnxindex,
      breadth,
      updatedAt: new Date().toISOString(),
    }

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({
      vnindex: { value: 1250, change: 0, changePct: 0, volume: 0 },
      hnxindex: { value: 230, change: 0, changePct: 0, volume: 0 },
      breadth: { advancing: 5, declining: 3, unchanged: 2 },
      updatedAt: new Date().toISOString(),
    })
  }
}
