import { NextRequest, NextResponse } from 'next/server'

const CAFEF_BASE = 'https://cafef.vn/du-lieu/Ajax/PageNew'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://cafef.vn/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

async function cafefFetch(path: string): Promise<AnyObj> {
  const url = `${CAFEF_BASE}/${path}`
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`CafeF HTTP ${res.status}: ${path}`)
  const text = await res.text()
  try { return JSON.parse(text) } catch { return null }
}

function parseDotNetDate(d: string): string {
  if (!d) return ''
  const m = String(d).match(/\/Date\((\d+)\)\//)
  if (m) return new Date(parseInt(m[1])).toISOString().split('T')[0]
  return d
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

export interface CafefReport {
  id: string
  title: string
  date: string
  source: string
  url: string
  recommendation: string
  targetPrice: number
  summary: string
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json([])

  try {
    const data = await cafefFetch(`BaoCaoPhanTich.ashx?Symbol=${symbol}&PageIndex=1&PageSize=15`)
    if (!data) return NextResponse.json([])

    const arr: AnyObj[] = (data.Data && Array.isArray(data.Data)) ? data.Data : []

    const reports: CafefReport[] = arr.map((r: AnyObj, i: number) => {
      // Build PDF URL: ImageThumb → strip thumb prefix + change extension to .pdf
      let pdfUrl = ''
      if (r.ImageThumb && r.ImageThumb.includes('Images/Uploaded/')) {
        const basePath = r.ImageThumb
          .replace(/^thumb\/[\d_]+\//, '')
          .replace(/\.(png|jpg|jpeg)$/i, '.pdf')
        pdfUrl = `https://cafef.vn/${basePath}`
      } else if (r.FileName) {
        pdfUrl = `https://cafef.vn/Images/Uploaded/DuLieuDownload/PhanTichBaoCao/${r.FileName}`
      }

      return {
        id: `cafef_${symbol}_${i}`,
        title: r.Title || r.title || '',
        date: parseDotNetDate(r.DateDeploy || r.date || ''),
        source: r.ResourceName || r.Source || r.source || '',
        url: pdfUrl || (r.LinkDetail ? `https://cafef.vn${r.LinkDetail}` : ''),
        recommendation: r.ReportType || r.Recommendation || '',
        targetPrice: Number(r.TargetPrice || r.GiaMucTieu || 0),
        summary: stripHtml(r.ShortContent || r.Summary || '').slice(0, 500),
      }
    }).filter((r) => r.title)

    return NextResponse.json(reports)
  } catch {
    return NextResponse.json([])
  }
}
