'use client'

import { useState } from 'react'
import type { NewsItem } from '@/types'
import { Sparkles, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { getClientToken } from '@/lib/requireAuth'

interface AISummaryProps {
  news: NewsItem[]
}

interface SummaryResult {
  headline: string
  summary: string
  impact: 'TÍCH CỰC' | 'TRUNG LẬP' | 'TIÊU CỰC'
  keyPoints: string[]
  watchSymbols: string[]
}

export default function AISummary({ news }: AISummaryProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SummaryResult | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(true)

  const handleSummarize = async () => {
    if (news.length === 0) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const token = getClientToken()
      const res = await fetch('/api/news-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ news: news.slice(0, 5) }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Lỗi phân tích')
      }
      const data: SummaryResult = await res.json()
      setResult(data)
      setExpanded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định')
    } finally {
      setLoading(false)
    }
  }

  const ImpactIcon =
    result?.impact === 'TÍCH CỰC'
      ? TrendingUp
      : result?.impact === 'TIÊU CỰC'
        ? TrendingDown
        : Minus

  const impactColor =
    result?.impact === 'TÍCH CỰC'
      ? 'text-accent'
      : result?.impact === 'TIÊU CỰC'
        ? 'text-danger'
        : 'text-gold'

  return (
    <div className="card-glass overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-gold" />
          <span className="font-medium text-sm">AI Tóm Tắt Hôm Nay</span>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-muted hover:text-gray-100 transition-colors"
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          )}
          <button
            onClick={handleSummarize}
            disabled={loading || news.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gold/10 text-gold hover:bg-gold/20 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {loading ? 'Đang phân tích...' : result ? 'Phân tích lại' : 'Phân tích AI'}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 pb-4">
          <p className="text-xs text-danger">
            {error.includes('key') ? 'Cần Claude API key để sử dụng tính năng này' : error}
          </p>
        </div>
      )}

      {loading && (
        <div className="px-4 pb-4 space-y-2 animate-pulse">
          <div className="h-4 bg-border rounded w-3/4" />
          <div className="h-3 bg-border rounded w-full" />
          <div className="h-3 bg-border rounded w-5/6" />
        </div>
      )}

      {result && expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {/* Impact + Headline */}
          <div className="flex items-start gap-2">
            <ImpactIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${impactColor}`} />
            <p className={`text-sm font-medium ${impactColor}`}>{result.headline}</p>
          </div>

          {/* Summary */}
          <p className="text-xs text-gray-400 leading-relaxed">{result.summary}</p>

          {/* Key points */}
          {result.keyPoints?.length > 0 && (
            <div className="space-y-1">
              {result.keyPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-gray-400">
                  <span className="text-gold mt-0.5 flex-shrink-0">•</span>
                  {point}
                </div>
              ))}
            </div>
          )}

          {/* Watch symbols */}
          {result.watchSymbols?.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted">Theo dõi:</span>
              {result.watchSymbols.map((s) => (
                <span
                  key={s}
                  className="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded font-medium"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
