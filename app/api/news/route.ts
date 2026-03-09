import { NextRequest, NextResponse } from 'next/server'
import { fetchFinnhubNews } from '@/lib/finnhub'
import type { NewsItem } from '@/types'

const POSITIVE_WORDS = [
  'tăng', 'lợi nhuận', 'tăng trưởng', 'kỷ lục', 'vượt kế hoạch',
  'chia cổ tức', 'mua vào', 'nâng hạng', 'tích cực', 'khởi sắc',
  'đột phá', 'triển vọng', 'phục hồi', 'bứt phá', 'lạc quan',
]

const NEGATIVE_WORDS = [
  'giảm', 'lỗ', 'khó khăn', 'rủi ro', 'bán tháo', 'hạ hạng',
  'cảnh báo', 'vi phạm', 'phạt', 'thoái vốn', 'bán ra',
  'sụt giảm', 'tiêu cực', 'lo ngại', 'đáng lo',
]

function calcSentiment(text: string): number {
  const lower = text.toLowerCase()
  let positive = 0
  let negative = 0

  for (const word of POSITIVE_WORDS) {
    if (lower.includes(word)) positive++
  }
  for (const word of NEGATIVE_WORDS) {
    if (lower.includes(word)) negative++
  }

  const total = positive + negative
  if (total === 0) return 50
  return Math.round(((positive - negative) / total) * 50 + 50)
}

async function fetchCafeFNews(): Promise<NewsItem[]> {
  try {
    const res = await fetch('https://cafef.vn/thi-truong-chung-khoan.rss', {
      next: { revalidate: 300 },
    })

    if (!res.ok) return []

    const xml = await res.text()
    const items: NewsItem[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1]
      const title =
        itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
        itemXml.match(/<title>(.*?)<\/title>/)?.[1] ||
        ''
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
      const description =
        itemXml.match(
          /<description><!\[CDATA\[(.*?)\]\]><\/description>/
        )?.[1] ||
        itemXml.match(/<description>(.*?)<\/description>/)?.[1] ||
        ''

      const cleanDesc = description.replace(/<[^>]*>/g, '').trim()

      if (title) {
        items.push({
          id: `cafef-${items.length}`,
          title: title.trim(),
          summary: cleanDesc.slice(0, 200),
          source: 'CafeF',
          url: link.trim(),
          publishedAt: (() => { try { const d = new Date(pubDate); return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString() } catch { return new Date().toISOString() } })(),
          sentiment: calcSentiment(title + ' ' + cleanDesc),
          relatedSymbol: null,
        })
      }

      if (items.length >= 12) break
    }

    return items
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')

  try {
    const [cafefNews, finnhubNews] = await Promise.all([
      fetchCafeFNews(),
      fetchFinnhubNews(symbol || undefined),
    ])

    const allNews = [...cafefNews, ...finnhubNews]
    allNews.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )

    // Deduplicate by title similarity
    const seen = new Set<string>()
    const unique = allNews.filter((item) => {
      const key = item.title.slice(0, 50).toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return NextResponse.json(unique.slice(0, 12))
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch news'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
