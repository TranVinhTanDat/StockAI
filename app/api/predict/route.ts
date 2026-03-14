import { NextRequest, NextResponse } from 'next/server'
import { fetchQuote, fetchFundamental, fetchHistory } from '@/lib/tcbs'
import { predictStocks } from '@/lib/claude'
import { calcRSI } from '@/lib/indicators'
import { POPULAR_SYMBOLS } from '@/lib/utils'
import type { PredictionItem } from '@/types'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const style = (request.nextUrl.searchParams.get('style') || 'balanced') as
    | 'safe'
    | 'balanced'
    | 'growth'
    | 'speculative'

  if (!['safe', 'balanced', 'growth', 'speculative'].includes(style)) {
    return NextResponse.json(
      { error: 'Invalid style. Use: safe, balanced, growth, speculative' },
      { status: 400 }
    )
  }

  if (!process.env.CLAUDE_API_KEY) {
    return NextResponse.json(
      { error: 'Claude API key not configured' },
      { status: 500 }
    )
  }

  try {
    const symbols = POPULAR_SYMBOLS.slice(0, 12)

    // Fetch quote + fundamental for all symbols in parallel
    const results = await Promise.allSettled(
      symbols.map(async (symbol) => {
        const [quote, fundamental, candles] = await Promise.all([
          fetchQuote(symbol),
          fetchFundamental(symbol),
          fetchHistory(symbol, 30).catch(() => []),
        ])

        // Calculate RSI from last 30 days
        const closes = candles.map((c) => c.close)
        const rsiValues = calcRSI(closes, 14)
        const rsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50

        return {
          symbol,
          price: quote.price,
          changePct: quote.changePct,
          pe: fundamental.pe,
          eps: fundamental.eps,
          roe: fundamental.roe,
          revenueGrowth: fundamental.revenueGrowth,
          profitGrowth: fundamental.profitGrowth,
          debtEquity: fundamental.debtEquity,
          rsi,
          volume: quote.volume,
        }
      })
    )

    // Filter only successful results
    const stocks = results
      .filter(
        (r): r is PromiseFulfilledResult<{
          symbol: string
          price: number
          changePct: number
          pe: number
          eps: number
          roe: number
          revenueGrowth: number
          profitGrowth: number
          debtEquity: number
          rsi: number
          volume: number
        }> => r.status === 'fulfilled' && r.value.price > 0
      )
      .map((r) => r.value)

    if (stocks.length < 5) {
      return NextResponse.json(
        { error: 'Not enough stock data available' },
        { status: 500 }
      )
    }

    // Call Claude to rank and predict
    const predictions: PredictionItem[] = await predictStocks({
      style,
      stocks,
    })

    return NextResponse.json(predictions)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Prediction failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
