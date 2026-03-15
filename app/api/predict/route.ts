import { NextRequest, NextResponse } from 'next/server'
import { fetchQuote, fetchFundamental, fetchHistory } from '@/lib/tcbs'
import { predictStocks, type InvestmentStyle } from '@/lib/claude'
import { requireAuth } from '@/lib/requireAuth'
import { calcRSI } from '@/lib/indicators'
import { POPULAR_SYMBOLS } from '@/lib/utils'
import type { PredictionItem } from '@/types'

export const maxDuration = 60

const VALID_STYLES: InvestmentStyle[] = ['longterm', 'dca', 'swing', 'dividend', 'etf']

export async function GET(request: NextRequest) {
  const { error } = await requireAuth(request)
  if (error) return error

  const rawStyle = request.nextUrl.searchParams.get('style') || 'longterm'
  const style = rawStyle as InvestmentStyle

  if (!VALID_STYLES.includes(style)) {
    return NextResponse.json(
      { error: `Invalid style. Use: ${VALID_STYLES.join(', ')}` },
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
    const symbols = POPULAR_SYMBOLS.slice(0, 15)

    // Fetch quote + fundamental + 60-day history for all symbols in parallel
    const results = await Promise.allSettled(
      symbols.map(async (symbol) => {
        const [quote, fundamental, candles] = await Promise.all([
          fetchQuote(symbol),
          fetchFundamental(symbol),
          fetchHistory(symbol, 60).catch(() => []),
        ])

        const closes = candles.map((c) => c.close)

        // RSI(14)
        const rsiValues = calcRSI(closes, 14)
        const rsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50

        // SMA20 & SMA50
        const sma20 =
          closes.length >= 20
            ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20
            : quote.price
        const sma50 =
          closes.length >= 50
            ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50
            : quote.price

        // 30-day price trend
        const slice30 = closes.length >= 30 ? closes.slice(-30) : closes
        const start30 = slice30.length > 0 ? slice30[0] : quote.price
        const end30 = slice30.length > 0 ? slice30[slice30.length - 1] : quote.price
        const trend30d = start30 > 0 ? ((end30 - start30) / start30) * 100 : 0

        return {
          symbol,
          price: quote.price,
          changePct: quote.changePct,
          industry: quote.industry || 'Khác',
          pe: fundamental.pe,
          eps: fundamental.eps,
          roe: fundamental.roe,
          revenueGrowth: fundamental.revenueGrowth,
          profitGrowth: fundamental.profitGrowth,
          debtEquity: fundamental.debtEquity,
          dividendYield: fundamental.dividendYield,
          rsi,
          aboveSMA20: quote.price > sma20,
          aboveSMA50: quote.price > sma50,
          trend30d,
          volume: quote.volume,
        }
      })
    )

    // Filter only successful results with valid price
    const stocks = results
      .filter(
        (r): r is PromiseFulfilledResult<{
          symbol: string
          price: number
          changePct: number
          industry: string
          pe: number
          eps: number
          roe: number
          revenueGrowth: number
          profitGrowth: number
          debtEquity: number
          dividendYield: number
          rsi: number
          aboveSMA20: boolean
          aboveSMA50: boolean
          trend30d: number
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
