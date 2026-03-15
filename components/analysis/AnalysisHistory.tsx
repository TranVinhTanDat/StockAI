'use client'

import { useEffect, useState } from 'react'
import { getAnalyses } from '@/lib/storage'
import type { SavedAnalysis } from '@/types'
import { formatVND, getRecommendationBg, timeAgo } from '@/lib/utils'
import { History, Eye, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 10

interface Props {
  /** When provided, only show analyses for this symbol */
  symbol?: string
  onSelect?: (analysis: SavedAnalysis) => void
}

export default function AnalysisHistory({ symbol, onSelect }: Props) {
  const [allAnalyses, setAllAnalyses] = useState<SavedAnalysis[]>([])
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [page, setPage]               = useState(1)

  useEffect(() => {
    const reload = () => { getAnalyses().then(setAllAnalyses) }
    reload()
    window.addEventListener('stockai:analysis-saved', reload)
    return () => window.removeEventListener('stockai:analysis-saved', reload)
  }, [])

  // When symbol changes, reset selected and go to page 1
  useEffect(() => {
    setSelectedId(null)
    setPage(1)
  }, [symbol])

  const analyses = symbol
    ? allAnalyses.filter(a => a.symbol === symbol.toUpperCase())
    : allAnalyses

  if (analyses.length === 0) return null

  const totalPages = Math.max(1, Math.ceil(analyses.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paginated  = analyses.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const handleClick = (a: SavedAnalysis) => {
    setSelectedId(a.id)
    onSelect?.(a)
  }

  const label = symbol ? `Lịch sử ${symbol.toUpperCase()}` : 'Lịch sử phân tích'

  return (
    <div className="card-glass overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
        <span className="font-semibold flex items-center gap-2 text-sm">
          <History className="w-4 h-4 text-muted" />
          {label}
          <span className="text-xs bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-semibold">
            {analyses.length}
          </span>
        </span>
        <a href="/analysis-history" className="text-xs text-accent hover:underline">
          Xem tất cả →
        </a>
      </div>

      {/* List */}
      <div className="divide-y divide-border/50">
        {paginated.map((a) => (
          <div
            key={a.id}
            onClick={() => handleClick(a)}
            className={`px-4 py-3 flex items-center gap-3 transition-colors ${
              onSelect ? 'cursor-pointer hover:bg-surface2/50' : ''
            } ${selectedId === a.id ? 'bg-accent/5 border-l-2 border-accent' : ''}`}
          >
            {!symbol && (
              <span className="font-semibold text-sm w-12">{a.symbol}</span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${getRecommendationBg(a.recommendation)}`}>
              {a.recommendation}
            </span>
            <span className="text-xs text-muted flex-1">
              {a.target_price ? formatVND(a.target_price) : '---'}
            </span>
            <span className="text-xs text-muted">{a.confidence}%</span>
            <span className="text-xs text-muted">{timeAgo(a.analyzed_at)}</span>
            {onSelect && (
              <Eye className="w-3.5 h-3.5 text-muted/40 hover:text-accent transition-colors flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-border/50 px-4 py-2 flex items-center justify-between">
          <span className="text-[10px] text-muted">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, analyses.length)} / {analyses.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={safePage <= 1}
              onClick={() => setPage(p => p - 1)}
              className="p-1 rounded text-muted hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-6 h-6 text-[10px] rounded transition-colors ${
                  p === safePage
                    ? 'bg-accent/20 text-accent font-semibold'
                    : 'text-muted hover:text-gray-200'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              disabled={safePage >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="p-1 rounded text-muted hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
