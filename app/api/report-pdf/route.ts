import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/report-pdf?url=<reportUrl>
 * Returns the direct PDF URL for a given analyst report URL.
 * - If the URL already ends with .pdf → returns it directly
 * - Otherwise fetches the HTML page and tries to extract a PDF link
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  // Already a direct PDF link — but cafef.vn/Images/... serves 404, real CDN is cafefnew.mediacdn.vn
  if (/\.pdf(\?.*)?$/i.test(url)) {
    const pdfUrl = url.replace(
      /^https?:\/\/cafef\.vn\//i,
      'https://cafefnew.mediacdn.vn/'
    )
    return NextResponse.json({ pdfUrl })
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Cannot fetch page: HTTP ${res.status}` }, { status: 502 })
    }

    const html = await res.text()

    // Priority 1: CafeF CDN PDF pattern
    const cafefMatch = html.match(/(https?:\/\/cafefnew\.mediacdn\.vn[^\s"'<>]*\.pdf[^\s"'<>]*)/i)
    if (cafefMatch) return NextResponse.json({ pdfUrl: cafefMatch[1] })

    // Priority 2: Any absolute PDF URL in the page
    const pdfMatch = html.match(/(https?:\/\/[^\s"'<>]*\.pdf[^\s"'<>]*)/i)
    if (pdfMatch) return NextResponse.json({ pdfUrl: pdfMatch[1] })

    // Priority 3: Relative PDF path
    const relMatch = html.match(/["']([^"']*\.pdf[^"']*)['"]/i)
    if (relMatch) {
      try {
        const base = new URL(url)
        const pdfUrl = new URL(relMatch[1], base.origin).href
        return NextResponse.json({ pdfUrl })
      } catch {
        // ignore
      }
    }

    return NextResponse.json({ error: 'PDF not found in page' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch report page' }, { status: 500 })
  }
}
