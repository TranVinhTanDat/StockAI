import type { NewsItem } from '@/types'

const POSITIVE_WORDS = [
  'surge', 'gain', 'rise', 'rally', 'beat', 'strong', 'growth', 'profit',
  'record', 'upgrade', 'buy', 'bullish', 'positive', 'recovery', 'outperform',
  'exceed', 'boost', 'jump', 'soar', 'expansion',
]

const NEGATIVE_WORDS = [
  'fall', 'drop', 'loss', 'decline', 'miss', 'weak', 'risk', 'sell',
  'warning', 'concern', 'downgrade', 'bearish', 'negative', 'crash', 'plunge',
  'shrink', 'cut', 'reduce', 'layoff', 'debt',
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
      sentiment: calcSentiment(item.headline + ' ' + item.summary),
      relatedSymbol: item.related || null,
    }))
  } catch {
    return []
  }
}
