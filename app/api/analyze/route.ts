import { NextRequest, NextResponse } from 'next/server'
import { analyzeStock } from '@/lib/claude'
import { createClient } from '@supabase/supabase-js'
import { verifyToken } from '@/lib/jwt'

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
    const { symbol, quote, indicators, fundamental, news, currentHolding, forceRefresh } = body

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

    // Check shared cache (only for analyses without portfolio context, and not forced refresh)
    const noHolding = !currentHolding
    const cached = !forceRefresh && await getCachedResult(symbol, noHolding)
    if (cached) return NextResponse.json({ ...cached, _cached: true })

    const result = await analyzeStock({
      symbol,
      price: quote?.price || 0,
      currentHolding: currentHolding || null,
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

    if (noHolding) await saveCachedResult(symbol, result)
    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
