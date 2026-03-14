'use client'

import { useState } from 'react'
import type { AnalysisResult as AnalysisResultType, QuoteData } from '@/types'
import {
  formatVND,
  formatPct,
  getRecommendationColor,
  getRecommendationBg,
  getChangeColor,
} from '@/lib/utils'
import { saveAnalysis } from '@/lib/storage'
import { formatCacheAge, formatCacheTTL } from '@/lib/analysisCache'
import {
  Target,
  ShieldAlert,
  ArrowDownToLine,
  Clock,
  Save,
  RefreshCw,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Lightbulb,
  Database,
  Zap,
  TrendingUp,
  TrendingDown,
  Briefcase,
} from 'lucide-react'

interface HoldingSnapshot {
  qty: number
  avgCost: number
  totalCost: number
}

interface AnalysisResultProps {
  result: AnalysisResultType
  quote: QuoteData
  symbol: string
  fromCache?: boolean
  cachedAt?: string
  expiresAt?: string
  onReanalyze: () => void
  onRefresh?: () => void
  onViewChart: () => void
  currentHolding?: HoldingSnapshot | null
}

export default function AnalysisResult({
  result,
  quote,
  symbol,
  fromCache = false,
  cachedAt,
  expiresAt,
  onReanalyze,
  onRefresh,
  onViewChart,
  currentHolding,
}: AnalysisResultProps) {
  const [activeTab, setActiveTab] = useState<'technical' | 'fundamental' | 'sentiment'>('technical')
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    await saveAnalysis(symbol, result)
    setSaved(true)
    window.dispatchEvent(new CustomEvent('stockai:analysis-saved'))
    setTimeout(() => setSaved(false), 2000)
  }

  const upsidePct =
    quote.price > 0 ? ((result.targetPrice - quote.price) / quote.price) * 100 : 0
  const downsidePct =
    quote.price > 0 ? ((result.stopLoss - quote.price) / quote.price) * 100 : 0

  const tabs = [
    { key: 'technical' as const, label: 'Kỹ Thuật', score: result.technicalScore },
    { key: 'fundamental' as const, label: 'Cơ Bản', score: result.fundamentalScore },
    { key: 'sentiment' as const, label: 'Tâm Lý', score: result.sentimentScore },
  ]

  const overallScore = Math.round(
    (result.technicalScore + result.fundamentalScore + result.sentimentScore) / 3
  )

  return (
    <div className="card-glass overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="p-5 border-b border-border">
        <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-accent" />
            {symbol} — Phân tích AI
          </h3>

          {/* Cache / Fresh badge */}
          {fromCache && cachedAt ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-gold bg-gold/10 border border-gold/20 rounded-full px-2.5 py-1">
                <Database className="w-3 h-3" />
                Bộ nhớ đệm · {formatCacheAge(cachedAt)}
                {expiresAt && (
                  <span className="text-gold/60 ml-1">({formatCacheTTL(expiresAt)})</span>
                )}
              </span>
            </div>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-accent bg-accent/10 border border-accent/20 rounded-full px-2.5 py-1">
              <Zap className="w-3 h-3" />
              Phân tích mới · {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* ── Recommendation + Metrics ─────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Recommendation box */}
          <div
            className={`flex flex-col items-center justify-center p-5 rounded-xl border-2 min-w-[140px] ${getRecommendationBg(result.recommendation)}`}
          >
            <span className={`text-2xl font-bold ${getRecommendationColor(result.recommendation)}`}>
              {result.recommendation}
            </span>
            <div className="mt-2 text-xs text-current/70">Độ tin cậy</div>
            <div className="w-full mt-1 h-1.5 bg-black/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-current rounded-full transition-all"
                style={{ width: `${result.confidence}%` }}
              />
            </div>
            <span className="text-sm font-bold mt-1">{result.confidence}%</span>

            {/* Overall score */}
            <div className="mt-2 text-xs text-current/60">Điểm tổng</div>
            <span className="text-lg font-bold">{overallScore}/10</span>
          </div>

          {/* Price targets grid */}
          <div className="flex-1 grid grid-cols-2 gap-3">
            {/* Current price */}
            <div className="col-span-2 flex items-center gap-3 bg-surface2 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs text-muted">Giá hiện tại</p>
                <span className={`text-xl font-bold ${getChangeColor(quote.changePct)}`}>
                  {formatVND(quote.price)}
                </span>
                <span className={`ml-2 text-sm ${getChangeColor(quote.changePct)}`}>
                  {formatPct(quote.changePct)}
                </span>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-muted">Khối lượng</p>
                <p className="text-sm font-medium">{(quote.volume / 1000).toFixed(0)}K CP</p>
              </div>
            </div>

            {/* Target price */}
            <div className="bg-surface2 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Target className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs text-muted">Mục tiêu</span>
              </div>
              <p className="font-semibold text-accent">{formatVND(result.targetPrice)}</p>
              <p className={`text-xs font-medium mt-0.5 flex items-center gap-0.5 ${upsidePct >= 0 ? 'text-accent' : 'text-danger'}`}>
                {upsidePct >= 0
                  ? <TrendingUp className="w-3 h-3" />
                  : <TrendingDown className="w-3 h-3" />
                }
                {upsidePct >= 0 ? '+' : ''}{upsidePct.toFixed(1)}% upside
              </p>
            </div>

            {/* Stop loss */}
            <div className="bg-surface2 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <ShieldAlert className="w-3.5 h-3.5 text-danger" />
                <span className="text-xs text-muted">Cắt lỗ</span>
              </div>
              <p className="font-semibold text-danger">{formatVND(result.stopLoss)}</p>
              <p className="text-xs text-danger/80 mt-0.5">{downsidePct.toFixed(1)}% downside</p>
            </div>

            {/* Entry zone */}
            <div className="bg-surface2 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowDownToLine className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs text-muted">Vào lệnh</span>
              </div>
              <p className="text-sm font-medium">
                {formatVND(result.entryZone.low)}
              </p>
              <p className="text-xs text-muted">– {formatVND(result.entryZone.high)}</p>
            </div>

            {/* Holding period */}
            <div className="bg-surface2 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5 text-gold" />
                <span className="text-xs text-muted">Nắm giữ</span>
              </div>
              <p className="text-sm font-medium">{result.holdingPeriod}</p>
              <p className="text-xs text-muted">Xem lại: {result.nextReview}</p>
            </div>
          </div>
        </div>

        {/* Risk/Reward ratio */}
        {upsidePct !== 0 && downsidePct !== 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <span>Risk/Reward:</span>
            <span className={`font-semibold ${Math.abs(upsidePct / downsidePct) >= 2 ? 'text-accent' : 'text-gold'}`}>
              1 : {Math.abs(upsidePct / downsidePct).toFixed(1)}
            </span>
            {Math.abs(upsidePct / downsidePct) >= 2 && (
              <span className="text-accent">✓ Tỷ lệ tốt</span>
            )}
          </div>
        )}

        {/* Vị thế của bạn */}
        {currentHolding && currentHolding.qty > 0 && (() => {
          const currentValue = currentHolding.qty * quote.price
          const pnl = currentValue - currentHolding.totalCost
          const pnlPct = currentHolding.totalCost > 0 ? (pnl / currentHolding.totalCost) * 100 : 0
          const isProfit = pnl >= 0
          return (
            <div className="mt-4 bg-surface2 rounded-xl p-4 border border-accent/20">
              <h4 className="text-sm font-semibold text-accent mb-3 flex items-center gap-2">
                <Briefcase className="w-4 h-4" /> Vị Thế Của Bạn
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <p className="text-xs text-muted mb-0.5">CP nắm giữ</p>
                  <p className="font-semibold text-sm">{currentHolding.qty.toLocaleString('vi-VN')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted mb-0.5">Giá vốn TB</p>
                  <p className="font-semibold text-sm">{formatVND(currentHolding.avgCost)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted mb-0.5">Tổng đầu tư</p>
                  <p className="font-semibold text-sm">{formatVND(currentHolding.totalCost)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted mb-0.5">Giá trị hiện tại</p>
                  <p className="font-semibold text-sm">{formatVND(currentValue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted mb-0.5">Lãi/lỗ chưa TH</p>
                  <p className={`font-semibold text-sm ${isProfit ? 'text-accent' : 'text-danger'}`}>
                    {isProfit ? '+' : ''}{formatVND(pnl)}
                    <span className="ml-1 text-xs">({isProfit ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
                  </p>
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Score Tabs ─────────────────────────────────────────────────────── */}
      <div className="border-b border-border">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-gray-300'
              }`}
            >
              <span>{tab.label}</span>
              <span className="ml-1.5 text-xs">
                {Array.from({ length: 10 }, (_, i) => (
                  <span key={i} className={i < tab.score ? (activeTab === tab.key ? 'text-accent' : 'text-gray-500') : 'text-border'}>●</span>
                ))}
              </span>
              <span className="ml-1">{tab.score}/10</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Analysis Body ──────────────────────────────────────────────────── */}
      <div className="p-5">
        <p className="text-sm text-gray-300 leading-relaxed mb-4 min-h-[60px]">
          {activeTab === 'technical' && result.technical}
          {activeTab === 'fundamental' && result.fundamental}
          {activeTab === 'sentiment' && result.sentiment}
        </p>

        {/* Pros / Risks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-surface2/50 rounded-lg p-3">
            <h4 className="text-sm font-medium text-accent mb-2 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> Điểm tích cực
            </h4>
            <div className="space-y-1.5">
              {result.pros.map((pro, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-300">
                  <span className="text-accent mt-0.5 flex-shrink-0">✓</span>
                  {pro}
                </div>
              ))}
            </div>
          </div>
          <div className="bg-surface2/50 rounded-lg p-3">
            <h4 className="text-sm font-medium text-danger mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Rủi ro
            </h4>
            <div className="space-y-1.5">
              {result.risks.map((risk, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-300">
                  <span className="text-danger mt-0.5 flex-shrink-0">⚠</span>
                  {risk}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="bg-surface2 rounded-lg p-4 mb-4 border-l-4 border-gold">
          <div className="flex items-center gap-2 mb-1.5">
            <Lightbulb className="w-4 h-4 text-gold" />
            <span className="text-sm font-semibold text-gold">Hành động ngay</span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">{result.action}</p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={handleSave}
            disabled={saved}
            className="btn-primary py-2 px-4 text-sm flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            {saved ? 'Đã lưu!' : 'Lưu phân tích'}
          </button>

          {fromCache && onRefresh ? (
            <button
              onClick={onRefresh}
              className="bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 py-2 px-4 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Làm mới (gọi AI)
            </button>
          ) : (
            <button
              onClick={onReanalyze}
              className="bg-surface2 hover:bg-border text-gray-100 py-2 px-4 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Phân tích lại
            </button>
          )}

          <button
            onClick={onViewChart}
            className="bg-surface2 hover:bg-border text-gray-100 py-2 px-4 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            Xem Chart
          </button>

          {fromCache && cachedAt && (
            <span className="text-xs text-muted ml-auto">
              Tiết kiệm ~$0.05 · phân tích lúc {new Date(cachedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
