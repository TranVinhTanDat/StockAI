'use client'

import { useEffect, useState, useCallback } from 'react'
import { BookOpen, RefreshCw, Zap, Database, TrendingUp, TrendingDown } from 'lucide-react'
import { formatCacheAge } from '@/lib/analysisCache'

const DIARY_CACHE_KEY = 'sai_market_diary'
const DIARY_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface DiaryCache {
  diary: string
  generatedAt: string
  expiresAt: string
  marketSnapshot: {
    vnindex: number
    vnindexChangePct: number
    advancing: number
    declining: number
  } | null
}

function getCachedDiary(): DiaryCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(DIARY_CACHE_KEY)
    if (!raw) return null
    const entry: DiaryCache = JSON.parse(raw)
    if (Date.now() > new Date(entry.expiresAt).getTime()) {
      localStorage.removeItem(DIARY_CACHE_KEY)
      return null
    }
    return entry
  } catch {
    return null
  }
}

function setCachedDiary(data: Omit<DiaryCache, 'expiresAt'>): void {
  if (typeof window === 'undefined') return
  try {
    const entry: DiaryCache = {
      ...data,
      expiresAt: new Date(Date.now() + DIARY_TTL_MS).toISOString(),
    }
    localStorage.setItem(DIARY_CACHE_KEY, JSON.stringify(entry))
  } catch {}
}

export default function MarketDiary() {
  const [diary, setDiary] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<string>('')
  const [snapshot, setSnapshot] = useState<DiaryCache['marketSnapshot']>(null)
  const [error, setError] = useState<string>('')

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedDiary()
      if (cached) {
        setDiary(cached.diary)
        setGeneratedAt(cached.generatedAt)
        setSnapshot(cached.marketSnapshot)
        setFromCache(true)
        return
      }
    }

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/market-diary')
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Lỗi tải nhật ký')
      }
      const data = await res.json()
      setDiary(data.diary)
      setGeneratedAt(data.generatedAt)
      setSnapshot(data.marketSnapshot)
      setFromCache(false)
      setCachedDiary({
        diary: data.diary,
        generatedAt: data.generatedAt,
        marketSnapshot: data.marketSnapshot,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="card-glass overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2 text-sm">
          <BookOpen className="w-4 h-4 text-gold" />
          Nhật Ký Thị Trường · AI
        </h3>
        <div className="flex items-center gap-2">
          {generatedAt && (
            <span
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                fromCache
                  ? 'text-gold bg-gold/10 border-gold/20'
                  : 'text-accent bg-accent/10 border-accent/20'
              }`}
            >
              {fromCache ? <Database className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
              {fromCache ? formatCacheAge(generatedAt) : 'Vừa tạo'}
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="text-muted hover:text-accent transition-colors disabled:opacity-50"
            title="Làm mới (tốn ~$0.01)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Market snapshot mini-bar */}
      {snapshot && (
        <div className="px-4 py-2 bg-surface2/50 border-b border-border/50 flex items-center gap-4 text-xs">
          <span className="text-muted">VN-Index</span>
          <span className="font-bold">{snapshot.vnindex.toFixed(2)}</span>
          <span className={`flex items-center gap-0.5 font-medium ${snapshot.vnindexChangePct >= 0 ? 'text-accent' : 'text-danger'}`}>
            {snapshot.vnindexChangePct >= 0
              ? <TrendingUp className="w-3 h-3" />
              : <TrendingDown className="w-3 h-3" />
            }
            {snapshot.vnindexChangePct >= 0 ? '+' : ''}{snapshot.vnindexChangePct.toFixed(2)}%
          </span>
          <span className="text-muted ml-auto">
            <span className="text-accent mr-1">▲{snapshot.advancing}</span>
            <span className="text-danger">▼{snapshot.declining}</span>
          </span>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 bg-gold rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <p className="text-xs text-muted">Claude Haiku đang phân tích thị trường...</p>
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-4">
            <p className="text-danger text-sm mb-2">{error}</p>
            <button
              onClick={() => load(true)}
              className="text-xs text-accent hover:underline"
            >
              Thử lại
            </button>
          </div>
        )}

        {diary && !loading && (
          <p className="text-sm text-gray-300 leading-relaxed">{diary}</p>
        )}

        {!diary && !loading && !error && (
          <div className="text-center py-6">
            <p className="text-muted text-sm mb-3">Chưa có nhật ký thị trường hôm nay</p>
            <button
              onClick={() => load(true)}
              className="btn-primary py-2 px-4 text-xs flex items-center gap-1.5 mx-auto"
            >
              <Zap className="w-3 h-3" />
              Tạo nhật ký (~$0.01)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
