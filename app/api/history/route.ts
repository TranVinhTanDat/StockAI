import { NextRequest, NextResponse } from 'next/server'
import { fetchHistory } from '@/lib/tcbs'
import { calcSMA, calcRSI, calcMACD, calcBB } from '@/lib/indicators'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')
  const days = parseInt(request.nextUrl.searchParams.get('days') || '90', 10) || 90
  const fromParam = request.nextUrl.searchParams.get('from') // YYYY-MM-DD
  const toParam   = request.nextUrl.searchParams.get('to')   // YYYY-MM-DD

  if (!symbol) {
    return NextResponse.json(
      { error: 'Missing symbol parameter' },
      { status: 400 }
    )
  }

  let customFromTs: number | undefined
  let customToTs: number | undefined
  if (fromParam) customFromTs = Math.floor(new Date(fromParam).getTime() / 1000)
  if (toParam)   customToTs   = Math.floor(new Date(toParam + 'T23:59:59').getTime() / 1000)

  try {
    const candles = await fetchHistory(symbol, days, customFromTs, customToTs)

    if (candles.length === 0) {
      return NextResponse.json(
        { candles: [], indicators: { sma20: [], sma50: [], rsi: [], macd: [], bb: [] } }
      )
    }

    const closes = candles.map((c) => c.close)

    const sma20 = calcSMA(closes, 20)
    const sma50 = calcSMA(closes, 50)
    const rsi = calcRSI(closes, 14)
    const macd = calcMACD(closes)
    const bb = calcBB(closes)

    return NextResponse.json({
      candles,
      indicators: { sma20, sma50, rsi, macd, bb },
    })
  } catch (error) {
    // On timeout or network error, return empty candles instead of 500
    // so the chart just shows "no data" rather than breaking
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('abort'))) {
      return NextResponse.json(
        { candles: [], indicators: { sma20: [], sma50: [], rsi: [], macd: [], bb: [] }, warning: 'Data source timeout' }
      )
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch history'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
