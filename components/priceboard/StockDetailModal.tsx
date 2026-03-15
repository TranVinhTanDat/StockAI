'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import {
  X, Globe, ExternalLink, TrendingUp, TrendingDown,
  BarChart2, Newspaper, Building2, Users, PieChart,
  Calendar, BookOpen, Briefcase, ChevronRight,
  Sparkles, AlertCircle, Zap, RefreshCw, History,
} from 'lucide-react'
import type { StockBoard } from '@/lib/priceboard-data'
import type { AnalysisResult as AnalysisResultType, QuoteData } from '@/types'
import { saveAnalysis } from '@/lib/storage'
import { getClientToken } from '@/lib/requireAuth'

// Dynamic import — CandlestickChart uses lightweight-charts (no SSR)
const CandlestickChart = dynamic(() => import('@/components/chart/CandlestickChart'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[340px] text-muted text-sm">
      <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full mr-2" />
      Đang tải biểu đồ...
    </div>
  ),
})

const AnalysisResult = dynamic(() => import('@/components/analysis/AnalysisResult'), { ssr: false })

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyDetail {
  symbol: string
  intro: { companyName: string; shortName: string; logo: string; website: string; description: string } | null
  basicInfo: { exchange: string; industry: string; firstTradingDate: string; charterCapital: number; sharesOutstanding: number; marketCapTy?: number } | null
  management: Array<{ name: string; yearBorn: number; position: string; positionGroup: string; photo: string; education: string }>
  shareholders: { major: Array<{ name: string; volume: number; pct: number; type: string }>; corporate: Array<{ name: string; volume: number; pct: number; type: string }> }
  financialRatios: Array<{ period: string; yearPeriod: number; eps: number; bvps: number; pe: number; pb: number; roe: number; roa: number; ebitda: number }>
  subsidiaries: Array<{ name: string; pct: number; businessType: string; type: string }>
  businessPlan: Array<{ year: number; revenue: number; revenueRaw?: string; profit: number; profitRaw?: string; dividend: string; revenueGrowth: number; profitGrowth: number; values?: Array<{ name: string; value: string }> }>
  events: Array<{ date: string; exDate: string; recordDate: string; title: string; eventType: string; detail: string }>
  foreignData: { buyVolume: number; sellVolume: number; netVolume: number; holdingPct: number; maxRatioPct: number } | null
  analystReports: Array<{ title: string; date: string; source: string; url: string; recommendation: string; targetPrice: number; summary: string }>
}

interface NewsItem { id: string; title: string; url: string; publishedAt: string; source: string; sentiment: number }
interface HistoryData {
  candles: Array<{ time: string; open: number; high: number; low: number; close: number; volume: number }>
  indicators: {
    sma20: number[]; sma50: number[]
    rsi: number[]
    macd: Array<{ macd: number; signal: number; histogram: number }>
    bb: Array<{ upper: number; middle: number; lower: number }>
  }
}

type Tab = 'chart' | 'history' | 'overview' | 'news' | 'reports' | 'ownership' | 'plan' | 'subsidiaries' | 'ai'

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'chart',        label: 'Biểu Đồ',      icon: BarChart2   },
  { key: 'history',      label: 'Lịch Sử',      icon: History     },
  { key: 'ai',           label: 'Phân Tích AI',  icon: Sparkles    },
  { key: 'overview',     label: 'Tổng Quan',     icon: Building2   },
  { key: 'news',         label: 'Tin Tức',       icon: Newspaper   },
  { key: 'reports',      label: 'BCPT',          icon: BookOpen    },
  { key: 'ownership',    label: 'Sở Hữu',        icon: PieChart    },
  { key: 'plan',         label: 'Kế Hoạch',      icon: Briefcase   },
  { key: 'subsidiaries', label: 'Công Ty Con',   icon: Users       },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtP(p: number): string {
  if (!p) return '—'
  return (p / 1000).toFixed(2)
}

function fmtN(n: number, d = 0): string {
  if (!n && n !== 0) return '—'
  return n.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtBil(n: number): string {
  if (!n) return '—'
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)} nghìn tỷ`
  if (n >= 1e9)  return `${(n / 1e9).toFixed(2)} tỷ`
  if (n >= 1e6)  return `${(n / 1e6).toFixed(2)} triệu`
  return fmtN(n)
}

// Smart display for ROE/ROA: CafeF might return decimal (0.285) or percentage (28.5)
function fmtPct(v: number): string {
  if (!v) return '—'
  // If absolute value > 1, it's already a percentage
  const pct = Math.abs(v) > 1 ? v : v * 100
  return `${pct.toFixed(1)}%`
}

function priceClass(price: number, ref: number, ceil: number, floor: number): string {
  if (!price || !ref) return 'text-gray-300'
  const eps = 50
  if (price >= ceil - eps) return 'text-fuchsia-400'
  if (price <= floor + eps) return 'text-cyan-400'
  if (price > ref) return 'text-green-400'
  if (price < ref) return 'text-red-400'
  return 'text-yellow-400'
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

// ─── Report Analysis ──────────────────────────────────────────────────────────

interface ReportAnalysis { summary: string; keyPoints: string[]; recommendation: string; sentiment: string; riskFactors: string[]; catalysts: string[]; conclusion: string }

function ReportCard({ report }: { report: CompanyDetail['analystReports'][0] }) {
  const [analysis, setAnalysis] = useState<ReportAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)

  const analyze = async () => {
    setLoading(true); setError('')
    try {
      const token = getClientToken()
      const res = await fetch('/api/report-analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url: report.url, title: report.title, symbol: '', reportType: 'Báo cáo phân tích', date: report.date }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAnalysis(data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Lỗi phân tích') }
    finally { setLoading(false) }
  }

  const recColor = !analysis?.recommendation ? '' :
    analysis.recommendation.includes('MUA') ? 'text-green-400' :
    analysis.recommendation.includes('BÁN') ? 'text-red-400' : 'text-yellow-400'

  return (
    <div className="bg-surface2/40 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-200 leading-snug">{report.title}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted flex-wrap">
            <span className="text-accent">{report.source}</span>
            <span>·</span>
            <span>{report.date ? new Date(report.date).toLocaleDateString('vi-VN') : '—'}</span>
            {report.recommendation && <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px]">{report.recommendation}</span>}
            {report.targetPrice > 0 && <span className="text-yellow-400">TP: {fmtP(report.targetPrice * 1000)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Search for report online */}
          <a href={`https://www.google.com/search?q=${encodeURIComponent(report.title + ' ' + report.source + ' pdf')}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-muted hover:text-accent transition-colors text-xs"
            title="Tìm kiếm báo cáo">
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tìm</span>
          </a>
          <button onClick={analyze} disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors disabled:opacity-50">
            <Sparkles className="w-3 h-3" />
            {loading ? 'Đang...' : analysis ? 'Lại' : 'AI'}
          </button>
        </div>
      </div>

      {/* Inline report content preview */}
      {report.summary && (
        <div>
          <p className={`text-xs text-gray-400 leading-relaxed ${!expanded ? 'line-clamp-3' : ''}`}>
            {report.summary}
          </p>
          {report.summary.length > 200 && (
            <button onClick={() => setExpanded(v => !v)}
              className="text-[10px] text-accent hover:underline mt-1">
              {expanded ? 'Thu gọn ▲' : 'Xem thêm ▼'}
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />{error}
        </p>
      )}

      {analysis && (
        <div className="space-y-3 border-t border-border/40 pt-3">
          {analysis.recommendation && (
            <span className={`text-sm font-bold ${recColor}`}>{analysis.recommendation}</span>
          )}
          <p className="text-xs text-gray-300 leading-relaxed">{analysis.summary}</p>
          {analysis.keyPoints?.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted font-semibold">Điểm chính</p>
              {analysis.keyPoints.map((pt, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-gray-400">
                  <ChevronRight className="w-3 h-3 text-accent flex-shrink-0 mt-0.5" />
                  {pt}
                </div>
              ))}
            </div>
          )}
          {analysis.catalysts?.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-green-400 font-semibold">Động lực tăng</p>
              {analysis.catalysts.map((c, i) => <p key={i} className="text-xs text-gray-400">• {c}</p>)}
            </div>
          )}
          {analysis.riskFactors?.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-red-400 font-semibold">Rủi ro</p>
              {analysis.riskFactors.map((r, i) => <p key={i} className="text-xs text-gray-400">• {r}</p>)}
            </div>
          )}
          {analysis.conclusion && (
            <div className="bg-accent/5 rounded-lg p-2.5">
              <p className="text-xs text-accent leading-relaxed">{analysis.conclusion}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function StockDetailModal({ stock, onClose }: { stock: StockBoard; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('chart')
  const [logoFailed, setLogoFailed] = useState(false)

  // AI analysis state
  const [aiResult, setAiResult]   = useState<AnalysisResultType | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError]     = useState('')

  // Price history state
  const today = new Date().toISOString().split('T')[0]
  const oneMonthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0]
  const [histFrom, setHistFrom] = useState(oneMonthAgo)
  const [histTo,   setHistTo]   = useState(today)
  const [histApplied, setHistApplied] = useState({ from: oneMonthAgo, to: today })

  const { data: detail } = useSWR<CompanyDetail>(
    `/api/company-detail?symbol=${stock.sym}`,
    fetcher,
    { revalidateOnFocus: false }
  )

  const { data: newsData } = useSWR<{ items: NewsItem[] }>(
    `/api/news?symbol=${stock.sym}&pageSize=15`,
    fetcher,
    { revalidateOnFocus: false }
  )

  const { data: histData, isLoading: histLoading } = useSWR<{
    candles: Array<{ time: string; open: number; high: number; low: number; close: number; volume: number }>
  }>(
    tab === 'history' ? `/api/history?symbol=${stock.sym}&from=${histApplied.from}&to=${histApplied.to}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // ── AI Analysis ──────────────────────────────────────────────────────────────

  const runAnalysis = useCallback(async (forceRefresh = false) => {
    setAiLoading(true)
    setAiError('')
    if (forceRefresh) setAiResult(null)
    try {
      // Fetch history + indicators
      const histRes = await fetch(`/api/history?symbol=${stock.sym}&days=90`)
      const histData: HistoryData = await histRes.json()

      // Construct QuoteData from stock
      const intro = detail?.intro
      const basicInfo = detail?.basicInfo
      const quote: QuoteData = {
        symbol: stock.sym,
        name: intro?.companyName || stock.name,
        price: stock.price,
        change: stock.change,
        changePct: stock.changePct,
        volume: stock.vol,
        high52w: 0,
        low52w: 0,
        marketCap: basicInfo?.sharesOutstanding ? stock.price * basicInfo.sharesOutstanding : 0,
        exchange: stock.exchange,
        industry: basicInfo?.industry || '',
        timestamp: new Date().toISOString(),
      }

      // Build fundamental from financialRatios
      const fr = detail?.financialRatios?.[0]
      const fundamental = fr ? {
        pe: fr.pe,
        eps: fr.eps,
        roe: fr.roe,
        roa: fr.roa,
        revenueGrowth: 0,
        profitGrowth: 0,
        debtEquity: 0,
        dividendYield: 0,
        bookValue: fr.bvps,
        tcbsRating: 0,
        tcbsRecommend: 'N/A',
      } : null

      // News
      const news = newsData?.items?.slice(0, 5).map(item => ({
        title: item.title,
        sentiment: item.sentiment || 50,
      })) || []

      const token = getClientToken()
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          symbol: stock.sym,
          quote,
          indicators: histData.indicators,
          fundamental,
          news,
          forceRefresh,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAiResult(data)

      // Save analysis
      await saveAnalysis(stock.sym, data)
      window.dispatchEvent(new Event('stockai:analysis-saved'))
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Phân tích thất bại')
    } finally {
      setAiLoading(false)
    }
  }, [stock, detail, newsData])

  // Build QuoteData for AnalysisResult component
  const quoteForResult: QuoteData = {
    symbol: stock.sym,
    name: detail?.intro?.companyName || stock.name,
    price: stock.price,
    change: stock.change,
    changePct: stock.changePct,
    volume: stock.vol,
    high52w: 0,
    low52w: 0,
    marketCap: detail?.basicInfo?.sharesOutstanding ? stock.price * detail.basicInfo.sharesOutstanding : 0,
    exchange: stock.exchange,
    industry: detail?.basicInfo?.industry || '',
    timestamp: new Date().toISOString(),
  }

  const intro       = detail?.intro
    ? { ...detail.intro, logo: detail.intro.logo?.includes('cafef.vn') ? '' : (detail.intro.logo || '') }
    : null
  const basicInfo   = detail?.basicInfo
  const fr          = detail?.financialRatios
  const foreignData = detail?.foreignData
  const latestFR    = fr?.[0]
  const pc = priceClass(stock.price, stock.ref, stock.ceil, stock.floor)
  const isUp = stock.change >= 0

  // Market cap calculation
  const marketCap = basicInfo?.sharesOutstanding
    ? (stock.price * basicInfo.sharesOutstanding) / 1e9
    : 0

  // Foreign buy/sell values (approx using current price)
  const foreignBuyVal  = stock.foreignBuy  > 0 ? (stock.foreignBuy  * stock.price / 1e9) : 0
  const foreignSellVal = stock.foreignSell > 0 ? (stock.foreignSell * stock.price / 1e9) : 0
  const foreignRoom    = foreignData ? (foreignData.maxRatioPct - foreignData.holdingPct) : null

  const KV = ({ label, value, cls = '' }: { label: string; value: string | number; cls?: string }) => (
    <div className="bg-surface2/50 rounded-lg p-3 space-y-0.5">
      <p className="text-[10px] text-muted uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-semibold font-mono ${cls || 'text-gray-200'}`}>{typeof value === 'number' ? fmtN(value) : value}</p>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-6xl h-[95vh] bg-surface rounded-2xl border border-border/60 shadow-2xl flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex-shrink-0 border-b border-border/60">
          {/* Company intro bar */}
          <div className="flex items-start gap-3 px-5 pt-4 pb-3">
            {(intro?.logo && !logoFailed) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={intro.logo} alt={stock.sym}
                className="w-10 h-10 rounded-xl object-contain bg-white/5 p-1 flex-shrink-0"
                onError={() => setLogoFailed(true)} />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0 text-accent font-bold text-sm">
                {stock.sym.slice(0, 2)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold text-gray-100">{stock.sym}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium">{stock.exchange}</span>
                {basicInfo?.industry && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface2 text-muted">{basicInfo.industry}</span>
                )}
              </div>
              <p className="text-sm font-medium text-gray-300 mt-0.5 truncate">{intro?.companyName || stock.name}</p>
              {intro?.description && (
                <p className="text-xs text-muted mt-1 line-clamp-2 leading-relaxed max-w-2xl">
                  {intro.description.slice(0, 280)}
                </p>
              )}
              {intro?.website && (
                <a href={intro.website} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-1">
                  <Globe className="w-3 h-3" />
                  {intro.website.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>

            {/* Price block */}
            <div className="flex-shrink-0 text-right mr-10">
              <div className={`text-3xl font-bold font-mono ${pc}`}>{fmtP(stock.price)}</div>
              <div className={`flex items-center justify-end gap-2 mt-1 ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span className="text-sm font-semibold">
                  {isUp ? '+' : ''}{fmtP(stock.change)} ({isUp ? '+' : ''}{stock.changePct.toFixed(2)}%)
                </span>
              </div>
            </div>

            {/* Close */}
            <button onClick={onClose}
              className="absolute top-3 right-3 p-2 rounded-xl hover:bg-surface2 text-muted hover:text-gray-200 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Price levels quick bar */}
          <div className="flex items-center gap-1 px-5 pb-3 flex-wrap">
            {[
              { label: 'Trần',    value: fmtP(stock.ceil),    cls: 'text-fuchsia-400 border-fuchsia-400/30 bg-fuchsia-400/5'  },
              { label: 'TC',      value: fmtP(stock.ref),     cls: 'text-yellow-400  border-yellow-400/30  bg-yellow-400/5'   },
              { label: 'Sàn',     value: fmtP(stock.floor),   cls: 'text-cyan-400    border-cyan-400/30    bg-cyan-400/5'     },
              { label: 'Mở cửa', value: fmtP(stock.open || stock.ref),   cls: 'text-gray-300 border-border/30 bg-surface2/40'  },
              { label: 'Cao nhất',value: fmtP(stock.high || stock.price), cls: 'text-green-400 border-green-400/20 bg-green-400/5' },
              { label: 'Thấp nhất',value: fmtP(stock.low || stock.price), cls: 'text-red-400 border-red-400/20 bg-red-400/5'  },
              { label: 'KL Khớp', value: fmtN(stock.vol),    cls: 'text-gray-300 border-border/30 bg-surface2/40'           },
            ].map(({ label, value, cls }) => (
              <div key={label} className={`flex flex-col items-center px-3 py-1.5 rounded-lg border text-center ${cls}`}>
                <span className="text-[9px] text-muted uppercase tracking-wider">{label}</span>
                <span className="text-xs font-bold font-mono">{value}</span>
              </div>
            ))}
          </div>

          {/* Tab bar */}
          <div className="flex overflow-x-auto no-scrollbar border-t border-border/40 px-2">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-gray-200'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {label}
                {key === 'ai' && aiResult && (
                  <span className="ml-1 w-1.5 h-1.5 rounded-full bg-accent" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab Content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ─── Biểu Đồ ─── */}
          {tab === 'chart' && (
            <div className="p-4">
              <div className="bg-surface2/30 rounded-xl overflow-hidden" style={{ minHeight: 480 }}>
                <CandlestickChart symbol={stock.sym} />
              </div>
              <div className="mt-3 text-center">
                <button
                  onClick={() => setTab('ai')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Phân tích AI cho {stock.sym}
                </button>
              </div>
            </div>
          )}

          {/* ─── Phân Tích AI ─── */}
          {tab === 'ai' && (
            <div className="p-5">
              {!aiResult && !aiLoading && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8 text-accent" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-200 mb-2">
                    Phân tích AI cho {stock.sym}
                  </h3>
                  <p className="text-sm text-muted mb-6 max-w-sm leading-relaxed">
                    Claude AI sẽ phân tích kỹ thuật, cơ bản và tâm lý thị trường,
                    đưa ra khuyến nghị mua/bán với mức độ tin cậy.
                  </p>
                  {aiError && (
                    <div className="flex items-center gap-2 text-red-400 text-sm mb-4 bg-red-400/10 px-4 py-2 rounded-lg">
                      <AlertCircle className="w-4 h-4" />
                      {aiError}
                    </div>
                  )}
                  <button
                    onClick={() => runAnalysis()}
                    className="flex items-center gap-2 px-6 py-3 bg-accent text-bg rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors"
                  >
                    <Zap className="w-4 h-4" />
                    Phân tích ngay
                  </button>
                </div>
              )}

              {aiLoading && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="animate-spin w-10 h-10 border-2 border-accent border-t-transparent rounded-full mb-4" />
                  <p className="text-sm text-muted">Claude AI đang phân tích {stock.sym}...</p>
                  <p className="text-xs text-muted/60 mt-1">Thường mất 10-20 giây</p>
                </div>
              )}

              {aiResult && !aiLoading && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs text-muted">
                      Kết quả phân tích AI · Giá hiện tại: <span className="text-gray-300 font-mono">{fmtP(stock.price)}</span>
                    </p>
                    <button
                      onClick={() => runAnalysis(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted hover:text-accent transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Phân tích lại
                    </button>
                  </div>
                  <AnalysisResult
                    result={aiResult}
                    quote={quoteForResult}
                    symbol={stock.sym}
                    onReanalyze={() => runAnalysis(true)}
                    onViewChart={() => setTab('chart')}
                  />
                </div>
              )}
            </div>
          )}

          {/* ─── Tổng Quan ─── */}
          {tab === 'overview' && (
            <div className="p-5 space-y-6">

              {/* Company description */}
              {intro?.description && (
                <div>
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Giới thiệu công ty</h3>
                  <div className="bg-surface2/30 rounded-xl p-4">
                    <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                      {intro.description}
                    </p>
                    {intro.website && (
                      <a href={intro.website} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline mt-3">
                        <Globe className="w-3.5 h-3.5" />
                        {intro.website.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Financial metrics grid */}
              <div>
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                  Chỉ số tài chính {latestFR?.period ? `(${latestFR.period})` : ''}
                </h3>
                {!detail ? (
                  <div className="flex items-center gap-2 text-muted text-sm py-4">
                    <div className="animate-spin w-4 h-4 border-2 border-accent border-t-transparent rounded-full" />
                    Đang tải dữ liệu...
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    <KV label="EPS (nghìn đ)" value={latestFR?.eps ? latestFR.eps.toFixed(2) : '—'} />
                    <KV label="P/E" value={latestFR?.pe ? latestFR.pe.toFixed(2) : '—'} />
                    <KV label="BVPS (nghìn đ)" value={latestFR?.bvps ? latestFR.bvps.toFixed(2) : '—'} />
                    <KV label="P/B" value={latestFR?.pb ? latestFR.pb.toFixed(2) : '—'} />
                    <KV label="ROE* (%)" value={latestFR?.roe ? fmtPct(latestFR.roe) : '—'} cls="text-green-400" />
                    <KV label="ROA (%)" value={latestFR?.roa ? fmtPct(latestFR.roa) : '—'} cls="text-blue-400" />
                    <KV label="Vốn hóa (tỷ)" value={basicInfo?.marketCapTy ? `${basicInfo.marketCapTy.toLocaleString('vi-VN', {maximumFractionDigits: 0})} tỷ` : (marketCap > 0 ? fmtBil(marketCap * 1e9) : '—')} />
                  </div>
                )}
                {latestFR?.roe ? (
                  <p className="text-[10px] text-muted/60 mt-1">* ROE ước tính = EPS / BVPS</p>
                ) : null}
              </div>

              {/* Company basics */}
              {basicInfo && (
                <div>
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Thông tin cơ bản</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {basicInfo.sharesOutstanding > 0 && <KV label="KLCP niêm yết" value={fmtN(basicInfo.sharesOutstanding)} />}
                    {basicInfo.charterCapital > 0 && <KV label="Vốn điều lệ" value={fmtBil(basicInfo.charterCapital)} />}
                    {basicInfo.exchange && <KV label="Sàn giao dịch" value={basicInfo.exchange} />}
                    {basicInfo.industry && <KV label="Ngành" value={basicInfo.industry} />}
                    {basicInfo.firstTradingDate && <KV label="Ngày GD đầu tiên" value={new Date(basicInfo.firstTradingDate).toLocaleDateString('vi-VN')} />}
                  </div>
                </div>
              )}

              {/* Foreign trading */}
              <div>
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Giao dịch NĐTNN</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {/* NN Mua: use VPS today, fallback to CafeF recent */}
                  <div className="bg-green-400/5 border border-green-400/20 rounded-xl p-3">
                    <p className="text-[10px] text-green-400 uppercase tracking-wider font-semibold">NN Mua</p>
                    {stock.foreignBuy > 0 ? (
                      <>
                        <p className="text-sm font-bold text-green-400 font-mono mt-1">{fmtN(stock.foreignBuy)} CP</p>
                        <p className="text-xs text-green-400/70">{foreignBuyVal.toFixed(2)} tỷ đ</p>
                      </>
                    ) : foreignData?.buyVolume ? (
                      <>
                        <p className="text-sm font-bold text-green-400 font-mono mt-1">{fmtN(foreignData.buyVolume)} CP</p>
                        <p className="text-[10px] text-muted/60">Phiên gần nhất</p>
                      </>
                    ) : (
                      <p className="text-sm font-bold text-muted font-mono mt-1">0 CP</p>
                    )}
                  </div>
                  {/* NN Bán */}
                  <div className="bg-red-400/5 border border-red-400/20 rounded-xl p-3">
                    <p className="text-[10px] text-red-400 uppercase tracking-wider font-semibold">NN Bán</p>
                    {stock.foreignSell > 0 ? (
                      <>
                        <p className="text-sm font-bold text-red-400 font-mono mt-1">{fmtN(stock.foreignSell)} CP</p>
                        <p className="text-xs text-red-400/70">{foreignSellVal.toFixed(2)} tỷ đ</p>
                      </>
                    ) : foreignData?.sellVolume ? (
                      <>
                        <p className="text-sm font-bold text-red-400 font-mono mt-1">{fmtN(foreignData.sellVolume)} CP</p>
                        <p className="text-[10px] text-muted/60">Phiên gần nhất</p>
                      </>
                    ) : (
                      <p className="text-sm font-bold text-muted font-mono mt-1">0 CP</p>
                    )}
                  </div>
                  {/* Room */}
                  <div className="bg-surface2/50 border border-border/30 rounded-xl p-3">
                    <p className="text-[10px] text-muted uppercase tracking-wider font-semibold">Tỷ lệ NN sở hữu</p>
                    {foreignData?.holdingPct ? (
                      <>
                        <p className="text-sm font-bold text-yellow-400 font-mono mt-1">{foreignData.holdingPct.toFixed(2)}%</p>
                        <p className="text-xs text-muted">Room tối đa: {foreignData.maxRatioPct > 0 ? `${foreignData.maxRatioPct}%` : '49%'}</p>
                      </>
                    ) : (
                      <p className="text-sm font-bold text-muted font-mono mt-1">—</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Historical financial ratios table */}
              {fr && fr.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Lịch sử chỉ số tài chính</h3>
                  <div className="overflow-x-auto rounded-xl border border-border/40">
                    <table className="w-full text-xs">
                      <thead className="bg-surface2">
                        <tr>
                          {['Kỳ', 'EPS', 'P/E', 'BVPS', 'P/B', 'ROE %', 'ROA %'].map(h => (
                            <th key={h} className="px-3 py-2 text-right text-muted font-semibold first:text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {fr.slice(0, 8).map((r, i) => (
                          <tr key={i} className="hover:bg-surface2/40 transition-colors">
                            <td className="px-3 py-2 text-accent font-mono text-[10px]">{r.period || '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-300">{r.eps ? r.eps.toFixed(2) : '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-300">{r.pe ? r.pe.toFixed(2) : '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-300">{r.bvps ? r.bvps.toFixed(2) : '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-300">{r.pb ? r.pb.toFixed(2) : '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-300">{r.roe ? fmtPct(r.roe) : '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-300">{r.roa ? fmtPct(r.roa) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Order book */}
              {(stock.bid[0].p > 0 || stock.ask[0].p > 0) && (
                <div>
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Dư Mua / Dư Bán</h3>
                  <div className="grid grid-cols-2 gap-3 max-w-md">
                    <div>
                      <p className="text-[10px] text-green-400 text-center mb-1 font-semibold">MUA</p>
                      <div className="space-y-1">
                        {stock.bid.filter(b => b.p > 0).map((b, i) => (
                          <div key={i} className="flex justify-between text-xs bg-green-400/5 rounded-lg px-3 py-1.5">
                            <span className="text-green-400 font-mono">{fmtP(b.p)}</span>
                            <span className="text-muted">{fmtN(b.v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-red-400 text-center mb-1 font-semibold">BÁN</p>
                      <div className="space-y-1">
                        {stock.ask.filter(a => a.p > 0).map((a, i) => (
                          <div key={i} className="flex justify-between text-xs bg-red-400/5 rounded-lg px-3 py-1.5">
                            <span className="text-red-400 font-mono">{fmtP(a.p)}</span>
                            <span className="text-muted">{fmtN(a.v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Lịch Sử Giá ─── */}
          {tab === 'history' && (
            <div className="p-5 space-y-4">
              {/* Date filter */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted">Từ</span>
                  <input
                    type="date"
                    value={histFrom}
                    onChange={e => setHistFrom(e.target.value)}
                    className="bg-surface2 border border-border/60 rounded-lg px-3 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-accent"
                  />
                  <span className="text-muted">đến</span>
                  <input
                    type="date"
                    value={histTo}
                    onChange={e => setHistTo(e.target.value)}
                    className="bg-surface2 border border-border/60 rounded-lg px-3 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={() => setHistApplied({ from: histFrom, to: histTo })}
                    className="px-3 py-1.5 bg-accent/15 text-accent border border-accent/30 rounded-lg text-xs font-medium hover:bg-accent/25 transition-colors"
                  >
                    Xem
                  </button>
                </div>
                {/* Quick presets */}
                <div className="flex gap-1">
                  {[
                    { label: '1 tuần', days: 7 },
                    { label: '1 tháng', days: 30 },
                    { label: '3 tháng', days: 90 },
                    { label: '6 tháng', days: 180 },
                    { label: '1 năm', days: 365 },
                  ].map(p => {
                    const from = new Date(Date.now() - p.days * 86400_000).toISOString().split('T')[0]
                    return (
                      <button
                        key={p.days}
                        onClick={() => { setHistFrom(from); setHistTo(today); setHistApplied({ from, to: today }) }}
                        className="px-2 py-1 bg-surface2 text-muted hover:text-gray-200 rounded text-[11px] transition-colors"
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Table */}
              {histLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
                </div>
              ) : !histData?.candles?.length ? (
                <div className="text-center py-12 text-muted text-sm">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Không có dữ liệu trong khoảng thời gian này</p>
                </div>
              ) : (
                <>
                  <p className="text-[10px] text-muted">{histData.candles.length} phiên giao dịch · giá đơn vị: nghìn đồng</p>
                  <div className="rounded-xl border border-border/40 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-surface2 sticky top-0">
                        <tr>
                          {['Ngày', 'Mở cửa', 'Cao nhất', 'Thấp nhất', 'Đóng cửa', 'Thay đổi', 'KL Khớp'].map(h => (
                            <th key={h} className="px-3 py-2.5 text-right text-muted font-semibold first:text-left whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {[...histData.candles].reverse().map((c, i, arr) => {
                          const prev = arr[i + 1]
                          const change = prev ? c.close - prev.close : 0
                          const changePct = prev && prev.close > 0 ? (change / prev.close) * 100 : 0
                          const isUp = change >= 0
                          const isRef = Math.abs(change) < 50
                          const cls = isRef ? 'text-yellow-400' : isUp ? 'text-green-400' : 'text-red-400'
                          return (
                            <tr key={c.time} className="hover:bg-surface2/30 transition-colors">
                              <td className="px-3 py-2 text-accent font-mono text-[11px]">
                                {new Date(c.time).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-gray-300">{(c.open / 1000).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-mono text-green-400">{(c.high / 1000).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-mono text-red-400">{(c.low / 1000).toFixed(2)}</td>
                              <td className={`px-3 py-2 text-right font-bold font-mono ${cls}`}>{(c.close / 1000).toFixed(2)}</td>
                              <td className={`px-3 py-2 text-right font-mono ${cls}`}>
                                {prev ? `${isRef ? '' : isUp ? '+' : ''}${(change / 1000).toFixed(2)} (${isRef ? '' : isUp ? '+' : ''}${changePct.toFixed(2)}%)` : '—'}
                              </td>
                              <td className="px-3 py-2 text-right text-muted">
                                {c.volume >= 1_000_000 ? `${(c.volume / 1_000_000).toFixed(2)}M` : c.volume >= 1_000 ? `${(c.volume / 1_000).toFixed(1)}K` : c.volume.toLocaleString('vi-VN')}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── Tin Tức ─── */}
          {tab === 'news' && (
            <div className="p-5 space-y-2">
              {newsData?.items?.length ? (
                newsData.items.slice(0, 15).map(item => (
                  <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"
                    className="block bg-surface2/40 rounded-xl p-3.5 hover:bg-surface2 transition-colors group">
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-1 h-full rounded-full self-stretch ${item.sentiment > 60 ? 'bg-green-400/50' : item.sentiment < 40 ? 'bg-red-400/50' : 'bg-yellow-400/50'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-200 leading-snug group-hover:text-white transition-colors">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted">
                          <span className="text-accent">{item.source}</span>
                          <span>·</span>
                          <span>{new Date(item.publishedAt).toLocaleDateString('vi-VN')}</span>
                          {item.sentiment > 60 ? <span className="text-green-400 text-[10px]">▲ Tích cực</span> :
                           item.sentiment < 40 ? <span className="text-red-400 text-[10px]">▼ Tiêu cực</span> : null}
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted/30 group-hover:text-muted transition-colors flex-shrink-0 mt-0.5" />
                    </div>
                  </a>
                ))
              ) : (
                <div className="text-center py-16 text-muted">
                  <Newspaper className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Đang tải tin tức...</p>
                </div>
              )}
            </div>
          )}

          {/* ─── BCPT ─── */}
          {tab === 'reports' && (
            <div className="p-5 space-y-3">
              {detail?.analystReports?.length ? (
                <p className="text-[10px] text-muted/60 leading-relaxed">
                  Nội dung trích từ CafeF · Nhấn &quot;Tìm&quot; để tìm kiếm file PDF gốc trên Google · Nhấn &quot;AI&quot; để phân tích nội dung bằng Claude
                </p>
              ) : null}
              {!detail ? (
                <div className="flex items-center gap-2 text-muted text-sm py-8 justify-center">
                  <div className="animate-spin w-4 h-4 border-2 border-accent border-t-transparent rounded-full" />
                  Đang tải báo cáo...
                </div>
              ) : detail.analystReports?.length ? (
                detail.analystReports.map((r, i) => <ReportCard key={i} report={r} />)
              ) : (
                <div className="text-center py-16 text-muted">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Chưa có báo cáo phân tích</p>
                </div>
              )}
            </div>
          )}

          {/* ─── Sở Hữu ─── */}
          {tab === 'ownership' && (
            <div className="p-5 space-y-5">
              {!detail ? (
                <div className="flex items-center gap-2 text-muted text-sm py-8 justify-center">
                  <div className="animate-spin w-4 h-4 border-2 border-accent border-t-transparent rounded-full" />
                  Đang tải dữ liệu sở hữu...
                </div>
              ) : (
                <>
                  {detail.shareholders?.major?.length ? (
                    <div>
                      <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Cổ đông lớn</h3>
                      <div className="rounded-xl border border-border/40 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-surface2">
                            <tr>
                              <th className="px-4 py-2.5 text-left text-muted font-semibold">Cổ đông</th>
                              <th className="px-4 py-2.5 text-right text-muted font-semibold">Khối lượng</th>
                              <th className="px-4 py-2.5 text-right text-muted font-semibold">Tỷ lệ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/30">
                            {detail.shareholders.major.map((s, i) => (
                              <tr key={i} className="hover:bg-surface2/40">
                                <td className="px-4 py-2.5 text-gray-300">{s.name}</td>
                                <td className="px-4 py-2.5 text-right font-mono text-gray-300">{fmtN(s.volume)}</td>
                                <td className="px-4 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-16 h-1.5 bg-surface2 rounded-full overflow-hidden">
                                      <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min(100, s.pct)}%` }} />
                                    </div>
                                    <span className="text-accent font-semibold">{s.pct.toFixed(2)}%</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-muted text-sm py-8">Chưa có dữ liệu cơ cấu sở hữu</p>
                  )}

                  {/* Management */}
                  {detail.management?.length ? (
                    <div>
                      <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Ban lãnh đạo</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {detail.management.slice(0, 10).map((p, i) => (
                          <div key={i} className="flex items-center gap-3 bg-surface2/40 rounded-xl p-3">
                            <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                              <span className="text-accent text-sm font-bold">
                                {p.name.replace(/^(Ông|Bà|Ông)\s+/i, '').charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-200 truncate">{p.name}</p>
                              <p className="text-xs text-muted truncate">{p.position}</p>
                              {p.yearBorn > 0 && <p className="text-[10px] text-muted/60">Sinh năm {p.yearBorn}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}

          {/* ─── Kế Hoạch ─── */}
          {tab === 'plan' && (
            <div className="p-5 space-y-5">
              {!detail ? (
                <div className="flex items-center gap-2 text-muted text-sm py-8 justify-center">
                  <div className="animate-spin w-4 h-4 border-2 border-accent border-t-transparent rounded-full" />
                  Đang tải kế hoạch...
                </div>
              ) : (
                <>
                  {detail.businessPlan?.length ? (
                    <div className="space-y-4">
                      {detail.businessPlan.slice(0, 5).map((p, i) => (
                        <div key={i}>
                          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                            Kế hoạch kinh doanh năm {p.year}
                          </h3>
                          {/* Show all raw values from CafeF if available */}
                          {p.values && p.values.length > 0 ? (
                            <div className="rounded-xl border border-border/40 overflow-hidden">
                              <table className="w-full text-xs">
                                <tbody className="divide-y divide-border/20">
                                  {p.values.map((v, j) => (
                                    <tr key={j} className="hover:bg-surface2/40">
                                      <td className="px-3 py-2.5 text-muted w-1/2">{v.name}</td>
                                      <td className="px-3 py-2.5 text-right text-gray-200 font-medium">{v.value || '—'}</td>
                                    </tr>
                                  ))}
                                  {p.dividend && (
                                    <tr className="hover:bg-surface2/40">
                                      <td className="px-3 py-2.5 text-muted">Cổ tức</td>
                                      <td className="px-3 py-2.5 text-right text-yellow-400 font-medium">{p.dividend}</td>
                                    </tr>
                                  )}
                                  {p.profitGrowth !== 0 && (
                                    <tr className="hover:bg-surface2/40">
                                      <td className="px-3 py-2.5 text-muted">Tăng trưởng LNTT</td>
                                      <td className={`px-3 py-2.5 text-right font-semibold ${p.profitGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {p.profitGrowth >= 0 ? '+' : ''}{p.profitGrowth.toFixed(1)}%
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            /* Fallback: show parsed revenue/profit table */
                            <div className="rounded-xl border border-border/40 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-surface2">
                                  <tr>
                                    {['Chỉ tiêu','Kế hoạch','Tăng trưởng'].map(h => (
                                      <th key={h} className="px-3 py-2.5 text-right text-muted font-semibold first:text-left">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30">
                                  {(p.revenue > 0 || p.revenueRaw) && (
                                    <tr className="hover:bg-surface2/40">
                                      <td className="px-3 py-2.5 text-muted">Doanh thu</td>
                                      <td className="px-3 py-2.5 text-right text-gray-300 font-mono">{p.revenue > 0 ? `${p.revenue.toLocaleString('vi-VN')} tỷ` : p.revenueRaw}</td>
                                      <td className={`px-3 py-2.5 text-right font-semibold ${p.revenueGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {p.revenueGrowth ? `${p.revenueGrowth >= 0 ? '+' : ''}${p.revenueGrowth.toFixed(1)}%` : '—'}
                                      </td>
                                    </tr>
                                  )}
                                  {(p.profit > 0 || p.profitRaw) && (
                                    <tr className="hover:bg-surface2/40">
                                      <td className="px-3 py-2.5 text-muted">Lợi nhuận trước thuế</td>
                                      <td className="px-3 py-2.5 text-right text-gray-300 font-mono">{p.profit > 0 ? `${p.profit.toLocaleString('vi-VN')} tỷ` : p.profitRaw}</td>
                                      <td className={`px-3 py-2.5 text-right font-semibold ${p.profitGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {p.profitGrowth ? `${p.profitGrowth >= 0 ? '+' : ''}${p.profitGrowth.toFixed(1)}%` : '—'}
                                      </td>
                                    </tr>
                                  )}
                                  {p.dividend && (
                                    <tr className="hover:bg-surface2/40">
                                      <td className="px-3 py-2.5 text-muted">Cổ tức</td>
                                      <td className="px-3 py-2.5 text-right text-yellow-400">{p.dividend}</td>
                                      <td />
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted text-sm py-8">Chưa có kế hoạch kinh doanh</p>
                  )}

                  {/* Events */}
                  {detail.events?.length ? (
                    <div>
                      <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Lịch sự kiện</h3>
                      <div className="space-y-2">
                        {detail.events.slice(0, 10).map((ev, i) => (
                          <div key={i} className="flex items-start gap-3 bg-surface2/40 rounded-xl p-3">
                            <div className="flex-shrink-0 text-center bg-accent/10 rounded-lg px-2 py-1 min-w-[56px]">
                              <Calendar className="w-3.5 h-3.5 text-accent mx-auto mb-0.5" />
                              <p className="text-[10px] text-accent font-mono">
                                {ev.date ? new Date(ev.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—'}
                              </p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-200 leading-snug">{ev.title}</p>
                              {ev.detail && <p className="text-xs text-muted mt-0.5">{ev.detail}</p>}
                              {ev.eventType && <span className="text-[10px] text-accent">{ev.eventType}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}

          {/* ─── Công Ty Con ─── */}
          {tab === 'subsidiaries' && (
            <div className="p-5">
              {!detail ? (
                <div className="flex items-center gap-2 text-muted text-sm py-8 justify-center">
                  <div className="animate-spin w-4 h-4 border-2 border-accent border-t-transparent rounded-full" />
                  Đang tải công ty con...
                </div>
              ) : detail.subsidiaries?.length ? (
                <div>
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                    Công ty con & liên kết ({detail.subsidiaries.length})
                  </h3>
                  <div className="rounded-xl border border-border/40 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-surface2">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-muted font-semibold">Tên công ty</th>
                          <th className="px-4 py-2.5 text-right text-muted font-semibold">Tỷ lệ sở hữu</th>
                          <th className="px-4 py-2.5 text-right text-muted font-semibold">Lĩnh vực</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {detail.subsidiaries.map((s, i) => (
                          <tr key={i} className="hover:bg-surface2/40">
                            <td className="px-4 py-2.5 text-gray-300">{s.name}</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className="text-accent font-semibold font-mono">{s.pct.toFixed(1)}%</span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-muted">{s.businessType || s.type || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-muted">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Chưa có dữ liệu công ty con</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        .no-scrollbar { scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
