import type { QuoteData, CandleData, FundamentalData } from '@/types'

const BASE_URL = 'https://apipubaws.tcbs.com.vn'

export async function fetchQuote(symbol: string): Promise<QuoteData> {
  const ticker = symbol.toUpperCase()

  const [overviewRes, priceRes] = await Promise.all([
    fetch(
      `${BASE_URL}/stock-insight/v1/stock/ticker-overview?ticker=${ticker}`,
      { next: { revalidate: 60 } }
    ),
    fetch(
      `${BASE_URL}/stock-insight/v1/intraday/${ticker}/prev-sessions?page=0&size=1`,
      { next: { revalidate: 60 } }
    ),
  ])

  if (!overviewRes.ok) {
    throw new Error(`Failed to fetch overview for ${ticker}`)
  }

  const overview = await overviewRes.json()
  let priceData = null
  if (priceRes.ok) {
    const priceJson = await priceRes.json()
    if (priceJson.data && priceJson.data.length > 0) {
      priceData = priceJson.data[0]
    }
  }

  const price = (overview.price || overview.closePrice || 0) * 1000
  const refPrice = (overview.refPrice || overview.previousClose || 0) * 1000
  const change = price - refPrice
  const changePct = refPrice > 0 ? (change / refPrice) * 100 : 0

  return {
    symbol: ticker,
    name: overview.shortName || overview.companyName || ticker,
    price,
    change,
    changePct,
    volume: priceData?.volume || overview.volume || 0,
    high52w: (overview.high52Week || 0) * 1000,
    low52w: (overview.low52Week || 0) * 1000,
    marketCap: overview.marketCap || 0,
    exchange: overview.exchange || 'HOSE',
    industry: overview.industry || '',
    timestamp: new Date().toISOString(),
  }
}

export async function fetchHistory(
  symbol: string,
  days: number = 90
): Promise<CandleData[]> {
  const ticker = symbol.toUpperCase()
  const toTs = Math.floor(Date.now() / 1000)
  const fromTs = toTs - days * 24 * 60 * 60

  const res = await fetch(
    `${BASE_URL}/stock-insight/v1/stock/bars-long-term?ticker=${ticker}&type=stock&resolution=D&from=${fromTs}&to=${toTs}`,
    { next: { revalidate: 300 } }
  )

  if (!res.ok) {
    throw new Error(`Failed to fetch history for ${ticker}`)
  }

  const json = await res.json()
  const bars = json.data || []

  return bars.map(
    (bar: {
      tradingDate: string
      open: number
      high: number
      low: number
      close: number
      volume: number
    }) => ({
      time: bar.tradingDate
        ? bar.tradingDate.split('T')[0]
        : new Date().toISOString().split('T')[0],
      open: bar.open * 1000,
      high: bar.high * 1000,
      low: bar.low * 1000,
      close: bar.close * 1000,
      volume: bar.volume,
    })
  )
}

export async function fetchFundamental(
  symbol: string
): Promise<FundamentalData> {
  const ticker = symbol.toUpperCase()

  const [financialRes, ratingRes] = await Promise.all([
    fetch(
      `${BASE_URL}/tcanalysis/v1/finance/${ticker}/financialreport?yearly=4&quarterly=0`,
      { next: { revalidate: 3600 } }
    ),
    fetch(`${BASE_URL}/tcanalysis/v1/rating/${ticker}/rating`, {
      next: { revalidate: 3600 },
    }),
  ])

  let financial = null
  if (financialRes.ok) {
    const fJson = await financialRes.json()
    if (Array.isArray(fJson) && fJson.length > 0) {
      financial = fJson[0]
    }
  }

  let rating = null
  if (ratingRes.ok) {
    const rJson = await ratingRes.json()
    rating = rJson
  }

  return {
    pe: financial?.pe || rating?.pe || 0,
    eps: (financial?.eps || 0) * 1000,
    roe: financial?.roe ? financial.roe * 100 : 0,
    roa: financial?.roa ? financial.roa * 100 : 0,
    debtEquity: financial?.debtOnEquity || 0,
    revenueGrowth: financial?.revenueGrowth
      ? financial.revenueGrowth * 100
      : 0,
    profitGrowth: financial?.earningGrowth
      ? financial.earningGrowth * 100
      : 0,
    dividendYield: financial?.dividendYield
      ? financial.dividendYield * 100
      : 0,
    bookValue: (financial?.bookValue || 0) * 1000,
    tcbsRating: rating?.stockRating || 0,
    tcbsRecommend:
      rating?.stockRating != null
        ? rating.stockRating >= 4
          ? 'MUA'
          : rating.stockRating >= 3
            ? 'GIỮ'
            : 'BÁN'
        : 'N/A',
  }
}
