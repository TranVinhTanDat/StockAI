import { NextRequest, NextResponse } from 'next/server'
import { fetchHistory } from '@/lib/tcbs'
import { calcSMA, calcRSI, calcMACD, calcBB } from '@/lib/indicators'

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')
  const days = parseInt(request.nextUrl.searchParams.get('days') || '90', 10) || 90

  if (!symbol) {
    return NextResponse.json(
      { error: 'Missing symbol parameter' },
      { status: 400 }
    )
  }

  try {
    const candles = await fetchHistory(symbol, days)

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
    const message =
      error instanceof Error ? error.message : 'Failed to fetch history'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
