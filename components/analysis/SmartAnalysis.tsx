'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  Zap, Search, TrendingUp, TrendingDown, BarChart3, Target,
  CheckCircle, AlertTriangle, ChevronDown, ChevronUp,
  Activity, DollarSign, Newspaper, RefreshCw, Minus,
  Building2, FileText, Globe, ExternalLink, Wallet,
  Heart, Scale,
} from 'lucide-react'
import { calcRSI } from '@/lib/indicators'
import type { SmartScoreResult } from '@/lib/smartScore'
import type { NewsItem, PortfolioHolding, Balance } from '@/types'
import CompanyProfile from '@/components/analysis/CompanyProfile'
import CafefCompanyData from '@/components/analysis/CafefCompanyData'
import IndustryComparison from '@/components/analysis/IndustryComparison'
import AnalystReports from '@/components/analysis/AnalystReports'

const CandlestickChart = dynamic(
  () => import('@/components/chart/CandlestickChart'),
  {
    ssr: false,
    loading: () => (
      <div className="card-glass h-[380px] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    ),
  }
)

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoricalData {
  closes: number[]
  highs: number[]
  lows: number[]
  volumes: number[]
  timestamps: number[]
}

interface BusinessPlan {
  year: number
  revenueTarget: number
  revenueActual: number
  profitTarget: number
  profitActual: number
}

interface SmartAnalysisData extends SmartScoreResult {
  stockName?: string
  exchange?: string
  volume?: number
  marketCap?: number
  openPrice?: number
  highPrice?: number
  lowPrice?: number
  w52high?: number
  w52low?: number
  vnIndexLevel?: number
  vnIndexTrend?: number
  vnIndexRsi?: number
  quarterlyEPS?: Array<{ period: string; eps: number; pe: number }>
  businessPlan?: BusinessPlan | null
  historicalData?: HistoricalData
  pe?: number
  pb?: number
  roe?: number
  roa?: number
  eps?: number
  netMargin?: number
  dividendYield?: number
  debtEquity?: number
  revenueGrowth?: number
  profitGrowth?: number
  // sma200 already in SmartScoreResult
}

// ─── Advanced Technical Calculations ─────────────────────────────────────────

interface IchimokuResult {
  tenkan: number; kijun: number; senkouA: number; senkouB: number
  cloudTop: number; cloudBottom: number; signal: string; tkKjSignal: string; bullish: boolean
}

function calcIchimoku(highs: number[], lows: number[], closes: number[]): IchimokuResult | null {
  const n = closes.length
  if (n < 52) return null
  const mid = (h: number[], l: number[], period: number, idx: number) => {
    const start = Math.max(0, idx - period + 1)
    return (Math.max(...h.slice(start, idx + 1)) + Math.min(...l.slice(start, idx + 1))) / 2
  }
  const last = n - 1
  const tenkan = mid(highs, lows, 9, last)
  const kijun = mid(highs, lows, 26, last)
  const senkouA = (tenkan + kijun) / 2
  const senkouB = mid(highs, lows, 52, last)
  const price = closes[last]
  const cloudTop = Math.max(senkouA, senkouB)
  const cloudBottom = Math.min(senkouA, senkouB)
  let signal: string, bullish = false
  if (price > cloudTop) { signal = 'Giá TRÊN mây — Xu hướng TĂNG mạnh'; bullish = true }
  else if (price < cloudBottom) { signal = 'Giá DƯỚI mây — Xu hướng GIẢM, tránh mua' }
  else { signal = 'Giá TRONG mây — Tích lũy, chưa rõ xu hướng' }
  const tkKjSignal = tenkan > kijun
    ? 'Tenkan > Kijun — Momentum TĂNG (tín hiệu MUA)'
    : 'Tenkan < Kijun — Momentum GIẢM (tín hiệu BÁN)'
  if (tenkan > kijun) bullish = true
  return {
    tenkan: Math.round(tenkan), kijun: Math.round(kijun),
    senkouA: Math.round(senkouA), senkouB: Math.round(senkouB),
    cloudTop: Math.round(cloudTop), cloudBottom: Math.round(cloudBottom),
    signal, tkKjSignal, bullish,
  }
}

interface StochRSIResult { k: number; d: number; signal: string; bullish: boolean }

function calcStochRSI(closes: number[], rsiPeriod = 14, stochPeriod = 14): StochRSIResult | null {
  const rsiArr = calcRSI(closes, rsiPeriod)
  const validRsi = rsiArr.filter(v => !isNaN(v))
  if (validRsi.length < stochPeriod + 3) return null
  const stochK: number[] = []
  for (let i = stochPeriod - 1; i < validRsi.length; i++) {
    const slice = validRsi.slice(i - stochPeriod + 1, i + 1)
    const min = Math.min(...slice), max = Math.max(...slice)
    stochK.push(max === min ? 50 : (validRsi[i] - min) / (max - min) * 100)
  }
  if (stochK.length < 3) return null
  const lastK = stochK[stochK.length - 1]
  const lastD = (stochK[stochK.length - 1] + stochK[stochK.length - 2] + stochK[stochK.length - 3]) / 3
  let signal: string, bullish: boolean
  if (lastK < 20 && lastD < 20) { signal = `StochRSI ${Math.round(lastK)}/${Math.round(lastD)} — Quá bán, tín hiệu MUA`; bullish = true }
  else if (lastK > 80 && lastD > 80) { signal = `StochRSI ${Math.round(lastK)}/${Math.round(lastD)} — Quá mua, tín hiệu BÁN`; bullish = false }
  else if (lastK > lastD) { signal = `StochRSI ${Math.round(lastK)}/${Math.round(lastD)} — %K trên %D, momentum TĂNG`; bullish = true }
  else { signal = `StochRSI ${Math.round(lastK)}/${Math.round(lastD)} — %K dưới %D, momentum GIẢM`; bullish = false }
  return { k: Math.round(lastK), d: Math.round(lastD), signal, bullish }
}

interface PivotPoints { P: number; R1: number; R2: number; R3: number; S1: number; S2: number; S3: number }

function calcPivotPoints(high: number, low: number, close: number): PivotPoints {
  const P = (high + low + close) / 3
  return {
    P: Math.round(P), R1: Math.round(2 * P - low), R2: Math.round(P + (high - low)), R3: Math.round(high + 2 * (P - low)),
    S1: Math.round(2 * P - high), S2: Math.round(P - (high - low)), S3: Math.round(low - 2 * (high - P)),
  }
}

// ─── Valuation & Financial Health Calculations ────────────────────────────────

const INDUSTRY_MEDIAN_PE: Record<string, number> = {
  'Ngân hàng': 10, 'Bảo hiểm': 12, 'Chứng khoán': 14,
  'Bất động sản': 18, 'Xây dựng': 12,
  'Công nghệ': 22, 'Phần mềm': 24,
  'Tiêu dùng': 20, 'Bán lẻ': 18, 'Thực phẩm': 18,
  'Năng lượng': 12, 'Điện': 14,
  'Vật liệu': 14, 'Thép': 10, 'Hóa chất': 12,
  'Dược phẩm': 25, 'Y tế': 22,
  'Vận tải': 14, 'Logistics': 16,
  'Nông nghiệp': 14, 'Thủy sản': 12,
}

function getIndustryPE(industry: string): number {
  for (const [key, pe] of Object.entries(INDUSTRY_MEDIAN_PE)) {
    if (industry?.toLowerCase().includes(key.toLowerCase().split(' ')[0])) return pe
  }
  return 16
}

interface ValuationResult {
  trailing4QEPS: number
  epsFairValue: number
  grahamNumber: number
  pegFairValue: number
  avgFairValue: number
  upsideAvg: number
  industryPE: number
  models: Array<{ name: string; value: number; upside: number; note: string }>
}

function calcValuation(r: SmartAnalysisData): ValuationResult | null {
  const pe = r.pe ?? 0
  const pb = r.pb ?? 0
  const eps = r.eps ?? 0
  const profitGrowth = r.profitGrowth ?? 0
  const price = r.price ?? 0
  const industry = r.industry ?? ''
  const quarterlyEPS = r.quarterlyEPS ?? []

  if (price <= 0) return null

  // Trailing 4Q EPS
  const t4q = quarterlyEPS.length >= 4
    ? quarterlyEPS.slice(0, 4).reduce((s, q) => s + (q.eps || 0), 0)
    : eps
  const trailing4QEPS = t4q > 0 ? t4q : eps

  const industryPE = getIndustryPE(industry) || (pe > 0 ? pe * 0.8 : 16)

  // Model 1: EPS × Sector Median P/E
  const epsFairValue = trailing4QEPS > 0 ? Math.round(trailing4QEPS * industryPE) : 0

  // Model 2: Graham Number = sqrt(22.5 × EPS × BookValue), BV = Price/PB
  const bvEstimate = pb > 0 ? price / pb : 0
  const grahamNumber = trailing4QEPS > 0 && bvEstimate > 0
    ? Math.round(Math.sqrt(22.5 * trailing4QEPS * bvEstimate))
    : 0

  // Model 3: PEG Fair Value — P/E should equal growth rate
  const cappedGrowth = Math.max(5, Math.min(profitGrowth, 35))
  const pegFairValue = trailing4QEPS > 0 && profitGrowth > 0
    ? Math.round(cappedGrowth * trailing4QEPS)
    : 0

  const vals = [epsFairValue, grahamNumber, pegFairValue].filter(v => v > 0)
  const avgFairValue = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
  const upsideAvg = avgFairValue > 0 ? Math.round(((avgFairValue - price) / price) * 1000) / 10 : 0

  const models: Array<{ name: string; value: number; upside: number; note: string }> = []
  if (epsFairValue > 0) models.push({
    name: 'EPS × Ngành PE', value: epsFairValue,
    upside: Math.round(((epsFairValue - price) / price) * 1000) / 10,
    note: `EPS trailing 4Q: ${trailing4QEPS.toFixed(0)} × P/E ngành: ${industryPE}x`,
  })
  if (grahamNumber > 0) models.push({
    name: 'Graham Number', value: grahamNumber,
    upside: Math.round(((grahamNumber - price) / price) * 1000) / 10,
    note: `√(22.5 × EPS × BV) | BV≈${Math.round(bvEstimate).toLocaleString('vi-VN')}₫`,
  })
  if (pegFairValue > 0) models.push({
    name: 'PEG Fair Value', value: pegFairValue,
    upside: Math.round(((pegFairValue - price) / price) * 1000) / 10,
    note: `Growth-adjusted P/E=${cappedGrowth.toFixed(0)}x × EPS`,
  })

  return { trailing4QEPS, epsFairValue, grahamNumber, pegFairValue, avgFairValue, upsideAvg, industryPE, models }
}

interface HealthResult {
  score: number
  maxScore: number
  label: string
  color: string
  checks: Array<{ pass: boolean; text: string }>
}

function calcFinancialHealth(r: SmartAnalysisData): HealthResult {
  const roe = r.roe ?? 0
  const roa = r.roa ?? 0
  const profitGrowth = r.profitGrowth ?? 0
  const revenueGrowth = r.revenueGrowth ?? 0
  const debtEquity = r.debtEquity ?? 0
  const netMargin = r.netMargin ?? 0
  const dividendYield = r.dividendYield ?? 0
  const eps = r.eps ?? 0
  const pe = r.pe ?? 0
  const pb = r.pb ?? 0

  const checks: Array<{ pass: boolean; text: string }> = [
    { pass: roa > 0, text: `ROA dương (${roa.toFixed(1)}%)` },
    { pass: roa >= 5, text: `ROA ≥ 5% (hiện ${roa.toFixed(1)}%)` },
    { pass: roe >= 15, text: `ROE ≥ 15% (hiện ${roe.toFixed(1)}%)` },
    { pass: roe >= 20, text: `ROE xuất sắc ≥ 20% (hiện ${roe.toFixed(1)}%)` },
    { pass: profitGrowth > 0, text: `Lợi nhuận tăng trưởng (${profitGrowth > 0 ? '+' : ''}${profitGrowth.toFixed(1)}%)` },
    { pass: profitGrowth >= 15, text: `Tăng trưởng LN mạnh ≥ 15%` },
    { pass: revenueGrowth > 0, text: `Doanh thu tăng trưởng (${revenueGrowth > 0 ? '+' : ''}${revenueGrowth.toFixed(1)}%)` },
    { pass: debtEquity === 0 || debtEquity < 1.5, text: `Đòn bẩy an toàn D/E < 1.5x (hiện ${debtEquity.toFixed(2)}x)` },
    { pass: netMargin >= 10, text: `Biên LN ròng cao ≥ 10% (hiện ${netMargin.toFixed(1)}%)` },
    { pass: dividendYield > 0, text: `Trả cổ tức (${dividendYield.toFixed(1)}%)` },
    { pass: eps > 0, text: `EPS dương` },
    { pass: pe > 0 && pe < 25, text: `P/E hợp lý < 25x (hiện ${pe > 0 ? pe.toFixed(1) + 'x' : 'N/A'})` },
    { pass: pb > 0 && pb < 3, text: `P/B hợp lý < 3x (hiện ${pb > 0 ? pb.toFixed(2) + 'x' : 'N/A'})` },
  ]

  const score = checks.filter(c => c.pass).length
  const max = checks.length
  const label = score >= 11 ? 'Xuất Sắc' : score >= 9 ? 'Rất Tốt' : score >= 7 ? 'Tốt' : score >= 5 ? 'Trung Bình' : score >= 3 ? 'Yếu' : 'Kém'
  const color = score >= 11 ? 'text-emerald-400' : score >= 9 ? 'text-green-400' : score >= 7 ? 'text-green-400' : score >= 5 ? 'text-yellow-400' : score >= 3 ? 'text-orange-400' : 'text-red-400'

  return { score, maxScore: max, label, color, checks }
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatVND(n: number): string {
  if (!n || isNaN(n)) return '—'
  if (n >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(2) + ' nghìn tỷ'
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' triệu'
  return n.toLocaleString('vi-VN') + '₫'
}

function formatPrice(n: number): string {
  if (!n || isNaN(n)) return '—'
  return n.toLocaleString('vi-VN') + '₫'
}

function formatNum(n: number): string {
  if (!n || isNaN(n)) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toFixed(0)
}

function getRecColor(rec: string): string {
  if (rec === 'MUA MẠNH') return 'text-emerald-400'
  if (rec === 'MUA') return 'text-green-400'
  if (rec === 'GIỮ') return 'text-yellow-400'
  if (rec === 'BÁN') return 'text-orange-400'
  if (rec === 'BÁN MẠNH') return 'text-red-400'
  return 'text-muted'
}

function getRecBg(rec: string): string {
  if (rec === 'MUA MẠNH') return 'bg-emerald-400/10 border-emerald-400/30'
  if (rec === 'MUA') return 'bg-green-400/10 border-green-400/30'
  if (rec === 'GIỮ') return 'bg-yellow-400/10 border-yellow-400/30'
  if (rec === 'BÁN') return 'bg-orange-400/10 border-orange-400/30'
  if (rec === 'BÁN MẠNH') return 'bg-red-400/10 border-red-400/30'
  return 'bg-surface2'
}

function getScoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-400'
  if (score >= 55) return 'text-green-400'
  if (score >= 45) return 'text-yellow-400'
  if (score >= 30) return 'text-orange-400'
  return 'text-red-400'
}

function getScoreBg(score: number): string {
  if (score >= 70) return 'bg-emerald-400'
  if (score >= 55) return 'bg-green-400'
  if (score >= 45) return 'bg-yellow-400'
  if (score >= 30) return 'bg-orange-400'
  return 'bg-red-400'
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ngày trước`
  return new Date(dateStr).toLocaleDateString('vi-VN')
}

// ─── UI sub-components ────────────────────────────────────────────────────────

function ScoreArc({ score, size = 120 }: { score: number; size?: number }) {
  const r = size * 0.38, cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r, arcLen = circ * 0.75
  const fill = arcLen * (score / 100)
  const color = score >= 70 ? '#34d399' : score >= 55 ? '#4ade80' : score >= 45 ? '#facc15' : score >= 30 ? '#fb923c' : '#f87171'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[135deg]">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e2a3a" strokeWidth={size * 0.09}
        strokeDasharray={`${arcLen} ${circ - arcLen}`} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.09}
        strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s ease' }} />
    </svg>
  )
}

function ScoreBar({ label, score, icon: Icon }: { label: string; score: number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted"><Icon className="w-3 h-3" />{label}</span>
        <span className={`font-bold ${getScoreColor(score)}`}>{score}</span>
      </div>
      <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${getScoreBg(score)}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

function SignalRow({ label, value, positive }: { label: string; value: string; positive?: boolean | null }) {
  const Icon = positive === true ? TrendingUp : positive === false ? TrendingDown : Minus
  const color = positive === true ? 'text-green-400' : positive === false ? 'text-red-400' : 'text-muted'
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/30 last:border-0">
      <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${color}`} />
      <span className="text-xs text-muted w-24 flex-shrink-0">{label}</span>
      <span className="text-xs text-gray-200 flex-1">{value}</span>
    </div>
  )
}

function Section({ title, icon: Icon, score, children, defaultOpen = false, badge, color }: {
  title: string; icon: React.ComponentType<{ className?: string }>
  score?: number; children: React.ReactNode; defaultOpen?: boolean; badge?: string; color?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card-glass overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-surface2/30 transition-colors">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color ? `bg-${color}/10` : 'bg-accent/10'}`}>
          <Icon className={`w-4 h-4 ${color ? `text-${color}` : 'text-accent'}`} />
        </div>
        <span className="font-semibold text-sm flex-1 text-left">{title}</span>
        {badge && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20 font-bold mr-1">{badge}</span>}
        {score !== undefined && <span className={`text-sm font-bold mr-2 ${getScoreColor(score)}`}>{score}/100</span>}
        {open ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

function InfoCell({ label, value, sub, colored }: { label: string; value: string; sub?: string; colored?: string }) {
  return (
    <div className="bg-surface2/50 rounded-xl p-3">
      <p className="text-[10px] text-muted mb-0.5">{label}</p>
      <p className={`text-sm font-semibold leading-tight ${colored || 'text-gray-100'}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── News Section ─────────────────────────────────────────────────────────────

function NewsSection({ symbol }: { symbol: string }) {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    fetch(`/api/news?symbol=${symbol}`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => { setNews((Array.isArray(data) ? data : (data.items ?? [])).slice(0, 12)) })
      .catch(() => setNews([]))
      .finally(() => setLoading(false))
  }, [symbol])
  if (loading) return <div className="space-y-2 animate-pulse">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-border/30 rounded-lg" />)}</div>
  if (news.length === 0) return <p className="text-xs text-muted text-center py-4">Không tìm thấy tin tức gần đây</p>
  return (
    <div className="space-y-2">
      {news.map((n, i) => (
        <a key={n.id || i} href={n.url} target="_blank" rel="noopener noreferrer"
          className="flex items-start gap-3 p-3 rounded-xl bg-surface2/40 hover:bg-surface2/70 transition-colors group">
          <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.sentiment >= 60 ? 'bg-green-400' : n.sentiment < 40 ? 'bg-red-400' : 'bg-yellow-400'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-200 leading-relaxed line-clamp-2 group-hover:text-accent transition-colors">{n.title}</p>
            <div className="flex items-center gap-2 mt-1">
              {n.source && <span className="text-[10px] text-muted">{n.source}</span>}
              {n.publishedAt && <span className="text-[10px] text-muted/60">{timeAgo(n.publishedAt)}</span>}
            </div>
          </div>
          <ExternalLink className="w-3 h-3 text-muted/40 group-hover:text-accent flex-shrink-0 mt-0.5 transition-colors" />
        </a>
      ))}
    </div>
  )
}

// ─── Portfolio Panel ──────────────────────────────────────────────────────────

interface PortfolioPanelProps {
  symbol: string
  price: number
  score: number
  recommendation: string
  targetPrice: number
  stopLoss: number
  confidence: string
  holdings: PortfolioHolding[]
  balance: Balance
  technicalScore: number
  fundamentalScore: number
  sentimentScore: number
  rsi14: number
  rsiSignal: string
  trend: string
  macdSignal: string
  pe?: number
  pb?: number
  roe?: number
  roa?: number
  profitGrowth?: number
  revenueGrowth?: number
  netMargin?: number
  peg?: number | null
  foreignFlow?: string
  rsSignal?: string
  relativeStrength?: number
  strengths?: string[]
  weaknesses?: string[]
  watchPoints?: string[]
}

function PortfolioPanel({
  symbol, price, score, recommendation, targetPrice, stopLoss, confidence,
  holdings, balance,
  technicalScore, fundamentalScore, sentimentScore,
  rsi14, rsiSignal, trend, macdSignal,
  pe, roe, profitGrowth, peg,
  foreignFlow, rsSignal,
  watchPoints,
}: PortfolioPanelProps) {
  const holding = holdings.find(h => h.symbol === symbol)

  const currentValue = holding ? holding.qty * price : 0
  const pl = holding ? currentValue - holding.total_cost : 0
  const plPct = holding && holding.total_cost > 0 ? (pl / holding.total_cost) * 100 : 0

  const totalInvested = holdings.reduce((s, h) => s + h.total_cost, 0)
  const totalPortfolio = totalInvested + balance.cash
  const thisWeight = totalPortfolio > 0 && holding ? (holding.total_cost / totalPortfolio) * 100 : 0
  const stopRisk = holding ? Math.abs((stopLoss - price) / price) * currentValue : 0
  const targetGain = holding ? Math.abs((targetPrice - price) / price) * currentValue : 0
  const rrRatio = stopRisk > 0 ? targetGain / stopRisk : 0

  const recColor =
    recommendation === 'MUA MẠNH' ? 'text-green-400 bg-green-400/10 border-green-400/30' :
    recommendation === 'MUA'      ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' :
    recommendation === 'GIỮ'      ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' :
    recommendation === 'BÁN'      ? 'text-orange-400 bg-orange-400/10 border-orange-400/30' :
                                    'text-red-400 bg-red-400/10 border-red-400/30'

  const scoreBarColor = (s: number) => s >= 70 ? 'bg-green-400' : s >= 55 ? 'bg-yellow-400' : s >= 40 ? 'bg-orange-400' : 'bg-red-400'
  const scoreTextColor = (s: number) => s >= 70 ? 'text-green-400' : s >= 55 ? 'text-yellow-400' : s >= 40 ? 'text-orange-400' : 'text-red-400'

  const getActionAdvice = (): string => {
    const targetPct = (((targetPrice - price) / price) * 100).toFixed(1)
    const stopPct = (Math.abs((stopLoss - price) / price) * 100).toFixed(1)
    const isBullish = recommendation === 'MUA MẠNH' || recommendation === 'MUA'
    const isHold    = recommendation === 'GIỮ'
    // BÁN / BÁN MẠNH = bearish

    if (holding) {
      if (isBullish) {
        if (plPct > 25) return `Lãi ${plPct.toFixed(1)}% — vượt ngưỡng tốt. Chốt lời 30–50% tại ${formatPrice(targetPrice)}, dịch stop loss lên ${formatPrice(Math.max(stopLoss, Math.round(holding.avg_cost * 1.05)))} để bảo vệ lợi nhuận.`
        if (plPct < -12) return `Lỗ ${Math.abs(plPct).toFixed(1)}% nhưng điểm kỹ thuật còn tốt (${technicalScore}/100). Giữ nếu không phá ${formatPrice(stopLoss)} — cân nhắc mua thêm tại vùng hỗ trợ.`
        return `${recommendation} (${score}/100). Duy trì vị thế, stop loss ${formatPrice(stopLoss)} (−${stopPct}%), target ${formatPrice(targetPrice)} (+${targetPct}%). R:R = 1:${rrRatio.toFixed(1)}.`
      }
      if (isHold) {
        if (plPct > 15) return `GIỮ — đang lãi ${plPct.toFixed(1)}%. Đặt trailing stop tại ${formatPrice(stopLoss)} để bảo vệ lợi nhuận. Xem xét chốt một phần nếu giá chạm ${formatPrice(targetPrice)}.`
        if (plPct < -10) return `GIỮ — lỗ ${Math.abs(plPct).toFixed(1)}%. Duy trì ngưỡng cắt lỗ tại ${formatPrice(stopLoss)}, thoát ngay nếu giá đóng cửa dưới mức này.`
        return `GIỮ (${score}/100). Duy trì vị thế khi giá trên ${formatPrice(stopLoss)}, cắt lỗ ngay khi phá. Target ${formatPrice(targetPrice)} (+${targetPct}%).`
      }
      // BÁN / BÁN MẠNH
      if (plPct > 0) return `${recommendation} (${score}/100) — đang lãi ${plPct.toFixed(1)}%. Nên giảm/chốt vị thế để bảo toàn lợi nhuận trước khi tín hiệu xấu hơn.`
      return `${recommendation} (${score}/100) — lỗ ${Math.abs(plPct).toFixed(1)}%. Ưu tiên cắt lỗ tại ${formatPrice(stopLoss)} để bảo toàn vốn.`
    } else {
      if (isBullish) return `${recommendation} (${score}/100). Xem xét mở vị thế tại ${formatPrice(price)}, target ${formatPrice(targetPrice)} (+${targetPct}%), stop loss ${formatPrice(stopLoss)} (−${stopPct}%). R:R = 1:${rrRatio.toFixed(1)}.`
      if (isHold) return `GIỮ (${score}/100) — tín hiệu trung tính. Chờ xác nhận rõ hơn trước khi mở vị thế. Quan sát vùng ${formatPrice(stopLoss)}–${formatPrice(targetPrice)}.`
      return `${recommendation} (${score}/100) — tín hiệu yếu. Chưa nên mở vị thế, chờ điểm cải thiện hoặc tín hiệu kỹ thuật đảo chiều.`
    }
  }

  const fundamentalDetail = [
    pe ? `P/E ${pe.toFixed(1)}x` : null,
    roe ? `ROE ${roe.toFixed(1)}%` : null,
    peg != null && peg > 0 ? `PEG ${peg.toFixed(2)}` : null,
    profitGrowth ? `TT LN ${profitGrowth > 0 ? '+' : ''}${profitGrowth.toFixed(1)}%` : null,
  ].filter(Boolean).join(' · ') || 'Không có dữ liệu'

  const sentimentDetail = [
    rsSignal || null,
    foreignFlow || null,
  ].filter(Boolean).join(' · ') || 'N/A'

  const factors = [
    { label: 'Kỹ thuật', score: technicalScore, detail: `RSI ${rsi14.toFixed(0)} (${rsiSignal}) · ${trend.split(' (')[0]} · ${macdSignal}` },
    { label: 'Cơ bản',   score: fundamentalScore, detail: fundamentalDetail },
    { label: 'Tâm lý',   score: sentimentScore,   detail: sentimentDetail },
  ]

  return (
    <div className="space-y-4">
      {/* Recommendation header */}
      <div className={`p-4 rounded-xl border ${recColor}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-bold ${recColor.split(' ')[0]}`}>{recommendation}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Điểm:</span>
            <span className={`text-sm font-bold ${scoreTextColor(score)}`}>{score}/100</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
              confidence === 'CAO' ? 'text-green-400 border-green-400/30 bg-green-400/10' :
              confidence === 'TRUNG BÌNH' ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10' :
              'text-red-400 border-red-400/30 bg-red-400/10'
            }`}>{confidence}</span>
          </div>
        </div>
        <p className="text-xs text-gray-300 leading-relaxed">{getActionAdvice()}</p>
      </div>

      {/* 3-factor score breakdown */}
      <div className="space-y-2">
        {factors.map(({ label, score: s, detail }) => (
          <div key={label} className="bg-surface2/30 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted">{label}</span>
              <span className={`text-xs font-bold ${scoreTextColor(s)}`}>{s}/100</span>
            </div>
            <div className="h-1.5 bg-surface2 rounded-full overflow-hidden mb-1.5">
              <div className={`h-full rounded-full ${scoreBarColor(s)}`} style={{ width: `${s}%` }} />
            </div>
            <p className="text-[10px] text-muted">{detail}</p>
          </div>
        ))}
      </div>

      {/* Portfolio overview */}
      {totalPortfolio > 100_000 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-surface2/40 rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted">Tiền mặt</p>
            <p className="text-xs font-semibold text-gray-100">{formatVND(balance.cash)}</p>
          </div>
          <div className="bg-surface2/40 rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted">Đầu tư</p>
            <p className="text-xs font-semibold text-gray-100">{formatVND(totalInvested)}</p>
          </div>
          <div className="bg-surface2/40 rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted">Tỷ trọng {symbol}</p>
            <p className={`text-xs font-semibold ${thisWeight > 20 ? 'text-orange-400' : 'text-gray-100'}`}>
              {thisWeight > 0 ? thisWeight.toFixed(1) + '%' : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Holding detail */}
      {holding ? (
        <div className="p-4 bg-surface2/50 rounded-xl border border-border/30 space-y-3">
          <p className="text-xs font-semibold text-accent flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" /> Vị thế hiện tại: {symbol}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <InfoCell label="Số lượng" value={`${holding.qty.toLocaleString('vi-VN')} CP`} />
            <InfoCell label="Giá vốn TB" value={formatPrice(Math.round(holding.avg_cost))} />
            <InfoCell label="Giá trị" value={formatVND(currentValue)} />
            <InfoCell label="Lãi / Lỗ"
              value={`${pl >= 0 ? '+' : ''}${plPct.toFixed(2)}%`}
              colored={pl >= 0 ? 'text-green-400' : 'text-red-400'}
              sub={`${pl >= 0 ? '+' : ''}${formatVND(Math.abs(pl))}`} />
          </div>
          {(stopRisk > 0 || targetGain > 0) && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/30">
              <div className="text-center">
                <p className="text-[10px] text-muted">Rủi ro → Stop</p>
                <p className="text-xs font-semibold text-red-400">−{formatVND(Math.round(stopRisk))}</p>
                <p className="text-[10px] text-muted">{formatPrice(stopLoss)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted">Lợi nhuận → Target</p>
                <p className="text-xs font-semibold text-green-400">+{formatVND(Math.round(targetGain))}</p>
                <p className="text-[10px] text-muted">{formatPrice(targetPrice)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted">R:R Ratio</p>
                <p className={`text-xs font-semibold ${rrRatio >= 2 ? 'text-green-400' : rrRatio >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                  1:{rrRatio.toFixed(1)}
                </p>
                <p className="text-[10px] text-muted">{rrRatio >= 2 ? 'Tốt' : rrRatio >= 1 ? 'Chấp nhận' : 'Kém'}</p>
              </div>
            </div>
          )}
          {thisWeight > 20 && (
            <div className="flex items-start gap-1.5 p-2 bg-orange-400/10 rounded-lg border border-orange-400/20">
              <AlertTriangle className="w-3 h-3 text-orange-400 mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-orange-300">Tỷ trọng {thisWeight.toFixed(1)}% vượt mức khuyến nghị 20%. Cân nhắc giảm bớt để phân tán rủi ro danh mục.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="p-3 bg-surface2/30 rounded-xl text-center">
          <p className="text-xs text-muted">Bạn chưa nắm giữ <span className="text-accent font-semibold">{symbol}</span></p>
          <p className="text-[10px] text-muted/60 mt-0.5">Vào trang Danh Mục Ảo để thực hiện giao dịch giả lập</p>
        </div>
      )}

      {/* Watch points */}
      {watchPoints && watchPoints.length > 0 && (
        <div className="p-3 bg-yellow-400/5 rounded-xl border border-yellow-400/15">
          <p className="text-[10px] font-semibold text-yellow-400 mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Điểm cần theo dõi
          </p>
          <ul className="space-y-1">
            {watchPoints.slice(0, 4).map((wp, i) => (
              <li key={i} className="text-[10px] text-muted flex items-start gap-1.5">
                <span className="text-yellow-400 mt-0.5 flex-shrink-0">•</span>{wp}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[10px] text-muted/50 text-center">Danh mục ảo · Lưu trên thiết bị · Không cần đăng nhập</p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface SmartAnalysisProps {
  isVisible?: boolean
  holdings?: PortfolioHolding[]
  balance?: Balance
}

const DEFAULT_BALANCE: Balance = { user_id: '', cash: 500_000_000, updated_at: '' }

export default function SmartAnalysis({ isVisible = true, holdings = [], balance = DEFAULT_BALANCE }: SmartAnalysisProps) {
  const [symbol, setSymbol] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SmartAnalysisData | null>(null)
  const [activeTab, setActiveTab] = useState<'technical' | 'fundamental' | 'sentiment'>('technical')

  const analyze = useCallback(async (sym?: string) => {
    const s = (sym || symbol).trim().toUpperCase()
    if (!s) return
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch(`/api/smart-analyze?symbol=${s}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Phân tích thất bại'); return }
      setResult(data)
      setSymbol(s)
    } catch {
      setError('Lỗi kết nối. Vui lòng thử lại.')
    } finally { setLoading(false) }
  }, [symbol])

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') analyze() }

  // Advanced technicals from historicalData
  const advanced = useMemo(() => {
    if (!result?.historicalData) return null
    const { closes, highs, lows } = result.historicalData
    return {
      ichimoku: calcIchimoku(highs, lows, closes),
      stochRsi: calcStochRSI(closes),
      pivots: closes.length >= 3
        ? calcPivotPoints(Math.max(...highs.slice(-5)), Math.min(...lows.slice(-5)), closes[closes.length - 1])
        : null,
    }
  }, [result?.historicalData])

  // Valuation models
  const valuation = useMemo(() => result ? calcValuation(result) : null, [result])

  // Financial health
  const health = useMemo(() => result ? calcFinancialHealth(result) : null, [result])

  const data = result as SmartAnalysisData | null

  return (
    <div className="space-y-5">
      {/* ── Search bar ── */}
      <div className="card-glass p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
            <input type="text" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={handleKey} placeholder="Nhập mã cổ phiếu (VD: FPT, VNM, ACB...)"
              className="input-dark w-full pl-9 pr-4 py-2.5 text-sm" disabled={loading} maxLength={10} />
          </div>
          <button onClick={() => analyze()} disabled={loading || !symbol.trim()}
            className="px-5 py-2.5 bg-accent text-bg text-sm font-semibold rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
            {loading
              ? <><span className="w-4 h-4 border-2 border-bg/30 border-t-bg rounded-full animate-spin" />Đang phân tích...</>
              : <><Zap className="w-4 h-4" />Phân tích</>}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {['FPT', 'VNM', 'VCB', 'HPG', 'ACB', 'MWG', 'VIC', 'SSI', 'VHM', 'TCB'].map(s => (
            <button key={s} onClick={() => { setSymbol(s); analyze(s) }}
              className="px-2 py-1 text-xs bg-surface2 text-muted hover:text-accent hover:bg-accent/10 rounded-md transition-colors">{s}</button>
          ))}
        </div>
        <p className="text-[11px] text-muted/60 mt-2">Phân tích thuật toán miễn phí · Không cần đăng nhập · Biểu đồ + Kỹ thuật nâng cao + Báo cáo PDF</p>
      </div>

      {error && (
        <div className="card-glass p-4 border border-red-500/20 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading && (
        <div className="card-glass p-8 flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-accent animate-spin" />
            <Zap className="absolute inset-0 m-auto w-6 h-6 text-accent" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-200">Đang phân tích {symbol}...</p>
            <p className="text-xs text-muted mt-1">Thu thập từ VPS · Simplize · CafeF · VN-Index</p>
          </div>
          <div className="flex gap-6 text-center">
            {['Giá & Lịch sử', 'Kỹ thuật', 'Tài chính', 'Định giá'].map((s, i) => (
              <div key={i} className="text-center">
                <div className="w-6 h-6 mx-auto rounded-full bg-accent/20 flex items-center justify-center mb-1">
                  <div className="w-2 h-2 rounded-full bg-accent animate-pulse" style={{ animationDelay: `${i * 0.25}s` }} />
                </div>
                <span className="text-[10px] text-muted">{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && !loading && (
        <>
          {/* ══ 1. HERO CARD ══ */}
          <div className="card-glass p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <div className="relative flex-shrink-0">
                <ScoreArc score={result.overallScore} size={120} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-2xl font-bold ${getScoreColor(result.overallScore)}`}>{result.overallScore}</span>
                  <span className="text-[10px] text-muted">/ 100</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h2 className="text-2xl font-bold">{result.symbol}</h2>
                  {data?.stockName && <span className="text-muted text-sm truncate">{data.stockName}</span>}
                  {data?.exchange && <span className="text-[10px] px-1.5 py-0.5 bg-surface2 text-muted rounded">{data.exchange}</span>}
                </div>
                {result.industry && <p className="text-xs text-muted/70 mt-0.5">{result.industry}</p>}
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-xl font-semibold">{formatPrice(result.price)}</span>
                  <span className={`text-sm font-medium px-2 py-0.5 rounded-full border ${getRecBg(result.recommendation)} ${getRecColor(result.recommendation)}`}>
                    {result.recommendation}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    result.confidence === 'CAO' ? 'bg-accent/10 text-accent border border-accent/20' :
                    result.confidence === 'TRUNG BÌNH' ? 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20' :
                    'bg-orange-400/10 text-orange-400 border border-orange-400/20'
                  }`}>Tin cậy: {result.confidenceNum}% · {result.confidence}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <ScoreBar label="Kỹ thuật (30%)" score={result.technical.score} icon={BarChart3} />
                  <ScoreBar label="Cơ bản (40%)" score={result.fundamental.score} icon={DollarSign} />
                  <ScoreBar label="Tâm lý (30%)" score={result.sentiment.score} icon={Newspaper} />
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-surface2/60 rounded-xl p-3 text-center">
                {/* Mục tiêu: bearish shows downside (negative %), bullish shows upside (positive %) */}
                <p className="text-[10px] text-muted mb-1">{result.stopLoss > result.price ? 'Hỗ trợ/Target' : 'Mục tiêu'}</p>
                <p className={`text-sm font-bold ${result.stopLoss > result.price ? 'text-orange-400' : 'text-green-400'}`}>{formatPrice(result.targetPrice)}</p>
                {result.price > 0 && (() => {
                  const pct = ((result.targetPrice - result.price) / result.price * 100)
                  return <p className={`text-[10px] ${pct >= 0 ? 'text-green-400/70' : 'text-orange-400/70'}`}>{pct >= 0 ? `+${pct.toFixed(1)}` : pct.toFixed(1)}%</p>
                })()}
              </div>
              <div className="bg-surface2/60 rounded-xl p-3 text-center">
                {/* Cắt lỗ: for BÁN stop > price = upside risk (+%), for MUA stop < price = downside risk (-%) */}
                <p className="text-[10px] text-muted mb-1">{result.stopLoss > result.price ? 'Dừng BÁN' : 'Cắt lỗ'}</p>
                <p className="text-sm font-bold text-red-400">{formatPrice(result.stopLoss)}</p>
                <p className="text-[10px] text-red-400/70">{result.price > 0 ? (((result.stopLoss - result.price) / result.price) * 100).toFixed(1) : 0}%</p>
              </div>
              <div className="bg-surface2/60 rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted mb-1">Vào lệnh</p>
                <p className="text-xs font-bold text-blue-400">{formatPrice(result.entryZone.low)}</p>
                <p className="text-[10px] text-blue-400/70">— {formatPrice(result.entryZone.high)}</p>
              </div>
              <div className="bg-surface2/60 rounded-xl p-3 text-center">
                <p className="text-[10px] text-muted mb-1">Nắm giữ</p>
                <p className="text-xs font-bold text-accent leading-tight">{result.holdingPeriod}</p>
                <p className={`text-[10px] mt-0.5 ${result.rsi14 > 70 ? 'text-red-400' : result.rsi14 < 30 ? 'text-green-400' : 'text-muted'}`}>
                  RSI: {result.rsi14}
                </p>
              </div>
            </div>
            {result.rrRatio > 0 && (
              <div className="mt-2 flex items-center justify-between px-1 text-[11px]">
                <span className="text-muted">R/R Ratio: <span className={`font-semibold ${result.rrRatio >= 2 ? 'text-green-400' : result.rrRatio >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>{result.rrRatio}:1</span></span>
                <span className="text-muted">SMA20: <span className={`font-medium ${result.price >= result.sma20 ? 'text-green-400' : 'text-red-400'}`}>{formatPrice(result.sma20)}</span> · SMA50: {formatPrice(result.sma50)}</span>
                {result.sma200 > 0 && <span className="text-muted">SMA200: <span className={`font-medium ${result.price >= result.sma200 ? 'text-blue-400' : 'text-orange-400'}`}>{formatPrice(result.sma200)}</span></span>}
              </div>
            )}
          </div>

          {/* ══ 2. CANDLESTICK CHART ══ */}
          <div className="card-glass overflow-hidden">
            <div className="px-4 pt-3 pb-1 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-accent" />
              <span className="font-semibold text-sm">Biểu Đồ Kỹ Thuật — {result.symbol}</span>
            </div>
            <CandlestickChart symbol={result.symbol} isVisible={isVisible && !!result} />
          </div>

          {/* ══ 3. STOCK INFO GRID ══ */}
          <div className="card-glass p-4">
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-accent" />Thông Tin Cổ Phiếu
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <InfoCell label="Giá hiện tại" value={formatPrice(result.price)} sub={`O: ${formatPrice(data?.openPrice || 0)}`} />
              <InfoCell label="Cao / Thấp ngày" value={formatPrice(data?.highPrice || 0)} sub={`L: ${formatPrice(data?.lowPrice || 0)}`} />
              <InfoCell label="52 tuần Cao/Thấp" value={formatPrice(data?.w52high || 0)} sub={formatPrice(data?.w52low || 0)} />
              <InfoCell label="Khối lượng GD" value={formatNum(data?.volume || 0)} sub="cổ phiếu/phiên" />
              <InfoCell label="Vốn hóa" value={formatVND(data?.marketCap || 0)} />
              <InfoCell label="P/E" value={data?.pe ? `${data.pe.toFixed(1)}x` : '—'} colored={data?.pe && data.pe < 15 ? 'text-green-400' : 'text-gray-100'} />
              <InfoCell label="P/B" value={data?.pb ? `${data.pb.toFixed(2)}x` : '—'} />
              <InfoCell label="EPS (TTM)" value={data?.eps ? formatPrice(data.eps) : '—'} />
              <InfoCell label="ROE" value={data?.roe ? `${data.roe.toFixed(1)}%` : '—'} colored={data?.roe && data.roe >= 15 ? 'text-green-400' : 'text-gray-100'} />
              <InfoCell label="ROA" value={data?.roa ? `${data.roa.toFixed(1)}%` : '—'} colored={data?.roa && data.roa >= 5 ? 'text-green-400' : 'text-gray-100'} />
              <InfoCell label="Biên LN ròng" value={data?.netMargin ? `${data.netMargin.toFixed(1)}%` : '—'} />
              <InfoCell label="Cổ tức" value={data?.dividendYield ? `${data.dividendYield.toFixed(1)}%` : '—'} />
              <InfoCell label="Tăng trưởng LN"
                value={data?.profitGrowth ? `${data.profitGrowth > 0 ? '+' : ''}${data.profitGrowth.toFixed(1)}%` : '—'}
                colored={data?.profitGrowth && data.profitGrowth > 10 ? 'text-green-400' : data?.profitGrowth && data.profitGrowth < 0 ? 'text-red-400' : 'text-gray-100'} />
              <InfoCell label="Tăng trưởng DT"
                value={data?.revenueGrowth ? `${data.revenueGrowth > 0 ? '+' : ''}${data.revenueGrowth.toFixed(1)}%` : '—'}
                colored={data?.revenueGrowth && data.revenueGrowth > 0 ? 'text-green-400' : 'text-gray-100'} />
              <InfoCell label="Hỗ trợ / Kháng cự" value={formatPrice(result.technical.support)} sub={formatPrice(result.technical.resistance)} />
              <InfoCell label="RS vs VN-Index"
                value={`${result.sentiment.relativeStrength > 0 ? '+' : ''}${result.sentiment.relativeStrength}%`}
                colored={result.sentiment.relativeStrength > 0 ? 'text-green-400' : result.sentiment.relativeStrength < 0 ? 'text-red-400' : 'text-gray-100'} />
            </div>
          </div>

          {/* ══ 4. ENTRY/EXIT RECOMMENDATION ══ */}
          <div className="card-glass p-4">
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
              <Target className="w-4 h-4 text-accent" />Vùng Giao Dịch Khuyến Nghị
            </h3>
            {result.stopLoss > result.price ? (
              /* ── BEARISH layout (BÁN / BÁN MẠNH): show downside target + sell zone + stop ── */
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-orange-400/5 border border-orange-400/20 rounded-xl p-4">
                  <p className="text-xs font-semibold text-orange-400 mb-2">Hỗ trợ kế tiếp</p>
                  <p className="text-lg font-bold text-orange-400">{formatPrice(result.targetPrice)}</p>
                  <p className="text-xs text-muted mt-1">Downside: {result.price > 0 ? ((result.targetPrice - result.price) / result.price * 100).toFixed(1) : 0}%</p>
                  <p className="text-[10px] text-muted/70 mt-2">Vùng hỗ trợ bears hướng tới</p>
                </div>
                <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-4">
                  <p className="text-xs font-semibold text-yellow-400 mb-2">Vùng bán ra</p>
                  <p className="text-lg font-bold text-yellow-400">{formatPrice(Math.round(result.price * 0.99))}</p>
                  <p className="text-xs text-muted mt-1">— {formatPrice(Math.round(result.price * 1.01))}</p>
                  <p className="text-[10px] text-muted/70 mt-2">Khuyến nghị thoát vị thế ngay</p>
                </div>
                <div className="bg-red-400/5 border border-red-400/20 rounded-xl p-4">
                  <p className="text-xs font-semibold text-red-400 mb-2">Ngưỡng dừng BÁN</p>
                  <p className="text-lg font-bold text-red-400">{formatPrice(result.stopLoss)}</p>
                  <p className="text-xs text-muted mt-1">Upside risk: +{result.price > 0 ? ((result.stopLoss - result.price) / result.price * 100).toFixed(1) : 0}%</p>
                  <p className="text-[10px] text-muted/70 mt-2">
                    R/R: {result.price > 0 && (result.stopLoss - result.price) > 0
                      ? Math.abs((result.price - result.targetPrice) / (result.stopLoss - result.price)).toFixed(1) + ':1'
                      : '—'}
                  </p>
                </div>
              </div>
            ) : (
              /* ── BULLISH/NEUTRAL layout (GIỮ / MUA / MUA MẠNH) ── */
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-green-400/5 border border-green-400/20 rounded-xl p-4">
                  <p className="text-xs font-semibold text-green-400 mb-2">Vùng MUA tốt</p>
                  <p className="text-lg font-bold text-green-400">{formatPrice(result.stopLoss * 1.02)}</p>
                  <p className="text-xs text-muted mt-1">— {formatPrice(result.price * 1.02)}</p>
                  <p className="text-[10px] text-muted/70 mt-2">Gần support, RSI không overbought</p>
                </div>
                <div className="bg-blue-400/5 border border-blue-400/20 rounded-xl p-4">
                  <p className="text-xs font-semibold text-blue-400 mb-2">Mục tiêu chốt lời</p>
                  <p className="text-lg font-bold text-blue-400">{formatPrice(result.targetPrice)}</p>
                  <p className="text-xs text-muted mt-1">Upside: +{result.price > 0 ? (((result.targetPrice - result.price) / result.price) * 100).toFixed(1) : 0}%</p>
                  <p className="text-[10px] text-muted/70 mt-2">Kháng cự gần nhất + score target</p>
                </div>
                <div className="bg-red-400/5 border border-red-400/20 rounded-xl p-4">
                  <p className="text-xs font-semibold text-red-400 mb-2">Cắt lỗ</p>
                  <p className="text-lg font-bold text-red-400">{formatPrice(result.stopLoss)}</p>
                  <p className="text-xs text-muted mt-1">Risk: {result.price > 0 ? (((result.stopLoss - result.price) / result.price) * 100).toFixed(1) : 0}%</p>
                  <p className="text-[10px] text-muted/70 mt-2">
                    R/R: {result.price > 0 && result.stopLoss < result.price
                      ? (((result.targetPrice - result.price) / (result.price - result.stopLoss))).toFixed(1) + ':1'
                      : '—'}
                  </p>
                </div>
              </div>
            )}
            {(result.strengths.length > 0 || result.weaknesses.length > 0) && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {result.strengths.length > 0 && (
                  <div>
                    <p className="text-[10px] text-green-400 font-semibold uppercase mb-2 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Điểm mạnh
                    </p>
                    <ul className="space-y-1.5">
                      {result.strengths.map((s, i) => (
                        <li key={i} className="text-xs text-gray-300 flex items-start gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1 flex-shrink-0" />{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.weaknesses.length > 0 && (
                  <div>
                    <p className="text-[10px] text-orange-400 font-semibold uppercase mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Rủi ro
                    </p>
                    <ul className="space-y-1.5">
                      {result.weaknesses.map((w, i) => (
                        <li key={i} className="text-xs text-gray-300 flex items-start gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1 flex-shrink-0" />{w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {result.watchPoints.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {result.watchPoints.map((w, i) => (
                  <span key={i} className="text-xs bg-accent/10 text-accent/80 border border-accent/20 rounded-lg px-2.5 py-1">{w}</span>
                ))}
              </div>
            )}
          </div>

          {/* ══ 5. SIGNAL TABS ══ */}
          <div className="card-glass overflow-hidden">
            <div className="flex border-b border-border/40">
              {(['technical', 'fundamental', 'sentiment'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 text-xs font-semibold transition-colors ${activeTab === tab ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-muted hover:text-gray-200'}`}>
                  {tab === 'technical' ? 'Kỹ Thuật' : tab === 'fundamental' ? 'Cơ Bản' : 'Tâm Lý'}
                </button>
              ))}
            </div>
            <div className="p-4">
              {activeTab === 'technical' && (
                <div className="space-y-0">
                  <div className="mb-3 p-3 bg-accent/5 border border-accent/15 rounded-xl">
                    <p className="text-[10px] text-accent/70 font-semibold uppercase mb-1">Tóm tắt kỹ thuật</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{result.technicalSummary}</p>
                  </div>
                  <SignalRow label="Xu hướng" value={result.technical.trend}
                    positive={result.technical.trend.includes('Tăng') ? true : result.technical.trend.includes('Giảm') ? false : null} />
                  <SignalRow label="RSI(14)" value={`${result.technical.rsi} — ${result.technical.rsiSignal}`}
                    positive={result.technical.rsi < 35 ? true : result.technical.rsi > 70 ? false : null} />
                  <SignalRow label="MACD" value={result.technical.macdSignal}
                    positive={result.technical.macdSignal.includes('Golden') || result.technical.macdSignal.includes('tăng') ? true :
                      result.technical.macdSignal.includes('Death') || result.technical.macdSignal.includes('giảm') ? false : null} />
                  <SignalRow label="Bollinger" value={result.technical.bbSignal}
                    positive={result.technical.bbSignal.includes('Oversold') ? true : result.technical.bbSignal.includes('Overbought') ? false : null} />
                  <SignalRow label="ADX" value={`${result.technical.adxValue} — ${result.technical.adxSignal}`}
                    positive={result.technical.adxValue >= 25 ? true : null} />
                  <SignalRow label="Khối lượng" value={result.technical.volumeSignal}
                    positive={result.technical.volumeSignal.includes('xác nhận') ? true : result.technical.volumeSignal.includes('áp lực') ? false : null} />
                  <SignalRow label="Momentum 1W" value={`${result.technical.momentum1W > 0 ? '+' : ''}${result.technical.momentum1W}%`}
                    positive={result.technical.momentum1W > 0 ? true : result.technical.momentum1W < 0 ? false : null} />
                  <SignalRow label="Momentum 1M" value={`${result.technical.momentum1M > 0 ? '+' : ''}${result.technical.momentum1M}%`}
                    positive={result.technical.momentum1M > 0 ? true : result.technical.momentum1M < 0 ? false : null} />
                  <SignalRow label="Momentum 3M" value={`${result.technical.momentum3M > 0 ? '+' : ''}${result.technical.momentum3M}%`}
                    positive={result.technical.momentum3M > 0 ? true : result.technical.momentum3M < 0 ? false : null} />
                  <SignalRow label="Hỗ trợ" value={formatPrice(result.technical.support)} positive={null} />
                  <SignalRow label="Kháng cự" value={formatPrice(result.technical.resistance)} positive={null} />
                </div>
              )}
              {activeTab === 'fundamental' && (
                <div className="space-y-0">
                  <div className="mb-3 p-3 bg-blue-400/5 border border-blue-400/15 rounded-xl">
                    <p className="text-[10px] text-blue-400/70 font-semibold uppercase mb-1">Tóm tắt cơ bản</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{result.fundamentalSummary}</p>
                  </div>
                  <SignalRow label="P/E" value={result.fundamental.peSignal}
                    positive={result.fundamental.peSignal.includes('THẤP') || result.fundamental.peSignal.includes('HỢP LÝ') ? true : result.fundamental.peSignal.includes('QUÁ CAO') ? false : null} />
                  <SignalRow label="P/B" value={result.fundamental.pbSignal}
                    positive={result.fundamental.pbSignal.includes('Thấp') ? true : result.fundamental.pbSignal.includes('Cao hơn') ? false : null} />
                  <SignalRow label="ROE" value={result.fundamental.roeSignal}
                    positive={result.fundamental.roeSignal.includes('Xuất sắc') || result.fundamental.roeSignal.includes('Tốt') ? true : result.fundamental.roeSignal.includes('Thấp') ? false : null} />
                  <SignalRow label="ROA" value={result.fundamental.roaSignal}
                    positive={result.fundamental.roaSignal.includes('Xuất sắc') || result.fundamental.roaSignal.includes('Tốt') ? true : result.fundamental.roaSignal.includes('Thấp') ? false : null} />
                  <SignalRow label="Tăng trưởng" value={result.fundamental.growthSignal}
                    positive={result.fundamental.growthSignal.includes('MẠNH') || result.fundamental.growthSignal.includes('TỐT') ? true : result.fundamental.growthSignal.includes('ÂM') ? false : null} />
                  <SignalRow label="Nợ" value={result.fundamental.debtSignal}
                    positive={result.fundamental.debtSignal.includes('thấp') || result.fundamental.debtSignal.includes('an toàn') ? true : result.fundamental.debtSignal.includes('CAO') ? false : null} />
                  <SignalRow label="Cổ tức" value={result.fundamental.dividendSignal}
                    positive={result.fundamental.dividendSignal.includes('Cao') || result.fundamental.dividendSignal.includes('Ổn') ? true : null} />
                  {result.fundamental.peg !== null && (
                    <SignalRow label="PEG" value={`${result.fundamental.peg.toFixed(2)}x — ${result.fundamental.peg < 1 ? 'Rẻ so tốc độ tăng' : result.fundamental.peg < 2 ? 'Hợp lý' : 'Đắt'}`}
                      positive={result.fundamental.peg < 1 ? true : result.fundamental.peg > 2 ? false : null} />
                  )}
                  <SignalRow label="Chất lượng EPS" value={result.fundamental.earningsQuality}
                    positive={result.fundamental.earningsQuality.includes('tăng') || result.fundamental.earningsQuality.includes('XUẤT SẮC') ? true : result.fundamental.earningsQuality.includes('giảm') || result.fundamental.earningsQuality.includes('GIẢM') ? false : null} />
                  <SignalRow label="Chất lượng LN" value={result.fundamental.marginQuality}
                    positive={result.fundamental.marginQuality.includes('mở rộng') || result.fundamental.marginQuality.includes('MỞ RỘNG') ? true : result.fundamental.marginQuality.includes('thu hẹp') || result.fundamental.marginQuality.includes('THU HẸP') || result.fundamental.marginQuality.includes('xấu') ? false : null} />
                </div>
              )}
              {activeTab === 'sentiment' && (
                <div className="space-y-0">
                  <div className="mb-3 p-3 bg-purple-400/5 border border-purple-400/15 rounded-xl">
                    <p className="text-[10px] text-purple-400/70 font-semibold uppercase mb-1">Tóm tắt tâm lý</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{result.sentimentSummary}</p>
                  </div>
                  <SignalRow label="Tin tức" value={`${result.sentiment.newsScore} — ${result.sentiment.newsSummary}`}
                    positive={result.sentiment.newsScore >= 60 ? true : result.sentiment.newsScore < 40 ? false : null} />
                  <SignalRow label="Khối ngoại" value={result.sentiment.foreignFlow}
                    positive={result.sentiment.foreignFlow.includes('MUA RÒNG') ? true : result.sentiment.foreignFlow.includes('BÁN RÒNG') ? false : null} />
                  <SignalRow label="52 tuần" value={result.sentiment.w52Signal}
                    positive={result.sentiment.w52Signal.includes('ĐÁY') || result.sentiment.w52Signal.includes('THẤP') ? true : result.sentiment.w52Signal.includes('ĐỈNH') ? false : null} />
                  <SignalRow label="TT chung" value={result.sentiment.marketRegime}
                    positive={result.sentiment.marketRegime.includes('BULL') && !result.sentiment.marketRegime.includes('Quá mua') ? true : result.sentiment.marketRegime.includes('BEAR') ? false : null} />
                  <SignalRow label="RS vs VNIndex" value={result.sentiment.rsSignal}
                    positive={result.sentiment.relativeStrength > 1 ? true : result.sentiment.relativeStrength < -1 ? false : null} />
                </div>
              )}
            </div>
          </div>

          {/* ══ 5.5. HÀNH ĐỘNG & THEO DÕI ══ */}
          <div className="card-glass p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-accent" />Hành Động Khuyến Nghị
            </h3>
            <div className={`p-4 rounded-xl border ${
              result.recommendation === 'MUA MẠNH' ? 'bg-emerald-400/5 border-emerald-400/25' :
              result.recommendation === 'MUA' ? 'bg-green-400/5 border-green-400/25' :
              result.recommendation === 'GIỮ' ? 'bg-yellow-400/5 border-yellow-400/25' :
              result.recommendation === 'BÁN' ? 'bg-orange-400/5 border-orange-400/25' :
              'bg-red-400/5 border-red-400/25'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getRecBg(result.recommendation)} ${getRecColor(result.recommendation)}`}>
                  {result.recommendation}
                </span>
                <span className="text-xs text-muted">{result.overallScore}/100 · Tin cậy {result.confidenceNum}%</span>
              </div>
              <p className="text-sm text-gray-200 leading-relaxed">{result.action}</p>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted/80 bg-surface2/40 rounded-lg p-3">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-yellow-400/70" />
              <span><span className="text-yellow-400/80 font-semibold">Theo dõi: </span>{result.nextReview}</span>
            </div>
          </div>

          {/* ══ 6. ADVANCED TECHNICAL ══ */}
          {advanced && (
            <Section title="Kỹ Thuật Nâng Cao" icon={Activity} badge="PRO" defaultOpen>
              <div className="space-y-4">
                {advanced.ichimoku && (
                  <div>
                    <p className="text-xs font-semibold text-accent mb-2">Ichimoku Cloud</p>
                    <div className="space-y-0">
                      <SignalRow label="Vị trí mây" value={advanced.ichimoku.signal} positive={advanced.ichimoku.bullish} />
                      <SignalRow label="Tenkan/Kijun" value={advanced.ichimoku.tkKjSignal} positive={advanced.ichimoku.tenkan > advanced.ichimoku.kijun} />
                      <SignalRow label="Tenkan (9)" value={formatPrice(advanced.ichimoku.tenkan)} positive={null} />
                      <SignalRow label="Kijun (26)" value={formatPrice(advanced.ichimoku.kijun)} positive={null} />
                      <SignalRow label="Senkou A" value={formatPrice(advanced.ichimoku.senkouA)} positive={null} />
                      <SignalRow label="Senkou B" value={formatPrice(advanced.ichimoku.senkouB)} positive={null} />
                    </div>
                  </div>
                )}
                {advanced.stochRsi && (
                  <div className="pt-3 border-t border-border/30">
                    <p className="text-xs font-semibold text-accent mb-2">Stochastic RSI</p>
                    <SignalRow label="Tín hiệu" value={advanced.stochRsi.signal} positive={advanced.stochRsi.bullish} />
                    <div className="mt-2 flex gap-4">
                      {[{ label: '%K', val: advanced.stochRsi.k }, { label: '%D', val: advanced.stochRsi.d }].map(({ label, val }) => (
                        <div key={label} className="flex-1">
                          <p className="text-[10px] text-muted mb-1">{label}</p>
                          <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${val < 20 ? 'bg-green-400' : val > 80 ? 'bg-red-400' : 'bg-yellow-400'}`}
                              style={{ width: `${val}%` }} />
                          </div>
                          <p className="text-xs font-bold text-right mt-0.5">{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {advanced.pivots && (
                  <div className="pt-3 border-t border-border/30">
                    <p className="text-xs font-semibold text-accent mb-2">Pivot Points (Classic)</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'R3', value: advanced.pivots.R3, color: 'text-red-300' },
                        { label: 'R2', value: advanced.pivots.R2, color: 'text-red-400' },
                        { label: 'R1', value: advanced.pivots.R1, color: 'text-orange-400' },
                        { label: 'Pivot (P)', value: advanced.pivots.P, color: 'text-accent' },
                        { label: 'S1', value: advanced.pivots.S1, color: 'text-green-400' },
                        { label: 'S2', value: advanced.pivots.S2, color: 'text-green-500' },
                        { label: 'S3', value: advanced.pivots.S3, color: 'text-green-300' },
                      ].map(p => (
                        <div key={p.label} className={`bg-surface2/50 rounded-lg p-2 text-center ${
                          result.price > p.value * 0.98 && result.price < p.value * 1.02 ? 'ring-1 ring-accent/40' : ''
                        }`}>
                          <p className="text-[9px] text-muted">{p.label}</p>
                          <p className={`text-xs font-bold ${p.color}`}>{formatPrice(p.value)}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted/60 mt-2">Vòng highlight = giá hiện tại gần mức đó</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* ══ 7. ĐỊNH GIÁ NÂNG CAO ══ */}
          {valuation && valuation.models.length > 0 && (
            <Section title="Định Giá Nâng Cao" icon={Scale} badge="QUANT" defaultOpen>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {valuation.models.map(m => {
                    const up = m.upside
                    const color = up > 20 ? 'text-emerald-400' : up > 5 ? 'text-green-400' : up > -5 ? 'text-yellow-400' : 'text-red-400'
                    const bg = up > 20 ? 'bg-emerald-400/5 border-emerald-400/20' : up > 5 ? 'bg-green-400/5 border-green-400/20' : up > -5 ? 'bg-yellow-400/5 border-yellow-400/20' : 'bg-red-400/5 border-red-400/20'
                    return (
                      <div key={m.name} className={`border rounded-xl p-3 ${bg}`}>
                        <p className="text-[10px] text-muted font-semibold">{m.name}</p>
                        <p className={`text-base font-bold mt-1 ${color}`}>{formatPrice(m.value)}</p>
                        <p className={`text-xs font-medium ${color}`}>{up > 0 ? '+' : ''}{up.toFixed(1)}% vs giá hiện tại</p>
                        <p className="text-[10px] text-muted/70 mt-1 leading-relaxed">{m.note}</p>
                      </div>
                    )
                  })}
                </div>
                {valuation.avgFairValue > 0 && (
                  <div className={`p-4 rounded-xl border ${valuation.upsideAvg > 0 ? 'bg-green-400/5 border-green-400/20' : 'bg-red-400/5 border-red-400/20'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted">Giá hợp lý trung bình ({valuation.models.length} mô hình)</p>
                        <p className={`text-xl font-bold mt-0.5 ${valuation.upsideAvg > 0 ? 'text-green-400' : 'text-red-400'}`}>{formatPrice(valuation.avgFairValue)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted">Upside tiềm năng</p>
                        <p className={`text-2xl font-bold ${valuation.upsideAvg > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {valuation.upsideAvg > 0 ? '+' : ''}{valuation.upsideAvg.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted/70 mt-3">
                      {valuation.upsideAvg > 20 ? '✓ Cổ phiếu có vẻ đang được định giá THẤP hơn giá trị nội tại — tiềm năng tăng tốt.' :
                        valuation.upsideAvg > 0 ? '→ Cổ phiếu đang giao dịch dưới fair value theo các mô hình định lượng.' :
                          valuation.upsideAvg > -15 ? '⚠ Cổ phiếu đang giao dịch xấp xỉ fair value — cần theo dõi thêm.' :
                            '✗ Cổ phiếu có vẻ đang được định giá CAO hơn các mô hình — rủi ro downside.'}
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-muted/50">* Các mô hình định giá mang tính tham khảo, dựa trên EPS trailing 4Q và ngành median P/E = {valuation.industryPE}x</p>
              </div>
            </Section>
          )}

          {/* ══ 8. SỨC KHỎE TÀI CHÍNH ══ */}
          {health && (
            <Section title="Sức Khỏe Tài Chính" icon={Heart} defaultOpen>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20 flex-shrink-0">
                    <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
                      <circle cx="20" cy="20" r="16" fill="none" stroke="#1e2a3a" strokeWidth="4" />
                      <circle cx="20" cy="20" r="16" fill="none" strokeWidth="4"
                        stroke={health.score >= 9 ? '#34d399' : health.score >= 7 ? '#4ade80' : health.score >= 5 ? '#facc15' : health.score >= 3 ? '#fb923c' : '#f87171'}
                        strokeDasharray={`${(health.score / health.maxScore) * 100.5} 100.5`}
                        strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-base font-bold ${health.color}`}>{health.score}</span>
                      <span className="text-[9px] text-muted">/{health.maxScore}</span>
                    </div>
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${health.color}`}>{health.label}</p>
                    <p className="text-xs text-muted mt-0.5">Điểm sức khỏe tài chính Piotroski</p>
                    <p className="text-[11px] text-muted/70 mt-1">
                      {health.score >= 9 ? 'Doanh nghiệp có nền tảng tài chính xuất sắc, tất cả chỉ số vượt chuẩn.' :
                        health.score >= 7 ? 'Tài chính tốt, hầu hết chỉ số đạt tiêu chuẩn.' :
                          health.score >= 5 ? 'Tài chính ở mức trung bình, cần theo dõi một số điểm yếu.' :
                            'Có nhiều điểm yếu tài chính, cần phân tích kỹ trước khi đầu tư.'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {health.checks.map((c, i) => (
                    <div key={i} className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs ${c.pass ? 'bg-green-400/5' : 'bg-surface2/30'}`}>
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${c.pass ? 'bg-green-400/20 text-green-400' : 'bg-surface2 text-muted'}`}>
                        {c.pass ? '✓' : '✗'}
                      </span>
                      <span className={c.pass ? 'text-gray-200' : 'text-muted/70'}>{c.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {/* ══ 9. TÀI CHÍNH CÔNG TY ══ */}
          {((data?.quarterlyEPS?.length ?? 0) > 0 || data?.businessPlan) && (
            <Section title="Tài Chính Công Ty" icon={DollarSign} defaultOpen>
              <div className="space-y-4">
                {data?.quarterlyEPS && data.quarterlyEPS.length >= 2 && (
                  <div>
                    <p className="text-xs font-semibold text-accent mb-3">EPS theo quý (8 quý gần nhất)</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border/40 text-muted text-[10px] uppercase">
                            <th className="py-2 text-left">Quý</th>
                            <th className="py-2 text-right">EPS</th>
                            <th className="py-2 text-right">P/E</th>
                            <th className="py-2 text-right">Trend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.quarterlyEPS.map((q, i) => {
                            const prev = data.quarterlyEPS![i + 1]
                            const trend = prev ? (q.eps > prev.eps ? '↑' : q.eps < prev.eps ? '↓' : '→') : '—'
                            const tc = trend === '↑' ? 'text-green-400' : trend === '↓' ? 'text-red-400' : 'text-muted'
                            return (
                              <tr key={i} className="border-b border-border/20 hover:bg-surface2/30">
                                <td className="py-2 text-muted">{q.period}</td>
                                <td className={`py-2 text-right font-medium ${q.eps >= 0 ? 'text-green-400' : 'text-red-400'}`}>{q.eps.toLocaleString('vi-VN')}</td>
                                <td className="py-2 text-right text-muted">{q.pe ? q.pe.toFixed(1) + 'x' : '—'}</td>
                                <td className={`py-2 text-right font-bold ${tc}`}>{trend}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {data?.businessPlan && (
                  <div className={data?.quarterlyEPS && data.quarterlyEPS.length >= 2 ? 'pt-4 border-t border-border/30' : ''}>
                    <p className="text-xs font-semibold text-accent mb-3">Kế Hoạch Kinh Doanh {data.businessPlan.year}</p>
                    {[
                      { label: 'Doanh thu', target: data.businessPlan.revenueTarget, actual: data.businessPlan.revenueActual },
                      { label: 'Lợi nhuận', target: data.businessPlan.profitTarget, actual: data.businessPlan.profitActual },
                    ].filter(item => item.target > 0).map(item => {
                      const pct = Math.min(150, Math.round((item.actual / item.target) * 100))
                      return (
                        <div key={item.label} className="mb-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted">{item.label}</span>
                            <span className={`font-semibold ${pct >= 100 ? 'text-green-400' : pct >= 70 ? 'text-yellow-400' : 'text-orange-400'}`}>{pct}% KH</span>
                          </div>
                          <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-400' : pct >= 70 ? 'bg-yellow-400' : 'bg-orange-400'}`}
                              style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted mt-0.5">
                            <span>Thực tế: {formatVND(item.actual * 1_000_000_000)}</span>
                            <span>KH: {formatVND(item.target * 1_000_000_000)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* ══ 10. DANH MỤC ẢO ══ */}
          <Section title="Danh Mục Ảo" icon={Wallet} badge="FREE" defaultOpen>
            <PortfolioPanel
              symbol={result.symbol}
              price={result.price}
              score={result.overallScore}
              recommendation={result.recommendation}
              targetPrice={result.targetPrice}
              stopLoss={result.stopLoss}
              confidence={result.confidence}
              holdings={holdings}
              balance={balance}
              technicalScore={result.technical.score}
              fundamentalScore={result.fundamental.score}
              sentimentScore={result.sentiment.score}
              rsi14={result.rsi14}
              rsiSignal={result.technical.rsiSignal}
              trend={result.technical.trend}
              macdSignal={result.technical.macdSignal}
              pe={result.pe}
              pb={result.pb}
              roe={result.roe}
              roa={result.roa}
              profitGrowth={result.profitGrowth}
              revenueGrowth={result.revenueGrowth}
              netMargin={result.netMargin}
              peg={result.fundamental.peg}
              foreignFlow={result.sentiment.foreignFlow}
              rsSignal={result.sentiment.rsSignal}
              relativeStrength={result.sentiment.relativeStrength}
              strengths={result.strengths}
              weaknesses={result.weaknesses}
              watchPoints={result.watchPoints}
            />
          </Section>

          {/* ══ 11. BÁO CÁO PHÂN TÍCH ══ */}
          <Section title="Báo Cáo Phân Tích" icon={FileText} defaultOpen>
            <AnalystReports symbol={result.symbol} />
          </Section>

          {/* ══ 12. TIN TỨC ══ */}
          <Section title="Tin Tức Liên Quan" icon={Newspaper} defaultOpen>
            <NewsSection symbol={result.symbol} />
          </Section>

          {/* ══ 13. HỒ SƠ CÔNG TY ══ */}
          <Section title="Hồ Sơ Công Ty" icon={Building2} defaultOpen>
            <CompanyProfile symbol={result.symbol} />
          </Section>

          {/* ══ 14. DỮ LIỆU TÀI CHÍNH CAFEF ══ */}
          <Section title="Dữ Liệu Tài Chính CafeF" icon={BarChart3} defaultOpen>
            <CafefCompanyData symbol={result.symbol} />
          </Section>

          {/* ══ 15. SO SÁNH NGÀNH ══ */}
          <Section title="So Sánh Ngành" icon={Globe} defaultOpen>
            <IndustryComparison symbol={result.symbol} />
          </Section>

          {/* ══ 16. VN-INDEX CONTEXT ══ */}
          {data?.vnIndexLevel && (
            <div className="card-glass p-4">
              <p className="text-xs font-semibold text-muted mb-3 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" />Tình Hình Thị Trường VN-Index
              </p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[10px] text-muted">Điểm hiện tại</p>
                  <p className="text-sm font-bold text-gray-100">{data.vnIndexLevel?.toLocaleString('vi-VN')}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted">Thay đổi 30 ngày</p>
                  <p className={`text-sm font-bold ${(data.vnIndexTrend ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {(data.vnIndexTrend ?? 0) > 0 ? '+' : ''}{data.vnIndexTrend?.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted">RSI VN-Index</p>
                  <p className={`text-sm font-bold ${(data.vnIndexRsi ?? 50) > 70 ? 'text-red-400' : (data.vnIndexRsi ?? 50) < 30 ? 'text-green-400' : 'text-yellow-400'}`}>
                    {data.vnIndexRsi}
                  </p>
                </div>
              </div>
              <div className="mt-3 p-3 bg-surface2/50 rounded-xl">
                <p className="text-xs text-gray-300">{result.sentiment.marketRegime}</p>
              </div>
            </div>
          )}

          {/* Refresh + disclaimer */}
          <div className="flex justify-between items-center">
            <p className="text-[10px] text-muted/50">Phân tích thuật toán — chỉ để tham khảo, không phải lời khuyên đầu tư</p>
            <button onClick={() => analyze(result.symbol)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-accent transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />Cập nhật
            </button>
          </div>
        </>
      )}
    </div>
  )
}
