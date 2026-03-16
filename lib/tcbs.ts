import type { QuoteData, CandleData, FundamentalData } from '@/types'

// VPS public APIs (no auth required)
const VPS_QUOTE_URL = 'https://bgapidatafeed.vps.com.vn/getliststockdata'
const VPS_HISTORY_URL = 'https://histdatafeed.vps.com.vn/tradingview/history'
const VIETCAP_GRAPHQL = 'https://trading.vietcap.com.vn/data-mt/graphql'
const FETCH_TIMEOUT = 12000

// Browser-like headers required to bypass Vietcap WAF
const VIETCAP_HEADERS = {
  'Content-Type': 'application/json',
  'Origin': 'https://trading.vietcap.com.vn',
  'Referer': 'https://trading.vietcap.com.vn/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
}

function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  return fetch(url, { signal: controller.signal, ...options }).finally(() => clearTimeout(timeout))
}

// Vietnamese company name mapping
const COMPANY_NAMES: Record<string, string> = {
  FPT: 'FPT Corporation', VNM: 'Vinamilk', VIC: 'Vingroup',
  HPG: 'Hòa Phát Group', MWG: 'Thế Giới Di Động', VHM: 'Vinhomes',
  TCB: 'Techcombank', BID: 'BIDV', VCB: 'Vietcombank', GAS: 'PV GAS',
  MBB: 'MB Bank', ACB: 'ACB', STB: 'Sacombank', SSI: 'SSI Securities',
  MSN: 'Masan Group', SAB: 'Sabeco', PLX: 'Petrolimex',
  CTG: 'VietinBank', VPB: 'VPBank', NLG: 'Nam Long Group',
  NVL: 'Novaland', PDR: 'Phát Đạt', KDH: 'Khang Điền',
  DGC: 'Đức Giang Chemicals', REE: 'REE Corporation', SHB: 'SHB',
  HDB: 'HDBank', EIB: 'Eximbank', PNJ: 'PNJ', DPM: 'Đạm Phú Mỹ',
}

const EXCHANGE_MAP: Record<string, string> = {
  STO: 'HOSE', HNO: 'HNX', UPC: 'UPCOM',
}

export async function fetchQuote(symbol: string): Promise<QuoteData> {
  const ticker = symbol.toUpperCase()

  // Fetch quote and 365-day history in parallel (history for 52w high/low)
  const toTs = Math.floor(Date.now() / 1000)
  const fromTs = toTs - 370 * 86400

  const [quoteRes, histRes] = await Promise.all([
    fetchWithTimeout(`${VPS_QUOTE_URL}/${ticker}`),
    fetchWithTimeout(`${VPS_HISTORY_URL}?symbol=${ticker}&resolution=D&from=${fromTs}&to=${toTs}`).catch(() => null),
  ])

  if (!quoteRes.ok) {
    throw new Error(`Failed to fetch quote for ${ticker} (HTTP ${quoteRes.status})`)
  }

  const quoteJson = await quoteRes.json()
  const q = Array.isArray(quoteJson) ? quoteJson[0] : quoteJson

  if (!q || !q.sym) {
    throw new Error(`No data found for symbol ${ticker}`)
  }

  // VPS prices are in thousands VND — multiply by 1000
  const price = (q.lastPrice || 0) * 1000
  const refPrice = (q.r || 0) * 1000
  const change = price - refPrice
  const changePct = refPrice > 0 ? (change / refPrice) * 100 : 0

  // 52-week high/low from history
  let high52w = price
  let low52w = price
  if (histRes && histRes.ok) {
    const h = await histRes.json()
    if (h.s === 'ok' && h.h && h.l && h.h.length > 0) {
      high52w = Math.max(...h.h) * 1000
      low52w = Math.min(...h.l) * 1000
    }
  }

  return {
    symbol: ticker,
    name: COMPANY_NAMES[ticker] || ticker,
    price,
    change,
    changePct,
    volume: q.lot || q.lastVolume || 0,
    high52w,
    low52w,
    marketCap: 0,
    exchange: EXCHANGE_MAP[q.marketId] || 'HOSE',
    industry: '',
    timestamp: new Date().toISOString(),
    // Foreign investor flows from VPS
    foreignBuyVol: q.fBVol || 0,
    foreignSellVol: q.fSVol || 0,
    foreignRoom: typeof q.fRoom === 'number' ? q.fRoom : undefined,
  }
}

export async function fetchHistory(
  symbol: string,
  days: number = 90,
  customFromTs?: number,
  customToTs?: number
): Promise<CandleData[]> {
  const ticker = symbol.toUpperCase()
  const toTs = customToTs ?? Math.floor(Date.now() / 1000)
  const fromTs = customFromTs ?? (toTs - days * 86400)

  const res = await fetchWithTimeout(
    `${VPS_HISTORY_URL}?symbol=${ticker}&resolution=D&from=${fromTs}&to=${toTs}`
  )

  if (!res.ok) {
    throw new Error(`Failed to fetch history for ${ticker} (HTTP ${res.status})`)
  }

  const json = await res.json()
  if (json.s !== 'ok' || !json.t || json.t.length === 0) {
    return []
  }

  return json.t.map((ts: number, i: number) => ({
    time: new Date(ts * 1000).toISOString().split('T')[0],
    open: (json.o[i] || 0) * 1000,
    high: (json.h[i] || 0) * 1000,
    low: (json.l[i] || 0) * 1000,
    close: (json.c[i] || 0) * 1000,
    volume: json.v[i] || 0,
  }))
}

interface VietcapRatioItem {
  yearReport: number
  lengthReport: number
  pe: number | null
  eps: number | null
  roe: number | null
  roa: number | null
  revenue: number | null
  netProfit: number | null
  revenueGrowth: number | null
  de: number | null
  dividend: number | null
}

export async function fetchFundamental(
  symbol: string
): Promise<FundamentalData> {
  const ticker = symbol.toUpperCase()

  const query = `query {
    CompanyFinancialRatio(ticker: "${ticker}", period: "ANNUAL") {
      ratio { yearReport lengthReport pe eps roe roa revenue netProfit revenueGrowth de dividend }
    }
  }`

  try {
    const res = await fetchWithTimeout(VIETCAP_GRAPHQL, {
      method: 'POST',
      headers: VIETCAP_HEADERS,
      body: JSON.stringify({ query }),
    })

    if (!res.ok) throw new Error(`Vietcap HTTP ${res.status}`)

    const json = await res.json()
    if (json.errors) throw new Error('GraphQL error')

    const ratios: VietcapRatioItem[] = json?.data?.CompanyFinancialRatio?.ratio ?? []

    // Filter full-year annual reports (lengthReport === 4), newest first
    const annual = ratios
      .filter((r) => r.lengthReport === 4)
      .sort((a, b) => b.yearReport - a.yearReport)

    if (annual.length === 0) throw new Error('No annual data')

    const latest = annual[0]
    const prev = annual[1]

    // Profit growth from two consecutive years
    const profitGrowth =
      prev && prev.netProfit && latest.netProfit && prev.netProfit !== 0
        ? ((latest.netProfit - prev.netProfit) / Math.abs(prev.netProfit)) * 100
        : (latest.revenueGrowth ?? 0) * 100

    return {
      pe: latest.pe ?? 0,
      eps: latest.eps ?? 0,
      // Vietcap ratios are decimals (0.28 = 28%) → convert to %
      roe: (latest.roe ?? 0) * 100,
      roa: (latest.roa ?? 0) * 100,
      debtEquity: latest.de ?? 0,
      revenueGrowth: (latest.revenueGrowth ?? 0) * 100,
      profitGrowth,
      dividendYield: (latest.dividend ?? 0) * 100,
      bookValue: 0,
      tcbsRating: 0,
      tcbsRecommend: 'N/A',
    }
  } catch {
    // Fallback to zeros if Vietcap unavailable
    return {
      pe: 0, eps: 0, roe: 0, roa: 0, debtEquity: 0,
      revenueGrowth: 0, profitGrowth: 0, dividendYield: 0,
      bookValue: 0, tcbsRating: 0, tcbsRecommend: 'N/A',
    }
  }
}
