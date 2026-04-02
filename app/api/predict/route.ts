import { NextRequest, NextResponse } from 'next/server'
import { fetchQuote } from '@/lib/tcbs'
import { predictStocks, type InvestmentStyle } from '@/lib/claude'
import { requireAuth } from '@/lib/requireAuth'
import { INDUSTRY_MAP } from '@/lib/utils'
import { calcRSI, calcMACD, calcBB, calcADX, calcSMA, calcBeta } from '@/lib/indicators'
import type { PredictionItem } from '@/types'

export const maxDuration = 60

// In-memory cache per style (20 min TTL) — survives within the same warm Vercel instance.
// Prevents repeated 504s: first call computes + caches, subsequent calls (SWR refetch on focus) return instantly.
const _cache = new Map<string, { data: PredictionItem[]; ts: number }>()
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours — predictions don't change rapidly

const VALID_STYLES: InvestmentStyle[] = ['longterm', 'dca', 'swing', 'dividend', 'etf']

// Reduced to 12 symbols per style — keeps execution under Vercel 10s limit
const STYLE_SYMBOLS: Record<InvestmentStyle, string[]> = {
  // Dài hạn: bluechip tăng trưởng bền vững, ROE cao, lợi thế cạnh tranh
  longterm: ['FPT', 'VNM', 'VCB', 'BID', 'HPG', 'GAS', 'MSN', 'MWG', 'REE', 'PNJ', 'ACB', 'TCB'],
  // DCA: ổn định, thanh khoản cao, biến động thấp-trung bình
  dca:      ['VCB', 'BID', 'CTG', 'ACB', 'TCB', 'MBB', 'FPT', 'VNM', 'GAS', 'HPG', 'MWG', 'PNJ'],
  // Lướt sóng: biến động cao, thanh khoản tốt, có momentum kỹ thuật rõ
  swing:    ['HPG', 'HSG', 'FPT', 'TCB', 'VHM', 'MWG', 'PDR', 'NLG', 'KDH', 'VIC', 'HDB', 'VPB'],
  // Cổ tức: lịch sử trả cổ tức đều, yield cao, cashflow ổn định
  dividend: ['VCB', 'BID', 'CTG', 'ACB', 'MBB', 'GAS', 'VNM', 'PNJ', 'REE', 'FPT', 'HPG', 'SAB'],
  // ETF/Chỉ số: vốn hóa lớn, đại diện VN30, thanh khoản cao nhất thị trường
  etf:      ['VCB', 'BID', 'CTG', 'HPG', 'VNM', 'GAS', 'FPT', 'VIC', 'VHM', 'MSN', 'MWG', 'TCB'],
}

// Fetch Simplize for ROE/ROA/PB/PE/EPS + margins/dividendYield — replaces WAF-blocked Vietcap
async function fetchSimplizeSummary(symbol: string): Promise<{ roa: number; roe: number; pb: number; pe: number; eps: number; netMargin: number; grossMargin: number; operatingMargin: number; dividendYield: number; debtToEquity: number }> {
  try {
    const res = await fetch(`https://api.simplize.vn/api/company/summary/${symbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://simplize.vn/' },
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 3600 } as RequestInit['next'],
    })
    if (!res.ok) return { roa: 0, roe: 0, pb: 0, pe: 0, eps: 0, netMargin: 0, grossMargin: 0, operatingMargin: 0, dividendYield: 0, debtToEquity: 0 }
    const d = await res.json()
    const s = d?.data || d
    return {
      roa: s?.roa || 0,
      roe: s?.roe || 0,
      pb: s?.pbRatio || 0,
      pe: s?.peRatio || 0,
      eps: s?.epsRatio || 0,
      netMargin: s?.netProfitMargin || s?.netMarginRatio || s?.netMargin || 0,
      grossMargin: s?.grossProfitMargin || s?.grossMargin || s?.grossProfitRatio || s?.grossMarginRatio || 0,
      operatingMargin: s?.operatingMargin || s?.operatingProfitMargin || s?.ebitMargin || s?.operatingMarginRatio || 0,
      dividendYield: s?.dividendYield || s?.dividendRatio || s?.dividend || 0,
      debtToEquity: s?.deRatio || s?.debtToEquity || s?.leverageRatio || 0,
    }
  } catch { return { roa: 0, roe: 0, pb: 0, pe: 0, eps: 0, netMargin: 0, grossMargin: 0, operatingMargin: 0, dividendYield: 0, debtToEquity: 0 } }
}

// Fetch CafeF quarterly EPS/PE trend — for EPS growth YoY and PEG fallback
async function fetchCafeFQuarterlyRatios(symbol: string): Promise<Array<{ period: string; eps: number; pe: number }>> {
  try {
    const res = await fetch(
      `https://cafef.vn/du-lieu/Ajax/PageNew/ChiSoTaiChinh.ashx?Symbol=${symbol}&TotalRow=8&ReportType=Q&Sort=DESC`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://cafef.vn/' }, signal: AbortSignal.timeout(1500), next: { revalidate: 86400 } as RequestInit['next'] }
    )
    if (!res.ok) return []
    const data = await res.json()
    const rows: Array<Record<string, unknown>> =
      data?.Data?.Data || data?.data?.Data || data?.Data || data?.data || []
    if (!Array.isArray(rows) || rows.length === 0) return []
    return rows.slice(0, 8).map(r => ({
      period: String(r.ReportDate || r.Quarter || r.reportDate || r.year || ''),
      eps: Number(r.EPS || r.eps || 0),
      pe: Number(r.PriceToEarning || r.PE || r.pe || r.priceToEarning || 0),
    })).filter(r => r.period && (r.eps !== 0 || r.pe !== 0))
  } catch { return [] }
}

// Fetch CafeF profit growth — 3s hard timeout so it never blocks predict
async function fetchCafeFGrowth(symbol: string): Promise<{ revenueGrowth: number; profitGrowth: number }> {
  try {
    const res = await fetch(
      `https://cafef.vn/du-lieu/Ajax/PageNew/KeHoachKinhDoanh.ashx?Symbol=${symbol}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://cafef.vn/' }, signal: AbortSignal.timeout(1500), next: { revalidate: 3600 } as RequestInit['next'] }
    )
    if (!res.ok) return { revenueGrowth: 0, profitGrowth: 0 }
    const data = await res.json()
    const inner = data?.Data || data?.data || data
    let yearEntries: Array<{ Year: number; Values: Array<{ Name: string; Value: string }> }> = []
    if (Array.isArray(inner)) yearEntries = inner
    else if (Array.isArray(inner?.ListYear)) yearEntries = inner.ListYear
    else if (inner?.Year) yearEntries = [inner]
    yearEntries.sort((a, b) => b.Year - a.Year)
    if (yearEntries.length < 2) return { revenueGrowth: 0, profitGrowth: 0 }
    const curr = yearEntries[0], prev = yearEntries[1]
    const REVENUE_NAMES = ['Doanh thu', 'Tổng doanh thu', 'Tổng thu nhập hoạt động', 'Tổng thu nhập thuần', 'Thu nhập lãi và tương đương', 'Thu nhập lãi thuần']
    const PROFIT_NAMES = ['Lợi nhuận trước thuế', 'Lợi nhuận sau thuế', 'LNTT', 'LNST', 'Tổng Lợi nhuận trước thuế']
    const findVal = (entry: typeof curr, names: string[]): number => {
      for (const name of names) {
        const item = (entry.Values || []).find(v => v.Name?.includes(name))
        if (item?.Value && item.Value !== 'N/A') {
          const n = parseFloat(String(item.Value).replace(/\./g, '').replace(',', '.'))
          if (!isNaN(n) && n > 0) return n
        }
      }
      return 0
    }
    const currRev = findVal(curr, REVENUE_NAMES), prevRev = findVal(prev, REVENUE_NAMES)
    const currProfit = findVal(curr, PROFIT_NAMES), prevProfit = findVal(prev, PROFIT_NAMES)
    const revenueGrowth = prevRev > 0 && currRev > 0 ? Math.round(((currRev - prevRev) / prevRev) * 1000) / 10 : 0
    const profitGrowth = prevProfit !== 0 && currProfit !== 0 ? Math.round(((currProfit - prevProfit) / Math.abs(prevProfit)) * 1000) / 10 : 0
    return { revenueGrowth, profitGrowth }
  } catch { return { revenueGrowth: 0, profitGrowth: 0 } }
}

// Fetch top news headlines for a stock (lightweight, 1.5s timeout)
async function fetchStockNewsHeadlines(symbol: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://cafef.vn/du-lieu/Ajax/Events_RelatedNews_New.aspx?symbol=${symbol}&floorID=0&configID=0&PageIndex=1&PageSize=5&Type=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://cafef.vn/' }, signal: AbortSignal.timeout(1500), next: { revalidate: 3600 } as RequestInit['next'] }
    )
    if (!res.ok) return []
    const data = await res.json()
    const items = data?.Data || data?.data || []
    return (Array.isArray(items) ? items : [])
      .slice(0, 2)
      .map((n: { Title?: string; title?: string }) => n.Title || n.title || '')
      .filter(Boolean)
  } catch { return [] }
}

// Fetch VN-Index 30-day trend + closes array (for beta calculation)
async function fetchVNIndexContext(): Promise<{ trend30d: number; currentLevel: number; rsi: number; closes: number[] }> {
  try {
    const to = Math.floor(Date.now() / 1000)
    const from = to - 95 * 86400  // 95D covers 90D stock candle window for beta
    const res = await fetch(
      `https://histdatafeed.vps.com.vn/tradingview/history?symbol=VNINDEX&resolution=D&from=${from}&to=${to}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return { trend30d: 0, currentLevel: 0, rsi: 50, closes: [] }
    const d = await res.json()
    if (!d.c || d.c.length < 5) return { trend30d: 0, currentLevel: 0, rsi: 50, closes: [] }
    const closes: number[] = d.c
    const first = closes[0], last = closes[closes.length - 1]
    const trend30d = first > 0 ? ((last - first) / first) * 100 : 0
    const rsiArr = calcRSI(closes, 14).filter((v: number) => !isNaN(v))
    const rsi = rsiArr.length > 0 ? Math.round(rsiArr[rsiArr.length - 1]) : 50
    return { trend30d: Math.round(trend30d * 10) / 10, currentLevel: Math.round(last), rsi, closes }
  } catch { return { trend30d: 0, currentLevel: 0, rsi: 50, closes: [] } }
}

// Quick algorithmic pre-filter: scores all stocks and selects top 6 before Claude
// Reduces Claude input tokens by ~50% (6 × 3 lines vs 12 × 3 lines), cuts response time ~35%
function quickScore(s: {
  rsi: number; macdSignal: string; aboveSMA20: boolean; aboveSMA50: boolean
  adx: number; momentum1M: number; momentum3M: number
  roe: number; profitGrowth: number; pe: number; debtEquity: number
  foreignNetVol: number; rs30d?: number; volumeSignal: string; dividendYield: number
}, style: InvestmentStyle): number {
  // Technical (max ~33)
  let tech = 0
  if (s.rsi >= 30 && s.rsi <= 60) tech += 10; else if (s.rsi < 30) tech += 7; else if (s.rsi > 70) tech -= 5
  if (s.macdSignal === 'Bullish') tech += 8
  if (s.aboveSMA20 && s.aboveSMA50) tech += 7; else if (s.aboveSMA20) tech += 3
  if (s.adx >= 25) tech += 5; else if (s.adx < 15) tech -= 3
  if (s.momentum1M > 0 && s.momentum3M > 0) tech += 3; else if (s.momentum1M < 0 && s.momentum3M < 0) tech -= 3

  // Fundamental (max ~39)
  let fund = 0
  if (s.roe > 20) fund += 12; else if (s.roe > 15) fund += 8; else if (s.roe > 10) fund += 4; else fund -= 2
  if (s.profitGrowth > 25) fund += 10; else if (s.profitGrowth > 15) fund += 7; else if (s.profitGrowth > 5) fund += 4; else if (s.profitGrowth < 0) fund -= 5
  if (s.pe > 0 && s.pe < 15) fund += 8; else if (s.pe > 0 && s.pe < 25) fund += 4; else if (s.pe > 35) fund -= 3
  if (s.debtEquity < 0.5) fund += 5; else if (s.debtEquity > 2.5) fund -= 4
  if (style === 'dividend') { if (s.dividendYield > 4) fund += 10; else if (s.dividendYield > 2) fund += 5 }

  // Flow + Momentum (max ~28)
  let flow = 0
  const fNet = s.foreignNetVol
  if (fNet > 500_000) flow += 12; else if (fNet > 100_000) flow += 7; else if (fNet > 0) flow += 3
  else if (fNet < -500_000) flow -= 8; else if (fNet < -100_000) flow -= 4
  if (s.rs30d !== undefined) {
    if (s.rs30d > 5) flow += 8; else if (s.rs30d > 2) flow += 5
    else if (s.rs30d > -2) flow += 2; else if (s.rs30d < -5) flow -= 4
  }
  if (s.volumeSignal.includes('Cao')) flow += 5; else if (s.volumeSignal.includes('Thấp')) flow -= 3

  // Style-specific weights (same as StockScreener STYLE_CONFIGS)
  const W: Record<InvestmentStyle, [number, number, number]> = {
    longterm: [0.25, 0.55, 0.20],
    dca:      [0.25, 0.50, 0.25],
    swing:    [0.55, 0.15, 0.30],
    dividend: [0.15, 0.55, 0.30],
    etf:      [0.30, 0.40, 0.30],
  }
  const w = W[style] ?? W.longterm
  return Math.round(tech * w[0] + fund * w[1] + flow * w[2])
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

  // Serve from in-memory cache if available (same Vercel instance, within TTL)
  const cached = _cache.get(style)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data)
  }

  try {
    const symbols = STYLE_SYMBOLS[style] ?? Object.values(STYLE_SYMBOLS)[0]

    // Fetch VN-Index once + all stock data in parallel
    // Data sources: VPS quote+history (fast), Simplize pe/eps/roe/roa/pb, CafeF growth (3s timeout)
    // Vietcap GraphQL removed — WAF-blocked, always returned zeros
    const [vnIndex, ...stockResults] = await Promise.all([
      fetchVNIndexContext(),
      ...symbols.map(async (symbol) => {
        const [quoteRes, simplizeRes, cafeGrowthRes, newsRes, quarterlyRes] = await Promise.allSettled([
          fetchQuote(symbol),
          fetchSimplizeSummary(symbol),
          fetchCafeFGrowth(symbol),
          fetchStockNewsHeadlines(symbol),
          fetchCafeFQuarterlyRatios(symbol),
        ])

        const q = quoteRes.status === 'fulfilled' ? quoteRes.value : null
        // Reuse the 365d candles already fetched inside fetchQuote (saves 1 VPS request per stock)
        const candles = q?.candles?.slice(-90) || []
        const s = simplizeRes.status === 'fulfilled' ? simplizeRes.value : { roa: 0, roe: 0, pb: 0, pe: 0, eps: 0, netMargin: 0, grossMargin: 0, operatingMargin: 0, dividendYield: 0, debtToEquity: 0 }
        const g = cafeGrowthRes.status === 'fulfilled' ? cafeGrowthRes.value : { revenueGrowth: 0, profitGrowth: 0 }
        const newsHeadlines = newsRes.status === 'fulfilled' ? newsRes.value : []
        const quarterlyRatios = quarterlyRes.status === 'fulfilled' ? quarterlyRes.value : []

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

        // Support / Resistance via swing pivot (±2 bar window)
        let support: number | undefined, resistance: number | undefined
        let support2: number | undefined, resistance2: number | undefined
        if (candles.length >= 10) {
          const W = 2
          const swingHighs: number[] = [], swingLows: number[] = []
          for (let i = W; i < candles.length - W; i++) {
            let isH = true, isL = true
            for (let j = i - W; j <= i + W; j++) {
              if (j === i) continue
              if (candles[j].high >= candles[i].high) isH = false
              if (candles[j].low <= candles[i].low) isL = false
            }
            if (isH) swingHighs.push(candles[i].high)
            if (isL) swingLows.push(candles[i].low)
          }
          const resLevels = swingHighs.filter(h => h > lastClose).sort((a, b) => a - b)
          const supLevels = swingLows.filter(l => l < lastClose).sort((a, b) => b - a)
          resistance = resLevels[0]
          resistance2 = resLevels[1]
          support = supLevels[0]
          support2 = supLevels[1]
        }

        // 52-week high/low from fetchQuote (already fetched 365-day history)
        const w52high = q.high52w || undefined
        const w52low = q.low52w || undefined
        const w52position = (w52high && w52low && w52high > w52low && lastClose >= w52low)
          ? Math.round(((lastClose - w52low) / (w52high - w52low)) * 100)
          : undefined

        // EPS YoY growth from quarterly data (fallback for PEG when CafeF growth is 0)
        let epsGrowthYoY: number | undefined
        if (quarterlyRatios.length >= 5 && quarterlyRatios[0].eps > 0 && quarterlyRatios[4].eps > 0) {
          epsGrowthYoY = Math.round(((quarterlyRatios[0].eps - quarterlyRatios[4].eps) / Math.abs(quarterlyRatios[4].eps)) * 100)
        }

        return {
          symbol,
          price: q.price,
          changePct: q.changePct,
          industry: INDUSTRY_MAP[symbol] || q.industry || 'Khác',
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
          // Support / Resistance
          support,
          resistance,
          support2,
          resistance2,
          // 52-week range
          w52high,
          w52low,
          w52position,
          // Fundamental — all from Simplize (fast, reliable)
          pe: Math.round((s.pe || 0) * 10) / 10,
          eps: Math.round((s.eps || 0) * 10) / 10,
          roe: Math.round((s.roe || 0) * 10) / 10,
          roa: Math.round((s.roa || 0) * 10) / 10,
          pb: Math.round((s.pb || 0) * 100) / 100,
          netMargin: Math.round((s.netMargin || 0) * 10) / 10,
          grossMargin: Math.round((s.grossMargin || 0) * 10) / 10,
          revenueGrowth: g.revenueGrowth,
          profitGrowth: g.profitGrowth,
          epsGrowthYoY,
          debtEquity: Math.round((s.debtToEquity || 0) * 100) / 100,
          dividendYield: Math.round((s.dividendYield || 0) * 10) / 10,
          // Foreign investor flows
          foreignBuyVol: q.foreignBuyVol ?? 0,
          foreignSellVol: q.foreignSellVol ?? 0,
          foreignNetVol: (q.foreignBuyVol ?? 0) - (q.foreignSellVol ?? 0),
          foreignRoom: q.foreignRoom,
          // Derived metrics — use EPS YoY as PEG fallback when CafeF growth is missing
          peg: (() => {
            const growthForPEG = g.profitGrowth !== 0 ? g.profitGrowth : (epsGrowthYoY ?? 0)
            return (s.pe > 0 && growthForPEG > 5) ? Math.round((s.pe / growthForPEG) * 100) / 100 : undefined
          })(),
          newsHeadlines,
          _candles: closes, // for beta calculation after vnIndex resolves
        }
      })
    ])

    // Compute rs30d + beta after Promise.all resolves (vnIndex is available now)
    const vnCloses = vnIndex?.closes || []
    const stocks = stockResults
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map(s => {
        const stockCloses = s._candles || []
        const beta = stockCloses.length >= 11 && vnCloses.length >= 11
          ? calcBeta(stockCloses, vnCloses)
          : undefined
        return {
          ...s,
          rs30d: vnIndex ? Math.round((s.trend30d - vnIndex.trend30d) * 10) / 10 : undefined,
          beta,
        }
      })

    if (stocks.length < 5) {
      return NextResponse.json(
        { error: 'Not enough stock data available' },
        { status: 500 }
      )
    }

    // Pre-filter: pass only top 6 candidates to Claude (sorted by style-weighted algorithmic score)
    // Reduces Claude input tokens ~50% vs sending all 12 → response time ~35% faster
    const topStocks = stocks
      .map(s => ({ s, score: quickScore(s, style) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(6, stocks.length))
      .map(({ s }) => s)

    const predictions: PredictionItem[] = await predictStocks({ style, stocks: topStocks, vnIndex })

    // Store in cache so SWR refetch on tab focus returns instantly
    _cache.set(style, { data: predictions, ts: Date.now() })

    return NextResponse.json(predictions)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Prediction failed'
    console.error('[predict] ERROR:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
