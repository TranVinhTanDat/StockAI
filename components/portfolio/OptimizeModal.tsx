'use client'

import { useState, useEffect } from 'react'
import type { PortfolioHolding, OptimizeResult } from '@/types'
import { Bot, X, Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, Zap, BarChart2, RefreshCw, Database } from 'lucide-react'
import { formatVND } from '@/lib/utils'
import { getClientToken } from '@/lib/requireAuth'
import { getOptimizeResult, saveOptimizeResult } from '@/lib/storage'

interface OptimizeModalProps {
  holdings: PortfolioHolding[]
  prices: Record<string, number>
  cash?: number
}

const ACTION_STYLE: Record<string, string> = {
  'MUA THÊM':           'bg-accent/15 text-accent border border-accent/30',
  'GIỮ':                'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  'CHỐT LỜI':           'bg-gold/15 text-gold border border-gold/30',
  'CHỐT LỜI MỘT PHẦN': 'bg-gold/15 text-gold border border-gold/30',
  'CẮT LỖ':             'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  'BÁN TOÀN BỘ':        'bg-danger/15 text-danger border border-danger/30',
}

const RISK_STYLE: Record<string, string> = {
  'Thấp':       'text-green-400',
  'Trung bình': 'text-yellow-400',
  'Cao':        'text-red-400',
}

const LOADING_STEPS = [
  'Đang lấy dữ liệu giá 90 ngày...',
  'Tính RSI, MACD, Bollinger Bands...',
  'Phân tích tài chính ROE/ROA/P/E từ Simplize...',
  'Đọc tin tức mới nhất từng mã...',
  'Lấy bối cảnh VN-Index...',
  'Claude Opus 4 đang phân tích sâu...',
]

function ActionIcon({ action }: { action: string }) {
  if (action.includes('MUA')) return <TrendingUp className="w-3.5 h-3.5" />
  if (action.includes('BÁN') || action.includes('CẮT')) return <TrendingDown className="w-3.5 h-3.5" />
  return <Minus className="w-3.5 h-3.5" />
}

export default function OptimizeModal({ holdings, prices, cash = 0 }: OptimizeModalProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadStep, setLoadStep] = useState(0)
  const [result, setResult] = useState<OptimizeResult | null>(null)
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [error, setError] = useState('')

  // Load saved result when modal opens
  useEffect(() => {
    if (!open) return
    let cancelled = false
    getOptimizeResult().then(saved => {
      if (!cancelled && saved) {
        setResult(saved.result)
        setAnalyzedAt(saved.analyzed_at)
        setFromCache(true)
      }
    })
    return () => { cancelled = true }
  }, [open])

  const handleOptimize = async () => {
    if (holdings.length === 0) return
    setLoading(true)
    setError('')
    setResult(null)
    setAnalyzedAt(null)
    setFromCache(false)
    setLoadStep(0)

    const stepInterval = setInterval(() => {
      setLoadStep(s => (s < LOADING_STEPS.length - 1 ? s + 1 : s))
    }, 2200)

    const holdingsWithPrice = holdings.map((h) => ({
      symbol: h.symbol,
      qty: h.qty,
      avgCost: h.avg_cost,
      currentPrice: prices[h.symbol] || h.avg_cost,
    }))

    try {
      const token = getClientToken()
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ holdings: holdingsWithPrice, cash }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi phân tích AI')
      // Save to storage (upsert — ghi đè kết quả cũ)
      await saveOptimizeResult(data as OptimizeResult)
      setResult(data)
      setAnalyzedAt(new Date().toISOString())
      setFromCache(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định')
    } finally {
      clearInterval(stepInterval)
      setLoading(false)
    }
  }

  const handleOpen = () => {
    setOpen(true)
    // Don't auto-run — let useEffect load from cache first
  }

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={holdings.length === 0}
        className="btn-primary flex items-center gap-2 disabled:opacity-50"
      >
        <Bot className="w-4 h-4" />
        AI Phân Tích Danh Mục
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card-glass w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between sticky top-0 bg-surface z-10">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Bot className="w-5 h-5 text-accent flex-shrink-0" />
                <h3 className="font-semibold truncate">AI Phân Tích Danh Mục Toàn Diện</h3>
                <span className="text-[10px] text-accent/60 font-normal bg-accent/10 px-1.5 py-0.5 rounded flex-shrink-0">claude-opus-4-6</span>
              </div>
              <div className="flex items-center gap-2 ml-3">
                {/* Timestamp badge */}
                {analyzedAt && !loading && (
                  <span className="hidden sm:flex items-center gap-1 text-[10px] text-gold bg-gold/10 border border-gold/20 rounded-full px-2 py-0.5 flex-shrink-0">
                    <Database className="w-2.5 h-2.5" />
                    {fromCache ? 'Đã lưu' : 'Vừa xong'} · {new Date(analyzedAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {/* Re-analyze button */}
                {!loading && (
                  <button
                    onClick={handleOptimize}
                    disabled={holdings.length === 0}
                    className="flex items-center gap-1 text-xs bg-surface2 hover:bg-border text-muted hover:text-gray-100 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                    title="Chạy phân tích AI mới (ghi đè kết quả cũ)"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {result ? 'Phân tích lại' : 'Phân tích AI'}
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-muted hover:text-gray-100 transition-colors p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Empty state — no saved result */}
              {!loading && !result && !error && (
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                  <Bot className="w-12 h-12 text-muted opacity-30" />
                  <div>
                    <p className="text-gray-300 font-medium mb-1">Chưa có phân tích danh mục</p>
                    <p className="text-xs text-muted mb-4">
                      Phân tích sâu {holdings.length} mã với RSI, MACD, ADX, ROA/ROE, dòng tiền NN, VN-Index
                    </p>
                    <button
                      onClick={handleOptimize}
                      disabled={holdings.length === 0}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent/15 text-accent border border-accent/30 rounded-xl text-sm font-medium hover:bg-accent/25 transition-colors disabled:opacity-40"
                    >
                      <Bot className="w-4 h-4" />
                      Chạy phân tích AI ngay
                    </button>
                  </div>
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div className="flex flex-col items-center gap-4 py-10">
                  <Loader2 className="w-10 h-10 text-accent animate-spin" />
                  <div className="text-center">
                    <p className="text-sm text-gray-300 font-medium mb-1">{LOADING_STEPS[loadStep]}</p>
                    <p className="text-xs text-muted/60">Phân tích {holdings.length} mã · RSI + MACD + ADX + ROA/ROE + Tin tức + VN-Index</p>
                  </div>
                  <div className="flex gap-1.5">
                    {LOADING_STEPS.map((_, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i <= loadStep ? 'bg-accent' : 'bg-surface2'}`} />
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-center space-y-2">
                  <p className="text-danger text-sm font-medium">Không thể phân tích danh mục</p>
                  <p className="text-xs text-muted">{error}</p>
                  <button
                    onClick={handleOptimize}
                    className="mt-2 text-xs px-3 py-1.5 bg-surface2 hover:bg-border text-gray-300 rounded-lg transition-colors"
                  >
                    Thử lại
                  </button>
                </div>
              )}

              {/* Result */}
              {result && !loading && (
                <div className="space-y-5">
                  {/* Context bar */}
                  <div className="flex gap-3 flex-wrap text-xs text-muted bg-surface2 rounded-lg px-4 py-2.5">
                    <span>CP: <span className="text-gray-200 font-medium">
                      {formatVND(holdings.reduce((s, h) => s + h.qty * (prices[h.symbol] || h.avg_cost), 0))}
                    </span></span>
                    <span>·</span>
                    <span>Tiền mặt: <span className="text-gray-200 font-medium">{formatVND(cash)}</span></span>
                    <span>·</span>
                    <span>{holdings.length} mã · Dữ liệu 90 ngày</span>
                    {analyzedAt && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Database className="w-3 h-3" />
                          {fromCache ? 'Đã lưu' : 'Vừa phân tích'} lúc {new Date(analyzedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Market context */}
                  {result.marketContext && (
                    <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-4">
                      <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <BarChart2 className="w-3.5 h-3.5" /> Bối Cảnh Thị Trường
                      </h4>
                      <p className="text-sm text-gray-300 leading-relaxed">{result.marketContext}</p>
                    </div>
                  )}

                  {/* Risk warnings */}
                  {result.riskWarnings && result.riskWarnings.length > 0 && (
                    <div className="bg-orange-500/8 border border-orange-500/25 rounded-xl p-4">
                      <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Cảnh Báo Rủi Ro
                      </h4>
                      <ul className="space-y-1.5">
                        {result.riskWarnings.map((w, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-orange-300/90">
                            <span className="text-orange-400 flex-shrink-0 mt-0.5">⚠</span>
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Overall analysis */}
                  <div>
                    <h4 className="text-xs font-semibold text-accent uppercase tracking-wider mb-2">Nhận Xét Tổng Quan</h4>
                    <p className="text-sm text-gray-300 leading-relaxed">{result.analysis}</p>
                  </div>

                  {/* Per-stock recommendations */}
                  {result.stockRecommendations && result.stockRecommendations.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gold uppercase tracking-wider mb-3">Khuyến Nghị Từng Mã</h4>
                      <div className="space-y-2.5">
                        {result.stockRecommendations.map((rec) => {
                          const recStyle = ACTION_STYLE[rec.action] || 'bg-surface2 text-muted border border-border'
                          const currentPrice = prices[rec.symbol] || 0
                          const holding = holdings.find(h => h.symbol === rec.symbol)
                          const pnlPct = holding && currentPrice > 0
                            ? ((currentPrice - holding.avg_cost) / holding.avg_cost) * 100 : null
                          const riskCls = RISK_STYLE[rec.riskLevel || ''] || 'text-muted'
                          return (
                            <div key={rec.symbol} className="bg-surface2/60 rounded-xl p-3.5 space-y-2">
                              <div className="flex items-center gap-3">
                                <div className="flex flex-col items-center min-w-[52px]">
                                  <span className="font-bold text-sm text-gray-100">{rec.symbol}</span>
                                  {pnlPct !== null && (
                                    <span className={`text-[10px] font-medium ${pnlPct >= 0 ? 'text-accent' : 'text-danger'}`}>
                                      {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                                <div className="flex-1 flex items-center gap-2 flex-wrap">
                                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${recStyle}`}>
                                    <ActionIcon action={rec.action} />
                                    {rec.action}
                                  </span>
                                  {rec.riskLevel && (
                                    <span className={`text-[10px] font-medium ${riskCls}`}>
                                      Rủi ro: {rec.riskLevel}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-gray-400 leading-relaxed">{rec.reason}</p>
                              {rec.catalyst && (
                                <div className="flex items-start gap-1.5 text-[11px] text-accent/80 bg-accent/5 rounded-lg px-2.5 py-1.5">
                                  <Zap className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                  <span>{rec.catalyst}</span>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Suggestions */}
                  <div>
                    <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Gợi Ý Điều Chỉnh</h4>
                    <ul className="space-y-1.5">
                      {result.suggestions.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-accent mt-0.5 flex-shrink-0 font-bold">{i + 1}.</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Rebalance plan */}
                  <div>
                    <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">Kế Hoạch Tái Cơ Cấu</h4>
                    <p className="text-sm text-gray-300 leading-relaxed bg-surface2 rounded-lg p-4 border-l-2 border-purple-400/40">
                      {result.rebalancePlan}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
