'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import type { NewsItem } from '@/types'
import NewsCard from './NewsCard'
import SentimentBar from '../dashboard/SentimentBar'
import AISummary from './AISummary'
import StockInfoPanel from './StockInfoPanel'
import { Newspaper, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

interface NewsResponse {
  items: NewsItem[]
  total: number
  page: number
  pageSize: number
}

type SourceKey = 'all' | 'cafef' | 'vietcap' | 'vneconomy'
type VietcapCategory = 'company' | 'topic' | 'exchange'

const SOURCES: { key: SourceKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'cafef', label: 'CafeF' },
  { key: 'vietcap', label: 'Vietcap' },
  { key: 'vneconomy', label: 'VnEconomy' },
]

const VIETCAP_MARKET_CATEGORIES: { key: VietcapCategory; label: string }[] = [
  { key: 'company', label: 'Doanh Nghiệp' },
  { key: 'topic', label: 'Chủ Đề' },
  { key: 'exchange', label: 'Tin từ Sở' },
]

const VIETCAP_SYMBOL_CATEGORIES: { key: VietcapCategory; label: string }[] = [
  { key: 'company', label: 'Doanh Nghiệp' },
  { key: 'exchange', label: 'Tin từ Sở' },
]

const PAGE_SIZE = 20

export default function NewsFeed() {
  const [tab, setTab] = useState<'market' | 'symbol'>('market')
  const [inputValue, setInputValue] = useState('')
  const [activeSymbol, setActiveSymbol] = useState('')
  const [source, setSource] = useState<SourceKey>('all')
  const [vietcapCategory, setVietcapCategory] = useState<VietcapCategory>('company')
  const [page, setPage] = useState(1)

  // Reset page when any filter changes
  useEffect(() => { setPage(1) }, [tab, activeSymbol, source, vietcapCategory])

  const buildUrl = () => {
    const params = new URLSearchParams()
    if (tab === 'symbol' && activeSymbol) params.set('symbol', activeSymbol)
    if (source !== 'all') params.set('source', source)
    if (source === 'vietcap') params.set('vietcapCategory', vietcapCategory)
    params.set('page', String(page))
    params.set('pageSize', String(PAGE_SIZE))
    return `/api/news?${params.toString()}`
  }

  const { data, isLoading, mutate } = useSWR<NewsResponse>(
    buildUrl(),
    fetcher,
    { refreshInterval: 300000, revalidateOnFocus: false, keepPreviousData: true }
  )

  const news = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleSearch = () => {
    const sym = inputValue.trim().toUpperCase()
    if (!sym) return
    setActiveSymbol(sym)
  }

  const handleTabChange = (t: 'market' | 'symbol') => {
    setTab(t)
    if (t === 'market') { setActiveSymbol(''); setInputValue('') }
  }

  const avgSentiment =
    news.length > 0
      ? Math.round(news.reduce((sum, n) => sum + n.sentiment, 0) / news.length)
      : 50

  const isSymbolMode = tab === 'symbol' && !!activeSymbol
  const relatedNews = news.filter(n => n.relatedSymbol === activeSymbol)
  const otherNews = news.filter(n => n.relatedSymbol !== activeSymbol)

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-accent" />
          Tin Tức
          {isSymbolMode && (
            <span className="text-sm font-normal text-accent ml-1">· {activeSymbol}</span>
          )}
        </h2>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Tab: Thị Trường / Theo Mã */}
          <div className="flex bg-surface2 rounded-lg p-0.5">
            <button onClick={() => handleTabChange('market')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === 'market' ? 'bg-accent text-bg' : 'text-muted hover:text-gray-100'
              }`}>
              Thị Trường
            </button>
            <button onClick={() => handleTabChange('symbol')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === 'symbol' ? 'bg-accent text-bg' : 'text-muted hover:text-gray-100'
              }`}>
              Theo Mã
            </button>
          </div>

          {/* Symbol search */}
          {tab === 'symbol' && (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="VD: HPG"
                className="input-dark py-1.5 px-3 text-sm w-28"
                maxLength={10}
              />
              <button onClick={handleSearch} disabled={!inputValue.trim()}
                className="bg-accent/20 hover:bg-accent/30 text-accent border border-accent/30 rounded-lg p-1.5 transition-colors disabled:opacity-40"
                title="Tìm kiếm">
                <Search className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Refresh */}
          <button onClick={() => mutate()}
            className="p-1.5 rounded-lg text-muted hover:text-accent transition-colors"
            title="Làm mới">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Source filter ─────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted">Nguồn:</span>
        {SOURCES.map((s) => (
          <button key={s.key} onClick={() => setSource(s.key)}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              source === s.key
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'bg-surface2 text-muted hover:text-gray-200 border border-transparent'
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Vietcap category sub-tabs ── */}
      {source === 'vietcap' && (tab === 'market' || activeSymbol) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted">Loại:</span>
          {(tab === 'market' ? VIETCAP_MARKET_CATEGORIES : VIETCAP_SYMBOL_CATEGORIES).map((c) => (
            <button key={c.key} onClick={() => setVietcapCategory(c.key)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                vietcapCategory === c.key
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'bg-surface2 text-muted hover:text-gray-200 border border-transparent'
              }`}>
              {c.label}
            </button>
          ))}
          {total > 0 && (
            <span className="text-xs text-muted ml-1">({total.toLocaleString('vi-VN')} bài)</span>
          )}
        </div>
      )}

      {/* ── Placeholder when symbol tab but no symbol yet ── */}
      {tab === 'symbol' && !activeSymbol && (
        <div className="card-glass p-10 text-center text-muted">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium mb-1">Tìm tin tức theo mã cổ phiếu</p>
          <p className="text-xs opacity-60">Nhập mã (VD: HPG, FPT, VCB) rồi nhấn Enter</p>
        </div>
      )}

      {/* ── Main content ─────────────────────────── */}
      {(tab === 'market' || activeSymbol) && (
        <>
          {isSymbolMode ? (
            /* Symbol mode: 2-column layout */
            <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5">
              <StockInfoPanel symbol={activeSymbol} />

              <div className="space-y-3">
                <SentimentBar score={avgSentiment} />
                {news.length > 0 && <AISummary news={news} />}

                <div className="flex items-center gap-3 text-xs text-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  <span>
                    {isLoading
                      ? `Đang tải tin về ${activeSymbol}...`
                      : `${relatedNews.length} tin về ${activeSymbol} · ${otherNews.length} tin thị trường chung`
                    }
                  </span>
                </div>

                {isLoading ? (
                  <SkeletonList />
                ) : news.length > 0 ? (
                  <div className="card-glass px-3 py-1">
                    {relatedNews.length > 0 && (
                      <>
                        <p className="text-[10px] text-accent font-semibold uppercase py-2 tracking-wider">
                          Tin về {activeSymbol} ({relatedNews.length})
                        </p>
                        {relatedNews.map((item) => (
                          <NewsCard key={item.id} news={item} compact />
                        ))}
                      </>
                    )}
                    {otherNews.length > 0 && (
                      <>
                        <p className="text-[10px] text-muted font-semibold uppercase py-2 tracking-wider mt-1">
                          Tin thị trường chung
                        </p>
                        {otherNews.slice(0, 15).map((item) => (
                          <NewsCard key={item.id} news={item} compact />
                        ))}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="card-glass p-8 text-center text-muted">
                    <p className="text-sm">Không tìm thấy tin tức về {activeSymbol}</p>
                    <p className="text-xs mt-1 opacity-60">Thử mã khác hoặc xem tin thị trường chung</p>
                  </div>
                )}

                {/* Pagination for symbol mode */}
                {total > PAGE_SIZE && (
                  <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
                )}
              </div>
            </div>
          ) : (
            /* Market mode */
            <>
              <SentimentBar score={avgSentiment} />
              {news.length > 0 && source !== 'vietcap' && <AISummary news={news} />}

              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="card-glass p-4 animate-pulse space-y-2">
                      <div className="h-3 w-20 bg-border rounded" />
                      <div className="h-4 w-full bg-border rounded" />
                      <div className="h-4 w-3/4 bg-border rounded" />
                      <div className="h-3 w-1/3 bg-border rounded" />
                    </div>
                  ))}
                </div>
              ) : news.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {news.map((item) => (
                    <NewsCard key={item.id} news={item} />
                  ))}
                </div>
              ) : (
                <div className="card-glass p-12 text-center text-muted">
                  <p className="text-sm">Không có tin tức</p>
                </div>
              )}

              {/* Pagination */}
              {total > PAGE_SIZE && (
                <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="card-glass divide-y divide-border/40">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="p-3 animate-pulse flex gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-border mt-1.5 flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-24 bg-border rounded" />
            <div className="h-3 w-full bg-border rounded" />
            <div className="h-3 w-3/4 bg-border rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

function Pagination({
  page, totalPages, total, onPage
}: {
  page: number; totalPages: number; total: number; onPage: (p: number) => void
}) {
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)

  // Build page number list: show up to 5 pages around current
  const pages: (number | '...')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('...')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
    if (page < totalPages - 2) pages.push('...')
    pages.push(totalPages)
  }

  return (
    <div className="flex items-center justify-between pt-2 border-t border-border/30">
      <span className="text-xs text-muted">
        {from}–{to} / {total.toLocaleString('vi-VN')} bài
      </span>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-md text-muted hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>

        {pages.map((p, i) =>
          p === '...'
            ? <span key={`d${i}`} className="text-xs text-muted px-1">…</span>
            : <button
                key={p}
                onClick={() => onPage(p as number)}
                className={`w-7 h-7 rounded-md text-xs font-medium transition-colors ${
                  p === page
                    ? 'bg-accent text-bg'
                    : 'text-muted hover:text-gray-200 hover:bg-surface2'
                }`}>
                {p}
              </button>
        )}

        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-md text-muted hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
