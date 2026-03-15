'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getAnalyses } from '@/lib/storage'
import type { SavedAnalysis, QuoteData } from '@/types'
import AnalysisResult from '@/components/analysis/AnalysisResult'
import { formatVND, getRecommendationBg, timeAgo } from '@/lib/utils'
import {
  ArrowLeft, History, TrendingUp, RefreshCw,
  Search, ChevronDown, ChevronUp, BarChart2, Zap,
} from 'lucide-react'

export default function AnalysisHistoryPage() {
  const router = useRouter()
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([])
  const [filter, setFilter]     = useState<string>('all')
  const [search, setSearch]     = useState('')
  const [page, setPage]         = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [quotes, setQuotes]     = useState<Record<string, QuoteData | null | 'loading'>>({})
  const fetchedSymbols          = useRef<Set<string>>(new Set())
  const PAGE_SIZE = 10

  const reload = useCallback(() => {
    getAnalyses().then(setAnalyses)
  }, [])

  useEffect(() => {
    reload()
    window.addEventListener('stockai:analysis-saved', reload)
    return () => window.removeEventListener('stockai:analysis-saved', reload)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch live quote for a symbol (once per symbol, cached in state)
  const fetchQuote = useCallback((symbol: string) => {
    if (fetchedSymbols.current.has(symbol)) return
    fetchedSymbols.current.add(symbol)
    setQuotes(q => ({ ...q, [symbol]: 'loading' }))
    fetch(`/api/quote?symbol=${symbol}`)
      .then(r => r.json())
      .then(data => setQuotes(q => ({ ...q, [symbol]: data.error ? null : (data as QuoteData) })))
      .catch(() => setQuotes(q => ({ ...q, [symbol]: null })))
  }, [])

  // When a row expands, fetch its quote
  useEffect(() => {
    if (!expandedId) return
    const a = analyses.find(x => x.id === expandedId)
    if (a) fetchQuote(a.symbol)
  }, [expandedId, analyses, fetchQuote])

  const uniqueSymbols = Array.from(new Set(analyses.map(a => a.symbol))).sort()

  const filtered = analyses.filter(a => {
    const matchSym = filter === 'all' || a.symbol === filter
    const matchSearch = !search || a.symbol.includes(search.toUpperCase())
    return matchSym && matchSearch
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const handleFilterChange = (f: string) => { setFilter(f); setPage(1); setExpandedId(null) }
  const handleSearchChange = (s: string) => { setSearch(s); setPage(1); setExpandedId(null) }
  const handleReanalyze    = (sym: string) => router.push(`/?symbol=${sym}&analyze=1`)

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }

  return (
    <div className="min-h-screen bg-bg text-gray-200">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-border/60">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <ArrowLeft className="w-4 h-4 text-muted" />
            <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-sm font-bold text-gray-100">StockAI VN</span>
          </Link>

          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-accent" />
            <h1 className="text-sm font-semibold">Lịch sử Phân tích</h1>
            {analyses.length > 0 && (
              <span className="text-[11px] bg-accent/15 text-accent px-2 py-0.5 rounded-full">
                {analyses.length} phân tích
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={reload}
              className="p-1.5 rounded-lg text-muted hover:text-accent transition-colors"
              title="Làm mới"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Link
              href="/"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 border border-accent/20 text-accent rounded-lg text-xs font-medium hover:bg-accent/20 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              Phân tích mới
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">

        {/* ── Filters ── */}
        {(uniqueSymbols.length > 1 || uniqueSymbols.length > 4) && (
          <div className="bg-surface rounded-xl border border-border/40 p-3 flex flex-wrap items-center gap-3">
            {/* Symbol chips */}
            <div className="flex flex-wrap gap-1.5 flex-1">
              <button
                onClick={() => handleFilterChange('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'bg-surface2 text-muted hover:text-gray-200'
                }`}
              >
                Tất cả
              </button>
              {uniqueSymbols.map(sym => (
                <button
                  key={sym}
                  onClick={() => handleFilterChange(sym)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    filter === sym
                      ? 'bg-accent/20 text-accent border border-accent/30'
                      : 'bg-surface2 text-muted hover:text-gray-200'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 bg-surface2 border border-border/40 rounded-lg px-3 py-1.5 min-w-[140px]">
              <Search className="w-3.5 h-3.5 text-muted flex-shrink-0" />
              <input
                type="text"
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Tìm mã..."
                className="bg-transparent text-xs outline-none w-full placeholder:text-muted"
              />
            </div>
          </div>
        )}

        {/* ── List ── */}
        {filtered.length === 0 ? (
          <div className="bg-surface rounded-xl border border-border/40 p-12 text-center">
            <History className="w-10 h-10 mx-auto mb-3 text-muted opacity-40" />
            <p className="text-sm text-muted">Chưa có phân tích nào</p>
            <p className="text-xs text-muted/60 mt-1">
              {analyses.length === 0 ? 'Phân tích cổ phiếu để lưu kết quả' : 'Thử bỏ bộ lọc'}
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-accent/10 border border-accent/20 text-accent rounded-lg text-sm hover:bg-accent/20 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              Phân tích ngay
            </Link>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-border/40 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2.5 border-b border-border/40 bg-surface2/50">
              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Mã / Khuyến nghị</span>
              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right">Tin cậy</span>
              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right">Mục tiêu</span>
              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right">Cắt lỗ</span>
              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right">Thời gian</span>
              <span className="w-5" />
            </div>

            <div className="divide-y divide-border/30">
              {paginated.map(a => {
                const isExpanded = expandedId === a.id
                const quoteData  = quotes[a.symbol]
                const q          = quoteData !== 'loading' ? quoteData : null

                return (
                  <div key={a.id}>
                    {/* Row */}
                    <button
                      onClick={() => toggleExpand(a.id)}
                      className={`w-full grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-3.5 text-left hover:bg-surface2/40 transition-colors ${
                        isExpanded ? 'bg-accent/5 border-l-2 border-accent' : ''
                      }`}
                    >
                      {/* Symbol + recommendation */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-sm font-bold text-gray-100 w-12 flex-shrink-0">{a.symbol}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded border font-medium flex-shrink-0 ${getRecommendationBg(a.recommendation)}`}>
                          {a.recommendation}
                        </span>
                      </div>
                      {/* Confidence */}
                      <div className="text-right self-center">
                        <span className="text-sm font-semibold text-accent">{a.confidence}%</span>
                      </div>
                      {/* Target */}
                      <div className="text-right self-center">
                        <span className="text-xs text-green-400 font-mono">
                          {a.target_price > 0 ? formatVND(a.target_price) : '—'}
                        </span>
                      </div>
                      {/* Stop loss */}
                      <div className="text-right self-center">
                        <span className="text-xs text-red-400 font-mono">
                          {a.stop_loss > 0 ? formatVND(a.stop_loss) : '—'}
                        </span>
                      </div>
                      {/* Time */}
                      <div className="text-right self-center">
                        <span className="text-xs text-muted">{timeAgo(a.analyzed_at)}</span>
                      </div>
                      {/* Expand icon */}
                      <div className="self-center flex-shrink-0">
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-accent" />
                          : <ChevronDown className="w-4 h-4 text-muted/50" />
                        }
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-border/30 bg-bg/60 px-4 py-4 space-y-4">
                        {/* Context bar */}
                        <div className="flex items-center justify-between flex-wrap gap-3 px-1">
                          <div className="flex items-center gap-4 flex-wrap text-xs text-muted">
                            <span>
                              Phân tích lúc:{' '}
                              <span className="text-gray-300">
                                {new Date(a.analyzed_at).toLocaleString('vi-VN')}
                              </span>
                            </span>
                            {quoteData === 'loading' ? (
                              <span className="text-muted/60 italic">Đang tải giá...</span>
                            ) : q ? (
                              <span>
                                Giá hiện tại:{' '}
                                <span className="text-gray-300 font-mono">{formatVND(q.price)}</span>
                                {a.target_price > 0 && (
                                  <span className={`ml-1.5 font-semibold ${
                                    q.price >= a.target_price ? 'text-green-400' : 'text-muted'
                                  }`}>
                                    {q.price >= a.target_price
                                      ? '✓ Đạt mục tiêu'
                                      : `→ Mục tiêu: ${formatVND(a.target_price)}`}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted/60 italic">Không thể tải giá</span>
                            )}
                          </div>
                          <button
                            onClick={() => handleReanalyze(a.symbol)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 border border-accent/20 text-accent rounded-lg text-xs hover:bg-accent/20 transition-colors flex-shrink-0"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            Phân tích lại
                          </button>
                        </div>

                        {/* Full analysis or summary card */}
                        {quoteData === 'loading' ? (
                          <div className="flex items-center justify-center py-10">
                            <div className="animate-spin w-7 h-7 border-2 border-accent border-t-transparent rounded-full" />
                          </div>
                        ) : q ? (
                          <AnalysisResult
                            result={a.full_result}
                            quote={q}
                            symbol={a.symbol}
                            fromCache={true}
                            cachedAt={a.analyzed_at}
                            onReanalyze={() => handleReanalyze(a.symbol)}
                            onViewChart={() => router.push(`/?symbol=${a.symbol}`)}
                          />
                        ) : (
                          <AnalysisSummaryCard
                            analysis={a}
                            onReanalyze={() => handleReanalyze(a.symbol)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-border/40 px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-muted">
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} / {filtered.length} phân tích
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={safePage <= 1}
                    onClick={() => { setPage(p => p - 1); setExpandedId(null) }}
                    className="px-2.5 py-1.5 text-xs text-muted hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-lg hover:bg-surface2"
                  >
                    ‹ Trước
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      onClick={() => { setPage(p); setExpandedId(null) }}
                      className={`w-7 h-7 text-xs rounded-lg transition-colors ${
                        p === safePage
                          ? 'bg-accent/20 text-accent font-semibold'
                          : 'text-muted hover:text-gray-200 hover:bg-surface2'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    disabled={safePage >= totalPages}
                    onClick={() => { setPage(p => p + 1); setExpandedId(null) }}
                    className="px-2.5 py-1.5 text-xs text-muted hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-lg hover:bg-surface2"
                  >
                    Sau ›
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Fallback summary card when live quote unavailable ─────────────────────────

function AnalysisSummaryCard({
  analysis, onReanalyze,
}: {
  analysis: SavedAnalysis
  onReanalyze: () => void
}) {
  const r = analysis.full_result
  return (
    <div className="bg-surface rounded-xl border border-border/40 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-border/40 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xl font-bold">{analysis.symbol}</span>
            <span className={`px-3 py-1 rounded-lg border text-sm font-semibold ${getRecommendationBg(analysis.recommendation)}`}>
              {analysis.recommendation}
            </span>
          </div>
          <p className="text-sm text-muted">{timeAgo(analysis.analyzed_at)}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-accent">{analysis.confidence}%</p>
          <p className="text-xs text-muted">Độ tin cậy</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 divide-x divide-border/40 border-b border-border/40">
        {[
          { label: 'Mục tiêu', value: analysis.target_price > 0 ? formatVND(analysis.target_price) : '—', cls: 'text-green-400' },
          { label: 'Cắt lỗ',  value: analysis.stop_loss > 0    ? formatVND(analysis.stop_loss)    : '—', cls: 'text-red-400'   },
          { label: 'Thời gian', value: r.holdingPeriod || '—', cls: 'text-gray-300' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="p-4 text-center">
            <p className="text-[11px] text-muted mb-1">{label}</p>
            <p className={`text-sm font-semibold ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Scores */}
      <div className="grid grid-cols-3 gap-4 p-4 border-b border-border/40">
        {[
          { label: 'Kỹ thuật', score: r.technicalScore   },
          { label: 'Cơ bản',   score: r.fundamentalScore },
          { label: 'Tâm lý',   score: r.sentimentScore   },
        ].map(({ label, score }) => (
          <div key={label} className="text-center">
            <p className="text-[11px] text-muted mb-2">{label}</p>
            <div className="relative h-1.5 bg-surface2 rounded-full overflow-hidden">
              <div className="absolute h-full bg-accent rounded-full" style={{ width: `${score * 10}%` }} />
            </div>
            <p className="text-xs font-semibold mt-1">{score}/10</p>
          </div>
        ))}
      </div>

      {/* Action + pros/risks */}
      <div className="p-4 space-y-3">
        {r.action && (
          <p className="text-sm text-gray-300 leading-relaxed">{r.action}</p>
        )}
        {r.pros && r.pros.length > 0 && (
          <div>
            <p className="text-[11px] text-muted uppercase tracking-wider mb-1.5">Điểm tích cực</p>
            <ul className="space-y-1">
              {r.pros.slice(0, 3).map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                  <span className="text-green-400 mt-0.5">▸</span>{p}
                </li>
              ))}
            </ul>
          </div>
        )}
        {r.risks && r.risks.length > 0 && (
          <div>
            <p className="text-[11px] text-muted uppercase tracking-wider mb-1.5">Rủi ro</p>
            <ul className="space-y-1">
              {r.risks.slice(0, 3).map((r2, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                  <span className="text-red-400 mt-0.5">▸</span>{r2}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={onReanalyze}
          className="w-full mt-2 py-2.5 bg-accent/10 border border-accent/20 text-accent rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors flex items-center justify-center gap-2"
        >
          <BarChart2 className="w-4 h-4" />
          Phân tích lại {analysis.symbol}
        </button>
      </div>
    </div>
  )
}
