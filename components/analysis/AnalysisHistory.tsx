'use client'

import { useEffect, useState } from 'react'
import { getAnalyses } from '@/lib/storage'
import type { SavedAnalysis } from '@/types'
import { formatVND, getRecommendationBg, timeAgo } from '@/lib/utils'
import { History, Eye } from 'lucide-react'

interface Props {
  onSelect?: (analysis: SavedAnalysis) => void
}

export default function AnalysisHistory({ onSelect }: Props) {
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const reload = () => { getAnalyses().then(setAnalyses) }
    reload()
    window.addEventListener('stockai:analysis-saved', reload)
    return () => window.removeEventListener('stockai:analysis-saved', reload)
  }, [])

  if (analyses.length === 0) {
    return (
      <div className="card-glass p-6 text-center text-muted">
        <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Chưa có lịch sử phân tích</p>
        <p className="text-xs mt-1">Phân tích cổ phiếu để lưu kết quả</p>
      </div>
    )
  }

  const handleClick = (a: SavedAnalysis) => {
    setSelectedId(a.id)
    onSelect?.(a)
  }

  return (
    <div className="card-glass overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <History className="w-4 h-4 text-muted" />
          Lịch sử phân tích
        </h3>
        {onSelect && (
          <span className="text-xs text-muted/60 italic">Click để xem lại phân tích</span>
        )}
      </div>
      <div className="divide-y divide-border/50">
        {analyses.slice(0, 10).map((a) => (
          <div
            key={a.id}
            onClick={() => handleClick(a)}
            className={`px-4 py-3 flex items-center gap-3 transition-colors ${
              onSelect ? 'cursor-pointer hover:bg-surface2/50' : ''
            } ${selectedId === a.id ? 'bg-accent/5 border-l-2 border-accent' : ''}`}
          >
            <span className="font-semibold text-sm w-12">{a.symbol}</span>
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
    </div>
  )
}
