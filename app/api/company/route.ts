import { NextResponse } from 'next/server'
import type { CompanyData } from '@/types'

const VPS_QUOTE_URL = 'https://bgapidatafeed.vps.com.vn/getliststockdata'
const VPS_HISTORY_URL = 'https://histdatafeed.vps.com.vn/tradingview/history'
const VIETCAP_GRAPHQL = 'https://trading.vietcap.com.vn/data-mt/graphql'

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

const INDUSTRY_MAP: Record<string, string> = {
  FPT: 'Công nghệ', VNM: 'Thực phẩm & Đồ uống', VIC: 'Bất động sản',
  HPG: 'Thép', MWG: 'Bán lẻ', VHM: 'Bất động sản',
  TCB: 'Ngân hàng', BID: 'Ngân hàng', VCB: 'Ngân hàng', GAS: 'Dầu khí',
  MBB: 'Ngân hàng', ACB: 'Ngân hàng', STB: 'Ngân hàng', SSI: 'Chứng khoán',
  MSN: 'Hàng tiêu dùng', SAB: 'Đồ uống', PLX: 'Dầu khí',
  CTG: 'Ngân hàng', VPB: 'Ngân hàng', NLG: 'Bất động sản',
}

const EXCHANGE_MAP: Record<string, string> = {
  STO: 'HOSE', HNO: 'HNX', UPC: 'UPCOM',
}

const VIETCAP_HEADERS = {
  'Content-Type': 'application/json',
  'Origin': 'https://trading.vietcap.com.vn',
  'Referer': 'https://trading.vietcap.com.vn/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
}

interface VietcapRatio {
  yearReport: number
  lengthReport: number
  pe: number | null
  pb: number | null
  roe: number | null
  roa: number | null
  eps: number | null
  revenue: number | null
  netProfit: number | null
  revenueGrowth: number | null
  de: number | null
  dividend: number | null
}

async function fetchVietcapRatios(symbol: string): Promise<VietcapRatio[]> {
  const query = `query {
    CompanyFinancialRatio(ticker: "${symbol}", period: "ANNUAL") {
      ratio { yearReport lengthReport pe pb roe roa eps revenue netProfit revenueGrowth de dividend }
    }
  }`

  const res = await fetch(VIETCAP_GRAPHQL, {
    method: 'POST',
    headers: VIETCAP_HEADERS,
    body: JSON.stringify({ query }),
    next: { revalidate: 3600 },
  })

  if (!res.ok) throw new Error(`Vietcap HTTP ${res.status}`)
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0]?.message || 'GraphQL error')
  return json?.data?.CompanyFinancialRatio?.ratio ?? []
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol')?.toUpperCase()

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 })
  }

  try {
    const toTs = Math.floor(Date.now() / 1000)
    const fromTs = toTs - 370 * 86400

    const [quoteRes, histRes, ratios] = await Promise.all([
      fetch(`${VPS_QUOTE_URL}/${symbol}`, { next: { revalidate: 60 } }),
      fetch(`${VPS_HISTORY_URL}?symbol=${symbol}&resolution=D&from=${fromTs}&to=${toTs}`, {
        next: { revalidate: 3600 },
      }),
      fetchVietcapRatios(symbol).catch(() => [] as VietcapRatio[]),
    ])

    const quoteJson = quoteRes.ok ? await quoteRes.json() : []
    const q = Array.isArray(quoteJson) ? quoteJson[0] : quoteJson

    // 52-week high/low from VPS history
    let high52w = 0
    let low52w = 0
    if (histRes.ok) {
      const h = await histRes.json()
      if (h.s === 'ok' && h.h && h.l && h.h.length > 0) {
        high52w = Math.max(...h.h) * 1000
        low52w = Math.min(...h.l) * 1000
      }
    }

    // Filter full-year annual reports (lengthReport === 4), newest first, last 4 years
    const annualRatios = ratios
      .filter((r) => r.lengthReport === 4)
      .sort((a, b) => b.yearReport - a.yearReport)
      .slice(0, 4)

    // Build yearly array oldest→newest for chart
    const yearly = annualRatios
      .slice()
      .reverse()
      .map((r, i, arr) => {
        const prev = arr[i - 1]
        const rawGrowth =
          prev && prev.netProfit && r.netProfit && prev.netProfit !== 0
            ? (r.netProfit - prev.netProfit) / Math.abs(prev.netProfit)
            : (r.revenueGrowth ?? 0)

        return {
          year: r.yearReport,
          revenue: (r.revenue ?? 0) / 1e9,           // VND → tỷ
          netIncome: (r.netProfit ?? 0) / 1e9,        // VND → tỷ
          eps: r.eps ?? 0,
          roe: (r.roe ?? 0) * 100,                    // decimal → %
          roa: (r.roa ?? 0) * 100,
          debtEquity: r.de ?? 0,
          pe: r.pe ?? 0,
          pb: r.pb ?? 0,
          dividendYield: (r.dividend ?? 0) * 100,
          revenueGrowth: (r.revenueGrowth ?? 0) * 100,
          profitGrowth: rawGrowth * 100,
        }
      })

    // Current ratios from most recent annual report
    const latest = annualRatios[0]
    const currentRatios = latest
      ? {
          pe: latest.pe ?? 0,
          pb: latest.pb ?? 0,
          roe: (latest.roe ?? 0) * 100,
          roa: (latest.roa ?? 0) * 100,
          debtEquity: latest.de ?? 0,
        }
      : { pe: 0, pb: 0, roe: 0, roa: 0, debtEquity: 0 }

    const result: CompanyData = {
      symbol,
      companyName: COMPANY_NAMES[symbol] || symbol,
      industry: INDUSTRY_MAP[symbol] || '',
      exchange: (q && EXCHANGE_MAP[q.marketId]) || 'HOSE',
      overview: {
        marketCap: 0,
        sharesOutstanding: 0,
        high52w,
        low52w,
      },
      yearly: yearly.length > 0
        ? yearly
        : [{
            year: new Date().getFullYear(),
            revenue: 0, netIncome: 0, eps: 0, roe: 0, roa: 0,
            debtEquity: 0, pe: 0, pb: 0, dividendYield: 0,
            revenueGrowth: 0, profitGrowth: 0,
          }],
      currentRatios,
      tcbsRating: 0,
      tcbsRecommend: 'N/A',
    }

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch company data'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
