'use client'

import { useRef, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import type { CompanyData } from '@/types'
import { formatVND } from '@/lib/utils'
import { Building2, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, Activity } from 'lucide-react'

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

interface CompanyProfileProps {
  symbol: string
}

const CHART_COLORS = {
  revenue: '#3b82f6',
  netIncome: '#f5a623',
}

// ─── Compute financial summary from yearly data ───────────────────────────────
function computeSummary(yearly: CompanyData['yearly']) {
  if (yearly.length < 2) return null

  const valid = yearly.filter((y) => y.revenue > 0 || y.netIncome > 0)
  if (valid.length < 2) return null

  const first = valid[0]
  const last = valid[valid.length - 1]
  const n = valid.length - 1

  const revCAGR =
    first.revenue > 0 && last.revenue > 0
      ? (Math.pow(last.revenue / first.revenue, 1 / n) - 1) * 100
      : 0

  const profitCAGR =
    first.netIncome > 0 && last.netIncome > 0
      ? (Math.pow(last.netIncome / first.netIncome, 1 / n) - 1) * 100
      : 0

  const roeArr = valid.filter((y) => y.roe > 0)
  const avgROE = roeArr.length ? roeArr.reduce((s, y) => s + y.roe, 0) / roeArr.length : 0

  const peArr = valid.filter((y) => y.pe > 0)
  const avgPE = peArr.length ? peArr.reduce((s, y) => s + y.pe, 0) / peArr.length : 0

  // Health score 0–100
  let score = 50
  if (avgROE >= 25) score += 20
  else if (avgROE >= 15) score += 12
  else if (avgROE >= 10) score += 5
  else if (avgROE > 0) score -= 5

  if (revCAGR >= 20) score += 15
  else if (revCAGR >= 15) score += 10
  else if (revCAGR >= 8) score += 6
  else if (revCAGR >= 0) score += 2
  else score -= 8

  if (profitCAGR >= 15) score += 10
  else if (profitCAGR >= 8) score += 6
  else if (profitCAGR < 0) score -= 10

  if (last.debtEquity > 0 && last.debtEquity < 0.5) score += 6
  else if (last.debtEquity >= 0.5 && last.debtEquity < 1.5) score += 2
  else if (last.debtEquity > 2.5) score -= 10

  if (last.pe > 0 && last.pe < 12) score += 5
  else if (last.pe > 30) score -= 5

  if (last.dividendYield >= 3) score += 4
  score = Math.max(5, Math.min(95, score))

  // Verdict
  type VerdictLevel = 'Xuất sắc' | 'Tốt' | 'Ổn định' | 'Cần theo dõi' | 'Rủi ro cao'
  const verdictMap: { min: number; label: VerdictLevel; color: string; bg: string }[] = [
    { min: 80, label: 'Xuất sắc', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/30' },
    { min: 65, label: 'Tốt', color: 'text-accent', bg: 'bg-accent/10 border-accent/30' },
    { min: 50, label: 'Ổn định', color: 'text-gold', bg: 'bg-gold/10 border-gold/30' },
    { min: 35, label: 'Cần theo dõi', color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/30' },
    { min: 0, label: 'Rủi ro cao', color: 'text-danger', bg: 'bg-danger/10 border-danger/30' },
  ]
  const verdict = verdictMap.find((v) => score >= v.min) ?? verdictMap[verdictMap.length - 1]

  // Key insights (bullets)
  const insights: { text: string; positive: boolean }[] = []

  if (revCAGR >= 15) insights.push({ text: `Doanh thu CAGR ${revCAGR.toFixed(1)}%/năm — tăng trưởng cao`, positive: true })
  else if (revCAGR >= 8) insights.push({ text: `Doanh thu CAGR ${revCAGR.toFixed(1)}%/năm — tăng trưởng ổn định`, positive: true })
  else if (revCAGR < 0) insights.push({ text: `Doanh thu CAGR ${revCAGR.toFixed(1)}%/năm — đang thu hẹp`, positive: false })

  if (avgROE >= 20) insights.push({ text: `ROE trung bình ${avgROE.toFixed(1)}% — sinh lời vốn xuất sắc`, positive: true })
  else if (avgROE >= 15) insights.push({ text: `ROE trung bình ${avgROE.toFixed(1)}% — hiệu quả tốt`, positive: true })
  else if (avgROE > 0 && avgROE < 10) insights.push({ text: `ROE trung bình ${avgROE.toFixed(1)}% — dưới mức kỳ vọng`, positive: false })

  if (last.debtEquity > 0) {
    if (last.debtEquity < 0.8) insights.push({ text: `D/E ${last.debtEquity.toFixed(2)} — cấu trúc vốn lành mạnh, ít rủi ro tài chính`, positive: true })
    else if (last.debtEquity > 2) insights.push({ text: `D/E ${last.debtEquity.toFixed(2)} — đòn bẩy cao, cần theo dõi dòng tiền`, positive: false })
  }

  if (last.pe > 0 && last.pe < 12) insights.push({ text: `P/E ${last.pe.toFixed(1)}x — định giá hấp dẫn so với lịch sử`, positive: true })
  else if (last.pe > 30) insights.push({ text: `P/E ${last.pe.toFixed(1)}x — định giá cao, phản ánh kỳ vọng lớn`, positive: false })
  else if (last.pe > 0) insights.push({ text: `P/E ${last.pe.toFixed(1)}x — định giá hợp lý`, positive: true })

  if (last.dividendYield >= 3) insights.push({ text: `Cổ tức ${last.dividendYield.toFixed(1)}% — thu nhập cổ tức tốt`, positive: true })

  if (profitCAGR >= 15) insights.push({ text: `Lợi nhuận CAGR ${profitCAGR.toFixed(1)}%/năm — lợi nhuận tăng mạnh`, positive: true })
  else if (profitCAGR < 0) insights.push({ text: `Lợi nhuận CAGR ${profitCAGR.toFixed(1)}%/năm — lợi nhuận suy giảm`, positive: false })

  // Synthesis paragraph
  const parts: string[] = []
  if (revCAGR !== 0) parts.push(`${last.year > first.year ? `Trong ${n} năm qua (${first.year}–${last.year}), d` : 'D'}oanh thu tăng trưởng CAGR ${revCAGR.toFixed(1)}%/năm`)
  if (avgROE > 0) parts.push(`ROE duy trì ổn định ở mức ${avgROE.toFixed(1)}%`)
  if (last.debtEquity > 0) parts.push(`đòn bẩy tài chính D/E ${last.debtEquity.toFixed(2)}`)
  if (last.pe > 0 && avgPE > 0) parts.push(`P/E hiện tại ${last.pe.toFixed(1)}x (TB ${avgPE.toFixed(1)}x)`)
  const synthesis = parts.length ? parts.join(', ') + '.' : ''

  const isRevGrowing = valid.length >= 2 && last.revenue > valid[valid.length - 2].revenue
  const isProfitGrowing = valid.length >= 2 && last.netIncome > valid[valid.length - 2].netIncome

  return { revCAGR, profitCAGR, avgROE, avgPE, score, verdict, insights, synthesis, n, isRevGrowing, isProfitGrowing, last, first }
}

export default function CompanyProfile({ symbol }: CompanyProfileProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { data, isLoading } = useSWR<CompanyData>(
    symbol ? `/api/company?symbol=${symbol}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const sortedYearly = useMemo(() => {
    if (!data?.yearly) return []
    return [...data.yearly].sort((a, b) => a.year - b.year)
  }, [data])

  const summary = useMemo(() => computeSummary(sortedYearly), [sortedYearly])
  const hasRealData = sortedYearly.some((y) => y.revenue > 0 || y.eps > 0)

  // Draw bar chart
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || sortedYearly.length === 0 || !hasRealData) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.offsetWidth || 400
    const h = 180
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const padLeft = 60
    const padRight = 20
    const padTop = 20
    const padBottom = 30
    const chartW = w - padLeft - padRight
    const chartH = h - padTop - padBottom

    const maxRevenue = Math.max(...sortedYearly.map((y) => y.revenue), 1)
    const barGroupW = chartW / sortedYearly.length
    const barW = barGroupW * 0.3

    // Grid + Y-axis labels
    ctx.fillStyle = '#7a8ba0'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const val = (maxRevenue * i) / 4
      const y = padTop + chartH - (chartH * i) / 4
      const yLabel = val >= 1000 ? `${(val / 1000).toFixed(0)}K` : val > 0 ? `${val.toFixed(0)}` : '0'
      ctx.fillText(yLabel, padLeft - 8, y + 3)
      ctx.beginPath()
      ctx.moveTo(padLeft, y)
      ctx.lineTo(w - padRight, y)
      ctx.strokeStyle = 'rgba(30,45,69,0.5)'
      ctx.stroke()
    }

    // Bars
    sortedYearly.forEach((y, i) => {
      const x = padLeft + i * barGroupW + barGroupW * 0.15

      const revH = (y.revenue / maxRevenue) * chartH
      ctx.fillStyle = CHART_COLORS.revenue
      ctx.globalAlpha = 0.85
      ctx.fillRect(x, padTop + chartH - revH, barW, revH)

      const niH = (Math.max(0, y.netIncome) / maxRevenue) * chartH
      ctx.fillStyle = CHART_COLORS.netIncome
      ctx.fillRect(x + barW + 2, padTop + chartH - niH, barW, niH)
      ctx.globalAlpha = 1

      ctx.fillStyle = '#7a8ba0'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`${y.year}`, x + barW, h - 8)
    })

    // Growth rate line overlay (revenue growth %)
    const pts = sortedYearly.map((y, i) => ({
      x: padLeft + i * barGroupW + barGroupW * 0.5,
      y: padTop + chartH - ((Math.min(Math.max(y.revenueGrowth, -30), 50) + 30) / 80) * chartH,
      g: y.revenueGrowth,
    }))
    if (pts.length >= 2) {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.strokeStyle = '#00d4aa'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.lineWidth = 1

      // dots
      pts.forEach((p) => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
        ctx.fillStyle = p.g >= 0 ? '#00d4aa' : '#f43f5e'
        ctx.fill()
      })
    }

    // Legend
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = CHART_COLORS.revenue
    ctx.fillRect(padLeft, 4, 10, 8)
    ctx.fillStyle = '#ccc'
    ctx.fillText('Doanh thu (tỷ)', padLeft + 14, 12)
    ctx.fillStyle = CHART_COLORS.netIncome
    ctx.fillRect(padLeft + 108, 4, 10, 8)
    ctx.fillStyle = '#ccc'
    ctx.fillText('Lợi nhuận (tỷ)', padLeft + 122, 12)
    ctx.strokeStyle = '#00d4aa'
    ctx.setLineDash([4, 3])
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(padLeft + 218, 8)
    ctx.lineTo(padLeft + 228, 8)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.lineWidth = 1
    ctx.fillStyle = '#ccc'
    ctx.fillText('Tăng trưởng DT', padLeft + 232, 12)
  }, [sortedYearly, hasRealData])

  if (isLoading) {
    return (
      <div className="card-glass p-6 animate-pulse space-y-4">
        <div className="h-5 w-48 bg-border rounded" />
        <div className="h-24 bg-border rounded-lg" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-border rounded-lg" />
          ))}
        </div>
        <div className="h-44 bg-border rounded-lg" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="card-glass overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-border">
        <h3 className="font-semibold flex items-center gap-2">
          <Building2 className="w-5 h-5 text-accent" />
          Hồ Sơ Tài Chính — {data.companyName || symbol}
        </h3>
        <p className="text-xs text-muted mt-1">
          {data.industry && `${data.industry} · `}{data.exchange} · Dữ liệu: VPS + Vietcap
        </p>
      </div>

      {/* ── Financial Summary (only if we have real data) ──────────────────── */}
      {summary && hasRealData && (
        <div className="p-5 border-b border-border bg-surface2/30">
          {/* Score + Verdict row */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              {/* Health gauge */}
              <div className="relative w-14 h-14 flex-shrink-0">
                <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
                  <circle cx="28" cy="28" r="22" fill="none" stroke="#1e2d45" strokeWidth="5" />
                  <circle
                    cx="28" cy="28" r="22"
                    fill="none"
                    stroke={summary.score >= 65 ? '#00d4aa' : summary.score >= 50 ? '#f5a623' : '#f43f5e'}
                    strokeWidth="5"
                    strokeDasharray={`${(summary.score / 100) * 138.2} 138.2`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold rotate-0">
                  {summary.score}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted">Sức khỏe tài chính</p>
                <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${summary.verdict.bg} ${summary.verdict.color}`}>
                  {summary.verdict.label}
                </span>
              </div>
            </div>

            {/* CAGR stats */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-right">
              <div>
                <p className="text-xs text-muted">CAGR Doanh thu</p>
                <p className={`text-base font-bold ${summary.revCAGR >= 0 ? 'text-accent' : 'text-danger'}`}>
                  {summary.revCAGR >= 0 ? '+' : ''}{summary.revCAGR.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">CAGR Lợi nhuận</p>
                <p className={`text-base font-bold ${summary.profitCAGR >= 0 ? 'text-accent' : 'text-danger'}`}>
                  {summary.profitCAGR >= 0 ? '+' : ''}{summary.profitCAGR.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">ROE trung bình</p>
                <p className={`text-base font-bold ${summary.avgROE >= 15 ? 'text-accent' : 'text-gold'}`}>
                  {summary.avgROE.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">P/E trung bình</p>
                <p className="text-base font-bold text-gray-200">
                  {summary.avgPE > 0 ? `${summary.avgPE.toFixed(1)}x` : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Synthesis paragraph */}
          {summary.synthesis && (
            <p className="text-xs text-muted leading-relaxed mb-3 italic border-l-2 border-accent/40 pl-3">
              {summary.synthesis}
            </p>
          )}

          {/* Key insights */}
          {summary.insights.length > 0 && (
            <div className="space-y-1">
              {summary.insights.slice(0, 5).map((ins, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {ins.positive
                    ? <CheckCircle className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
                    : <AlertTriangle className="w-3.5 h-3.5 text-gold flex-shrink-0 mt-0.5" />
                  }
                  <span className={ins.positive ? 'text-gray-300' : 'text-gold/90'}>{ins.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* No-data notice */}
      {!hasRealData && (
        <div className="px-5 py-4 text-xs text-muted text-center">
          Đang tải dữ liệu tài chính... Nếu không hiện, xem tại{' '}
          <a href="https://cafef.vn" target="_blank" rel="noopener noreferrer" className="text-accent underline">cafef.vn</a>
        </div>
      )}

      {/* ── Overview Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5">
        <MetricCard
          label="P/E"
          value={data.currentRatios.pe > 0 ? `${data.currentRatios.pe.toFixed(1)}x` : 'N/A'}
          sub={data.currentRatios.pe > 0
            ? data.currentRatios.pe < 12 ? 'Hấp dẫn' : data.currentRatios.pe < 20 ? 'Hợp lý' : 'Cao'
            : ''}
          subColor={data.currentRatios.pe < 12 ? 'text-accent' : data.currentRatios.pe > 25 ? 'text-danger' : 'text-gold'}
        />
        <MetricCard
          label="P/B"
          value={data.currentRatios.pb > 0 ? `${data.currentRatios.pb.toFixed(2)}x` : 'N/A'}
          sub={data.currentRatios.pb > 0
            ? data.currentRatios.pb < 1.5 ? 'Dưới book' : data.currentRatios.pb < 3 ? 'Hợp lý' : 'Cao'
            : ''}
          subColor={data.currentRatios.pb < 1.5 ? 'text-accent' : data.currentRatios.pb > 4 ? 'text-danger' : 'text-gold'}
        />
        <MetricCard
          label="ROE"
          value={data.currentRatios.roe > 0 ? `${data.currentRatios.roe.toFixed(1)}%` : 'N/A'}
          sub={data.currentRatios.roe >= 20 ? 'Xuất sắc' : data.currentRatios.roe >= 15 ? 'Tốt' : data.currentRatios.roe > 0 ? 'Trung bình' : ''}
          subColor={data.currentRatios.roe >= 20 ? 'text-emerald-400' : data.currentRatios.roe >= 15 ? 'text-accent' : 'text-gold'}
          trend={summary?.isRevGrowing}
        />
        <MetricCard
          label="D/E"
          value={data.currentRatios.debtEquity > 0 ? data.currentRatios.debtEquity.toFixed(2) : 'N/A'}
          sub={data.currentRatios.debtEquity > 0
            ? data.currentRatios.debtEquity < 0.8 ? 'Thận trọng' : data.currentRatios.debtEquity < 1.5 ? 'Hợp lý' : 'Cao'
            : ''}
          subColor={data.currentRatios.debtEquity < 0.8 ? 'text-accent' : data.currentRatios.debtEquity > 2 ? 'text-danger' : 'text-gold'}
        />
      </div>

      {/* ── Bar Chart ────────────────────────────────────────────────────────── */}
      {sortedYearly.length > 1 && hasRealData && (
        <div className="px-5 pb-3">
          <canvas
            ref={canvasRef}
            className="w-full rounded-lg bg-surface2"
            style={{ height: 180 }}
          />
        </div>
      )}

      {/* ── Financial Table ──────────────────────────────────────────────────── */}
      {hasRealData && sortedYearly.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-b border-border text-muted text-xs">
                <th className="px-5 py-2.5 text-left font-medium">Chỉ số</th>
                {sortedYearly.map((y) => (
                  <th key={y.year} className="px-3 py-2.5 text-right font-medium">{y.year}</th>
                ))}
                <th className="px-3 py-2.5 text-center font-medium text-muted/60">Xu hướng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              <TableRow label="Doanh thu (tỷ)" values={sortedYearly.map((y) => y.revenue)} format="num" />
              <TableRow label="Lợi nhuận (tỷ)" values={sortedYearly.map((y) => y.netIncome)} format="num" higherIsBetter />
              <TableRow label="EPS (₫)" values={sortedYearly.map((y) => y.eps)} format="vnd" higherIsBetter />
              <TableRow label="P/E" values={sortedYearly.map((y) => y.pe)} format="ratio" />
              <TableRow label="P/B" values={sortedYearly.map((y) => y.pb)} format="ratio" />
              <TableRow label="ROE (%)" values={sortedYearly.map((y) => y.roe)} format="pct" higherIsBetter />
              <TableRow label="ROA (%)" values={sortedYearly.map((y) => y.roa)} format="pct" higherIsBetter />
              <TableRow label="D/E" values={sortedYearly.map((y) => y.debtEquity)} format="ratio" />
              <TableRow label="Cổ tức (%)" values={sortedYearly.map((y) => y.dividendYield)} format="pct" />
              <TableRow label="TT Doanh thu (%)" values={sortedYearly.map((y) => y.revenueGrowth)} format="growth" />
              <TableRow label="TT Lợi nhuận (%)" values={sortedYearly.map((y) => y.profitGrowth)} format="growth" />
            </tbody>
          </table>
        </div>
      )}

      {/* ── 52-Week Range ─────────────────────────────────────────────────────── */}
      {(data.overview.high52w > 0 || data.overview.low52w > 0) && (
        <div className="px-5 py-4 border-t border-border">
          <div className="flex items-center justify-between text-xs text-muted mb-2">
            <span>{formatVND(data.overview.low52w)}</span>
            <span className="flex items-center gap-1 font-medium">
              <Activity className="w-3 h-3" /> Biên độ 52 tuần
            </span>
            <span>{formatVND(data.overview.high52w)}</span>
          </div>
          <div className="h-2 bg-surface2 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-danger via-gold to-accent rounded-full w-full" />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MetricCard ───────────────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, subColor, trend,
}: {
  label: string
  value: string
  sub: string
  subColor: string
  trend?: boolean
}) {
  return (
    <div className="bg-surface2 rounded-lg p-3">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      <div className="flex items-center justify-between">
        <p className={`text-xs ${subColor}`}>{sub}</p>
        {trend !== undefined && (
          trend
            ? <TrendingUp className="w-3.5 h-3.5 text-accent" />
            : <TrendingDown className="w-3.5 h-3.5 text-danger" />
        )}
      </div>
    </div>
  )
}

// ─── TableRow ────────────────────────────────────────────────────────────────
function TableRow({
  label, values, format, higherIsBetter,
}: {
  label: string
  values: number[]
  format: 'num' | 'vnd' | 'pct' | 'ratio' | 'growth'
  higherIsBetter?: boolean
}) {
  const fmt = (v: number) => {
    if (v === 0 && format !== 'growth') return '—'
    switch (format) {
      case 'num': return v.toLocaleString('vi-VN', { maximumFractionDigits: 0 })
      case 'vnd': return v.toLocaleString('vi-VN', { maximumFractionDigits: 0 })
      case 'pct': return `${v.toFixed(1)}`
      case 'ratio': return v.toFixed(2)
      case 'growth': return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
      default: return v.toFixed(1)
    }
  }

  const color = (v: number) => {
    if (format === 'growth') return v > 0 ? 'text-accent' : v < 0 ? 'text-danger' : 'text-gray-400'
    return 'text-gray-200'
  }

  // Trend arrow: compare last two values
  const last = values[values.length - 1]
  const prev = values[values.length - 2]
  const hasData = last !== 0 && prev !== 0 && values.length >= 2
  const isUp = hasData && last > prev
  const isDown = hasData && last < prev

  const TrendIcon = !hasData
    ? null
    : isUp
      ? <TrendingUp className={`w-3.5 h-3.5 ${higherIsBetter ? 'text-accent' : format === 'growth' ? 'text-accent' : 'text-muted'}`} />
      : isDown
        ? <TrendingDown className={`w-3.5 h-3.5 ${higherIsBetter === false || format === 'ratio' ? 'text-accent' : higherIsBetter ? 'text-danger' : 'text-muted'}`} />
        : <Minus className="w-3.5 h-3.5 text-muted" />

  return (
    <tr className="hover:bg-surface2/30 transition-colors">
      <td className="px-5 py-2 text-muted text-xs whitespace-nowrap">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`px-3 py-2 text-right text-xs font-medium tabular-nums ${color(v)}`}>
          {fmt(v)}
        </td>
      ))}
      <td className="px-3 py-2 text-center">{TrendIcon}</td>
    </tr>
  )
}
