import { NextRequest, NextResponse } from 'next/server'
import { chatStockAnalysis, type ChatMessage, type InvestmentStyle } from '@/lib/claude'
import { requireAuth } from '@/lib/requireAuth'
import { fetchQuote, fetchHistory } from '@/lib/tcbs'
import { calcRSI, calcMACD, calcSMA, calcBB, calcADX } from '@/lib/indicators'

export const maxDuration = 60

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

async function fetchVNIndexContext(): Promise<{ trend30d: number; currentLevel: number; rsi: number } | null> {
  try {
    const to = Math.floor(Date.now() / 1000)
    const from = to - 35 * 86400
    const res = await fetch(
      `https://histdatafeed.vps.com.vn/tradingview/history?symbol=VNINDEX&resolution=D&from=${from}&to=${to}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return null
    const d = await res.json()
    if (!d.c || d.c.length < 5) return null
    const closes: number[] = d.c
    const first = closes[0], last = closes[closes.length - 1]
    const trend30d = first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : 0
    const rsiArr = calcRSI(closes, 14).filter((v: number) => !isNaN(v))
    const rsi = rsiArr.length > 0 ? Math.round(rsiArr[rsiArr.length - 1]) : 50
    return { trend30d, currentLevel: Math.round(last), rsi }
  } catch { return null }
}

async function fetchSimplize(symbol: string): Promise<{ roa: number; roe: number; pe: number; pb: number; eps: number; netMargin: number; dividendYield: number; debtToEquity: number }> {
  try {
    const res = await fetch(`https://api.simplize.vn/api/company/summary/${symbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://simplize.vn/' },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 3600 } as RequestInit['next'],
    })
    if (!res.ok) return { roa: 0, roe: 0, pe: 0, pb: 0, eps: 0, netMargin: 0, dividendYield: 0, debtToEquity: 0 }
    const d = await res.json()
    const s = d?.data || d
    return {
      roa: s?.roa || 0, roe: s?.roe || 0, pe: s?.peRatio || 0, pb: s?.pbRatio || 0, eps: s?.epsRatio || 0,
      netMargin: s?.netProfitMargin || s?.netMarginRatio || s?.netMargin || 0,
      dividendYield: s?.dividendYield || s?.dividendRatio || s?.dividend || 0,
      debtToEquity: s?.deRatio || s?.debtToEquity || s?.leverageRatio || 0,
    }
  } catch { return { roa: 0, roe: 0, pe: 0, pb: 0, eps: 0, netMargin: 0, dividendYield: 0, debtToEquity: 0 } }
}

// Fetch CafeF quarterly EPS/PE trend (4 quarters)
async function fetchCafeFQuarterlyRatios(symbol: string): Promise<Array<{ period: string; eps: number; pe: number }>> {
  try {
    const res = await fetch(
      `https://cafef.vn/du-lieu/Ajax/PageNew/ChiSoTaiChinh.ashx?Symbol=${symbol}&TotalRow=4&ReportType=Q&Sort=DESC`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://cafef.vn/' }, signal: AbortSignal.timeout(4000), next: { revalidate: 86400 } as RequestInit['next'] }
    )
    if (!res.ok) return []
    const data = await res.json()
    const rows: Array<Record<string, unknown>> =
      data?.Data?.Data || data?.data?.Data || data?.Data || data?.data || []
    if (!Array.isArray(rows) || rows.length === 0) return []
    return rows.slice(0, 4).map(r => ({
      period: String(r.ReportDate || r.Quarter || r.reportDate || r.year || ''),
      eps: Number(r.EPS || r.eps || 0),
      pe: Number(r.PriceToEarning || r.PE || r.pe || r.priceToEarning || 0),
    })).filter(r => r.period && (r.eps !== 0 || r.pe !== 0))
  } catch { return [] }
}

async function fetchCafeFGrowth(symbol: string): Promise<{ revenueGrowth: number; profitGrowth: number }> {
  try {
    const res = await fetch(
      `https://cafef.vn/du-lieu/Ajax/PageNew/KeHoachKinhDoanh.ashx?Symbol=${symbol}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://cafef.vn/' }, signal: AbortSignal.timeout(5000), next: { revalidate: 86400 } as RequestInit['next'] }
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
    const REVENUE_NAMES = ['Doanh thu', 'Tổng doanh thu', 'Tổng thu nhập hoạt động', 'Tổng thu nhập thuần', 'Tổng thu nhập', 'Thu nhập lãi và tương đương', 'Thu nhập lãi thuần', 'Thu nhập lãi', 'Tổng thu']
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

async function fetchNewsHeadlines(symbol: string): Promise<string[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/news?symbol=${symbol}`, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    const items = data?.items || []
    return items.slice(0, 5).map((n: { title: string }) => n.title).filter(Boolean)
  } catch { return [] }
}

async function fetchLatestAnalystReportPdf(symbol: string): Promise<{ pdfBase64: string | null; reportTitle: string }> {
  try {
    const res = await fetch(
      `https://cafef.vn/du-lieu/Ajax/PageNew/BaoCaoPhanTich.ashx?Symbol=${symbol}&PageIndex=1&PageSize=3`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Referer': 'https://cafef.vn/' },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!res.ok) return { pdfBase64: null, reportTitle: '' }
    const data = await res.json()
    const reports: Array<{ ImageThumb?: string; FileName?: string; Title?: string }> = data?.Data || []
    for (const r of reports) {
      let pdfUrl = ''
      if (r.ImageThumb && r.ImageThumb.includes('Images/Uploaded/')) {
        const basePath = r.ImageThumb.replace(/^thumb\/[\d_]+\//, '').replace(/\.(png|jpg|jpeg)$/i, '.pdf')
        pdfUrl = `https://cafef.vn/${basePath}`
      } else if (r.FileName) {
        pdfUrl = `https://cafef.vn/Images/Uploaded/DuLieuDownload/PhanTichBaoCao/${r.FileName}`
      }
      if (!pdfUrl) continue
      const cdnUrl = pdfUrl.replace(/^https?:\/\/cafef\.vn\//i, 'https://cafefnew.mediacdn.vn/')
      try {
        const pdfRes = await fetch(cdnUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockAI/1.0)' },
          signal: AbortSignal.timeout(8000),
        })
        if (!pdfRes.ok) continue
        const buf = await pdfRes.arrayBuffer()
        if (buf.byteLength > 10 * 1024 * 1024) continue
        return { pdfBase64: Buffer.from(buf).toString('base64'), reportTitle: r.Title || '' }
      } catch { continue }
    }
    return { pdfBase64: null, reportTitle: '' }
  } catch { return { pdfBase64: null, reportTitle: '' } }
}

const VALID_STYLES: InvestmentStyle[] = ['longterm', 'dca', 'swing', 'dividend', 'etf']

export async function POST(request: NextRequest) {
  const { error } = await requireAuth(request)
  if (error) return error

  try {
    const body = await request.json()
    const { symbol, style, question, history } = body

    if (!symbol || !question) {
      return NextResponse.json({ error: 'symbol và question là bắt buộc' }, { status: 400 })
    }

    if (!process.env.CLAUDE_API_KEY) {
      return NextResponse.json({ error: 'Claude API key not configured' }, { status: 500 })
    }

    const sym = String(symbol).trim().toUpperCase()

    // Fetch all data in parallel (including quarterly EPS for earnings acceleration analysis)
    const [quoteRes, histRes, simplizeRes, cafeGrowthRes, newsRes, vnIndexRes, analystReportRes, quarterlyRes] = await Promise.allSettled([
      fetchQuote(sym),
      fetchHistory(sym, 90).catch(() => []),
      fetchSimplize(sym),
      fetchCafeFGrowth(sym),
      fetchNewsHeadlines(sym),
      fetchVNIndexContext(),
      fetchLatestAnalystReportPdf(sym),
      fetchCafeFQuarterlyRatios(sym),
    ])

    const quote = quoteRes.status === 'fulfilled' ? quoteRes.value : null
    const candles = histRes.status === 'fulfilled' ? histRes.value : []
    const simplize = simplizeRes.status === 'fulfilled' ? simplizeRes.value : { roa: 0, roe: 0, pe: 0, pb: 0, eps: 0, netMargin: 0, dividendYield: 0, debtToEquity: 0 }
    const cafeGrowth = cafeGrowthRes.status === 'fulfilled' ? cafeGrowthRes.value : { revenueGrowth: 0, profitGrowth: 0 }
    const newsHeadlines = newsRes.status === 'fulfilled' ? newsRes.value : []
    const vnIndex = vnIndexRes.status === 'fulfilled' ? vnIndexRes.value : null
    const analystReport = analystReportRes.status === 'fulfilled' ? analystReportRes.value : { pdfBase64: null, reportTitle: '' }
    const quarterlyRatios = quarterlyRes.status === 'fulfilled' ? quarterlyRes.value : []

    // Calculate technicals from 90-day history
    let rsi = 50, macd = 0, signal = 0, macdHistogram = 0
    let sma20 = 0, sma50 = 0, aboveSMA20 = false, aboveSMA50 = false
    let bbUpper = 0, bbMid = 0, bbLower = 0, bbSignal = 'Inside BB'
    let volumeSignal = 'Bình thường', adx = 0, adxTrend = 'Không rõ xu hướng'
    let momentum1W = 0, momentum1M = 0, momentum3M = 0, trend30d = 0
    let support = 0, resistance = 0, support2 = 0, resistance2 = 0

    if (candles.length > 10) {
      const closes = candles.map((c: { close: number }) => c.close)
      const volumes = candles.map((c: { volume: number }) => c.volume)
      const hArr = candles.map((c: { high: number }) => c.high)
      const lArr = candles.map((c: { low: number }) => c.low)
      const lastClose = closes[closes.length - 1]

      const rsiArr = calcRSI(closes, 14).filter((v: number) => !isNaN(v))
      if (rsiArr.length > 0) rsi = Math.round(rsiArr[rsiArr.length - 1])

      const macdArr = calcMACD(closes).filter((v: { macd: number }) => !isNaN(v.macd))
      if (macdArr.length > 0) {
        const last = macdArr[macdArr.length - 1]
        macd = Math.round(last.macd * 100) / 100
        signal = Math.round(last.signal * 100) / 100
        macdHistogram = Math.round(last.histogram * 100) / 100
      }

      const sma20arr = calcSMA(closes, 20).filter((v: number) => !isNaN(v))
      const sma50arr = calcSMA(closes, 50).filter((v: number) => !isNaN(v))
      if (sma20arr.length > 0) { sma20 = Math.round(sma20arr[sma20arr.length - 1]); aboveSMA20 = lastClose > sma20arr[sma20arr.length - 1] }
      if (sma50arr.length > 0) { sma50 = Math.round(sma50arr[sma50arr.length - 1]); aboveSMA50 = lastClose > sma50arr[sma50arr.length - 1] }

      const bbArr = calcBB(closes, 20, 2).filter((v: { upper: number }) => v.upper > 0)
      if (bbArr.length > 0) {
        const last = bbArr[bbArr.length - 1]
        bbUpper = Math.round(last.upper); bbMid = Math.round(last.middle); bbLower = Math.round(last.lower)
        if (lastClose >= last.upper * 0.98) bbSignal = 'Overbought (trên BB trên)'
        else if (lastClose <= last.lower * 1.02) bbSignal = 'Oversold (dưới BB dưới)'
      }

      if (volumes.length >= 20) {
        const avg20 = volumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20
        const avg5 = volumes.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5
        if (avg5 > avg20 * 1.5) volumeSignal = 'Cao bất thường'
        else if (avg5 < avg20 * 0.5) volumeSignal = 'Thấp bất thường'
      }

      if (candles.length >= 28) {
        const adxArr = calcADX(hArr, lArr, closes, 14).filter((v: number) => !isNaN(v))
        if (adxArr.length > 0) {
          adx = Math.round(adxArr[adxArr.length - 1])
          adxTrend = adx >= 25 ? 'Xu hướng MẠNH' : adx >= 15 ? 'Xu hướng YẾU' : 'SIDEWAY'
        }
      }

      if (closes.length >= 6) { const c = closes[Math.max(0, closes.length - 6)]; if (c > 0) momentum1W = Math.round(((lastClose - c) / c) * 1000) / 10 }
      if (closes.length >= 23) { const c = closes[Math.max(0, closes.length - 23)]; if (c > 0) momentum1M = Math.round(((lastClose - c) / c) * 1000) / 10 }
      if (closes.length >= 65) { const c = closes[Math.max(0, closes.length - 65)]; if (c > 0) momentum3M = Math.round(((lastClose - c) / c) * 1000) / 10 }
      if (closes.length >= 2) trend30d = Math.round(((lastClose - closes[0]) / closes[0]) * 1000) / 10

      if (hArr.length >= 10) {
        resistance = Math.round(Math.max(...hArr.slice(-20))); support = Math.round(Math.min(...lArr.slice(-20)))
        resistance2 = Math.round(Math.max(...hArr.slice(-10))); support2 = Math.round(Math.min(...lArr.slice(-10)))
      }
    }

    const validStyle = style && VALID_STYLES.includes(style) ? style as InvestmentStyle : undefined

    // 52-week position
    const w52high = quote?.high52w || 0
    const w52low = quote?.low52w || 0
    const price = quote?.price || 0
    const w52position = w52high > w52low ? Math.round(((price - w52low) / (w52high - w52low)) * 100) : undefined

    const ctx = {
      symbol: sym,
      price,
      changePct: quote?.changePct || 0,
      style: validStyle,
      rsi, macd, signal, macdHistogram,
      sma20, sma50, aboveSMA20, aboveSMA50,
      bbUpper, bbMid, bbLower, bbSignal, volumeSignal,
      adx, adxTrend, momentum1W, momentum1M, momentum3M, trend30d,
      support, resistance, support2, resistance2,
      pe: simplize.pe,
      pb: simplize.pb,
      eps: simplize.eps,
      roe: simplize.roe,
      roa: simplize.roa,
      revenueGrowth: cafeGrowth.revenueGrowth,
      profitGrowth: cafeGrowth.profitGrowth,
      dividendYield: simplize.dividendYield || 0,
      debtEquity: simplize.debtToEquity || 0,
      netMargin: simplize.netMargin || 0,
      quarterlyEPS: quarterlyRatios.length >= 2 ? quarterlyRatios : undefined,
      foreignBuyVol: quote?.foreignBuyVol || 0,
      foreignSellVol: quote?.foreignSellVol || 0,
      foreignNetVol: (quote?.foreignBuyVol || 0) - (quote?.foreignSellVol || 0),
      foreignRoom: quote?.foreignRoom,
      newsHeadlines,
      vnIndex: vnIndex || undefined,
      w52position,
      w52high: w52high || undefined,
      w52low: w52low || undefined,
      reportPdfBase64: analystReport.pdfBase64 || undefined,
      reportTitle: analystReport.reportTitle || undefined,
    }

    const allMessages: ChatMessage[] = [
      ...(Array.isArray(history) ? history as ChatMessage[] : []),
      { role: 'user', content: question },
    ]

    const response = await chatStockAnalysis(ctx, allMessages)
    return NextResponse.json({ response })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chat failed'
    console.error('[chat-stock]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
