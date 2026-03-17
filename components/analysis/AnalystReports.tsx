'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import type { AnalystReport } from '@/app/api/analyst-reports/route'
import type { CafefReport } from '@/app/api/cafef-reports/route'
import {
  FileText, ExternalLink, ChevronRight, ChevronDown, X, Bot, Loader2,
  TrendingUp, TrendingDown, Minus, RefreshCw, Search,
} from 'lucide-react'
import { getClientToken } from '@/lib/requireAuth'
import {
  getLocalReportAnalyses,
  saveReportAnalysis,
  loadReportAnalysesFromCloud,
} from '@/lib/storage'

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return dateStr }
}

function getTypeColor(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('doanh nghiệp') || t.includes('company')) return 'text-accent bg-accent/10'
  if (t.includes('ngành') || t.includes('industry') || t.includes('thị trường')) return 'text-blue-400 bg-blue-400/10'
  if (t.includes('kqkd') || t.includes('đhcđ')) return 'text-gold bg-gold/10'
  if (t.includes('cập nhật') || t.includes('update')) return 'text-purple-400 bg-purple-400/10'
  return 'text-muted bg-surface2'
}

interface AIAnalysis {
  summary: string
  keyPoints: string[]
  recommendation: string
  targetPrice: number | null
  sentiment: string
  riskFactors: string[]
  catalysts: string[]
  conclusion: string
  hasFullContent?: boolean
  parseError?: boolean
  error?: string
  cachedAt?: string
}

function SentimentIcon({ s }: { s: string }) {
  if (s === 'TÍCH CỰC') return <TrendingUp className="w-3.5 h-3.5 text-accent inline mr-1" />
  if (s === 'TIÊU CỰC') return <TrendingDown className="w-3.5 h-3.5 text-danger inline mr-1" />
  return <Minus className="w-3.5 h-3.5 text-gold inline mr-1" />
}

function RecommendBadge({ rec }: { rec: string }) {
  const colors: Record<string, string> = {
    'MUA MẠNH': 'bg-accent text-bg font-bold',
    'MUA': 'bg-accent/20 text-accent',
    'GIỮ': 'bg-gold/20 text-gold',
    'BÁN': 'bg-danger/20 text-danger',
    'BÁN MẠNH': 'bg-danger text-white font-bold',
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${colors[rec] || 'bg-surface2 text-muted'}`}>
      {rec}
    </span>
  )
}

// ── Cache helpers — delegates to lib/storage (localStorage + Supabase) ────────
function loadCache(prefix: string, symbol: string): Record<string, AIAnalysis> {
  return getLocalReportAnalyses(prefix, symbol) as Record<string, AIAnalysis>
}

// ── Shared AI analysis panel ───────────────────────────────────────────────────
function AIPanel({
  id, symbol, cachePrefix, title, url, reportType, date,
  aiMap, setAiMap, loadingMap, setLoadingMap,
}: {
  id: string
  symbol: string
  cachePrefix: string
  title: string
  url: string | null
  reportType: string
  date: string
  aiMap: Record<string, AIAnalysis | null>
  setAiMap: React.Dispatch<React.SetStateAction<Record<string, AIAnalysis | null>>>
  loadingMap: Record<string, boolean>
  setLoadingMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const ai = aiMap[id]
  const isLoading = !!loadingMap[id]
  const hasCached = !!(ai && !ai.error)
  const isPdf = /\.pdf(\?.*)?$/i.test(url || '')

  // For CafeF PDF URLs: rewrite via /api/report-pdf → cafefnew.mediacdn.vn CDN
  const openPdf = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!url || pdfLoading) return
    setPdfLoading(true)
    const win = window.open('', '_blank') // open synchronously (avoid popup blocker)
    try {
      const res = await fetch(`/api/report-pdf?url=${encodeURIComponent(url)}`)
      const data = await res.json()
      const finalUrl = data.pdfUrl || url
      if (win) { win.location.href = finalUrl } else { window.open(finalUrl, '_blank') }
    } catch {
      if (win) { win.location.href = url } else { window.open(url, '_blank') }
    } finally {
      setPdfLoading(false)
    }
  }

  const analyze = async (force = false) => {
    if (!force && (aiMap[id] || loadingMap[id])) return
    setLoadingMap(prev => ({ ...prev, [id]: true }))
    setCollapsed(false)
    try {
      const token = getClientToken()
      const res = await fetch('/api/report-analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url, title, symbol, reportType, date }),
      })
      const data = await res.json()
      const result: AIAnalysis = { ...data, cachedAt: new Date().toISOString() }
      setAiMap(prev => ({ ...prev, [id]: result }))
      if (!data.error) {
        // Save to localStorage + Supabase (non-blocking)
        await saveReportAnalysis(id, symbol, cachePrefix, result)
      }
    } catch {
      setAiMap(prev => ({
        ...prev, [id]: {
          summary: 'Không thể phân tích báo cáo này.',
          keyPoints: [], recommendation: 'KHÔNG RÕ', targetPrice: null,
          sentiment: 'TRUNG TÍNH', riskFactors: [], catalysts: [], conclusion: '',
          error: 'Lỗi kết nối',
        },
      }))
    } finally {
      setLoadingMap(prev => ({ ...prev, [id]: false }))
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {url && (
          isPdf ? (
            // PDF: rewrite via CDN proxy to avoid cafef.vn 404
            <button
              onClick={(e) => openPdf(e)}
              disabled={pdfLoading}
              className="inline-flex items-center gap-1.5 text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {pdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              Mở PDF
            </button>
          ) : (
            // Article URL: open directly
            <a
              href={url} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-xs bg-surface text-muted hover:text-gray-200 border border-border px-3 py-1.5 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Đọc báo cáo
            </a>
          )
        )}
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(title + ' pdf')}`}
          target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 text-xs bg-surface text-muted hover:text-accent border border-border px-3 py-1.5 rounded-lg transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          Tìm Google
        </a>
        {!hasCached ? (
          <button
            onClick={(e) => { e.stopPropagation(); analyze() }}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 text-xs bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
            {isLoading ? 'Đang phân tích...' : 'Phân tích AI'}
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); analyze(true) }}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 text-xs bg-surface text-muted hover:text-accent border border-border px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {isLoading ? 'Đang phân tích...' : 'Phân tích lại'}
          </button>
        )}
      </div>

      {/* AI loading */}
      {isLoading && (
        <div className="bg-bg/40 rounded-lg p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-accent animate-spin flex-shrink-0" />
          <p className="text-xs text-muted">StockAI đang đọc và phân tích báo cáo...</p>
        </div>
      )}

      {/* AI result */}
      {ai && !ai.error && !isLoading && (
        <div className="bg-bg/40 rounded-lg border border-accent/10 overflow-hidden">
          <button
            className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-surface2/30 transition-colors"
            onClick={(e) => { e.stopPropagation(); setCollapsed(c => !c) }}
          >
            <div className="flex items-center gap-2">
              <Bot className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-semibold text-accent">Phân tích AI</span>
              {!ai.hasFullContent && <span className="text-[10px] text-muted/60 italic">(từ tiêu đề)</span>}
              {ai.cachedAt && <span className="text-[10px] text-muted/40">· {new Date(ai.cachedAt).toLocaleDateString('vi-VN')}</span>}
            </div>
            <div className="flex items-center gap-3">
              <RecommendBadge rec={ai.recommendation} />
              <span className="text-[10px] text-muted flex items-center">
                <SentimentIcon s={ai.sentiment} />{ai.sentiment}
              </span>
              {collapsed
                ? <ChevronRight className="w-3.5 h-3.5 text-muted/60" />
                : <ChevronDown className="w-3.5 h-3.5 text-muted/60" />}
            </div>
          </button>

          {!collapsed && (
            <div className="px-4 pb-4 pt-1 space-y-3">
              <p className="text-xs text-gray-300 leading-relaxed">{ai.summary}</p>
              {ai.keyPoints?.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted font-semibold uppercase mb-1.5">Điểm chính</p>
                  <ul className="space-y-1">
                    {ai.keyPoints.map((pt, i) => (
                      <li key={i} className="text-xs text-gray-300 flex gap-1.5">
                        <span className="text-accent flex-shrink-0 mt-0.5">→</span><span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {ai.catalysts?.length > 0 && (
                  <div>
                    <p className="text-[10px] text-accent font-semibold uppercase mb-1">Động lực tăng</p>
                    <ul className="space-y-0.5">
                      {ai.catalysts.map((c, i) => <li key={i} className="text-[11px] text-gray-400">{c}</li>)}
                    </ul>
                  </div>
                )}
                {ai.riskFactors?.length > 0 && (
                  <div>
                    <p className="text-[10px] text-danger font-semibold uppercase mb-1">Rủi ro</p>
                    <ul className="space-y-0.5">
                      {ai.riskFactors.map((rf, i) => <li key={i} className="text-[11px] text-gray-400">{rf}</li>)}
                    </ul>
                  </div>
                )}
              </div>
              {ai.conclusion && (
                <p className="text-xs text-gray-400 bg-surface/50 rounded p-2 italic leading-relaxed border-l-2 border-accent/30">
                  {ai.conclusion}
                </p>
              )}
              {ai.targetPrice ? (
                <p className="text-xs text-gold">
                  Giá mục tiêu: <span className="font-semibold">{Number(ai.targetPrice).toLocaleString('vi-VN')}₫</span>
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}

      {ai?.error && !isLoading && (
        <div className="text-xs text-danger bg-danger/10 rounded-lg p-3">{ai.error}</div>
      )}
    </div>
  )
}

// ── CafeF Reports section ─────────────────────────────────────────────────────
function CafefReportsSection({ symbol }: { symbol: string }) {
  const { data: reports, isLoading } = useSWR<CafefReport[]>(
    symbol ? `/api/cafef-reports?symbol=${symbol}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [aiMap, setAiMap] = useState<Record<string, AIAnalysis | null>>({})
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})

  useEffect(() => {
    // 1. Load from localStorage instantly
    const local = loadCache('cafef', symbol)
    if (Object.keys(local).length > 0) setAiMap(prev => ({ ...local, ...prev }))
    // 2. Sync from Supabase (fills in analyses done on other devices)
    loadReportAnalysesFromCloud(symbol).then(cloud => {
      if (Object.keys(cloud).length > 0) setAiMap(prev => ({ ...cloud, ...prev }))
    })
  }, [symbol])

  if (isLoading) return (
    <div className="animate-pulse space-y-2 mb-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-10 bg-border/40 rounded" />
      ))}
    </div>
  )

  if (!reports || reports.length === 0) return null

  const displayed = showAll ? reports : reports.slice(0, 6)

  return (
    <div className="card-glass overflow-hidden mb-4">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2 text-sm">
          <FileText className="w-4 h-4 text-accent" />
          Báo Cáo Phân Tích
          <span className="text-xs text-muted font-normal">· {symbol}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-semibold">CafeF · PDF</span>
        </h3>
        <span className="text-xs text-muted">{reports.length} báo cáo</span>
      </div>

      <div className="divide-y divide-border/50">
        <div className="px-4 py-2 grid grid-cols-[100px_1fr_80px_20px] gap-3 text-xs text-muted/60 font-medium">
          <span>Ngày</span><span>Tiêu đề</span><span className="text-right">Nguồn</span><span />
        </div>

        {displayed.map((r) => {
          const isExpanded = expandedId === r.id
          const hasCached = !!(aiMap[r.id] && !aiMap[r.id]?.error)
          const isPdf = /\.pdf(\?.*)?$/i.test(r.url || '')

          return (
            <div key={r.id}>
              <div
                className="px-4 py-3 grid grid-cols-[100px_1fr_80px_20px] gap-3 items-center hover:bg-surface2/50 transition-colors cursor-pointer select-none"
                onClick={() => setExpandedId(isExpanded ? null : r.id)}
              >
                <span className="text-xs text-muted tabular-nums whitespace-nowrap">{formatDate(r.date)}</span>
                <div className="min-w-0 flex items-center gap-2">
                  <p className="text-xs text-gray-200 truncate" title={r.title}>{r.title}</p>
                  {isPdf && <span className="flex-shrink-0 text-[9px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded font-medium">PDF</span>}
                  {hasCached && <span className="flex-shrink-0 text-[9px] bg-accent/15 text-accent px-1.5 py-0.5 rounded font-medium">AI</span>}
                </div>
                <div className="flex justify-end">
                  <span className="text-[10px] text-muted truncate">{r.source}</span>
                </div>
                <div className="flex justify-center">
                  {isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 text-accent" />
                    : <ChevronRight className="w-3.5 h-3.5 text-muted/40" />}
                </div>
              </div>

              {isExpanded && (
                <div className="mx-4 mb-3 bg-surface2 rounded-xl border border-accent/15 overflow-hidden">
                  <div className="flex items-start justify-between gap-3 p-4 pb-3">
                    <p className="text-sm text-gray-100 leading-relaxed flex-1 font-medium">{r.title}</p>
                    <button onClick={(e) => { e.stopPropagation(); setExpandedId(null) }} className="text-muted hover:text-gray-300 flex-shrink-0 mt-0.5">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted px-4 pb-3">
                    {r.source && <span className="px-1.5 py-0.5 rounded bg-surface text-muted border border-border">{r.source}</span>}
                    {r.date && <><span>·</span><span>{formatDate(r.date)}</span></>}
                    <span>·</span><span className="text-blue-400">CafeF</span>
                    {isPdf && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">PDF đầy đủ</span>}
                  </div>
                  {r.summary && (
                    <p className="px-4 pb-3 text-xs text-muted/80 leading-relaxed italic">{r.summary}</p>
                  )}
                  <div className="px-4 pb-4">
                    <AIPanel
                      id={r.id} symbol={symbol} cachePrefix="cafef"
                      title={r.title} url={r.url} reportType={r.source || 'CafeF'} date={r.date}
                      aiMap={aiMap} setAiMap={setAiMap} loadingMap={loadingMap} setLoadingMap={setLoadingMap}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {reports.length > 6 && (
        <div className="px-4 py-2.5 border-t border-border">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-muted hover:text-accent transition-colors flex items-center gap-1"
          >
            {showAll ? 'Thu gọn' : `Xem thêm ${reports.length - 6} báo cáo`}
            <ChevronRight className={`w-3 h-3 transition-transform ${showAll ? 'rotate-90' : ''}`} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Vietcap Reports section ───────────────────────────────────────────────────
function VietcapReportsSection({ symbol }: { symbol: string }) {
  const { data: reports, isLoading } = useSWR<AnalystReport[]>(
    symbol ? `/api/analyst-reports?symbol=${symbol}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [aiMap, setAiMap] = useState<Record<string, AIAnalysis | null>>({})
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})

  useEffect(() => {
    // 1. Load from localStorage instantly
    const local = loadCache('vietcap', symbol)
    if (Object.keys(local).length > 0) setAiMap(prev => ({ ...local, ...prev }))
    // 2. Sync from Supabase (fills in analyses done on other devices)
    loadReportAnalysesFromCloud(symbol).then(cloud => {
      if (Object.keys(cloud).length > 0) setAiMap(prev => ({ ...cloud, ...prev }))
    })
  }, [symbol])

  if (isLoading) return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-10 bg-border/40 rounded" />
      ))}
    </div>
  )

  if (!reports || reports.length === 0) return null

  const displayed = showAll ? reports : reports.slice(0, 6)

  return (
    <div className="card-glass overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2 text-sm">
          <FileText className="w-4 h-4 text-blue-400" />
          Báo Cáo Phân Tích
          <span className="text-xs text-muted font-normal">· {symbol}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-400/15 text-blue-400 font-semibold">Vietcap</span>
        </h3>
        <span className="text-xs text-muted">{reports.length} báo cáo</span>
      </div>

      <div className="divide-y divide-border/50">
        <div className="px-4 py-2 grid grid-cols-[110px_1fr_90px_20px] gap-3 text-xs text-muted/60 font-medium">
          <span>Ngày</span><span>Tiêu đề</span><span className="text-right">Loại</span><span />
        </div>

        {displayed.map((r) => {
          const isExpanded = expandedId === r.id
          const hasCached = !!(aiMap[r.id] && !aiMap[r.id]?.error)

          return (
            <div key={r.id}>
              <div
                className="px-4 py-3 grid grid-cols-[110px_1fr_90px_20px] gap-3 items-center hover:bg-surface2/50 transition-colors cursor-pointer select-none"
                onClick={() => setExpandedId(isExpanded ? null : r.id)}
              >
                <span className="text-xs text-muted tabular-nums whitespace-nowrap">{formatDate(r.date)}</span>
                <div className="min-w-0 flex items-center gap-2">
                  <p className="text-xs text-gray-200 truncate" title={r.title}>{r.title}</p>
                  {hasCached && <span className="flex-shrink-0 text-[9px] bg-accent/15 text-accent px-1.5 py-0.5 rounded font-medium">AI</span>}
                </div>
                <div className="flex justify-end">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${getTypeColor(r.reportType)}`}>
                    {r.reportType}
                  </span>
                </div>
                <div className="flex justify-center">
                  {isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 text-accent" />
                    : <ChevronRight className="w-3.5 h-3.5 text-muted/40" />}
                </div>
              </div>

              {isExpanded && (
                <div className="mx-4 mb-3 bg-surface2 rounded-xl border border-accent/15 overflow-hidden">
                  <div className="flex items-start justify-between gap-3 p-4 pb-3">
                    <p className="text-sm text-gray-100 leading-relaxed flex-1 font-medium">{r.title}</p>
                    <button onClick={(e) => { e.stopPropagation(); setExpandedId(null) }} className="text-muted hover:text-gray-300 flex-shrink-0 mt-0.5">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted px-4 pb-3">
                    <span className={`px-1.5 py-0.5 rounded font-medium ${getTypeColor(r.reportType)}`}>{r.reportType}</span>
                    <span>·</span><span>{formatDate(r.date)}</span>
                    <span>·</span><span className="text-blue-400">Vietcap Securities</span>
                  </div>
                  <div className="px-4 pb-4">
                    <AIPanel
                      id={r.id} symbol={symbol} cachePrefix="vietcap"
                      title={r.title} url={r.url} reportType={r.reportType} date={r.date}
                      aiMap={aiMap} setAiMap={setAiMap} loadingMap={loadingMap} setLoadingMap={setLoadingMap}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {reports.length > 6 && (
        <div className="px-4 py-2.5 border-t border-border">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-muted hover:text-accent transition-colors flex items-center gap-1"
          >
            {showAll ? 'Thu gọn' : `Xem thêm ${reports.length - 6} báo cáo`}
            <ChevronRight className={`w-3 h-3 transition-transform ${showAll ? 'rotate-90' : ''}`} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function AnalystReports({ symbol }: { symbol: string }) {
  return (
    <div className="space-y-0">
      <CafefReportsSection symbol={symbol} />
      <VietcapReportsSection symbol={symbol} />
    </div>
  )
}
