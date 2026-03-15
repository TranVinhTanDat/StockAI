'use client'

import { useState } from 'react'
import useSWR from 'swr'
import {
  Building2, Users, PieChart, BarChart2, Target, Landmark, FileText,
  ExternalLink, Globe, Calendar, TrendingUp, TrendingDown, ChevronDown, ChevronUp,
} from 'lucide-react'

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyDetailData {
  symbol: string
  intro: {
    companyName: string; shortName: string; logo: string
    website: string; description: string
  } | null
  basicInfo: {
    exchange: string; industry: string; firstTradingDate: string
    charterCapital: number; sharesOutstanding: number
  } | null
  management: Array<{
    name: string; yearBorn: number; position: string
    positionGroup: string; photo: string; education: string
  }>
  shareholders: {
    major: Array<{ name: string; volume: number; pct: number; type: string }>
    corporate: Array<{ name: string; volume: number; pct: number; type: string }>
  }
  financialRatios: Array<{
    period: string; yearPeriod: number; eps: number; bvps: number
    pe: number; pb: number; roe: number; roa: number; ebitda: number
  }>
  subsidiaries: Array<{ name: string; pct: number; businessType: string; type: string }>
  businessPlan: Array<{
    year: number; revenue: number; profit: number; dividend: string
    revenueGrowth: number; profitGrowth: number
  }>
  events: Array<{
    date: string; exDate: string; recordDate: string
    title: string; eventType: string; detail: string
  }>
  foreignData: {
    buyVolume: number; sellVolume: number; netVolume: number
    holdingPct: number; maxRatioPct: number
  } | null
  analystReports: Array<{
    title: string; date: string; source: string; url: string
    recommendation: string; targetPrice: number; summary: string
  }>
}

type TabKey = 'overview' | 'management' | 'shareholders' | 'financials' | 'subsidiaries' | 'plan' | 'reports'

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'overview',    label: 'Tổng Quan',    icon: Building2  },
  { key: 'management',  label: 'Ban Lãnh Đạo', icon: Users      },
  { key: 'shareholders',label: 'Sở Hữu',       icon: PieChart   },
  { key: 'financials',  label: 'Chỉ Số TC',    icon: BarChart2  },
  { key: 'subsidiaries',label: 'Công Ty Con',  icon: Landmark   },
  { key: 'plan',        label: 'KH & Sự Kiện', icon: Target     },
  { key: 'reports',     label: 'BCPT',         icon: FileText   },
]

function fmtNum(n: number) {
  if (!n) return '—'
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)} nghìn tỷ`
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} tỷ`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} triệu`
  return n.toLocaleString('vi-VN')
}

function fmtDate(s: string) {
  if (!s) return '—'
  // Handle "2024-01-15T00:00:00" or "15/01/2024"
  const d = new Date(s.includes('T') ? s : s.split('/').reverse().join('-'))
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('vi-VN')
}

function recColor(r: string) {
  const low = r.toLowerCase()
  if (low.includes('mua') || low.includes('buy')) return 'text-accent bg-accent/10 border-accent/30'
  if (low.includes('bán') || low.includes('sell')) return 'text-danger bg-danger/10 border-danger/30'
  return 'text-gold bg-gold/10 border-gold/30'
}

// ─── Sub-sections ─────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: CompanyDetailData }) {
  const { intro, basicInfo, foreignData } = data
  return (
    <div className="space-y-5">
      {/* Company intro */}
      {intro && (
        <div className="flex gap-4">
          {intro.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={intro.logo} alt={intro.shortName} className="w-16 h-16 object-contain rounded-lg bg-white/5 p-1 flex-shrink-0" />
          )}
          <div>
            <p className="font-semibold text-gray-100">{intro.companyName}</p>
            {intro.website && (
              <a href={intro.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-accent hover:underline mt-0.5">
                <Globe className="w-3 h-3" />{intro.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {intro.description && (
              <p className="text-xs text-muted mt-2 leading-relaxed line-clamp-4">
                {intro.description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Basic info grid */}
      {basicInfo && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <InfoCard label="Sàn" value={basicInfo.exchange} />
          <InfoCard label="Ngành" value={basicInfo.industry || '—'} />
          <InfoCard label="Ngày GD đầu tiên" value={fmtDate(basicInfo.firstTradingDate)} />
          <InfoCard label="Vốn điều lệ" value={fmtNum(basicInfo.charterCapital)} />
          <InfoCard label="CP đang lưu hành" value={fmtNum(basicInfo.sharesOutstanding)} />
          {foreignData && (
            <InfoCard label="NĐTNN đang nắm giữ" value={`${foreignData.holdingPct.toFixed(2)}%`}
              sub={`Room còn: ${Math.max(0, foreignData.maxRatioPct - foreignData.holdingPct).toFixed(2)}%`} />
          )}
        </div>
      )}

      {/* Foreign investor activity */}
      {foreignData && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Giao Dịch NĐTNN</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface2 rounded-lg p-3 text-center">
              <p className="text-xs text-muted mb-1">Mua</p>
              <p className="text-sm font-bold text-accent">{fmtNum(foreignData.buyVolume)}</p>
            </div>
            <div className="bg-surface2 rounded-lg p-3 text-center">
              <p className="text-xs text-muted mb-1">Bán</p>
              <p className="text-sm font-bold text-danger">{fmtNum(foreignData.sellVolume)}</p>
            </div>
            <div className="bg-surface2 rounded-lg p-3 text-center">
              <p className="text-xs text-muted mb-1">Ròng</p>
              <p className={`text-sm font-bold ${foreignData.netVolume >= 0 ? 'text-accent' : 'text-danger'}`}>
                {foreignData.netVolume >= 0 ? '+' : ''}{fmtNum(foreignData.netVolume)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ManagementTab({ management }: { data: CompanyDetailData; management: CompanyDetailData['management'] }) {
  const groups = ['HĐQT', 'BKS', 'BGĐ', '']
  const getGroup = (g: string) => management.filter(p => {
    const pg = p.positionGroup?.toLowerCase() || ''
    if (g === 'HĐQT') return pg.includes('hội đồng') || pg.includes('hdqt') || pg === 'hdqt'
    if (g === 'BKS') return pg.includes('kiểm soát') || pg.includes('bks')
    if (g === 'BGĐ') return pg.includes('giám đốc') || pg.includes('bgd') || pg === 'bgd'
    return !['HĐQT', 'BKS', 'BGĐ'].some(grp => {
      const pp = p.positionGroup?.toLowerCase() || ''
      return pp.includes(grp.toLowerCase()) || pp === grp.toLowerCase()
    })
  })

  if (management.length === 0) return <EmptyState text="Không có dữ liệu ban lãnh đạo" />

  return (
    <div className="space-y-4">
      {groups.map(g => {
        const items = g ? getGroup(g) : management.filter(p => !groups.slice(0, 3).some(gr => getGroup(gr).includes(p)))
        if (items.length === 0) return null
        return (
          <div key={g || 'other'}>
            {g && <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-2">{g}</p>}
            <div className="space-y-2">
              {items.map((p, i) => (
                <div key={i} className="flex items-center gap-3 bg-surface2/50 rounded-lg px-3 py-2.5">
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt={p.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0 bg-border" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-accent">{p.name.charAt(0)}</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-100 truncate">{p.name}</p>
                    <p className="text-xs text-muted truncate">{p.position}</p>
                  </div>
                  {p.yearBorn > 0 && (
                    <span className="ml-auto text-xs text-muted flex-shrink-0">{p.yearBorn}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ShareholdersTab({ data }: { data: CompanyDetailData }) {
  const { shareholders, foreignData } = data
  const [showCorporate, setShowCorporate] = useState(false)

  if (shareholders.major.length === 0 && shareholders.corporate.length === 0)
    return <EmptyState text="Không có dữ liệu cơ cấu sở hữu" />

  return (
    <div className="space-y-5">
      {/* Major shareholders */}
      {shareholders.major.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Cổ Đông Lớn</p>
          <div className="space-y-2">
            {shareholders.major.slice(0, 10).map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted w-5">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-200 truncate">{s.name || '(Không tên)'}</p>
                  <div className="mt-1 h-1.5 bg-surface2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, s.pct)}%` }} />
                  </div>
                </div>
                <span className="text-xs font-semibold text-accent w-14 text-right">
                  {s.pct > 0 ? `${s.pct.toFixed(2)}%` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Corporate shareholders toggle */}
      {shareholders.corporate.length > 0 && (
        <div>
          <button
            onClick={() => setShowCorporate(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wider mb-2 hover:text-accent transition-colors">
            Cổ Đông Tổ Chức ({shareholders.corporate.length})
            {showCorporate ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showCorporate && (
            <div className="space-y-2">
              {shareholders.corporate.slice(0, 10).map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs bg-surface2/40 rounded px-3 py-1.5">
                  <span className="text-gray-300 truncate flex-1">{s.name}</span>
                  <span className="text-muted flex-shrink-0">{fmtNum(s.volume)} CP</span>
                  <span className="text-accent font-medium flex-shrink-0">{s.pct.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Foreign room */}
      {foreignData && (
        <div className="bg-surface2/40 rounded-lg p-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Room Ngoại</p>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1 h-2.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full"
                style={{ width: `${Math.min(100, (foreignData.holdingPct / Math.max(foreignData.maxRatioPct, 1)) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-accent">
              {foreignData.holdingPct.toFixed(2)}% / {foreignData.maxRatioPct.toFixed(0)}%
            </span>
          </div>
          <p className="text-xs text-muted">
            Room còn lại: <span className="text-gray-300">{Math.max(0, foreignData.maxRatioPct - foreignData.holdingPct).toFixed(2)}%</span>
          </p>
        </div>
      )}
    </div>
  )
}

function FinancialsTab({ ratios }: { ratios: CompanyDetailData['financialRatios'] }) {
  if (ratios.length === 0) return <EmptyState text="Không có dữ liệu chỉ số tài chính" />

  const cols: { key: keyof typeof ratios[0]; label: string; fmt: (v: number) => string }[] = [
    { key: 'eps',   label: 'EPS (₫)',  fmt: v => v > 0 ? v.toLocaleString('vi-VN') : '—' },
    { key: 'bvps',  label: 'BVPS (₫)', fmt: v => v > 0 ? v.toLocaleString('vi-VN') : '—' },
    { key: 'pe',    label: 'P/E',      fmt: v => v > 0 ? v.toFixed(1) : '—' },
    { key: 'pb',    label: 'P/B',      fmt: v => v > 0 ? v.toFixed(2) : '—' },
    { key: 'roe',   label: 'ROE (%)',  fmt: v => v !== 0 ? v.toFixed(1) : '—' },
    { key: 'roa',   label: 'ROA (%)',  fmt: v => v !== 0 ? v.toFixed(1) : '—' },
  ]

  const shown = ratios.slice(0, 6)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="py-2 text-left font-medium pl-1">Chỉ số</th>
            {shown.map((r, i) => (
              <th key={i} className="py-2 text-right font-medium px-2">{r.period}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {cols.map(col => (
            <tr key={col.key} className="hover:bg-surface2/30 transition-colors">
              <td className="py-2 pl-1 text-muted whitespace-nowrap">{col.label}</td>
              {shown.map((r, i) => {
                const v = r[col.key] as number
                const isGrowth = col.key === 'roe' || col.key === 'roa'
                return (
                  <td key={i} className={`py-2 px-2 text-right font-medium tabular-nums ${
                    isGrowth && v > 0 ? 'text-accent' : isGrowth && v < 0 ? 'text-danger' : 'text-gray-200'
                  }`}>
                    {col.fmt(v)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SubsidiariesTab({ subsidiaries }: { subsidiaries: CompanyDetailData['subsidiaries'] }) {
  if (subsidiaries.length === 0) return <EmptyState text="Không có dữ liệu công ty con / liên kết" />

  return (
    <div className="space-y-2">
      {subsidiaries.map((s, i) => (
        <div key={i} className="flex items-center gap-3 bg-surface2/40 rounded-lg px-3 py-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
            <Landmark className="w-4 h-4 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-200 truncate">{s.name}</p>
            {s.businessType && <p className="text-[10px] text-muted truncate">{s.businessType}</p>}
          </div>
          {s.pct > 0 && (
            <span className="text-xs font-semibold text-accent flex-shrink-0">{s.pct.toFixed(1)}%</span>
          )}
        </div>
      ))}
    </div>
  )
}

function PlanEventsTab({ businessPlan, events }: {
  businessPlan: CompanyDetailData['businessPlan']
  events: CompanyDetailData['events']
}) {
  const [showEvents, setShowEvents] = useState(true)

  return (
    <div className="space-y-5">
      {/* Business Plan */}
      {businessPlan.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Kế Hoạch Kinh Doanh</p>
          <div className="space-y-2">
            {businessPlan.map((p, i) => (
              <div key={i} className="bg-surface2/40 rounded-lg px-3 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <p className="text-muted">Năm</p>
                  <p className="font-semibold text-gray-100">{p.year}</p>
                </div>
                <div>
                  <p className="text-muted">Doanh thu (tỷ)</p>
                  <p className="font-medium text-gray-200">{p.revenue > 0 ? (p.revenue / 1e9).toFixed(0) : '—'}</p>
                </div>
                <div>
                  <p className="text-muted">Lợi nhuận (tỷ)</p>
                  <p className="font-medium text-gray-200">{p.profit > 0 ? (p.profit / 1e9).toFixed(0) : '—'}</p>
                </div>
                <div>
                  <p className="text-muted">Cổ tức</p>
                  <p className="font-medium text-accent">{p.dividend || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Events / Dividend history */}
      {events.length > 0 && (
        <div>
          <button
            onClick={() => setShowEvents(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wider mb-2 hover:text-accent transition-colors">
            <Calendar className="w-3.5 h-3.5" />
            Lịch Sử Sự Kiện ({events.length})
            {showEvents ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showEvents && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {events.slice(0, 30).map((e, i) => (
                <div key={i} className="bg-surface2/40 rounded-lg px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-gray-200 flex-1">{e.title}</p>
                    <span className="text-[10px] text-muted flex-shrink-0">{fmtDate(e.date)}</span>
                  </div>
                  {e.eventType && (
                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">{e.eventType}</span>
                  )}
                  {e.detail && (
                    <p className="text-[10px] text-muted mt-1 leading-relaxed">{e.detail}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {businessPlan.length === 0 && events.length === 0 && (
        <EmptyState text="Không có dữ liệu kế hoạch / sự kiện" />
      )}
    </div>
  )
}

function AnalystReportsTab({ reports }: { reports: CompanyDetailData['analystReports'] }) {
  const [expanded, setExpanded] = useState<number | null>(null)

  if (reports.length === 0) return <EmptyState text="Không có báo cáo phân tích" />

  return (
    <div className="space-y-2">
      {reports.map((r, i) => (
        <div key={i} className="bg-surface2/40 rounded-lg overflow-hidden">
          <div
            className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface2/60 transition-colors"
            onClick={() => setExpanded(expanded === i ? null : i)}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-200 leading-snug">{r.title}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] text-muted">{fmtDate(r.date)}</span>
                {r.source && <span className="text-[10px] text-muted">· {r.source}</span>}
                {r.recommendation && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${recColor(r.recommendation)}`}>
                    {r.recommendation}
                  </span>
                )}
                {r.targetPrice > 0 && (
                  <span className="text-[10px] text-gold">TP: {fmtNum(r.targetPrice * 1000)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {r.url && (
                <a href={r.url} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="p-1 rounded hover:text-accent text-muted transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {r.summary && (
                expanded === i
                  ? <ChevronUp className="w-3.5 h-3.5 text-muted" />
                  : <ChevronDown className="w-3.5 h-3.5 text-muted" />
              )}
            </div>
          </div>
          {expanded === i && r.summary && (
            <div className="px-3 pb-3 pt-0 border-t border-border/30">
              <p className="text-xs text-muted leading-relaxed">{r.summary}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface2 rounded-lg px-3 py-2.5">
      <p className="text-[10px] text-muted mb-0.5">{label}</p>
      <p className="text-xs font-semibold text-gray-200 truncate">{value || '—'}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-8 text-center text-muted text-sm">{text}</div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CafefCompanyData({ symbol }: { symbol: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  const { data, isLoading } = useSWR<CompanyDetailData>(
    symbol ? `/api/company-detail?symbol=${symbol}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const tabBadge = (key: TabKey): number | undefined => {
    if (!data) return undefined
    if (key === 'management') return data.management.length || undefined
    if (key === 'shareholders') return (data.shareholders.major.length + data.shareholders.corporate.length) || undefined
    if (key === 'financials') return data.financialRatios.length || undefined
    if (key === 'subsidiaries') return data.subsidiaries.length || undefined
    if (key === 'plan') return (data.businessPlan.length + data.events.length) || undefined
    if (key === 'reports') return data.analystReports.length || undefined
    return undefined
  }

  if (isLoading) {
    return (
      <div className="card-glass p-5 space-y-4 animate-pulse">
        <div className="h-4 w-48 bg-border rounded" />
        <div className="flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-8 w-20 bg-border rounded-lg" />
          ))}
        </div>
        <div className="h-40 bg-border rounded-lg" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="card-glass overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4.5 h-4.5 text-accent" />
          <span className="font-semibold text-sm">
            {data.intro?.companyName || symbol} — Dữ liệu CafeF
          </span>
        </div>
        <a
          href={`https://cafef.vn/co-phieu-${symbol.toLowerCase()}.chn`}
          target="_blank" rel="noopener noreferrer"
          className="text-xs text-accent hover:underline flex items-center gap-1">
          cafef.vn <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-border/60 bg-surface2/20 no-scrollbar">
        {TABS.map(({ key, label, icon: Icon }) => {
          const count = tabBadge(key)
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors border-b-2 ${
                activeTab === key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-gray-200'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {label}
              {count != null && (
                <span className={`text-[10px] rounded-full px-1.5 py-0 font-semibold ${
                  activeTab === key ? 'bg-accent/20 text-accent' : 'bg-border text-muted'
                }`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="p-5">
        {activeTab === 'overview'     && <OverviewTab data={data} />}
        {activeTab === 'management'   && <ManagementTab data={data} management={data.management} />}
        {activeTab === 'shareholders' && <ShareholdersTab data={data} />}
        {activeTab === 'financials'   && <FinancialsTab ratios={data.financialRatios} />}
        {activeTab === 'subsidiaries' && <SubsidiariesTab subsidiaries={data.subsidiaries} />}
        {activeTab === 'plan'         && <PlanEventsTab businessPlan={data.businessPlan} events={data.events} />}
        {activeTab === 'reports'      && <AnalystReportsTab reports={data.analystReports} />}
      </div>
    </div>
  )
}
