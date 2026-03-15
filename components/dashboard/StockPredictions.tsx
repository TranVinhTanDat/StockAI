'use client'

import { useState, useEffect, useCallback } from 'react'
import type { PredictionItem, SavedPrediction } from '@/types'
import { formatVND, getRecommendationBg } from '@/lib/utils'
import type { InvestmentStyle } from '@/lib/claude'
import { Target, Sparkles, AlertTriangle, TrendingUp, Zap, Coins, BarChart3, RefreshCw, Database, History, ChevronRight } from 'lucide-react'
import { getClientToken } from '@/lib/requireAuth'
import { getPredictions, savePredictions, getAllPredictions } from '@/lib/storage'

const STYLES: { key: InvestmentStyle; label: string; icon: React.ComponentType<{ className?: string }>; desc: string; color: string }[] = [
  { key: 'longterm', label: 'Dài Hạn',   icon: TrendingUp, desc: 'Buy & Hold 3-5 năm',   color: 'text-accent' },
  { key: 'dca',      label: 'DCA',        icon: RefreshCw,  desc: 'Bình quân giá vốn',    color: 'text-blue-400' },
  { key: 'swing',    label: 'Lướt Sóng',  icon: Zap,        desc: '1-4 tuần',             color: 'text-gold' },
  { key: 'dividend', label: 'Cổ Tức',     icon: Coins,      desc: 'Thu nhập thụ động',    color: 'text-emerald-400' },
  { key: 'etf',      label: 'VN30 Style', icon: BarChart3,  desc: 'Blue-chip chỉ số',     color: 'text-purple-400' },
]

const RISK_COLORS: Record<string, string> = {
  'THẤP': 'text-accent bg-accent/10',
  'TRUNG BÌNH': 'text-gold bg-gold/10',
  'CAO': 'text-danger bg-danger/10',
}

function styleLabel(key: string): string {
  return STYLES.find(s => s.key === key)?.label ?? key
}

export default function StockPredictions() {
  const [style, setStyle] = useState<InvestmentStyle>('longterm')
  const [predictions, setPredictions] = useState<PredictionItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(false)
  const [fromStorage, setFromStorage] = useState(false)
  const [predictedAt, setPredictedAt] = useState<string | null>(null)
  const [history, setHistory] = useState<SavedPrediction[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Load history of all analyzed styles
  const loadHistory = useCallback(async () => {
    const all = await getAllPredictions()
    setHistory(all)
  }, [])

  // On style change: load from storage (no auto-fetch)
  useEffect(() => {
    let cancelled = false
    async function loadFromStorage() {
      const saved = await getPredictions(style)
      if (!cancelled) {
        if (saved) {
          setPredictions(saved.predictions)
          setFromStorage(true)
          setPredictedAt(saved.predicted_at)
        } else {
          setPredictions(null)
          setFromStorage(false)
          setPredictedAt(null)
        }
        setError(false)
      }
    }
    loadFromStorage()
    return () => { cancelled = true }
  }, [style])

  // Load history on mount
  useEffect(() => { loadHistory() }, [loadHistory])

  const runAnalysis = useCallback(async (s: string) => {
    setIsLoading(true)
    setError(false)
    setFromStorage(false)
    setPredictedAt(null)

    try {
      const token = getClientToken()
      const res = await fetch(`/api/predict?style=${s}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: PredictionItem[] = await res.json()
      await savePredictions(s, data)
      setPredictions(data)
      setFromStorage(false)
      setPredictedAt(new Date().toISOString())
      // Refresh history after saving
      await loadHistory()
    } catch {
      setError(true)
      setPredictions(null)
    } finally {
      setIsLoading(false)
    }
  }, [loadHistory])

  const handleReanalyze = () => runAnalysis(style)

  // Load a saved prediction from history panel
  const handleLoadFromHistory = (saved: SavedPrediction) => {
    setStyle(saved.style as InvestmentStyle)
    setPredictions(saved.predictions)
    setFromStorage(true)
    setPredictedAt(saved.predicted_at)
    setShowHistory(false)
    setError(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Target className="w-5 h-5 text-accent" />
          AI Dự Đoán — Mã Nên Đầu Tư
        </h2>
        <div className="flex items-center gap-2">
          {predictedAt && (
            <span className="flex items-center gap-1 text-xs text-gold bg-gold/10 border border-gold/20 rounded-full px-2.5 py-1">
              <Database className="w-3 h-3" />
              {fromStorage ? 'Lưu trữ' : 'Vừa phân tích'} · {new Date(predictedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
            </span>
          )}
          {/* History toggle */}
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(v => !v)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                showHistory
                  ? 'bg-surface2 text-gray-100 border border-border'
                  : 'bg-surface2 hover:bg-border text-muted hover:text-gray-100'
              }`}
              title="Lịch sử phân tích AI"
            >
              <History className="w-3.5 h-3.5" />
              Lịch sử ({history.length})
            </button>
          )}
          <button
            onClick={handleReanalyze}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            title="Chạy phân tích AI sâu (mất ~30-60s)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Đang phân tích...' : 'Phân tích AI'}
          </button>
        </div>
      </div>

      {/* ── History panel ─────────────────────────────────── */}
      {showHistory && history.length > 0 && (
        <div className="card-glass border border-border/50 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-surface2/60 border-b border-border/40 flex items-center gap-2">
            <History className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-gray-200">Lịch sử phân tích gần đây</span>
            <span className="text-xs text-muted ml-auto">{history.length} phong cách đã lưu</span>
          </div>
          <div className="divide-y divide-border/30">
            {history.map((h) => {
              const styleInfo = STYLES.find(s => s.key === h.style)
              const Icon = styleInfo?.icon ?? Target
              const top3 = h.predictions.slice(0, 3)
              return (
                <button
                  key={h.style}
                  onClick={() => handleLoadFromHistory(h)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-surface2/50 transition-colors text-left ${h.style === style ? 'bg-accent/5' : ''}`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${styleInfo?.color ?? 'text-muted'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-gray-200">{styleLabel(h.style)}</span>
                      {h.style === style && <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">Đang xem</span>}
                    </div>
                    <div className="text-xs text-muted">
                      Top: {top3.map(p => `${p.symbol} ★${p.score}`).join(' · ')}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[10px] text-muted">
                      {new Date(h.predicted_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted" />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Style tabs */}
      <div className="flex flex-wrap gap-2">
        {STYLES.map((s) => {
          const Icon = s.icon
          const isActive = style === s.key
          const hasSaved = history.some(h => h.style === s.key)
          return (
            <button
              key={s.key}
              onClick={() => setStyle(s.key)}
              className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-accent/15 text-accent border border-accent/40 shadow shadow-accent/10'
                  : 'bg-surface2 text-muted border border-transparent hover:text-gray-100 hover:bg-surface2/80'
              }`}
            >
              {hasSaved && !isActive && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent/60" />
              )}
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

      {/* Empty state */}
      {!isLoading && !error && !predictions && (
        <div className="card-glass p-10 text-center">
          <Target className="w-10 h-10 text-muted mx-auto mb-3 opacity-40" />
          <p className="text-gray-300 font-medium mb-1">Chưa có phân tích cho phong cách này</p>
          <p className="text-xs text-muted mb-4">Nhấn &ldquo;Phân tích AI&rdquo; để chạy phân tích sâu với ADX, dòng tiền ngoại, momentum đa khung</p>
          <button
            onClick={handleReanalyze}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent/15 text-accent border border-accent/30 rounded-lg text-sm font-medium hover:bg-accent/25 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Chạy phân tích AI ngay
          </button>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="card-glass p-8 text-center">
          <Sparkles className="w-8 h-8 text-muted mx-auto mb-3 opacity-50" />
          <p className="text-muted text-sm">Phân tích thất bại. Vui lòng thử lại.</p>
          <button onClick={handleReanalyze} className="mt-3 text-xs text-accent hover:underline">Thử lại</button>
        </div>
      )}

      {/* Predictions grid */}
      {!isLoading && predictions && predictions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {predictions.map((p) => (
            <div key={p.symbol} className="card-glass p-5 hover:bg-surface2/30 transition-colors">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 text-accent font-bold text-sm">
                    #{p.rank}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-100">{p.symbol}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${getRecommendationBg(p.recommendation)}`}>
                        {p.recommendation}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm text-gray-300">{formatVND(p.currentPrice)}</span>
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
                    {formatVND(p.entryZone.low)} – {formatVND(p.entryZone.high)}
                  </span>
                </span>
              </div>

              {/* Key metrics */}
              <div className="flex gap-4 text-xs mb-3">
                {(() => {
                  const km = p.keyMetrics as Record<string, number>
                  const pe = km.pe ?? 0
                  const roe = km.roe ?? 0
                  const growth = km.growth ?? 0
                  return <>
                    <span className="text-muted">P/E: <span className="text-gray-300 font-medium">{pe.toFixed(1)}x</span></span>
                    <span className="text-muted">ROE: <span className="text-gray-300 font-medium">{roe.toFixed(1)}%</span></span>
                    <span className="text-muted">
                      Growth: <span className={`font-medium ${growth >= 0 ? 'text-accent' : 'text-danger'}`}>
                        {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
                      </span>
                    </span>
                  </>
                })()}
              </div>

              {/* Reason */}
              <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">{p.reason}</p>
            </div>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Chỉ mang tính tham khảo, không phải lời khuyên đầu tư. Phân tích AI dựa trên dữ liệu VPS realtime + ADX + dòng tiền ngoại.</span>
      </div>
    </div>
  )
}
