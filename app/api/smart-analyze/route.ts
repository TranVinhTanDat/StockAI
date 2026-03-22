import { NextRequest, NextResponse } from 'next/server'
import { calculateSmartScore, type SmartScoreInput } from '@/lib/smartScore'

export const maxDuration = 30

// Fetch VPS quote — full fields
async function fetchQuote(symbol: string) {
  try {
    const res = await fetch(
      `https://bgapidatafeed.vps.com.vn/getliststockdata/${symbol}`,
      { signal: AbortSignal.timeout(4000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const item = Array.isArray(data) ? data[0] : data
    if (!item) return null
    return {
      price: (Number(item.lastPrice || item.r || 0)) * 1000,
      changePct: Number(item.percentChange || item.changePct || item.pcp || 0),
      high52w: (Number(item['52WeekHigh'] || item.h52 || 0)) * 1000,
      low52w: (Number(item['52WeekLow'] || item.l52 || 0)) * 1000,
      foreignBuyVol: Number(item.fBVol || item.fBuyVol || item.foreignBuyVol || 0),
      foreignSellVol: Number(item.fSVolume || item.fSellVol || item.foreignSellVol || 0),
      foreignRoom: Number(item.fRoom || item.foreignRoom || 0),
      industry: String(item.industryName || item.industry || ''),
      name: String(item.stockName || item.name || symbol),
      volume: Number(item.lot || item.nmVolume || item.totalVolume || item.volume || 0),
      marketCap: Number(item.marketCap || 0) * 1_000_000,
      exchange: String(item.floorCode || item.marketId || item.mc || item.exchange || ''),
      openPrice: (Number(item.ot || item.openPrice || 0)) * 1000,   // VPS: ot = open today
      highPrice: (Number(item.hp || item.highPrice || 0)) * 1000,   // VPS: hp = high today
      lowPrice:  (Number(item.lp || item.lowPrice  || 0)) * 1000,   // VPS: lp = low today
    }
  } catch { return null }
}

// Sentiment keywords (inline — avoids cross-route import)
const SENT_POS = ['tăng', 'lợi nhuận', 'tăng trưởng', 'kỷ lục', 'vượt kế hoạch', 'chia cổ tức', 'mua vào', 'nâng hạng', 'tích cực', 'đột phá', 'phục hồi', 'khả quan', 'cao nhất', 'bứt phá', 'xuất sắc']
const SENT_NEG = ['giảm', 'lỗ', 'khó khăn', 'rủi ro', 'bán tháo', 'hạ hạng', 'cảnh báo', 'vi phạm', 'sụt giảm', 'tiêu cực', 'thua lỗ', 'khủng hoảng', 'thoái vốn']

function sentimentScore(text: string): number {
  const lower = text.toLowerCase()
  let pos = 0, neg = 0
  for (const w of SENT_POS) if (lower.includes(w)) pos++
  for (const w of SENT_NEG) if (lower.includes(w)) neg++
  const total = pos + neg
  return total === 0 ? 50 : Math.round(((pos - neg) / total) * 50 + 50)
}

// Fetch company news sentiment from CafeF + Vietcap AI
async function fetchNewsSentiment(symbol: string): Promise<{ avgSentiment: number; news: Array<{ title: string; sentiment: number }> }> {
  const results: Array<{ title: string; sentiment: number }> = []

  await Promise.all([
    // CafeF company news
    (async () => {
      try {
        const res = await fetch(
          `https://cafef.vn/du-lieu/Ajax/Events_RelatedNews_New.aspx?symbol=${symbol}&floorID=0&configID=0&PageIndex=1&PageSize=20&Type=0`,
          { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://cafef.vn/', 'X-Requested-With': 'XMLHttpRequest' }, signal: AbortSignal.timeout(5000) }
        )
        if (!res.ok) return
        const html = await res.text()
        const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/g
        let m
        while ((m = liRegex.exec(html)) !== null && results.length < 12) {
          const lm = m[1].match(/<a[^>]*class=['"]docnhanhTitle['"][^>]*title=['"]([^'"]+)['"]/)
          if (lm) {
            const title = lm[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
            if (title.length > 5) results.push({ title, sentiment: sentimentScore(title) })
          }
        }
      } catch { /* ignore */ }
    })(),

    // Vietcap AI company news (has Positive/Negative labels — more accurate)
    (async () => {
      try {
        const res = await fetch(
          `https://ai.vietcap.com.vn/api/v3/news_info?language=vi&page=1&page_size=15&ticker=${symbol}`,
          { headers: { 'Origin': 'https://trading.vietcap.com.vn', 'Referer': 'https://trading.vietcap.com.vn/', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
        )
        if (!res.ok) return
        const json = await res.json()
        const items: Array<{ news_title?: string; sentiment?: string }> = Array.isArray(json.news_info) ? json.news_info : []
        for (const item of items.slice(0, 12)) {
          if (!item.news_title) continue
          const s = item.sentiment === 'Positive' ? 72 : item.sentiment === 'Negative' ? 28 : sentimentScore(item.news_title)
          results.push({ title: item.news_title, sentiment: s })
        }
      } catch { /* ignore */ }
    })(),
  ])

  if (results.length === 0) return { avgSentiment: 50, news: [] }
  const avgSentiment = Math.round(results.reduce((s, r) => s + r.sentiment, 0) / results.length)
  return { avgSentiment, news: results.slice(0, 15) }
}

// Fetch VPS weekly history for multi-timeframe analysis
async function fetchWeeklyHistory(symbol: string, weeks = 60) {
  try {
    const to = Math.floor(Date.now() / 1000)
    const from = to - weeks * 7 * 86400
    const res = await fetch(
      `https://histdatafeed.vps.com.vn/tradingview/history?symbol=${symbol}&resolution=W&from=${from}&to=${to}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null
    const d = await res.json()
    if (!d.c || d.c.length < 10) return null
    return {
      closes: (d.c as number[]).map((v: number) => v * 1000),
      highs:  (d.h as number[]).map((v: number) => v * 1000),
      lows:   (d.l as number[]).map((v: number) => v * 1000),
    }
  } catch { return null }
}

// Fetch VPS price history — return raw OHLCV + timestamps
async function fetchHistory(symbol: string, days = 265) {
  try {
    const to = Math.floor(Date.now() / 1000)
    const from = to - days * 86400
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
      timestamps: d.t as number[],
    }
  } catch { return null }
}

// Fetch VN-Index context
async function fetchVNIndex(): Promise<{ trend30d: number; currentLevel: number; rsi: number }> {
  try {
    const to = Math.floor(Date.now() / 1000)
    const from = to - 40 * 86400
    const res = await fetch(
      `https://histdatafeed.vps.com.vn/tradingview/history?symbol=VNINDEX&resolution=D&from=${from}&to=${to}`,
      { signal: AbortSignal.timeout(4000) }
    )
    if (!res.ok) return { trend30d: 0, currentLevel: 0, rsi: 50 }
    const d = await res.json()
    if (!d.c || d.c.length < 5) return { trend30d: 0, currentLevel: 0, rsi: 50 }
    const closes: number[] = d.c
    const first = closes[0], last = closes[closes.length - 1]
    const trend30d = first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : 0
    const period = 14
    if (closes.length < period + 1) return { trend30d, currentLevel: Math.round(last), rsi: 50 }
    const changes = closes.slice(1).map((c, i) => c - closes[i])
    let avgGain = 0, avgLoss = 0
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) avgGain += changes[i]; else avgLoss += Math.abs(changes[i])
    }
    avgGain /= period; avgLoss /= period
    for (let i = period; i < changes.length; i++) {
      avgGain = (avgGain * (period - 1) + Math.max(0, changes[i])) / period
      avgLoss = (avgLoss * (period - 1) + Math.abs(Math.min(0, changes[i]))) / period
    }
    const rsi = avgLoss === 0 ? 100 : Math.round(100 - 100 / (1 + avgGain / avgLoss))
    return { trend30d, currentLevel: Math.round(last), rsi }
  } catch { return { trend30d: 0, currentLevel: 0, rsi: 50 } }
}

// Fetch Simplize fundamentals
async function fetchFundamentals(symbol: string) {
  try {
    const res = await fetch(
      `https://api.simplize.vn/api/company/summary/${symbol}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://simplize.vn/' },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!res.ok) return null
    const d = await res.json()
    const s = d?.data || d
    return {
      pe: Number(s?.peRatio || 0),
      pb: Number(s?.pbRatio || 0),
      roe: Number(s?.roe || 0),
      roa: Number(s?.roa || 0),
      eps: Number(s?.epsRatio || 0),
      netMargin: Number(s?.netProfitMargin || s?.netMarginRatio || 0),
      dividendYield: Number(s?.dividendYield || s?.dividendRatio || 0),
      debtEquity: Number(s?.deRatio || s?.debtToEquity || 0),
      industry: String(s?.industryActivity || s?.industry || ''),
    }
  } catch { return null }
}

// Fetch CafeF KeHoachKinhDoanh — returns growth + business plan in one call
async function fetchGrowthAndPlan(symbol: string): Promise<{
  revenueGrowth: number
  profitGrowth: number
  businessPlan: { year: number; revenueTarget: number; revenueActual: number; profitTarget: number; profitActual: number } | null
}> {
  try {
    const res = await fetch(
      `https://cafef.vn/du-lieu/Ajax/PageNew/KeHoachKinhDoanh.ashx?Symbol=${symbol}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://cafef.vn/' },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!res.ok) return { revenueGrowth: 0, profitGrowth: 0, businessPlan: null }
    const data = await res.json()
    const inner = data?.Data || data?.data || data
    let yearEntries: Array<{ Year: number; Values: Array<{ Name: string; Value: string }> }> = []
    if (Array.isArray(inner)) yearEntries = inner
    else if (Array.isArray(inner?.ListYear)) yearEntries = inner.ListYear
    else if (inner?.Year) yearEntries = [inner]
    yearEntries.sort((a, b) => b.Year - a.Year)

    const REVENUE_NAMES = ['Doanh thu', 'Tổng doanh thu', 'Tổng thu nhập hoạt động', 'Tổng thu nhập thuần', 'Tổng thu nhập', 'Thu nhập lãi và tương đương', 'Thu nhập lãi thuần', 'Thu nhập lãi', 'Tổng thu']
    const PROFIT_NAMES = ['Lợi nhuận trước thuế', 'Lợi nhuận sau thuế', 'LNTT', 'LNST', 'Tổng Lợi nhuận trước thuế']
    const findVal = (entry: typeof yearEntries[0], names: string[]): number => {
      for (const name of names) {
        const item = (entry.Values || []).find(v => v.Name?.includes(name))
        if (item?.Value && item.Value !== 'N/A') {
          const n = parseFloat(String(item.Value).replace(/\./g, '').replace(',', '.'))
          if (!isNaN(n) && n > 0) return n
        }
      }
      return 0
    }

    // Growth: compare latest 2 years
    let revenueGrowth = 0, profitGrowth = 0
    if (yearEntries.length >= 2) {
      const curr = yearEntries[0], prev = yearEntries[1]
      const currRev = findVal(curr, REVENUE_NAMES), prevRev = findVal(prev, REVENUE_NAMES)
      const currProfit = findVal(curr, PROFIT_NAMES), prevProfit = findVal(prev, PROFIT_NAMES)
      revenueGrowth = prevRev > 0 && currRev > 0 ? Math.round(((currRev - prevRev) / prevRev) * 1000) / 10 : 0
      profitGrowth = prevProfit !== 0 && currProfit !== 0 ? Math.round(((currProfit - prevProfit) / Math.abs(prevProfit)) * 1000) / 10 : 0
    }

    // Business plan: latest year target vs actual
    let businessPlan = null
    if (yearEntries.length >= 1) {
      const curr = yearEntries[0]
      const revenueTarget = findVal(curr, ['KH Doanh thu', 'Kế hoạch doanh thu', 'DT kế hoạch'])
      const revenueActual = findVal(curr, ['Doanh thu', 'Thực hiện doanh thu', 'DT thực hiện', 'Tổng doanh thu'])
      const profitTarget = findVal(curr, ['KH Lợi nhuận', 'Kế hoạch lợi nhuận', 'LN kế hoạch', 'KH LNTT'])
      const profitActual = findVal(curr, ['Lợi nhuận trước thuế', 'LNTT thực hiện', 'Lợi nhuận sau thuế', 'LNST'])
      if (profitTarget > 0 || revenueTarget > 0) {
        businessPlan = { year: curr.Year, revenueTarget, revenueActual, profitTarget, profitActual }
      }
    }

    return { revenueGrowth, profitGrowth, businessPlan }
  } catch { return { revenueGrowth: 0, profitGrowth: 0, businessPlan: null } }
}

// Fetch quarterly EPS from CafeF ChiSoTaiChinh
// Note: API returns rows per quarter (ReportDate, EPS, PriceToEarning fields)
async function fetchQuarterlyEPS(symbol: string): Promise<Array<{ period: string; eps: number; pe: number }>> {
  try {
    const res = await fetch(
      `https://cafef.vn/du-lieu/Ajax/PageNew/ChiSoTaiChinh.ashx?Symbol=${symbol}&TotalRow=8&ReportType=Q&Sort=DESC`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://cafef.vn/' },
        signal: AbortSignal.timeout(4000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    // Try multiple possible structures
    const rows: Array<Record<string, unknown>> =
      data?.Data?.Data || data?.data?.Data || data?.Data || data?.data || []
    if (!Array.isArray(rows) || rows.length === 0) return []
    // If first row has ReportDate/EPS-style fields → quarterly rows format
    if (rows[0] && (rows[0].ReportDate || rows[0].reportDate || rows[0].Quarter)) {
      return rows.slice(0, 8).map(r => ({
        period: String(r.ReportDate || r.Quarter || r.reportDate || ''),
        eps: Number(r.EPS || r.eps || r.EpsPerShare || 0),
        pe: Number(r.PriceToEarning || r.PE || r.pe || 0),
      })).filter(r => r.period && (r.eps !== 0 || r.pe !== 0))
    }
    return []
  } catch { return [] }
}

// Fetch annual EPS from CafeF ChiSoTaiChinh (ReportType=Y) for YoY profit growth
async function fetchAnnualEPS(symbol: string): Promise<Array<{ year: number; eps: number }>> {
  try {
    const res = await fetch(
      `https://cafef.vn/du-lieu/Ajax/PageNew/ChiSoTaiChinh.ashx?Symbol=${symbol}&TotalRow=5&ReportType=Y&Sort=DESC`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://cafef.vn/' },
        signal: AbortSignal.timeout(4000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    const rows: Array<Record<string, unknown>> =
      data?.Data?.Data || data?.data?.Data || data?.Data || data?.data || []
    if (!Array.isArray(rows) || rows.length === 0) return []
    return rows.slice(0, 5).map(r => ({
      year: Number(r.Year || r.year || r.ReportDate || 0),
      eps: Number(r.EPS || r.eps || r.EpsPerShare || 0),
    })).filter(r => r.year > 2000 && r.eps !== 0)
  } catch { return [] }
}


export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'Missing symbol' }, { status: 400 })

  try {
    // Fetch all data in parallel — no Claude API
    const [quote, history, weeklyHistory, vnIndex, fund, growthAndPlan, quarterlyEPS, annualEPS, newsSentiment] = await Promise.all([
      fetchQuote(symbol),
      fetchHistory(symbol),
      fetchWeeklyHistory(symbol),
      fetchVNIndex(),
      fetchFundamentals(symbol),
      fetchGrowthAndPlan(symbol),
      fetchQuarterlyEPS(symbol),
      fetchAnnualEPS(symbol),
      fetchNewsSentiment(symbol),
    ])
    const growth = { revenueGrowth: growthAndPlan.revenueGrowth, profitGrowth: growthAndPlan.profitGrowth }
    const businessPlan = growthAndPlan.businessPlan

    if (!quote) return NextResponse.json({ error: `Không tìm thấy mã ${symbol}` }, { status: 404 })
    if (!history) return NextResponse.json({ error: `Không đủ dữ liệu lịch sử cho ${symbol}` }, { status: 400 })

    // ── Compute profitGrowth — prefer quarterly EPS trailing 4Q, then annual EPS YoY ──
    let computedProfitGrowth = growth.profitGrowth
    // 1. Quarterly EPS: trailing 4Q vs prior 4Q (most accurate)
    if (quarterlyEPS.length >= 4) {
      const epsVals = quarterlyEPS.map(q => q.eps).filter(e => e !== 0)
      if (epsVals.length >= 8) {
        const t4 = epsVals.slice(0, 4).reduce((a, b) => a + b, 0)
        const p4 = epsVals.slice(4, 8).reduce((a, b) => a + b, 0)
        if (p4 !== 0) computedProfitGrowth = Math.round(((t4 - p4) / Math.abs(p4)) * 1000) / 10
      } else if (epsVals.length >= 4 && computedProfitGrowth === 0) {
        const latestEPS = epsVals[0], yearAgoEPS = epsVals[Math.min(3, epsVals.length - 1)]
        if (yearAgoEPS !== 0) computedProfitGrowth = Math.round(((latestEPS - yearAgoEPS) / Math.abs(yearAgoEPS)) * 1000) / 10
      }
    }
    // 2. Annual EPS YoY fallback (when quarterly data unavailable or returns 0)
    if (computedProfitGrowth === 0 && annualEPS.length >= 2) {
      const sorted = [...annualEPS].sort((a, b) => b.year - a.year)
      const curr = sorted[0].eps, prev = sorted[1].eps
      if (prev !== 0 && curr !== 0) computedProfitGrowth = Math.round(((curr - prev) / Math.abs(prev)) * 1000) / 10
    }

    // ── Compute 52W high/low — use VPS quote (true 52W) + history (38W) for max accuracy ──
    // VPS provides true 52-week high/low from exchange data. History covers only ~38 trading weeks.
    // Take the wider range: highest of both highs, lowest of both lows.
    const histHigh = history ? Math.max(...history.highs) : 0
    const histLow  = history ? Math.min(...history.lows)  : 0
    const w52high = Math.max(quote.high52w || 0, histHigh)
    const w52low  = Math.min(
      quote.low52w  > 0 ? quote.low52w : histLow,
      histLow > 0 ? histLow : (quote.low52w || 0)
    )

    // ── Industry: prefer Simplize (has sector name), fallback to VPS ──────────
    const industry = fund?.industry || quote.industry || ''

    // ── Business plan achievement % (bonus for companies exceeding targets) ───
    const businessPlanPct = businessPlan && businessPlan.profitTarget > 0 && businessPlan.profitActual > 0
      ? Math.round((businessPlan.profitActual / businessPlan.profitTarget) * 100)
      : undefined

    const input: SmartScoreInput = {
      symbol,
      industry,
      price: quote.price,
      changePct: quote.changePct,
      closes: history.closes,
      highs: history.highs,
      lows: history.lows,
      volumes: history.volumes,
      pe: fund?.pe ?? 0,
      pb: fund?.pb ?? 0,
      roe: fund?.roe ?? 0,
      roa: fund?.roa ?? 0,
      eps: fund?.eps ?? 0,
      profitGrowth: computedProfitGrowth,
      revenueGrowth: growth.revenueGrowth,
      debtEquity: fund?.debtEquity ?? 0,
      dividendYield: fund?.dividendYield ?? 0,
      netMargin: fund?.netMargin ?? 0,
      quarterlyEPS,
      businessPlanPct,
      w52high,
      w52low,
      foreignBuyVol: quote.foreignBuyVol,
      foreignSellVol: quote.foreignSellVol,
      foreignRoom: quote.foreignRoom,
      avgSentiment: newsSentiment.avgSentiment,
      news: newsSentiment.news,
      vnIndex,
      weeklyCloses: weeklyHistory?.closes,
      weeklyHighs:  weeklyHistory?.highs,
      weeklyLows:   weeklyHistory?.lows,
    }

    const result = calculateSmartScore(input)

    return NextResponse.json({
      ...result,
      stockName: quote.name,
      exchange: quote.exchange,
      volume: quote.volume,
      marketCap: quote.marketCap,
      openPrice: quote.openPrice,
      highPrice: quote.highPrice,
      lowPrice: quote.lowPrice,
      w52high,
      w52low,
      vnIndexLevel: vnIndex.currentLevel,
      vnIndexTrend: vnIndex.trend30d,
      vnIndexRsi: vnIndex.rsi,
      quarterlyEPS,
      businessPlan,
      // Raw historical data for advanced technical calculations in the component
      historicalData: {
        closes: history.closes,
        highs: history.highs,
        lows: history.lows,
        volumes: history.volumes,
        timestamps: history.timestamps,
      },
      // Extended fundamentals
      pe: fund?.pe ?? 0,
      pb: fund?.pb ?? 0,
      roe: fund?.roe ?? 0,
      roa: fund?.roa ?? 0,
      eps: fund?.eps ?? 0,
      netMargin: fund?.netMargin ?? 0,
      dividendYield: fund?.dividendYield ?? 0,
      debtEquity: fund?.debtEquity ?? 0,
      revenueGrowth: growth.revenueGrowth,
      profitGrowth: computedProfitGrowth,
      changePct: quote.changePct,
      weeklyTrend: result.weeklyTrend,
      weeklyRsi: result.weeklyRsi,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
