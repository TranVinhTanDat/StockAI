import { NextRequest, NextResponse } from 'next/server'
import type { NewsItem } from '@/types'

const POSITIVE_WORDS = [
  'tăng', 'lợi nhuận', 'tăng trưởng', 'kỷ lục', 'vượt kế hoạch',
  'chia cổ tức', 'mua vào', 'nâng hạng', 'tích cực', 'khởi sắc',
  'đột phá', 'triển vọng', 'phục hồi', 'bứt phá', 'lạc quan',
  'tăng mạnh', 'xuất sắc', 'vượt trội', 'khả quan', 'cao nhất', 'mua',
]

const NEGATIVE_WORDS = [
  'giảm', 'lỗ', 'khó khăn', 'rủi ro', 'bán tháo', 'hạ hạng',
  'cảnh báo', 'vi phạm', 'phạt', 'thoái vốn', 'bán ra',
  'sụt giảm', 'tiêu cực', 'lo ngại', 'thua lỗ', 'giảm sâu', 'khủng hoảng',
]

const COMPANY_KEYWORDS: Record<string, string[]> = {
  VCB: ['VCB', 'Vietcombank', 'Ngoại Thương'],
  BID: ['BID', 'BIDV', 'Đầu Tư và Phát Triển'],
  CTG: ['CTG', 'VietinBank', 'Công Thương'],
  TCB: ['TCB', 'Techcombank', 'Kỹ Thương'],
  MBB: ['MBB', 'MB Bank', 'Quân Đội'],
  VPB: ['VPB', 'VPBank'],
  ACB: ['ACB', 'Á Châu'],
  STB: ['STB', 'Sacombank', 'Sài Gòn Thương Tín'],
  HDB: ['HDB', 'HDBank'],
  SHB: ['SHB', 'Sài Gòn Hà Nội'],
  EIB: ['EIB', 'Eximbank', 'Xuất Nhập Khẩu'],
  TPB: ['TPB', 'TPBank', 'Tiên Phong'],
  MSB: ['MSB', 'Hàng Hải'],
  OCB: ['OCB', 'Phương Đông'],
  LPB: ['LPB', 'LienVietPostBank'],
  VIB: ['VIB', 'Quốc Tế'],
  VIC: ['VIC', 'Vingroup', 'Vin Group'],
  VHM: ['VHM', 'Vinhomes', 'Vin Homes'],
  NVL: ['NVL', 'Novaland', 'Nova Land'],
  PDR: ['PDR', 'Phát Đạt'],
  KDH: ['KDH', 'Khang Điền'],
  NLG: ['NLG', 'Nam Long'],
  DXG: ['DXG', 'Đất Xanh'],
  HDG: ['HDG', 'Hà Đô'],
  FPT: ['FPT', 'Công ty FPT', 'FPT Corp'],
  VGI: ['VGI', 'Viettel Global'],
  CMG: ['CMG', 'CMC'],
  HPG: ['HPG', 'Hòa Phát', 'Hoa Phat', 'Hoà Phát'],
  HSG: ['HSG', 'Hoa Sen', 'Tôn Hoa Sen'],
  NKG: ['NKG', 'Nam Kim'],
  VNM: ['VNM', 'Vinamilk', 'Sữa Việt Nam'],
  MSN: ['MSN', 'Masan', 'Ma San'],
  SAB: ['SAB', 'Sabeco', 'Sài Gòn Beer', 'Bia Sài Gòn'],
  BHN: ['BHN', 'Habeco', 'Bia Hà Nội'],
  MCH: ['MCH', 'Masan Consumer'],
  KDC: ['KDC', 'Kinh Đô', 'KIDO'],
  QNS: ['QNS', 'Đường Quảng Ngãi'],
  MWG: ['MWG', 'Thế Giới Di Động', 'TGDĐ', 'The Gioi Di Dong'],
  FRT: ['FRT', 'FPT Retail'],
  PNJ: ['PNJ', 'Phú Nhuận'],
  DGW: ['DGW', 'Digiworld'],
  GAS: ['GAS', 'PV GAS', 'Khí Việt Nam'],
  PLX: ['PLX', 'Petrolimex'],
  PVD: ['PVD', 'PV Drilling'],
  PVS: ['PVS', 'PTSC'],
  POW: ['POW', 'PV Power'],
  NT2: ['NT2', 'Nhơn Trạch'],
  BSR: ['BSR', 'Lọc Hóa Dầu Bình Sơn'],
  OIL: ['OIL', 'PVOil'],
  SSI: ['SSI', 'SSI Securities'],
  VCI: ['VCI', 'Vietcap Securities'],
  HCM: ['HCM', 'HSC'],
  VND: ['VND', 'VNDirect'],
  MBS: ['MBS', 'MB Securities'],
  HVN: ['HVN', 'Vietnam Airlines', 'Hàng không Việt Nam'],
  VJC: ['VJC', 'VietJet', 'Vietjet Air'],
  GMD: ['GMD', 'Gemadept'],
  VSC: ['VSC', 'Vinalines Container'],
  DHG: ['DHG', 'Dược Hậu Giang'],
  IMP: ['IMP', 'Imexpharm'],
  VCS: ['VCS', 'Vicostone'],
  DGC: ['DGC', 'Đức Giang'],
  DPM: ['DPM', 'Đạm Phú Mỹ'],
  DCM: ['DCM', 'Đạm Cà Mau'],
  REE: ['REE', 'Cơ điện lạnh REE'],
  HAG: ['HAG', 'Hoàng Anh Gia Lai'],
  DRC: ['DRC', 'Cao su Đà Nẵng'],
  BFC: ['BFC', 'Phân bón Bình Điền'],
  VHC: ['VHC', 'Vĩnh Hoàn'],
  ANV: ['ANV', 'Nam Việt'],
  MPC: ['MPC', 'Minh Phú'],
}

const VIETCAP_HEADERS = {
  'Content-Type': 'application/json',
  'Origin': 'https://trading.vietcap.com.vn',
  'Referer': 'https://trading.vietcap.com.vn/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, */*',
  'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
}

function makeId(title: string, source: string, idx: number): string {
  let h = 5381
  for (const c of (title + source)) h = (h * 33 ^ c.charCodeAt(0)) >>> 0
  return `${h.toString(36)}-${idx}`
}

function calcSentiment(text: string): number {
  const lower = text.toLowerCase()
  let positive = 0; let negative = 0
  for (const word of POSITIVE_WORDS) if (lower.includes(word)) positive++
  for (const word of NEGATIVE_WORDS) if (lower.includes(word)) negative++
  const total = positive + negative
  if (total === 0) return 50
  return Math.round(((positive - negative) / total) * 50 + 50)
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .trim()
}

async function fetchRSS(url: string, displaySource: string, limit = 25): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 300 },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockAI/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    const items: NewsItem[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match; let idx = 0

    while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
      const block = match[1]
      const title =
        block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ||
        block.match(/<title>([^<]*)<\/title>/)?.[1] || ''
      const link =
        block.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/)?.[1] ||
        block.match(/<link>([^<]*)<\/link>/)?.[1] ||
        block.match(/<guid[^>]*>([^<]*)<\/guid>/)?.[1] || ''
      const pubDate = block.match(/<pubDate>([^<]*)<\/pubDate>/)?.[1] || ''
      const description =
        block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ||
        block.match(/<description>([^<]*)<\/description>/)?.[1] || ''

      const cleanTitle = title.replace(/<[^>]*>/g, '').trim()
      const cleanDesc = description.replace(/<[^>]*>/g, '').trim().slice(0, 300)

      if (cleanTitle) {
        items.push({
          id: makeId(cleanTitle, displaySource, idx++),
          title: cleanTitle,
          summary: cleanDesc,
          source: displaySource,
          url: link.trim(),
          publishedAt: (() => {
            try { const d = new Date(pubDate); return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString() }
            catch { return new Date().toISOString() }
          })(),
          sentiment: calcSentiment(cleanTitle + ' ' + cleanDesc),
          relatedSymbol: null,
        })
      }
    }
    return items
  } catch {
    return []
  }
}

// Parse CafeF date format: "10/03/2026 15:47" → ISO string
function parseCafefDate(s: string): string {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
  if (!m) return new Date().toISOString()
  const [, dd, mm, yyyy, hh, min] = m
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00+07:00`).toISOString()
}

// Fetch company-specific news from CafeF AJAX endpoint
async function fetchCafefCompanyNews(symbol: string): Promise<NewsItem[]> {
  try {
    const url = `https://cafef.vn/du-lieu/Ajax/Events_RelatedNews_New.aspx?symbol=${symbol}&floorID=0&configID=0&PageIndex=1&PageSize=30&Type=0`
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': `https://cafef.vn/du-lieu/tin-doanh-nghiep/${symbol.toLowerCase()}/Event.chn`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []

    const html = await res.text()
    const items: NewsItem[] = []
    let idx = 0

    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/g
    let liMatch
    while ((liMatch = liRegex.exec(html)) !== null && items.length < 30) {
      const li = liMatch[1]
      const dateStr = li.match(/<span[^>]*class=['"]timeTitle['"][^>]*>([^<]+)<\/span>/)?.[1] || ''
      const linkMatch = li.match(/<a[^>]*class=['"]docnhanhTitle['"][^>]*href=['"]([^'"]+)['"][^>]*title=['"]([^'"]+)['"][^>]*>/)
      if (!linkMatch) continue

      let href = linkMatch[1].trim()
      const title = decodeHtmlEntities(linkMatch[2])
      if (!title || title.length < 5) continue

      if (href.startsWith('/')) href = `https://cafef.vn${href}`
      href = href.split('?')[0]

      items.push({
        id: makeId(title, 'CafeF-' + symbol, idx++),
        title,
        summary: '',
        source: 'CafeF',
        url: href,
        publishedAt: dateStr ? parseCafefDate(dateStr) : new Date().toISOString(),
        sentiment: calcSentiment(title),
        relatedSymbol: symbol,
      })
    }

    return items
  } catch {
    return []
  }
}

// Fetch company-specific news from VnEconomy search page (SSR)
async function fetchVneconomyCompanyNews(symbol: string): Promise<NewsItem[]> {
  try {
    const url = `https://vneconomy.vn/tim-kiem.html?Text=${encodeURIComponent(symbol)}`
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'vi-VN,vi;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []

    const html = await res.text()
    const items: NewsItem[] = []
    const seenUrls = new Set<string>()
    let idx = 0

    // Find all link-layer-imt anchors (each unique article has one)
    // Pattern: href="https://vneconomy.vn/slug.htm" title="..." class="link-layer-imt"
    const linkRegex = /href="(https?:\/\/vneconomy\.vn\/([^"]+\.htm))"[^>]*title="([^"]+)"[^>]*class="link-layer-imt"/g
    let lm

    while ((lm = linkRegex.exec(html)) !== null && items.length < 20) {
      const href = lm[1]
      const title = decodeHtmlEntities(lm[3])
      if (!title || title.length < 5 || seenUrls.has(href)) continue
      seenUrls.add(href)

      // Look backward from this match for the nearest image upload date
      const before = html.slice(Math.max(0, lm.index - 3000), lm.index)
      let publishedAt = new Date().toISOString()
      // Image path like: upload/2025/06/24/ or upload//2025/06/24/
      const dateMatch = before.match(/upload\/{1,2}(\d{4})\/(\d{2})\/(\d{2})\/[^"]*"[^>]*(?:class="responsive-image-link"|aria-label)/)
        || before.match(/upload\/{1,2}(\d{4})\/(\d{2})\/(\d{2})\//)
      if (dateMatch) {
        const [, y, m, d] = dateMatch
        try {
          const dt = new Date(`${y}-${m}-${d}T12:00:00+07:00`)
          if (!isNaN(dt.getTime())) publishedAt = dt.toISOString()
        } catch { /* keep default */ }
      }

      // Look backward for summary <p> text
      const summaryMatch = before.match(/<p[^>]*>([^<]{10,200})<\/p>(?![\s\S]*<p[^>]*>[^<]{10,200}<\/p>)/)
      const summary = summaryMatch
        ? decodeHtmlEntities(summaryMatch[1].replace(/<[^>]*>/g, '').trim()).slice(0, 200)
        : ''

      items.push({
        id: makeId(title, 'VnEconomy-' + symbol, idx++),
        title,
        summary,
        source: 'VnEconomy',
        url: href,
        publishedAt,
        sentiment: calcSentiment(title + ' ' + summary),
        relatedSymbol: symbol,
      })
    }

    // Sort by date descending (most recent first)
    items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    return items
  } catch {
    return []
  }
}

// ── Vietcap AI REST API (https://ai.vietcap.com.vn/api) ──────────────────────
const VIETCAP_AI_BASE = 'https://ai.vietcap.com.vn/api'
const VIETCAP_AI_HEADERS = {
  'Origin': 'https://trading.vietcap.com.vn',
  'Referer': 'https://trading.vietcap.com.vn/ai-news',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
}

interface VietcapAIItem {
  id: string; ticker: string; news_title: string; news_short_content?: string
  news_source_link: string; news_image_url?: string; update_date: string
  news_from: string; news_from_name?: string; sentiment?: string; topic_name?: string
}

function parseVietcapDate(s: string): string {
  // "2026-03-14 12:29:41" → ISO
  try { return new Date(s.replace(' ', 'T') + '+07:00').toISOString() }
  catch { return new Date().toISOString() }
}

function vietcapSentimentScore(s?: string): number {
  if (s === 'Positive') return 72
  if (s === 'Negative') return 28
  return 50
}

function vietcapItemToNewsItem(item: VietcapAIItem, relatedSymbol: string | null): NewsItem {
  return {
    id: item.id,
    title: item.news_title || '',
    summary: (item.news_short_content || '').replace(/<[^>]*>/g, '').trim().slice(0, 300),
    source: item.news_from_name || item.news_from || 'Vietcap',
    url: item.news_source_link || '',
    publishedAt: parseVietcapDate(item.update_date),
    sentiment: item.sentiment ? vietcapSentimentScore(item.sentiment) : calcSentiment(item.news_title || ''),
    relatedSymbol,
  }
}

async function fetchVietcapAICompanyNews(
  page: number, pageSize: number, ticker?: string
): Promise<{ items: NewsItem[]; total: number }> {
  try {
    const params = new URLSearchParams({
      language: 'vi', page: String(page), page_size: String(pageSize),
    })
    if (ticker) params.set('ticker', ticker)
    const res = await fetch(`${VIETCAP_AI_BASE}/v3/news_info?${params}`, {
      headers: VIETCAP_AI_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { items: [], total: 0 }
    const json = await res.json()
    const raw: VietcapAIItem[] = Array.isArray(json.news_info) ? json.news_info : []
    return {
      items: raw.map(item => vietcapItemToNewsItem(item, ticker || null)),
      total: typeof json.total_records === 'number' ? json.total_records : raw.length,
    }
  } catch { return { items: [], total: 0 } }
}

async function fetchVietcapAITopicNews(
  page: number, pageSize: number
): Promise<{ items: NewsItem[]; total: number }> {
  try {
    const params = new URLSearchParams({
      language: 'vi', page: String(page), page_size: String(pageSize),
    })
    const res = await fetch(`${VIETCAP_AI_BASE}/v3/topics_info?${params}`, {
      headers: VIETCAP_AI_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { items: [], total: 0 }
    const json = await res.json()
    const raw: VietcapAIItem[] = Array.isArray(json.news_info) ? json.news_info : []
    return {
      items: raw.map(item => vietcapItemToNewsItem(item, null)),
      total: typeof json.total_records === 'number' ? json.total_records : raw.length,
    }
  } catch { return { items: [], total: 0 } }
}

async function fetchVietcapAIExchangeNews(
  page: number, pageSize: number, ticker?: string
): Promise<{ items: NewsItem[]; total: number }> {
  try {
    const params = new URLSearchParams({
      language: 'vi', page: String(page), page_size: String(pageSize),
    })
    if (ticker) params.set('ticker', ticker)
    const res = await fetch(`${VIETCAP_AI_BASE}/v3/xnews_info?${params}`, {
      headers: VIETCAP_AI_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { items: [], total: 0 }
    const json = await res.json()
    const raw: VietcapAIItem[] = Array.isArray(json.news_info) ? json.news_info : []
    return {
      items: raw.map(item => vietcapItemToNewsItem(item, item.ticker || null)),
      total: typeof json.total_records === 'number' ? json.total_records : raw.length,
    }
  } catch { return { items: [], total: 0 } }
}

// Fetch Vietcap analyst reports (PDF research reports)
async function fetchVietcapReports(symbol: string): Promise<NewsItem[]> {
  try {
    const query = `query { AnalysisReportFiles(ticker: "${symbol}", langCode: "vi") { date name link } }`
    const res = await fetch('https://trading.vietcap.com.vn/data-mt/graphql', {
      method: 'POST',
      headers: VIETCAP_HEADERS,
      body: JSON.stringify({ query }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const json = await res.json()
    if (json.errors || !json.data?.AnalysisReportFiles) return []

    const files = json.data.AnalysisReportFiles as { date: string; name: string; link: string }[]
    if (!Array.isArray(files) || files.length === 0) return []

    return files.map((f, i) => {
      const title = f.name || ''
      const link = f.link?.startsWith('http') ? f.link : f.link ? `https://www.vietcap.com.vn${f.link}` : ''
      return {
        id: makeId(title, 'VietcapReport-' + symbol, i),
        title: `[Báo cáo] ${title}`,
        summary: 'Báo cáo phân tích từ Vietcap Securities',
        source: 'Vietcap',
        url: link,
        publishedAt: f.date ? new Date(f.date).toISOString() : new Date().toISOString(),
        sentiment: calcSentiment(title),
        relatedSymbol: symbol,
      }
    })
  } catch {
    return []
  }
}

function matchesSymbol(item: NewsItem, symbol: string): boolean {
  const titleLower = item.title.toLowerCase()
  const summaryLower = item.summary.toLowerCase()
  const keywords = [symbol.toLowerCase(), ...(COMPANY_KEYWORDS[symbol] || []).map(k => k.toLowerCase())]
  if (keywords.some(k => k.length >= 3 && titleLower.includes(k))) return true
  return keywords.filter(k => k.length > 4).some(k => summaryLower.includes(k))
}

function dedup(news: NewsItem[]): NewsItem[] {
  const seenIds = new Set<string>()
  const seenTitles = new Set<string>()
  return news.filter(item => {
    if (seenIds.has(item.id)) return false
    seenIds.add(item.id)
    const titleKey = item.title.slice(0, 60).toLowerCase().replace(/\s+/g, ' ')
    if (seenTitles.has(titleKey)) return false
    seenTitles.add(titleKey)
    return true
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const symbol = searchParams.get('symbol')?.toUpperCase() || null
  const sourceFilter = searchParams.get('source') || 'all'
  const vietcapCategory = searchParams.get('vietcapCategory') || 'company' // company | topic | exchange
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const pageSize = Math.min(50, Math.max(5, parseInt(searchParams.get('pageSize') || '20', 10)))

  const includeCafef = sourceFilter === 'all' || sourceFilter === 'cafef'
  const includeVietcap = sourceFilter === 'all' || sourceFilter === 'vietcap'
  const includeVneconomy = sourceFilter === 'all' || sourceFilter === 'vneconomy'

  try {
    // ── Vietcap-only mode: use AI REST with server-side pagination ─
    if (sourceFilter === 'vietcap') {
      if (symbol) {
        // Symbol + Vietcap: Tin Doanh Nghiệp OR Tin từ Sở
        if (vietcapCategory === 'exchange') {
          const result = await fetchVietcapAIExchangeNews(page, pageSize, symbol)
          return NextResponse.json({ items: result.items, total: result.total, page, pageSize })
        }
        // Default: company news + analyst reports on page 1
        const [companyResult, reports] = await Promise.all([
          fetchVietcapAICompanyNews(page, pageSize, symbol),
          page === 1 ? fetchVietcapReports(symbol) : Promise.resolve([]),
        ])
        const items = dedup([...companyResult.items, ...reports])
        return NextResponse.json({ items, total: companyResult.total, page, pageSize })
      }
      // Market + Vietcap: category-specific
      if (vietcapCategory === 'topic') {
        const result = await fetchVietcapAITopicNews(page, pageSize)
        return NextResponse.json({ items: result.items, total: result.total, page, pageSize })
      }
      if (vietcapCategory === 'exchange') {
        const result = await fetchVietcapAIExchangeNews(page, pageSize)
        return NextResponse.json({ items: result.items, total: result.total, page, pageSize })
      }
      // Default: company news (Tin Doanh Nghiệp)
      const result = await fetchVietcapAICompanyNews(page, pageSize)
      return NextResponse.json({ items: result.items, total: result.total, page, pageSize })
    }

    if (symbol) {
      // ── Symbol mode (non-Vietcap or all) ─────────────────────────
      const [cafefCompany, vneconomyCompany, vietcapAI, vietcapReports, cafefMarket, vneconomyMarket] = await Promise.all([
        includeCafef ? fetchCafefCompanyNews(symbol) : Promise.resolve([]),
        includeVneconomy ? fetchVneconomyCompanyNews(symbol) : Promise.resolve([]),
        includeVietcap ? fetchVietcapAICompanyNews(1, 30, symbol).then(r => r.items) : Promise.resolve([]),
        includeVietcap ? fetchVietcapReports(symbol) : Promise.resolve([]),
        includeCafef ? fetchRSS('https://cafef.vn/thi-truong-chung-khoan.rss', 'CafeF', 50) : Promise.resolve([]),
        includeVneconomy ? fetchRSS('https://vneconomy.vn/chung-khoan.rss', 'VnEconomy', 30) : Promise.resolve([]),
      ])

      const generalMatches: NewsItem[] = [
        ...cafefMarket.filter(n => matchesSymbol(n, symbol)).map(n => ({ ...n, relatedSymbol: symbol })),
        ...vneconomyMarket.filter(n => matchesSymbol(n, symbol)).map(n => ({ ...n, relatedSymbol: symbol })),
      ]

      const companyNews = dedup([
        ...cafefCompany, ...vneconomyCompany, ...vietcapAI, ...vietcapReports, ...generalMatches,
      ])

      const generalAll = dedup([...cafefMarket, ...vneconomyMarket])
      const generalOther = generalAll.filter(n => n.relatedSymbol !== symbol && !matchesSymbol(n, symbol))

      let result = dedup([...companyNews.slice(0, 50), ...generalOther.slice(0, 15)])
      result.sort((a, b) => {
        const ac = a.relatedSymbol === symbol ? 1 : 0
        const bc = b.relatedSymbol === symbol ? 1 : 0
        if (ac !== bc) return bc - ac
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      })

      const total = result.length
      const start = (page - 1) * pageSize
      return NextResponse.json({ items: result.slice(start, start + pageSize), total, page, pageSize })
    }

    // ── Market mode ──────────────────────────────────────────────
    const [cafefMarket, cafefDN, cafefBiz, vneconomy] = await Promise.all([
      includeCafef ? fetchRSS('https://cafef.vn/thi-truong-chung-khoan.rss', 'CafeF', 50) : Promise.resolve([]),
      includeCafef ? fetchRSS('https://cafef.vn/doanh-nghiep.rss', 'CafeF', 40) : Promise.resolve([]),
      includeCafef ? fetchRSS('https://cafef.vn/kinh-doanh.rss', 'CafeF', 20) : Promise.resolve([]),
      includeVneconomy ? fetchRSS('https://vneconomy.vn/chung-khoan.rss', 'VnEconomy', 30) : Promise.resolve([]),
    ])

    let allNews: NewsItem[] = [
      ...cafefMarket,
      ...cafefDN.map(n => ({ ...n, source: 'CafeF' })),
      ...cafefBiz.map(n => ({ ...n, source: 'CafeF' })),
      ...vneconomy,
    ]
    allNews.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    allNews = dedup(allNews)

    const total = allNews.length
    const start = (page - 1) * pageSize
    return NextResponse.json({ items: allNews.slice(start, start + pageSize), total, page, pageSize })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch news'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
