'use client'

import { useState } from 'react'
import useSWR from 'swr'
import type { NewsItem } from '@/types'
import NewsCard from './NewsCard'
import SentimentBar from '../dashboard/SentimentBar'
import { Newspaper } from 'lucide-react'

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

export default function NewsFeed() {
  const [tab, setTab] = useState<'market' | 'symbol'>('market')
  const [searchSymbol, setSearchSymbol] = useState('')

  const url =
    tab === 'symbol' && searchSymbol
      ? `/api/news?symbol=${searchSymbol}`
      : '/api/news'

  const { data: news, isLoading } = useSWR<NewsItem[]>(url, fetcher, {
    refreshInterval: 300000,
    revalidateOnFocus: false,
  })

  const avgSentiment =
    news && news.length > 0
      ? Math.round(
          news.reduce((sum, n) => sum + n.sentiment, 0) / news.length
        )
      : 50

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-accent" />
          Tin Tức
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex bg-surface2 rounded-lg p-0.5">
            <button
              onClick={() => setTab('market')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === 'market' ? 'bg-accent text-bg' : 'text-muted hover:text-gray-100'
              }`}
            >
              Thị Trường
            </button>
            <button
              onClick={() => setTab('symbol')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === 'symbol' ? 'bg-accent text-bg' : 'text-muted hover:text-gray-100'
              }`}
            >
              Theo Mã
            </button>
          </div>
          {tab === 'symbol' && (
            <input
              type="text"
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
              placeholder="VD: FPT"
              className="input-dark py-1.5 px-3 text-sm w-24"
              maxLength={10}
            />
          )}
        </div>
      </div>

      <SentimentBar score={avgSentiment} />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-glass p-4 animate-pulse space-y-2">
              <div className="h-3 w-20 bg-border rounded" />
              <div className="h-4 w-full bg-border rounded" />
              <div className="h-4 w-3/4 bg-border rounded" />
              <div className="h-3 w-1/3 bg-border rounded" />
            </div>
          ))}
        </div>
      ) : news && news.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {news.map((item) => (
            <NewsCard key={item.id} news={item} />
          ))}
        </div>
      ) : (
        <div className="card-glass p-12 text-center text-muted">
          Không có tin tức
        </div>
      )}
    </div>
  )
}
