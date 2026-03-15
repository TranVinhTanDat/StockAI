'use client'

import { useState, useEffect, useCallback } from 'react'
import type { PredictionItem } from '@/types'
import {
  formatVND,
  getRecommendationBg,
} from '@/lib/utils'
import type { InvestmentStyle } from '@/lib/claude'
import { Target, Sparkles, AlertTriangle, TrendingUp, Shield, Zap, Coins, BarChart3, RefreshCw, Database } from 'lucide-react'
import { getClientToken } from '@/lib/requireAuth'

const CACHE_TTL_MS: Record<string, number> = {
  swing: 2 * 60 * 60 * 1000,
  dca: 12 * 60 * 60 * 1000,
  longterm: 12 * 60 * 60 * 1000,
  dividend: 12 * 60 * 60 * 1000,
  etf: 6 * 60 * 60 * 1000,
}
const cacheKey = (style: string) => `sai_predict_v2_${style}`

interface CachedPredictions {
  data: PredictionItem[]
  cachedAt: string
  expires: number
}

function loadCache(style: string): CachedPredictions | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(cacheKey(style))
    if (!raw) return null
    const parsed: CachedPredictions = JSON.parse(raw)
    if (Date.now() > parsed.expires) {
      localStorage.removeItem(cacheKey(style))
      return null
    }
    return parsed
  } catch { return null }
}

function saveCache(style: string, data: PredictionItem[]) {
  try {
    const ttl = CACHE_TTL_MS[style] ?? 6 * 60 * 60 * 1000
    const entry: CachedPredictions = {
      data,
      cachedAt: new Date().toISOString(),
      expires: Date.now() + ttl,
    }
    localStorage.setItem(cacheKey(style), JSON.stringify(entry))
  } catch {}
}

const STYLES: { key: InvestmentStyle; label: string; icon: React.ComponentType<{ className?: string }>; desc: string; color: string }[] = [
  { key: 'longterm', label: 'Dài Hạn', icon: TrendingUp, desc: 'Buy & Hold 3-5 năm', color: 'text-accent' },
  { key: 'dca',      label: 'DCA',      icon: RefreshCw,  desc: 'Bình quân giá vốn',   color: 'text-blue-400' },
  { key: 'swing',    label: 'Lướt Sóng', icon: Zap,       desc: '1-4 tuần',             color: 'text-gold' },
  { key: 'dividend', label: 'Cổ Tức',   icon: Coins,      desc: 'Thu nhập thụ động',    color: 'text-emerald-400' },
  { key: 'etf',      label: 'VN30 Style', icon: BarChart3, desc: 'Blue-chip chỉ số',    color: 'text-purple-400' },
]

const RISK_COLORS: Record<string, string> = {
  'THẤP': 'text-accent bg-accent/10',
  'TRUNG BÌNH': 'text-gold bg-gold/10',
  'CAO': 'text-danger bg-danger/10',
}

export default function StockPredictions() {
  const [style, setStyle] = useState<InvestmentStyle>('longterm')
  const [predictions, setPredictions] = useState<PredictionItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(null)

  const fetchPredictions = useCallback(async (s: string, forceRefresh = false) => {
    // Check cache first
    if (!forceRefresh) {
      const cached = loadCache(s)
      if (cached) {
        setPredictions(cached.data)
        setFromCache(true)
        setCachedAt(cached.cachedAt)
        setIsLoading(false)
        return
      }
    }

    setIsLoading(true)
    setError(false)
    setFromCache(false)
    setCachedAt(null)

    try {
      const token = getClientToken()
      const res = await fetch(`/api/predict?style=${s}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: PredictionItem[] = await res.json()
      saveCache(s, data)
      setPredictions(data)
    } catch {
      setError(true)
      setPredictions(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load on style change
  useEffect(() => {
    fetchPredictions(style)
  }, [style, fetchPredictions])

  const handleReanalyze = () => {
    try { localStorage.removeItem(cacheKey(style)) } catch {}
    fetchPredictions(style, true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Target className="w-5 h-5 text-accent" />
          AI Dự Đoán — Mã Nên Đầu Tư
        </h2>
        <div className="flex items-center gap-2">
          {fromCache && cachedAt && (
            <span className="flex items-center gap-1 text-xs text-gold bg-gold/10 border border-gold/20 rounded-full px-2.5 py-1">
              <Database className="w-3 h-3" />
              Bộ đệm · {new Date(cachedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={handleReanalyze}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs bg-surface2 hover:bg-border text-muted hover:text-gray-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            title="Phân tích lại (gọi AI)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Phân tích lại
          </button>
        </div>
      </div>

      {/* Style tabs */}
      <div className="flex flex-wrap gap-2">
        {STYLES.map((s) => {
          const Icon = s.icon
          const isActive = style === s.key
          return (
            <button
              key={s.key}
              onClick={() => setStyle(s.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-accent/15 text-accent border border-accent/40 shadow shadow-accent/10'
                  : 'bg-surface2 text-muted border border-transparent hover:text-gray-100 hover:bg-surface2/80'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-accent' : s.color}`} />
              <div className="text-left">
                <div className="leading-tight">{s.label}</div>
                <div className="text-[10px] opacity-60 leading-tight hidden sm:block">{s.desc}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Active style description */}
      {(() => {
        const active = STYLES.find(s => s.key === style)
        if (!active) return null
        const Icon = active.icon
        return (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface2/60 border border-border/30 text-xs text-muted">
            <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${active.color}`} />
            <span>
              {style === 'longterm' && 'Tìm cổ phiếu có nền tảng cơ bản tốt để nắm giữ 3-5 năm'}
              {style === 'dca' && 'Tìm mã ổn định, xu hướng dài hạn tích cực, phù hợp mua đều đặn hàng tháng'}
              {style === 'swing' && 'Tìm mã có tín hiệu kỹ thuật ngắn hạn hấp dẫn, tiềm năng tăng 1-4 tuần'}
              {style === 'dividend' && 'Tìm mã cổ tức cao (>4%), cashflow ổn định, thu nhập thụ động bền vững'}
              {style === 'etf' && 'Tìm cổ phiếu trụ cột VN30 — blue-chip vốn hóa lớn, thanh khoản cao'}
            </span>
          </div>
        )
      })()}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card-glass p-5 animate-pulse space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-border" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-24 bg-border rounded" />
                  <div className="h-3 w-32 bg-border rounded" />
                </div>
                <div className="h-6 w-16 bg-border rounded" />
              </div>
              <div className="h-3 w-full bg-border rounded" />
              <div className="h-3 w-3/4 bg-border rounded" />
              <div className="flex gap-4">
                <div className="h-3 w-16 bg-border rounded" />
                <div className="h-3 w-16 bg-border rounded" />
                <div className="h-3 w-16 bg-border rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="card-glass p-8 text-center">
          <Sparkles className="w-8 h-8 text-muted mx-auto mb-3 opacity-50" />
          <p className="text-muted text-sm">Đang tải dự đoán AI...</p>
          <p className="text-xs text-muted mt-1">Cần Claude API key để sử dụng tính năng này</p>
        </div>
      )}

      {/* Predictions */}
      {predictions && predictions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {predictions.map((p) => (
            <div
              key={p.symbol}
              className="card-glass p-5 hover:bg-surface2/30 transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 text-accent font-bold text-sm">
                    #{p.rank}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-100">{p.symbol}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${getRecommendationBg(p.recommendation)}`}
                      >
                        {p.recommendation}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm text-gray-300">
                        {formatVND(p.currentPrice)}
                      </span>
                      <span className={`text-xs font-medium ${p.upsidePct >= 0 ? 'text-accent' : 'text-danger'}`}>
                        {p.upsidePct >= 0 ? '+' : ''}{p.upsidePct.toFixed(1)}%↑
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-accent">★ {p.score}</div>
                  <div className={`text-xs px-2 py-0.5 rounded mt-1 ${RISK_COLORS[p.riskLevel] || 'text-muted bg-surface2'}`}>
                    {p.riskLevel}
                  </div>
                </div>
              </div>

              {/* Targets */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3">
                <span className="text-muted">
                  🎯 Target: <span className="text-gray-200 font-medium">{formatVND(p.targetPrice)}</span>
                </span>
                <span className="text-muted">
                  📥 Vào lệnh: <span className="text-gray-200 font-medium">
                    {formatVND(p.entryZone.low)} - {formatVND(p.entryZone.high)}
                  </span>
                </span>
              </div>

              {/* Key metrics */}
              <div className="flex gap-4 text-xs mb-3">
                {(() => {
                  const km = p.keyMetrics as Record<string, number>
                  const pe = km.pe ?? km.pe_historic ?? 0
                  const roe = km.roe ?? km.roe_historic ?? 0
                  const growth = km.growth ?? km.growth_historic ?? 0
                  return <>
                    <span className="text-muted">
                      P/E: <span className="text-gray-300 font-medium">{pe.toFixed(1)}x</span>
                    </span>
                    <span className="text-muted">
                      ROE: <span className="text-gray-300 font-medium">{roe.toFixed(1)}%</span>
                    </span>
                    <span className="text-muted">
                      Growth: <span className={`font-medium ${growth >= 0 ? 'text-accent' : 'text-danger'}`}>
                        {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
                      </span>
                    </span>
                  </>
                })()}
              </div>

              {/* Reason */}
              <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">
                {p.reason}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Chỉ mang tính tham khảo, không phải lời khuyên đầu tư. Dữ liệu VPS realtime.</span>
      </div>
    </div>
  )
}
