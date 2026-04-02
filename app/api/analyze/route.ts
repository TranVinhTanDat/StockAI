import { NextRequest, NextResponse } from 'next/server'
import { analyzeStock } from '@/lib/claude'
import { calculateSmartScore } from '@/lib/smartScore'
import { createClient } from '@supabase/supabase-js'
import { verifyToken } from '@/lib/jwt'
import { calcRSI, calcDMI, calcBeta } from '@/lib/indicators'

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || url.includes('xxx')) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function getCachedResult(symbol: string, noHolding: boolean) {
  if (!noHolding) return null // don't cache user-specific analyses
  const sb = getServerSupabase()
  if (!sb) return null
  const { data } = await sb
    .from('analysis_cache')
    .select('data')
    .eq('symbol', symbol)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.data ?? null
}

async function saveCachedResult(symbol: string, result: unknown) {
  const sb = getServerSupabase()
  if (!sb) return
  const now = new Date()
  const vnHour = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })).getHours()
  // During market hours (8-16), cache 8h; otherwise cache 36h
  const ttlHours = (vnHour >= 8 && vnHour < 16) ? 8 : 36
  const expiresAt = new Date(now.getTime() + ttlHours * 3600_000).toISOString()
  await sb.from('analysis_cache').insert({ symbol, data: result, expires_at: expiresAt })
}

// Fetch Simplize for full fundamental data — replaces WAF-blocked Vietcap
async function fetchSimplizeSummary(symbol: string): Promise<{ roa: number; roe: number; pb: number; pe: number; eps: number; netMargin: number; grossMargin: number; operatingMargin: number; currentRatio: number; dividendYield: number; debtToEquity: number }> {
  try {
    const res = await fetch(`https://api.simplize.vn/api/company/summary/${symbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://simplize.vn/' },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 3600 } as RequestInit['next'],
    })
    if (!res.ok) return { roa: 0, roe: 0, pb: 0, pe: 0, eps: 0, netMargin: 0, grossMargin: 0, operatingMargin: 0, currentRatio: 0, dividendYield: 0, debtToEquity: 0 }
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
      currentRatio: s?.currentRatio || s?.liquidityRatio || s?.currentLiquidityRatio || 0,
      dividendYield: s?.dividendYield || s?.dividendRatio || s?.dividend || 0,
      debtToEquity: s?.deRatio || s?.debtToEquity || s?.leverageRatio || 0,
    }
  } catch { return { roa: 0, roe: 0, pb: 0, pe: 0, eps: 0, netMargin: 0, grossMargin: 0, operatingMargin: 0, currentRatio: 0, dividendYield: 0, debtToEquity: 0 } }
}

// Fetch CafeF KeHoachKinhDoanh for revenue/profit growth (fallback when Vietcap GraphQL is unavailable)
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

// Fetch CafeF quarterly EPS/PE trend (4 quarters) — reveals earnings acceleration/deceleration
async function fetchCafeFQuarterlyRatios(symbol: string): Promise<Array<{ period: string; eps: number; pe: number }>> {
  try {
    const res = await fetch(
      `https://cafef.vn/du-lieu/Ajax/PageNew/ChiSoTaiChinh.ashx?Symbol=${symbol}&TotalRow=8&ReportType=Q&Sort=DESC`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://cafef.vn/' }, signal: AbortSignal.timeout(4000), next: { revalidate: 86400 } as RequestInit['next'] }
    )
    if (!res.ok) return []
    const data = await res.json()
    // Try multiple response structures (CafeF inconsistent)
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

// Fetch latest analyst report PDF for deep analysis context
async function fetchLatestAnalystReportPdf(symbol: string): Promise<{ pdfBase64: string | null; reportTitle: string }> {
  try {
    const res = await fetch(
      `https://cafef.vn/du-lieu/Ajax/PageNew/BaoCaoPhanTich.ashx?Symbol=${symbol}&PageIndex=1&PageSize=3`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Referer': 'https://cafef.vn/' },
        signal: AbortSignal.timeout(3000),
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
          signal: AbortSignal.timeout(6000),
        })
        if (!pdfRes.ok) continue
        const buf = await pdfRes.arrayBuffer()
        if (buf.byteLength > 1.5 * 1024 * 1024) continue // skip >1.5MB
        return { pdfBase64: Buffer.from(buf).toString('base64'), reportTitle: r.Title || '' }
      } catch { continue }
    }
    return { pdfBase64: null, reportTitle: '' }
  } catch {
    return { pdfBase64: null, reportTitle: '' }
  }
}

// Fetch full VPS price history (265 days) for SmartScore — same as smart-analyze route
async function fetchStockHistoryForSmartScore(symbol: string): Promise<{ closes: number[]; highs: number[]; lows: number[]; volumes: number[] } | null> {
  try {
    const to = Math.floor(Date.now() / 1000)
    const from = to - 265 * 86400
    const res = await fetch(
      `https://histdatafeed.vps.com.vn/tradingview/history?symbol=${symbol}&resolution=D&from=${from}&to=${to}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null
    const d = await res.json()
    if (!d.c || d.c.length < 20) return null
    return {
      closes: (d.c as number[]).map((v: number) => v * 1000),
      highs: (d.h as number[]).map((v: number) => v * 1000),
      lows: (d.l as number[]).map((v: number) => v * 1000),
      volumes: d.v as number[],
    }
  } catch { return null }
}

// Fetch VN-Index 30-day trend + closes array (for beta calculation)
async function fetchVNIndexContext(): Promise<{ trend30d: number; currentLevel: number; rsi: number; closes: number[] }> {
  try {
    const to = Math.floor(Date.now() / 1000)
    const from = to - 95 * 86400  // 95D for beta calculation overlap
    const res = await fetch(
      `https://histdatafeed.vps.com.vn/tradingview/history?symbol=VNINDEX&resolution=D&from=${from}&to=${to}`
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

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    // ── JWT auth check ───────────────────────────────────────────
    const authHeader = request.headers.get('Authorization')
    const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!rawToken) {
      return NextResponse.json(
        { error: 'Vui lòng đăng nhập để sử dụng tính năng phân tích AI' },
        { status: 401 }
      )
    }
    const jwtPayload = await verifyToken(rawToken)
    if (!jwtPayload) {
      return NextResponse.json(
        { error: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { symbol, quote, indicators, highs, lows, closes, volumes, fundamental, news, currentHolding, forceRefresh } = body

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
    const latestMacd = macdValues.length > 0 ? macdValues[macdValues.length - 1] : { macd: 0, signal: 0, histogram: 0 }
    const latestBb = bbValues.length > 0 ? bbValues[bbValues.length - 1] : { upper: 0, middle: 0, lower: 0 }
    const latestSma20 = sma20Values.length > 0 ? sma20Values[sma20Values.length - 1] : quote?.price || 0
    const latestSma50 = sma50Values.length > 0 ? sma50Values[sma50Values.length - 1] : quote?.price || 0

    // Compute BB signal label
    const price = quote?.price || 0
    let bbSignal = 'Inside BB'
    if (latestBb.upper > 0) {
      if (price >= latestBb.upper * 0.98) bbSignal = 'Overbought (trên BB trên)'
      else if (price <= latestBb.lower * 1.02) bbSignal = 'Oversold (dưới BB dưới)'
    }

    // Compute MACD histogram
    const macdHistogram = latestMacd.histogram ?? (latestMacd.macd - latestMacd.signal)

    // Compute volume trend (5D vs 20D avg)
    let volumeSignal = 'Bình thường'
    const volArr: number[] = Array.isArray(volumes) ? volumes.filter((v: number) => !isNaN(v) && v > 0) : []
    if (volArr.length >= 20) {
      const avg20 = volArr.slice(-20).reduce((a, b) => a + b, 0) / 20
      const avg5 = volArr.slice(-5).reduce((a, b) => a + b, 0) / 5
      if (avg5 > avg20 * 1.5) volumeSignal = 'Cao bất thường (momentum mạnh)'
      else if (avg5 < avg20 * 0.5) volumeSignal = 'Thấp bất thường (thiếu xác nhận)'
    }

    // DMI/ADX (trend strength + direction) from highs/lows/closes
    const closesArr: number[] = Array.isArray(closes) ? closes.filter((v: number) => !isNaN(v)) : []
    const highsArr: number[] = Array.isArray(highs) ? highs.filter((v: number) => !isNaN(v)) : []
    const lowsArr: number[] = Array.isArray(lows) ? lows.filter((v: number) => !isNaN(v)) : []
    let adxValue = 0
    let adxTrend = 'Không rõ xu hướng'
    if (highsArr.length >= 28 && lowsArr.length >= 28 && closesArr.length >= 28) {
      const dmiArr = calcDMI(highsArr, lowsArr, closesArr, 14)
      const lastDMI = dmiArr.filter(d => !isNaN(d.adx)).pop()
      if (lastDMI) {
        adxValue = Math.round(lastDMI.adx)
        const uptrend = lastDMI.diPlus > lastDMI.diMinus
        if (adxValue >= 25 && uptrend) adxTrend = `Xu hướng TĂNG MẠNH (ADX ${adxValue}, DI+ ${Math.round(lastDMI.diPlus)} > DI- ${Math.round(lastDMI.diMinus)})`
        else if (adxValue >= 25 && !uptrend) adxTrend = `Xu hướng GIẢM MẠNH (ADX ${adxValue}, DI- ${Math.round(lastDMI.diMinus)} > DI+ ${Math.round(lastDMI.diPlus)})`
        else if (adxValue >= 15 && uptrend) adxTrend = `Xu hướng tăng YẾU (ADX ${adxValue})`
        else if (adxValue >= 15 && !uptrend) adxTrend = `Xu hướng giảm YẾU (ADX ${adxValue})`
        else adxTrend = `SIDEWAY (ADX ${adxValue} — không có xu hướng)`
      }
    }

    // Multi-timeframe momentum from closes
    let momentum1W = 0, momentum1M = 0, momentum3M = 0
    if (closesArr.length >= 5) {
      const last = closesArr[closesArr.length - 1]
      const w1 = closesArr[Math.max(0, closesArr.length - 6)]
      const m1 = closesArr[Math.max(0, closesArr.length - 23)]
      const m3 = closesArr[Math.max(0, closesArr.length - 65)]
      if (w1 > 0) momentum1W = Math.round(((last - w1) / w1) * 1000) / 10
      if (m1 > 0) momentum1M = Math.round(((last - m1) / m1) * 1000) / 10
      if (m3 > 0) momentum3M = Math.round(((last - m3) / m3) * 1000) / 10
    }

    // 52-week position (0=at 52w low, 100=at 52w high)
    const w52high = quote?.high52w || 0
    const w52low = quote?.low52w || 0
    const w52position = w52high > w52low ? Math.round(((price - w52low) / (w52high - w52low)) * 100) : 50

    // Foreign investor flows
    const foreignBuyVol = quote?.foreignBuyVol || 0
    const foreignSellVol = quote?.foreignSellVol || 0
    const foreignNetVol = foreignBuyVol - foreignSellVol
    const foreignRoom = quote?.foreignRoom

    // Support / Resistance — swing point detection (pivot highs/lows)
    // More accurate than simple max/min: finds actual market reaction levels
    let support = 0, resistance = 0, support2 = 0, resistance2 = 0
    if (highsArr.length >= 10 && lowsArr.length >= 10) {
      const window = 2 // pivot window: high[i] must be highest in ±2 bars
      const swingHighs: number[] = []
      const swingLows: number[] = []
      const n = Math.min(highsArr.length, lowsArr.length)
      for (let i = window; i < n - window; i++) {
        const h = highsArr[i]
        const l = lowsArr[i]
        // Swing high: highest in local window
        let isSwingHigh = true, isSwingLow = true
        for (let j = i - window; j <= i + window; j++) {
          if (j !== i) {
            if (highsArr[j] >= h) isSwingHigh = false
            if (lowsArr[j] <= l) isSwingLow = false
          }
        }
        if (isSwingHigh) swingHighs.push(h)
        if (isSwingLow) swingLows.push(l)
      }
      // Nearest resistance ABOVE price, nearest support BELOW price (aligned with smart-analyze)
      const resistanceLevels = swingHighs.filter(h => h > price)
      const supportLevels = swingLows.filter(l => l < price)
      if (resistanceLevels.length > 0) {
        resistance = Math.round(Math.min(...resistanceLevels)) // nearest above
        resistance2 = resistanceLevels.length > 1
          ? Math.round(resistanceLevels.sort((a,b) => a-b)[1]) // second nearest
          : resistance
      } else if (swingHighs.length > 0) {
        resistance = Math.round(Math.max(...swingHighs))
        resistance2 = resistance
      }
      if (supportLevels.length > 0) {
        support = Math.round(Math.max(...supportLevels)) // nearest below
        support2 = supportLevels.length > 1
          ? Math.round(supportLevels.sort((a,b) => b-a)[1]) // second nearest
          : support
      } else if (swingLows.length > 0) {
        support = Math.round(Math.min(...swingLows))
        support2 = support
      }
      // Fallback to simple max/min if not enough swing points
      if (!resistance) resistance = Math.round(Math.max(...highsArr.slice(-20)))
      if (!support)    support    = Math.round(Math.min(...lowsArr.slice(-20)))
      if (!resistance2) resistance2 = Math.round(Math.max(...highsArr.slice(-10)))
      if (!support2)    support2    = Math.round(Math.min(...lowsArr.slice(-10)))
    }

    const topNews = (news || []).slice(0, 5).map((n: { title: string; sentiment: number }) => ({
      title: n.title,
      sentiment: n.sentiment || 0,
    }))

    const avgSentiment =
      topNews.length > 0
        ? topNews.reduce((sum: number, n: { sentiment: number }) => sum + n.sentiment, 0) / topNews.length
        : 50

    // Check shared cache (only for analyses without portfolio context, and not forced refresh)
    const noHolding = !currentHolding
    const cached = !forceRefresh && await getCachedResult(symbol, noHolding)
    if (cached) return NextResponse.json({ ...cached, _cached: true })

    // Fetch enrichment data in parallel (Simplize + VN-Index + analyst report PDF + CafeF growth + quarterly EPS)
    const [simplize, vnIndex, analystReport, cafeGrowth, quarterlyRatios] = await Promise.all([
      fetchSimplizeSummary(symbol),
      fetchVNIndexContext(),
      fetchLatestAnalystReportPdf(symbol),
      fetchCafeFGrowth(symbol),
      fetchCafeFQuarterlyRatios(symbol),
    ])

    // Derived metrics
    const peVal = simplize.pe || fundamental?.pe || 0
    const profitGrowthVal = cafeGrowth.profitGrowth || fundamental?.profitGrowth || 0
    const peg = peVal > 0 && profitGrowthVal > 5 ? Math.round((peVal / profitGrowthVal) * 100) / 100 : undefined
    const rs30d = vnIndex ? Math.round((momentum1M - vnIndex.trend30d) * 10) / 10 : undefined
    // Beta from stock closes vs VN-Index closes
    const beta = closesArr.length >= 11 && vnIndex.closes.length >= 11
      ? calcBeta(closesArr, vnIndex.closes)
      : undefined

    // Run SmartScore to get algorithmic recommendation — pass to Claude for synchronization
    // Fetch 265-day history directly (same as Phân Tích Nhanh) so SmartScore results match exactly
    let smartRecommendation: string | undefined
    try {
      const fullHistory = await fetchStockHistoryForSmartScore(symbol)
      const ssCloses = fullHistory?.closes ?? closesArr
      const ssHighs  = fullHistory?.highs  ?? highsArr
      const ssLows   = fullHistory?.lows   ?? lowsArr
      const ssVols   = fullHistory?.volumes ?? volArr
      const smartResult = calculateSmartScore({
        symbol,
        industry: quote?.industry || '',
        price,
        changePct: quote?.changePct || 0,
        closes: ssCloses,
        highs: ssHighs,
        lows: ssLows,
        volumes: ssVols,
        pe: simplize.pe || fundamental?.pe || 0,
        pb: simplize.pb || 0,
        roe: simplize.roe || fundamental?.roe || 0,
        roa: simplize.roa || fundamental?.roa || 0,
        eps: simplize.eps || fundamental?.eps || 0,
        profitGrowth: cafeGrowth.profitGrowth || fundamental?.profitGrowth || 0,
        revenueGrowth: cafeGrowth.revenueGrowth || fundamental?.revenueGrowth || 0,
        debtEquity: simplize.debtToEquity || fundamental?.debtEquity || 0,
        dividendYield: simplize.dividendYield || fundamental?.dividendYield || 0,
        netMargin: simplize.netMargin || 0,
        quarterlyEPS: quarterlyRatios,
        w52high: quote?.high52w || 0,
        w52low: quote?.low52w || 0,
        foreignBuyVol,
        foreignSellVol,
        foreignRoom: typeof foreignRoom === 'number' ? foreignRoom : 0,
        avgSentiment,
        news: topNews,
        vnIndex,
      })
      smartRecommendation = smartResult.recommendation
    } catch { /* SmartScore failed — Claude will decide independently */ }

    const result = await analyzeStock({
      symbol,
      industry: quote?.industry || '',
      price,
      currentHolding: currentHolding || null,
      changePct: quote?.changePct || 0,
      sma20: latestSma20,
      sma50: latestSma50,
      rsi: latestRsi,
      macd: latestMacd.macd,
      signal: latestMacd.signal,
      macdHistogram,
      bbUpper: latestBb.upper,
      bbMid: latestBb.middle,
      bbLower: latestBb.lower,
      bbSignal,
      volumeSignal,
      pe: simplize.pe || fundamental?.pe || 0,   // Simplize > Vietcap (WAF-blocked)
      eps: simplize.eps || fundamental?.eps || 0,
      roe: simplize.roe || fundamental?.roe || 0,
      roa: simplize.roa || fundamental?.roa || 0,
      pb: simplize.pb || 0,
      netMargin: simplize.netMargin || 0,
      grossMargin: simplize.grossMargin || 0,
      operatingMargin: simplize.operatingMargin || 0,
      currentRatio: simplize.currentRatio || 0,
      revenueGrowth: cafeGrowth.revenueGrowth || fundamental?.revenueGrowth || 0,  // CafeF > Vietcap
      profitGrowth: cafeGrowth.profitGrowth || fundamental?.profitGrowth || 0,
      debtEquity: simplize.debtToEquity || fundamental?.debtEquity || 0,
      dividendYield: simplize.dividendYield || fundamental?.dividendYield || 0,
      quarterlyEPS: quarterlyRatios.length >= 2 ? quarterlyRatios : undefined,
      topNews,
      avgSentiment,
      vnIndex,
      adx: adxValue,
      adxTrend,
      momentum1W,
      momentum1M,
      momentum3M,
      w52position,
      w52high,
      w52low,
      foreignBuyVol,
      foreignSellVol,
      foreignNetVol,
      foreignRoom,
      support,
      resistance,
      support2,
      resistance2,
      reportPdfBase64: analystReport.pdfBase64 || undefined,
      reportTitle: analystReport.reportTitle || undefined,
      peg,
      rs30d,
      beta,
      forcedRecommendation: smartRecommendation,
    })

    if (noHolding) await saveCachedResult(symbol, result)
    return NextResponse.json(result)
  } catch (error) {
    const status = (error as { status?: number })?.status
    const rawMsg  = error instanceof Error ? error.message : 'Analysis failed'
    const isOverloaded = status === 529 || rawMsg.includes('overloaded')
    const isRateLimit  = status === 429
    const message = isOverloaded
      ? 'Claude API đang quá tải, vui lòng thử lại sau 30 giây'
      : isRateLimit
        ? 'Đã vượt giới hạn API, vui lòng thử lại sau 1 phút'
        : rawMsg
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
