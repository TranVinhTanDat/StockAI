import { NextRequest, NextResponse } from 'next/server'
import { optimizePortfolio } from '@/lib/claude'
import { requireAuth } from '@/lib/requireAuth'
import { INDUSTRY_MAP } from '@/lib/utils'
import { fetchHistory } from '@/lib/tcbs'
import { calcRSI, calcMACD, calcSMA, calcBB } from '@/lib/indicators'

export const maxDuration = 60

// Fetch latest news headlines for a symbol
async function fetchNewsHeadlines(symbol: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/news?symbol=${symbol}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    const items = data?.items || []
    return items.slice(0, 3).map((n: { title: string }) => n.title).filter(Boolean)
  } catch { return [] }
}

// Fetch Simplize summary for ROA/ROE/marketCap
async function fetchSimplizeSummary(symbol: string): Promise<{ roa: number; roe: number; pe: number; pb: number }> {
  try {
    const res = await fetch(`https://api.simplize.vn/api/company/summary/${symbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://simplize.vn/' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return { roa: 0, roe: 0, pe: 0, pb: 0 }
    const d = await res.json()
    const s = d?.data || d
    return {
      roa: s?.roa || 0,
      roe: s?.roe || 0,
      pe: s?.peRatio || 0,
      pb: s?.pbRatio || 0,
    }
  } catch { return { roa: 0, roe: 0, pe: 0, pb: 0 } }
}

// Fetch VN-Index 30-day trend for market context
async function fetchVNIndexContext(): Promise<{ trend30d: number; currentLevel: number; rsi: number }> {
  try {
    const to = Math.floor(Date.now() / 1000)
    const from = to - 35 * 86400
    const res = await fetch(
      `https://histdatafeed.vps.com.vn/tradingview/history?symbol=VNINDEX&resolution=D&from=${from}&to=${to}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return { trend30d: 0, currentLevel: 0, rsi: 50 }
    const d = await res.json()
    if (!d.c || d.c.length < 5) return { trend30d: 0, currentLevel: 0, rsi: 50 }
    const closes: number[] = d.c
    const first = closes[0], last = closes[closes.length - 1]
    const trend30d = first > 0 ? ((last - first) / first) * 100 : 0
    const rsiArr = calcRSI(closes, 14).filter((v: number) => !isNaN(v))
    const rsi = rsiArr.length > 0 ? Math.round(rsiArr[rsiArr.length - 1]) : 50
    return { trend30d: Math.round(trend30d * 10) / 10, currentLevel: Math.round(last), rsi }
  } catch { return { trend30d: 0, currentLevel: 0, rsi: 50 } }
}

export async function POST(request: NextRequest) {
  const { error } = await requireAuth(request)
  if (error) return error

  try {
    const body = await request.json()
    const { holdings, cash = 0 } = body

    if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
      return NextResponse.json({ error: 'No holdings provided' }, { status: 400 })
    }

    if (!process.env.CLAUDE_API_KEY) {
      return NextResponse.json({ error: 'Claude API key not configured' }, { status: 500 })
    }

    const totalMarketValue = holdings.reduce(
      (sum: number, h: { qty: number; currentPrice: number }) => sum + h.qty * h.currentPrice,
      0
    )

    // Fetch VN-Index context in parallel with per-stock data
    const [vnIndexContext, ...enrichedResults] = await Promise.all([
      fetchVNIndexContext(),
      ...holdings.map(
        async (h: { symbol: string; qty: number; avgCost: number; currentPrice: number }) => {
          const base = {
            symbol: h.symbol,
            qty: h.qty,
            avgCost: h.avgCost,
            currentPrice: h.currentPrice,
            industry: INDUSTRY_MAP[h.symbol] || 'Khác',
            weight: totalMarketValue > 0 ? (h.qty * h.currentPrice / totalMarketValue) * 100 : 0,
            pnlPct: h.avgCost > 0 ? ((h.currentPrice - h.avgCost) / h.avgCost) * 100 : 0,
            // Technical
            rsi: 50,
            macdSignal: 'Neutral' as string,
            macdHistogram: 0,
            trend30d: 0,
            aboveSMA20: false,
            aboveSMA50: false,
            bbSignal: 'Neutral' as string,   // Above upper / Near lower / Inside
            volumeSignal: 'Normal' as string, // High / Low / Normal
            // Fundamental
            pe: 0,
            pb: 0,
            roe: 0,
            roa: 0,
            profitGrowth: 0,
            debtEquity: 0,
            dividendYield: 0,
            // News
            recentNews: [] as string[],
          }

          // Fetch all data in parallel
          const [histResult, simplizeResult, newsResult] = await Promise.allSettled([
            fetchHistory(h.symbol, 90),
            fetchSimplizeSummary(h.symbol),
            fetchNewsHeadlines(h.symbol),
          ])

          // Technical analysis from 90-day history
          if (histResult.status === 'fulfilled' && histResult.value.length > 10) {
            const candles = histResult.value
            const closes = candles.map((c: { close: number }) => c.close)
            const volumes = candles.map((c: { volume: number }) => c.volume)

            // RSI(14)
            const rsiArr = calcRSI(closes, 14).filter((v: number) => !isNaN(v))
            if (rsiArr.length > 0) base.rsi = Math.round(rsiArr[rsiArr.length - 1])

            // MACD
            const macdArr = calcMACD(closes).filter((v: { macd: number }) => !isNaN(v.macd))
            if (macdArr.length > 0) {
              const last = macdArr[macdArr.length - 1]
              base.macdSignal = last.macd > last.signal ? 'Bullish' : 'Bearish'
              base.macdHistogram = Math.round(last.histogram * 100) / 100
            }

            // SMA crossovers
            const sma20 = calcSMA(closes, 20).filter((v: number) => !isNaN(v))
            const sma50 = calcSMA(closes, 50).filter((v: number) => !isNaN(v))
            const lastClose = closes[closes.length - 1]
            if (sma20.length > 0) base.aboveSMA20 = lastClose > sma20[sma20.length - 1]
            if (sma50.length > 0) base.aboveSMA50 = lastClose > sma50[sma50.length - 1]

            // Bollinger Bands (20,2)
            const bbArr = calcBB(closes, 20, 2).filter(
              (v: { upper: number; lower: number }) => v.upper > 0
            )
            if (bbArr.length > 0) {
              const lastBB = bbArr[bbArr.length - 1]
              if (lastClose >= lastBB.upper * 0.98) base.bbSignal = 'Overbought (trên BB trên)'
              else if (lastClose <= lastBB.lower * 1.02) base.bbSignal = 'Oversold (dưới BB dưới)'
              else base.bbSignal = 'Inside BB'
            }

            // Volume trend: compare last 5 days avg vs 20-day avg
            if (volumes.length >= 20) {
              const avg20vol = volumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20
              const avg5vol = volumes.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5
              if (avg5vol > avg20vol * 1.5) base.volumeSignal = 'Cao bất thường'
              else if (avg5vol < avg20vol * 0.5) base.volumeSignal = 'Thấp bất thường'
              else base.volumeSignal = 'Bình thường'
            }

            // Trend
            if (closes.length >= 2) {
              base.trend30d = Math.round(((closes[closes.length - 1] - closes[0]) / closes[0]) * 1000) / 10
            }
          }

          // Simplize fundamental data (more accurate ROA/ROE)
          if (simplizeResult.status === 'fulfilled') {
            const s = simplizeResult.value
            base.roa = Math.round(s.roa * 10) / 10
            base.roe = Math.round(s.roe * 10) / 10
            if (s.pe > 0) base.pe = Math.round(s.pe * 10) / 10
            if (s.pb > 0) base.pb = Math.round(s.pb * 10) / 10
          }

          // Recent news
          if (newsResult.status === 'fulfilled') {
            base.recentNews = newsResult.value
          }

          return base
        }
      )
    ])

    const result = await optimizePortfolio({
      holdings: enrichedResults,
      totalValue: totalMarketValue,
      cash,
      vnIndex: vnIndexContext,
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Optimization failed'
    console.error('[optimize]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
