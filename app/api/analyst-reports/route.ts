import { NextRequest, NextResponse } from 'next/server'

const VIETCAP_GRAPHQL = 'https://trading.vietcap.com.vn/data-mt/graphql'

const VIETCAP_HEADERS = {
  'Content-Type': 'application/json',
  'Origin': 'https://trading.vietcap.com.vn',
  'Referer': 'https://trading.vietcap.com.vn/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, */*',
  'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
}

export interface AnalystReport {
  id: string
  date: string
  title: string
  reportType: string
  url: string | null
}

function inferReportType(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('kqkd') || t.includes('kết quả') || t.includes('lợi nhuận quý') || t.includes('lnst')) {
    return 'Báo cáo KQKD'
  }
  if (t.includes('đhcđ') || t.includes('đại hội') || t.includes('kế hoạch')) return 'Báo cáo ĐHCĐ'
  if (t.includes('ngành') || t.includes('thị trường') || t.includes('macro')) return 'Thị Trường'
  if (t.includes('cập nhật') || t.includes('[mua') || t.includes('[khả quan') || t.includes('update')) {
    return 'Cập nhật'
  }
  return 'Doanh Nghiệp'
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json([])

  try {
    const query = `query { AnalysisReportFiles(ticker: "${symbol}", langCode: "vi") { date name link } }`
    const res = await fetch(VIETCAP_GRAPHQL, {
      method: 'POST',
      headers: VIETCAP_HEADERS,
      body: JSON.stringify({ query }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) return NextResponse.json([])

    const json = await res.json()
    if (json.errors || !json.data?.AnalysisReportFiles) return NextResponse.json([])

    const files = json.data.AnalysisReportFiles as { date: string; name: string; link: string }[]
    if (!Array.isArray(files) || files.length === 0) return NextResponse.json([])

    const reports: AnalystReport[] = files.map((f, i) => ({
      id: String(i),
      date: f.date || '',
      title: f.name || '',
      reportType: inferReportType(f.name || ''),
      url: f.link || null,
    }))

    return NextResponse.json(reports)
  } catch {
    return NextResponse.json([])
  }
}
