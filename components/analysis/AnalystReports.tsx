'use client'

import { useState } from 'react'
import useSWR from 'swr'
import type { AnalystReport } from '@/app/api/analyst-reports/route'
import {
  FileText, ExternalLink, ChevronRight, ChevronDown, X, Bot, Loader2,
  TrendingUp, TrendingDown, Minus, File,
} from 'lucide-react'
import { getClientToken } from '@/lib/requireAuth'

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

function formatReportDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function getTypeColor(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('doanh nghiệp') || t.includes('company')) return 'text-accent bg-accent/10'
  if (t.includes('ngành') || t.includes('industry') || t.includes('sector') || t.includes('thị trường')) return 'text-blue-400 bg-blue-400/10'
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
  error?: string
}

interface PdfModal {
  open: boolean
  loading: boolean
  url: string
  title: string
  error: string
}

interface Props {
  symbol: string
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

export default function AnalystReports({ symbol }: Props) {
  const { data: reports, isLoading } = useSWR<AnalystReport[]>(
    symbol ? `/api/analyst-reports?symbol=${symbol}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [aiAnalyses, setAiAnalyses] = useState<Record<string, AIAnalysis | null>>({})
  const [loadingAI, setLoadingAI] = useState<Record<string, boolean>>({})
  const [pdfModal, setPdfModal] = useState<PdfModal>({
    open: false, loading: false, url: '', title: '', error: '',
  })

  const analyzeReport = async (report: AnalystReport) => {
    if (aiAnalyses[report.id] || loadingAI[report.id]) return
    setLoadingAI(prev => ({ ...prev, [report.id]: true }))
    try {
      const token = getClientToken()
      const res = await fetch('/api/report-analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          url: report.url,
          title: report.title,
          symbol,
          reportType: report.reportType,
          date: report.date,
        }),
      })
      const data = await res.json()
      setAiAnalyses(prev => ({ ...prev, [report.id]: data }))
    } catch {
      setAiAnalyses(prev => ({
        ...prev,
        [report.id]: {
          summary: 'Không thể phân tích báo cáo này.',
          keyPoints: [], recommendation: 'KHÔNG RÕ', targetPrice: null,
          sentiment: 'TRUNG TÍNH', riskFactors: [], catalysts: [], conclusion: '',
          error: 'Lỗi kết nối',
        },
      }))
    } finally {
      setLoadingAI(prev => ({ ...prev, [report.id]: false }))
    }
  }

  const openPdf = async (report: AnalystReport, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!report.url) return
    setPdfModal({ open: true, loading: true, url: '', title: report.title, error: '' })
    try {
      const res = await fetch(`/api/report-pdf?url=${encodeURIComponent(report.url)}`)
      const data = await res.json()
      if (data.pdfUrl) {
        setPdfModal({ open: true, loading: false, url: data.pdfUrl, title: report.title, error: '' })
      } else {
        // Fallback: use original URL directly
        setPdfModal({ open: true, loading: false, url: report.url, title: report.title, error: '' })
      }
    } catch {
      setPdfModal({ open: true, loading: false, url: report.url, title: report.title, error: '' })
    }
  }

  const closePdf = () => setPdfModal(p => ({ ...p, open: false }))

  if (isLoading) {
    return (
      <div className="card-glass p-4 animate-pulse space-y-2">
        <div className="h-4 w-40 bg-border rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 bg-border/50 rounded" />
        ))}
      </div>
    )
  }

  if (!reports || reports.length === 0) return null

  const displayed = showAll ? reports : reports.slice(0, 8)

  return (
    <>
      <div className="card-glass overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-accent" />
            Báo Cáo Phân Tích
            <span className="text-xs text-muted font-normal">· {symbol}</span>
          </h3>
          <span className="text-xs text-muted">{reports.length} báo cáo · Vietcap</span>
        </div>

        <div className="divide-y divide-border/50">
          {/* Header row */}
          <div className="px-4 py-2 grid grid-cols-[110px_1fr_90px_20px] gap-3 text-xs text-muted/60 font-medium">
            <span>Ngày</span>
            <span>Tiêu đề</span>
            <span className="text-right">Loại</span>
            <span />
          </div>

          {displayed.map((r) => {
            const isExpanded = expandedId === r.id
            const ai = aiAnalyses[r.id]
            const isLoadingAI = loadingAI[r.id]
            return (
              <div key={r.id}>
                {/* Clickable row */}
                <div
                  className="px-4 py-3 grid grid-cols-[110px_1fr_90px_20px] gap-3 items-center hover:bg-surface2/50 transition-colors cursor-pointer select-none"
                  onClick={() => {
                    const next = isExpanded ? null : r.id
                    setExpandedId(next)
                  }}
                >
                  <span className="text-xs text-muted tabular-nums whitespace-nowrap">
                    {formatReportDate(r.date)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-200 truncate" title={r.title}>
                      {r.title}
                    </p>
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

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="mx-4 mb-3 bg-surface2 rounded-xl border border-accent/15 overflow-hidden">
                    {/* Panel header */}
                    <div className="flex items-start justify-between gap-3 p-4 pb-3">
                      <p className="text-sm text-gray-100 leading-relaxed flex-1 font-medium">{r.title}</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedId(null) }}
                        className="text-muted hover:text-gray-300 flex-shrink-0 mt-0.5"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted px-4 pb-3">
                      <span className={`px-1.5 py-0.5 rounded font-medium ${getTypeColor(r.reportType)}`}>
                        {r.reportType}
                      </span>
                      <span>·</span>
                      <span>{formatReportDate(r.date)}</span>
                      <span>·</span>
                      <span>Vietcap Securities</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 px-4 pb-4 flex-wrap">
                      {r.url && (
                        <>
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-xs bg-surface text-muted hover:text-gray-200 border border-border px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Đọc bản gốc
                          </a>
                          <button
                            onClick={(e) => openPdf(r, e)}
                            className="inline-flex items-center gap-1.5 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <File className="w-3.5 h-3.5" />
                            Xem PDF
                          </button>
                        </>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); analyzeReport(r) }}
                        disabled={isLoadingAI || !!ai}
                        className="inline-flex items-center gap-1.5 text-xs bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isLoadingAI
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Bot className="w-3.5 h-3.5" />}
                        {ai ? 'Đã phân tích' : isLoadingAI ? 'Đang phân tích...' : 'Phân tích AI'}
                      </button>
                    </div>

                    {/* AI Analysis Result */}
                    {isLoadingAI && (
                      <div className="mx-4 mb-4 bg-bg/40 rounded-lg p-4 flex items-center gap-3">
                        <Loader2 className="w-5 h-5 text-accent animate-spin flex-shrink-0" />
                        <p className="text-xs text-muted">Claude Sonnet 4.6 đang đọc và phân tích báo cáo...</p>
                      </div>
                    )}

                    {ai && !ai.error && (
                      <div className="mx-4 mb-4 bg-bg/40 rounded-lg p-4 space-y-3 border border-accent/10">
                        {/* Header */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Bot className="w-3.5 h-3.5 text-accent" />
                            <span className="text-xs font-semibold text-accent">Phân tích AI</span>
                            {!ai.hasFullContent && (
                              <span className="text-[10px] text-muted/60 italic">(dựa trên tiêu đề)</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <RecommendBadge rec={ai.recommendation} />
                            <span className="text-[10px] text-muted flex items-center">
                              <SentimentIcon s={ai.sentiment} />
                              {ai.sentiment}
                            </span>
                          </div>
                        </div>

                        {/* Summary */}
                        <p className="text-xs text-gray-300 leading-relaxed">{ai.summary}</p>

                        {/* Key points */}
                        {ai.keyPoints?.length > 0 && (
                          <div>
                            <p className="text-[10px] text-muted font-semibold uppercase mb-1">Điểm chính</p>
                            <ul className="space-y-1">
                              {ai.keyPoints.map((pt, i) => (
                                <li key={i} className="text-xs text-gray-300 flex gap-1.5">
                                  <span className="text-accent flex-shrink-0 mt-0.5">→</span>
                                  <span>{pt}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Catalysts & Risks */}
                        <div className="grid grid-cols-2 gap-3">
                          {ai.catalysts?.length > 0 && (
                            <div>
                              <p className="text-[10px] text-accent font-semibold uppercase mb-1">Động lực tăng</p>
                              <ul className="space-y-0.5">
                                {ai.catalysts.map((c, i) => (
                                  <li key={i} className="text-[11px] text-gray-400">{c}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {ai.riskFactors?.length > 0 && (
                            <div>
                              <p className="text-[10px] text-danger font-semibold uppercase mb-1">Rủi ro</p>
                              <ul className="space-y-0.5">
                                {ai.riskFactors.map((rf, i) => (
                                  <li key={i} className="text-[11px] text-gray-400">{rf}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Conclusion */}
                        {ai.conclusion && (
                          <p className="text-xs text-gray-400 bg-surface/50 rounded p-2 italic leading-relaxed border-l-2 border-accent/30">
                            {ai.conclusion}
                          </p>
                        )}

                        {ai.targetPrice && (
                          <p className="text-xs text-gold">
                            Giá mục tiêu: <span className="font-semibold">{ai.targetPrice.toLocaleString('vi-VN')}₫</span>
                          </p>
                        )}
                      </div>
                    )}

                    {ai?.error && (
                      <div className="mx-4 mb-4 text-xs text-danger bg-danger/10 rounded-lg p-3">
                        {ai.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {reports.length > 8 && (
          <div className="px-4 py-2.5 border-t border-border">
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs text-muted hover:text-accent transition-colors flex items-center gap-1"
            >
              {showAll ? 'Thu gọn' : `Xem thêm ${reports.length - 8} báo cáo`}
              <ChevronRight className={`w-3 h-3 transition-transform ${showAll ? 'rotate-90' : ''}`} />
            </button>
          </div>
        )}
      </div>

      {/* PDF Viewer Modal */}
      {pdfModal.open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
          {/* Modal toolbar */}
          <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <File className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <p className="text-sm font-medium text-gray-200 truncate">
                {pdfModal.title || 'Báo cáo phân tích'}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-3">
              {pdfModal.url && !pdfModal.loading && (
                <a
                  href={pdfModal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Mở tab mới
                </a>
              )}
              <button
                onClick={closePdf}
                className="text-muted hover:text-gray-100 transition-colors p-1 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* PDF content */}
          <div className="flex-1 bg-gray-900 min-h-0">
            {pdfModal.loading ? (
              <div className="flex items-center justify-center h-full gap-3">
                <Loader2 className="w-6 h-6 text-accent animate-spin" />
                <p className="text-muted text-sm">Đang tải PDF...</p>
              </div>
            ) : pdfModal.url ? (
              <iframe
                src={pdfModal.url}
                className="w-full h-full border-0"
                title={pdfModal.title}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
                <File className="w-10 h-10 opacity-30" />
                <p className="text-sm">Không thể tải file PDF</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
