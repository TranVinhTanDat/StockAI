import { NextResponse } from 'next/server'
import { fetchQuote } from '@/lib/tcbs'
import { POPULAR_SYMBOLS } from '@/lib/utils'
import type { MarketIndexData } from '@/types'

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
      { next: { revalidate: 60 } }
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
  const symbols = POPULAR_SYMBOLS // use all ~20 popular symbols for better breadth sample
  const results = await Promise.allSettled(
    symbols.map((s) => fetchQuote(s))
  )

  let advancing = 0
  let declining = 0
  let unchanged = 0

  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value.changePct > 0.3) advancing++
      else if (r.value.changePct < -0.3) declining++
      else unchanged++
    }
  }

  return { advancing, declining, unchanged }
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
