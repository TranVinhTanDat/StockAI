import type { NewsItem } from '@/types'

export async function fetchFinnhubNews(
  symbol?: string
): Promise<NewsItem[]> {
  const apiKey = process.env.FINNHUB_KEY
  if (!apiKey) return []

  const to = new Date().toISOString().split('T')[0]
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const url = symbol
    ? `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}`
    : `https://finnhub.io/api/v1/news?category=general`

  try {
    const res = await fetch(url, {
      headers: { 'X-Finnhub-Token': apiKey },
      next: { revalidate: 300 },
    })

    if (!res.ok) return []

    const data: Array<{
      id: number
      headline: string
      summary: string
      source: string
      url: string
      datetime: number
      related: string
    }> = await res.json()

    return data.slice(0, 10).map((item) => ({
      id: `finnhub-${item.id}`,
      title: item.headline,
      summary: item.summary,
      source: item.source,
      url: item.url,
      publishedAt: new Date(item.datetime * 1000).toISOString(),
      sentiment: 50,
      relatedSymbol: item.related || null,
    }))
  } catch {
    return []
  }
}
