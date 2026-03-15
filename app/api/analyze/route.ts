import { NextRequest, NextResponse } from 'next/server'
import { analyzeStock } from '@/lib/claude'
import { createClient } from '@supabase/supabase-js'
import { verifyToken } from '@/lib/jwt'
import { calcRSI, calcADX } from '@/lib/indicators'

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
    .single()
  return data?.data ?? null
}

async function saveCachedResult(symbol: string, result: unknown) {
  const sb = getServerSupabase()
  if (!sb) return
  const now = new Date()
  const vnHour = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })).getHours()
  // During market hours (8-16), cache 4h; otherwise cache 20h
  const ttlHours = (vnHour >= 8 && vnHour < 16) ? 4 : 20
  const expiresAt = new Date(now.getTime() + ttlHours * 3600_000).toISOString()
  await sb.from('analysis_cache').insert({ symbol, data: result, expires_at: expiresAt })
}

// Fetch Simplize for ROA/ROE/PB (more accurate than CafeF)
async function fetchSimplizeSummary(symbol: string): Promise<{ roa: number; pb: number }> {
  try {
    const res = await fetch(`https://api.simplize.vn/api/company/summary/${symbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://simplize.vn/' },
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
      `https://histdatafeed.vps.com.vn/tradingview/history?symbol=VNINDEX&resolution=D&from=${from}&to=${to}`
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

    // ADX (trend strength) from highs/lows/closes
    const closesArr: number[] = Array.isArray(closes) ? closes.filter((v: number) => !isNaN(v)) : []
    const highsArr: number[] = Array.isArray(highs) ? highs.filter((v: number) => !isNaN(v)) : []
    const lowsArr: number[] = Array.isArray(lows) ? lows.filter((v: number) => !isNaN(v)) : []
    let adxValue = 0
    let adxTrend = 'Không rõ xu hướng'
    if (highsArr.length >= 28 && lowsArr.length >= 28 && closesArr.length >= 28) {
      const adxArr = calcADX(highsArr, lowsArr, closesArr, 14).filter((v: number) => !isNaN(v))
      if (adxArr.length > 0) {
        adxValue = Math.round(adxArr[adxArr.length - 1])
        adxTrend = adxValue >= 25 ? 'Xu hướng MẠNH' : adxValue >= 15 ? 'Xu hướng YẾU' : 'SIDEWAY (không có xu hướng)'
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

    // Fetch enrichment data in parallel (Simplize + VN-Index)
    const [simplize, vnIndex] = await Promise.all([
      fetchSimplizeSummary(symbol),
      fetchVNIndexContext(),
    ])

    const result = await analyzeStock({
      symbol,
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
      pe: fundamental?.pe || 0,
      eps: fundamental?.eps || 0,
      roe: fundamental?.roe || 0,
      roa: simplize.roa,
      pb: simplize.pb,
      revenueGrowth: fundamental?.revenueGrowth || 0,
      profitGrowth: fundamental?.profitGrowth || 0,
      debtEquity: fundamental?.debtEquity || 0,
      dividendYield: fundamental?.dividendYield || 0,
      tcbsRating: fundamental?.tcbsRating || 0,
      tcbsRecommend: fundamental?.tcbsRecommend || 'N/A',
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
    })

    if (noHolding) await saveCachedResult(symbol, result)
    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
