'use client'

import { useState } from 'react'
import useSWR from 'swr'
import type { QuoteData, FundamentalData } from '@/types'
import type { AnalystReport } from '@/app/api/analyst-reports/route'
import { formatVND, getChangeColor } from '@/lib/utils'
import { TrendingUp, TrendingDown, FileText, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.ok ? r.json() : null)

function MetricBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-surface2/60 rounded-lg px-3 py-2">
      <p className="text-[10px] text-muted mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${color || 'text-gray-100'}`}>{value}</p>
    </div>
  )
}

function formatReportDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return dateStr }
}

function getTypeColor(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('kqkd')) return 'text-gold bg-gold/10'
  if (t.includes('cập nhật') || t.includes('[mua') || t.includes('[khả quan')) return 'text-purple-400 bg-purple-400/10'
  if (t.includes('đhcđ')) return 'text-blue-400 bg-blue-400/10'
  return 'text-accent bg-accent/10'
}

interface Props {
  symbol: string
}

export default function StockInfoPanel({ symbol }: Props) {
  const [showAllReports, setShowAllReports] = useState(false)

  const { data: quote } = useSWR<QuoteData>(
    symbol ? `/api/quote?symbol=${symbol}` : null,
    fetcher, { refreshInterval: 60000, revalidateOnFocus: false }
  )
  const { data: fundamental } = useSWR<FundamentalData>(
    symbol ? `/api/fundamental?symbol=${symbol}` : null,
    fetcher, { revalidateOnFocus: false }
  )
  const { data: reports } = useSWR<AnalystReport[]>(
    symbol ? `/api/analyst-reports?symbol=${symbol}` : null,
    fetcher, { revalidateOnFocus: false }
  )

  const displayedReports = showAllReports ? (reports ?? []) : (reports ?? []).slice(0, 5)

  return (
    <div className="space-y-3">
      {/* ── Quote card ─────────────────── */}
      <div className="card-glass p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs text-muted">Giá hiện tại</p>
            {quote ? (
              <p className={`text-2xl font-bold ${getChangeColor(quote.changePct)}`}>
                {formatVND(quote.price)}
              </p>
            ) : (
              <div className="h-8 w-32 bg-border animate-pulse rounded mt-1" />
            )}
          </div>
          {quote && (
            <div className={`flex items-center gap-1 text-sm font-semibold px-2 py-1 rounded-lg ${
              quote.changePct > 0 ? 'bg-accent/15 text-accent' : quote.changePct < 0 ? 'bg-danger/15 text-danger' : 'bg-gold/15 text-gold'
            }`}>
              {quote.changePct > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : quote.changePct < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : null}
              {quote.changePct > 0 ? '+' : ''}{quote.changePct.toFixed(2)}%
            </div>
          )}
        </div>
        {quote && (
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>KL: {(quote.volume / 1000).toFixed(0)}K CP</span>
            <span>·</span>
            <span>{quote.exchange || 'HOSE'}</span>
            {quote.industry && <><span>·</span><span className="truncate">{quote.industry}</span></>}
          </div>
        )}
      </div>

      {/* ── Key financial metrics ────────── */}
      {fundamental && (
        <div className="card-glass p-4">
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Chỉ Số Tài Chính</h4>
          <div className="grid grid-cols-2 gap-2">
            <MetricBox label="P/E" value={fundamental.pe > 0 ? fundamental.pe.toFixed(1) : 'N/A'} />
            <MetricBox label="ROE" value={fundamental.roe > 0 ? `${fundamental.roe.toFixed(1)}%` : 'N/A'}
              color={fundamental.roe > 15 ? 'text-accent' : undefined} />
            <MetricBox label="EPS" value={fundamental.eps > 0 ? formatVND(fundamental.eps) : 'N/A'} />
            <MetricBox label="D/E" value={fundamental.debtEquity > 0 ? fundamental.debtEquity.toFixed(2) : 'N/A'}
              color={fundamental.debtEquity > 2 ? 'text-danger' : undefined} />
            {fundamental.revenueGrowth !== 0 && (
              <MetricBox label="Tăng trưởng DT" value={`${fundamental.revenueGrowth > 0 ? '+' : ''}${fundamental.revenueGrowth.toFixed(1)}%`}
                color={fundamental.revenueGrowth > 0 ? 'text-accent' : 'text-danger'} />
            )}
            {fundamental.dividendYield > 0 && (
              <MetricBox label="Cổ tức" value={`${fundamental.dividendYield.toFixed(1)}%`} color="text-gold" />
            )}
          </div>
        </div>
      )}

      {/* ── Analyst reports ─────────────── */}
      {reports && reports.length > 0 && (
        <div className="card-glass overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-semibold">Báo Cáo Phân Tích</span>
            <span className="text-[10px] text-muted ml-auto">{reports.length} báo cáo · Vietcap</span>
          </div>
          <div className="divide-y divide-border/40">
            {displayedReports.map((r, i) => (
              <div key={i} className="px-4 py-2.5 hover:bg-surface2/50 transition-colors">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-200 leading-snug line-clamp-2">{r.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted">{formatReportDate(r.date)}</span>
                      <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${getTypeColor(r.reportType)}`}>
                        {r.reportType}
                      </span>
                    </div>
                  </div>
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer"
                      className="flex-shrink-0 text-muted hover:text-accent transition-colors mt-0.5">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          {reports.length > 5 && (
            <div className="px-4 py-2 border-t border-border">
              <button
                onClick={() => setShowAllReports(!showAllReports)}
                className="text-[10px] text-muted hover:text-accent transition-colors flex items-center gap-1"
              >
                {showAllReports
                  ? <><ChevronDown className="w-3 h-3" /> Thu gọn</>
                  : <><ChevronRight className="w-3 h-3" /> +{reports.length - 5} báo cáo khác</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
