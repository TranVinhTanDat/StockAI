import { NextRequest, NextResponse } from 'next/server'
import { fetchQuote, fetchFundamental, fetchHistory } from '@/lib/tcbs'
import { predictStocks, type InvestmentStyle } from '@/lib/claude'
import { requireAuth } from '@/lib/requireAuth'
import { calcRSI, calcMACD, calcBB, calcADX, calcSMA } from '@/lib/indicators'
import { POPULAR_SYMBOLS } from '@/lib/utils'
import type { PredictionItem } from '@/types'

export const maxDuration = 60

const VALID_STYLES: InvestmentStyle[] = ['longterm', 'dca', 'swing', 'dividend', 'etf']

// Fetch Simplize for ROA/PB
async function fetchSimplizeSummary(symbol: string): Promise<{ roa: number; pb: number }> {
  try {
    const res = await fetch(`https://api.simplize.vn/api/company/summary/${symbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://simplize.vn/' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return { roa: 0, pb: 0 }
    const d = await res.json()
    const s = d?.data || d
    return { roa: s?.roa || 0, pb: s?.pbRatio || 0 }
  } catch { return { roa: 0, pb: 0 } }
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

    // Fetch VN-Index once + all stock data in parallel
    const [vnIndex, ...stockResults] = await Promise.all([
      fetchVNIndexContext(),
      ...symbols.map(async (symbol) => {
        const [quoteRes, fundamentalRes, candlesRes, simplizeRes] = await Promise.allSettled([
          fetchQuote(symbol),
          fetchFundamental(symbol),
          fetchHistory(symbol, 90).catch(() => []),
          fetchSimplizeSummary(symbol),
        ])

        const q = quoteRes.status === 'fulfilled' ? quoteRes.value : null
        const f = fundamentalRes.status === 'fulfilled' ? fundamentalRes.value : null
        const candles = candlesRes.status === 'fulfilled' ? candlesRes.value : []
        const s = simplizeRes.status === 'fulfilled' ? simplizeRes.value : { roa: 0, pb: 0 }

        if (!q || q.price <= 0) return null

        const closes = candles.map((c: { close: number }) => c.close)
        const volumes = candles.map((c: { volume: number }) => c.volume)

        // RSI(14)
        const rsiArr = calcRSI(closes, 14).filter((v: number) => !isNaN(v))
        const rsi = rsiArr.length > 0 ? Math.round(rsiArr[rsiArr.length - 1]) : 50

        // MACD
        let macdSignal = 'Neutral'
        let macdHistogram = 0
        const macdArr = calcMACD(closes).filter((v: { macd: number }) => !isNaN(v.macd))
        if (macdArr.length > 0) {
          const lastM = macdArr[macdArr.length - 1]
          macdSignal = lastM.macd > lastM.signal ? 'Bullish' : 'Bearish'
          macdHistogram = Math.round(lastM.histogram * 100) / 100
        }

        // SMA20 & SMA50
        const sma20arr = calcSMA(closes, 20).filter((v: number) => !isNaN(v))
        const sma50arr = calcSMA(closes, 50).filter((v: number) => !isNaN(v))
        const lastClose = closes.length > 0 ? closes[closes.length - 1] : q.price
        const aboveSMA20 = sma20arr.length > 0 ? lastClose > sma20arr[sma20arr.length - 1] : false
        const aboveSMA50 = sma50arr.length > 0 ? lastClose > sma50arr[sma50arr.length - 1] : false

        // Bollinger Bands (20,2)
        let bbSignal = 'Inside BB'
        const bbArr = calcBB(closes, 20, 2).filter((v: { upper: number }) => v.upper > 0)
        if (bbArr.length > 0) {
          const lastBB = bbArr[bbArr.length - 1]
          if (lastClose >= lastBB.upper * 0.98) bbSignal = 'Overbought (trên BB)'
          else if (lastClose <= lastBB.lower * 1.02) bbSignal = 'Oversold (dưới BB)'
        }

        // Volume trend (5D vs 20D avg)
        let volumeSignal = 'Bình thường'
        if (volumes.length >= 20) {
          const avg20 = volumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20
          const avg5 = volumes.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5
          if (avg5 > avg20 * 1.5) volumeSignal = 'Cao bất thường'
          else if (avg5 < avg20 * 0.5) volumeSignal = 'Thấp bất thường'
        }

        // ADX(14)
        let adx = 0
        let adxTrend = 'N/A'
        if (candles.length >= 28) {
          const hArr = candles.map((c: { high: number }) => c.high)
          const lArr = candles.map((c: { low: number }) => c.low)
          const adxArr = calcADX(hArr, lArr, closes, 14).filter((v: number) => !isNaN(v))
          if (adxArr.length > 0) {
            adx = Math.round(adxArr[adxArr.length - 1])
            adxTrend = adx >= 25 ? 'Xu hướng MẠNH' : adx >= 15 ? 'Xu hướng YẾU' : 'SIDEWAY'
          }
        }

        // Trend 30D
        const trend30d = closes.length >= 30
          ? Math.round(((lastClose - closes[Math.max(0, closes.length - 30)]) / closes[Math.max(0, closes.length - 30)]) * 1000) / 10
          : 0

        // Momentum 1M / 3M
        let momentum1M = 0, momentum3M = 0
        if (closes.length > 0) {
          if (closes.length >= 23) {
            const c1m = closes[Math.max(0, closes.length - 23)]
            if (c1m > 0) momentum1M = Math.round(((lastClose - c1m) / c1m) * 1000) / 10
          }
          if (closes.length >= 65) {
            const c3m = closes[Math.max(0, closes.length - 65)]
            if (c3m > 0) momentum3M = Math.round(((lastClose - c3m) / c3m) * 1000) / 10
          }
        }

        return {
          symbol,
          price: q.price,
          changePct: q.changePct,
          industry: q.industry || 'Khác',
          // Technical
          rsi,
          macdSignal,
          macdHistogram,
          aboveSMA20,
          aboveSMA50,
          bbSignal,
          volumeSignal,
          adx,
          adxTrend,
          trend30d,
          momentum1M,
          momentum3M,
          volume: q.volume,
          // Fundamental
          pe: f?.pe ?? 0,
          eps: f?.eps ?? 0,
          roe: f?.roe ?? 0,
          roa: Math.round((s.roa ?? 0) * 10) / 10,
          pb: Math.round((s.pb ?? 0) * 100) / 100,
          revenueGrowth: f?.revenueGrowth ?? 0,
          profitGrowth: f?.profitGrowth ?? 0,
          debtEquity: f?.debtEquity ?? 0,
          dividendYield: f?.dividendYield ?? 0,
          // Foreign investor flows
          foreignBuyVol: q.foreignBuyVol ?? 0,
          foreignSellVol: q.foreignSellVol ?? 0,
          foreignNetVol: (q.foreignBuyVol ?? 0) - (q.foreignSellVol ?? 0),
          foreignRoom: q.foreignRoom,
        }
      })
    ])

    const stocks = stockResults.filter((r): r is NonNullable<typeof r> => r !== null)

    if (stocks.length < 5) {
      return NextResponse.json(
        { error: 'Not enough stock data available' },
        { status: 500 }
      )
    }

    const predictions: PredictionItem[] = await predictStocks({ style, stocks, vnIndex })

    return NextResponse.json(predictions)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Prediction failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
