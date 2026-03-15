'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getAnalyses } from '@/lib/storage'
import type { SavedAnalysis, QuoteData } from '@/types'
import AnalysisResult from '@/components/analysis/AnalysisResult'
import { formatVND, getRecommendationBg, timeAgo } from '@/lib/utils'
import {
  ArrowLeft, History, TrendingUp, RefreshCw, Eye,
  Search, ChevronRight, BarChart2, Zap,
} from 'lucide-react'

export default function AnalysisHistoryPage() {
  const router = useRouter()
  const [analyses, setAnalyses]       = useState<SavedAnalysis[]>([])
  const [filter, setFilter]           = useState<string>('all')
  const [selected, setSelected]       = useState<SavedAnalysis | null>(null)
  const [quote, setQuote]             = useState<QuoteData | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [quoteError, setQuoteError]   = useState(false)
  const [search, setSearch]           = useState('')

  const reload = useCallback(() => {
    getAnalyses().then(list => {
      setAnalyses(list)
      // auto-select first if none selected
      if (!selected && list.length > 0) setSelected(list[0])
    })
  }, [selected])

  useEffect(() => {
    reload()
    window.addEventListener('stockai:analysis-saved', reload)
    return () => window.removeEventListener('stockai:analysis-saved', reload)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch live quote when an analysis is selected
  useEffect(() => {
    if (!selected) { setQuote(null); return }
    setLoadingQuote(true)
    setQuoteError(false)
    fetch(`/api/quote?symbol=${selected.symbol}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setQuoteError(true)
        else setQuote(data as QuoteData)
      })
      .catch(() => setQuoteError(true))
      .finally(() => setLoadingQuote(false))
  }, [selected])

  const uniqueSymbols = Array.from(new Set(analyses.map(a => a.symbol))).sort()

  const filtered = analyses.filter(a => {
    const matchSym = filter === 'all' || a.symbol === filter
    const matchSearch = !search || a.symbol.includes(search.toUpperCase())
    return matchSym && matchSearch
  })

  const handleReanalyze = (sym: string) => {
    router.push(`/?symbol=${sym}&analyze=1`)
  }

  return (
    <div className="min-h-screen bg-bg text-gray-200">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-border/60">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
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

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-5 min-h-[calc(100vh-60px)]">

        {/* ── Left sidebar: list ── */}
        <aside className="w-[280px] flex-shrink-0 flex flex-col gap-3">

          {/* Symbol filter chips */}
          {uniqueSymbols.length > 1 && (
            <div className="bg-surface rounded-xl border border-border/40 p-3">
              <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2">Lọc theo mã</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setFilter('all')}
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
                    onClick={() => setFilter(sym)}
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
            </div>
          )}

          {/* Search */}
          {uniqueSymbols.length > 4 && (
            <div className="flex items-center gap-2 bg-surface border border-border/40 rounded-lg px-3 py-2">
              <Search className="w-3.5 h-3.5 text-muted" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tìm mã..."
                className="bg-transparent text-sm outline-none w-full placeholder:text-muted"
              />
            </div>
          )}

          {/* Analysis list */}
          <div className="bg-surface rounded-xl border border-border/40 overflow-hidden flex-1">
            {filtered.length === 0 ? (
              <div className="p-6 text-center">
                <History className="w-8 h-8 mx-auto mb-2 text-muted opacity-50" />
                <p className="text-sm text-muted">Chưa có phân tích nào</p>
                <p className="text-xs text-muted/60 mt-1">
                  {analyses.length === 0
                    ? 'Phân tích cổ phiếu để lưu kết quả'
                    : 'Thử bỏ bộ lọc'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {filtered.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelected(a)}
                    className={`w-full text-left px-3 py-3 hover:bg-surface2/60 transition-colors flex items-center gap-2.5 ${
                      selected?.id === a.id ? 'bg-accent/5 border-l-2 border-accent' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold text-gray-100">{a.symbol}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${getRecommendationBg(a.recommendation)}`}>
                          {a.recommendation}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted">
                        <span>{a.confidence}% tin cậy</span>
                        {a.target_price > 0 && (
                          <>
                            <span>·</span>
                            <span>Mục tiêu: {formatVND(a.target_price)}</span>
                          </>
                        )}
                      </div>
                      <p className="text-[10px] text-muted/60 mt-0.5">{timeAgo(a.analyzed_at)}</p>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${
                      selected?.id === a.id ? 'text-accent' : 'text-muted/40'
                    }`} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* ── Right: detail ── */}
        <main className="flex-1 min-w-0">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center">
              <Eye className="w-12 h-12 text-muted/30 mb-3" />
              <p className="text-muted text-sm">Chọn một phân tích để xem chi tiết</p>
            </div>
          ) : loadingQuote ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mb-3" />
              <p className="text-sm text-muted">Đang tải giá hiện tại...</p>
            </div>
          ) : quoteError || !quote ? (
            <div className="space-y-4">
              {/* Fallback: show analysis without live quote */}
              <div className="bg-surface rounded-xl border border-border/40 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted">Không thể tải giá hiện tại cho <span className="text-accent font-semibold">{selected.symbol}</span></p>
                  <p className="text-[11px] text-muted/60 mt-0.5">Hiển thị kết quả phân tích đã lưu</p>
                </div>
                <button
                  onClick={() => handleReanalyze(selected.symbol)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 border border-accent/20 text-accent rounded-lg text-xs hover:bg-accent/20 transition-colors"
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  Phân tích lại
                </button>
              </div>
              <AnalysisSummaryCard analysis={selected} onReanalyze={() => handleReanalyze(selected.symbol)} />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Context bar */}
              <div className="bg-surface rounded-xl border border-border/40 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <p className="text-xs text-muted">
                    Phân tích lúc: <span className="text-gray-300">{new Date(selected.analyzed_at).toLocaleString('vi-VN')}</span>
                  </p>
                  <span className="text-muted">·</span>
                  <p className="text-xs text-muted">
                    Giá hiện tại: <span className="text-gray-300 font-mono">{formatVND(quote.price)}</span>
                    {selected.target_price > 0 && (
                      <span className={`ml-1.5 font-semibold ${
                        quote.price >= selected.target_price ? 'text-green-400' : 'text-muted'
                      }`}>
                        {quote.price >= selected.target_price ? '✓ Đạt mục tiêu' : `→ Mục tiêu: ${formatVND(selected.target_price)}`}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleReanalyze(selected.symbol)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 border border-accent/20 text-accent rounded-lg text-xs hover:bg-accent/20 transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Phân tích lại
                </button>
              </div>

              <AnalysisResult
                result={selected.full_result}
                quote={quote}
                symbol={selected.symbol}
                fromCache={true}
                cachedAt={selected.analyzed_at}
                onReanalyze={() => handleReanalyze(selected.symbol)}
                onViewChart={() => router.push(`/?symbol=${selected.symbol}`)}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

// ── Fallback card when live quote unavailable ─────────────────────────────────

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
          { label: 'Cắt lỗ', value: analysis.stop_loss > 0 ? formatVND(analysis.stop_loss) : '—', cls: 'text-red-400' },
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
          { label: 'Kỹ thuật', score: r.technicalScore },
          { label: 'Cơ bản', score: r.fundamentalScore },
          { label: 'Tâm lý', score: r.sentimentScore },
        ].map(({ label, score }) => (
          <div key={label} className="text-center">
            <p className="text-[11px] text-muted mb-2">{label}</p>
            <div className="relative h-1.5 bg-surface2 rounded-full overflow-hidden">
              <div
                className="absolute h-full bg-accent rounded-full"
                style={{ width: `${score * 10}%` }}
              />
            </div>
            <p className="text-xs font-semibold mt-1">{score}/10</p>
          </div>
        ))}
      </div>

      {/* Action */}
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
                  <span className="text-green-400 mt-0.5">▸</span>
                  {p}
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
                  <span className="text-red-400 mt-0.5">▸</span>
                  {r2}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={onReanalyze}
          className="w-full mt-2 py-2.5 bg-accent/10 border border-accent/20 text-accent rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors"
        >
          Phân tích lại {analysis.symbol}
        </button>
      </div>
    </div>
  )
}
