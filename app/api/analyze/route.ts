import { NextRequest, NextResponse } from 'next/server'
import { analyzeStock } from '@/lib/claude'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { symbol, quote, indicators, fundamental, news } = body

    if (!symbol) {
      return NextResponse.json(
        { error: 'Missing symbol' },
        { status: 400 }
      )
    }

    if (!process.env.CLAUDE_API_KEY) {
      return NextResponse.json(
        { error: 'Claude API key not configured' },
        { status: 500 }
      )
    }

    const rsiValues = (indicators?.rsi || []).filter(
      (v: number) => !isNaN(v)
    )
    const macdValues = (indicators?.macd || []).filter(
      (v: { macd: number }) => !isNaN(v.macd)
    )
    const bbValues = (indicators?.bb || []).filter(
      (v: { upper: number }) => !isNaN(v.upper)
    )
    const sma20Values = (indicators?.sma20 || []).filter(
      (v: number) => !isNaN(v)
    )
    const sma50Values = (indicators?.sma50 || []).filter(
      (v: number) => !isNaN(v)
    )

    const latestRsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50
    const latestMacd = macdValues.length > 0 ? macdValues[macdValues.length - 1] : { macd: 0, signal: 0 }
    const latestBb = bbValues.length > 0 ? bbValues[bbValues.length - 1] : { upper: 0, middle: 0, lower: 0 }
    const latestSma20 = sma20Values.length > 0 ? sma20Values[sma20Values.length - 1] : quote?.price || 0
    const latestSma50 = sma50Values.length > 0 ? sma50Values[sma50Values.length - 1] : quote?.price || 0

    const topNews = (news || []).slice(0, 5).map((n: { title: string; sentiment: number }) => ({
      title: n.title,
      sentiment: n.sentiment || 0,
    }))

    const avgSentiment =
      topNews.length > 0
        ? topNews.reduce((sum: number, n: { sentiment: number }) => sum + n.sentiment, 0) / topNews.length
        : 50

    const result = await analyzeStock({
      symbol,
      price: quote?.price || 0,
      changePct: quote?.changePct || 0,
      sma20: latestSma20,
      sma50: latestSma50,
      rsi: latestRsi,
      macd: latestMacd.macd,
      signal: latestMacd.signal,
      bbUpper: latestBb.upper,
      bbMid: latestBb.middle,
      bbLower: latestBb.lower,
      pe: fundamental?.pe || 0,
      eps: fundamental?.eps || 0,
      roe: fundamental?.roe || 0,
      revenueGrowth: fundamental?.revenueGrowth || 0,
      profitGrowth: fundamental?.profitGrowth || 0,
      debtEquity: fundamental?.debtEquity || 0,
      dividendYield: fundamental?.dividendYield || 0,
      tcbsRating: fundamental?.tcbsRating || 0,
      tcbsRecommend: fundamental?.tcbsRecommend || 'N/A',
      topNews,
      avgSentiment,
    })

    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
