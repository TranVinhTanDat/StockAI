'use client'

import { useEffect, useState, useCallback } from 'react'
import { Activity, BarChart3, Bot, X } from 'lucide-react'
import type { HeatmapCell } from '@/app/api/market-heatmap/route'

function getHeatColor(changePct: number): string {
  if (changePct >= 4) return 'bg-emerald-500 text-white'
  if (changePct >= 2) return 'bg-emerald-600/80 text-white'
  if (changePct >= 0.5) return 'bg-emerald-700/60 text-emerald-100'
  if (changePct > 0) return 'bg-emerald-900/50 text-emerald-200'
  if (changePct === 0) return 'bg-gold/20 text-gold'
  if (changePct > -0.5) return 'bg-rose-900/50 text-rose-200'
  if (changePct > -2) return 'bg-rose-700/60 text-rose-100'
  if (changePct > -4) return 'bg-rose-600/80 text-white'
  return 'bg-rose-500 text-white'
}

function formatVND(v: number) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(v)) + ' ₫'
}

interface Props {
  onAnalyze: (symbol: string) => void
  onViewChart?: (symbol: string) => void
}

export default function MarketHeatmap({ onAnalyze, onViewChart }: Props) {
  const [cells, setCells] = useState<HeatmapCell[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [selected, setSelected] = useState<HeatmapCell | null>(null)

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/market-heatmap')
      if (!res.ok) return
      const data: HeatmapCell[] = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        setCells(data)
        setLastUpdate(new Date())
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 60000)
    return () => clearInterval(interval)
  }, [loadData])

  // Group by industry
  const byIndustry = cells.reduce<Record<string, HeatmapCell[]>>((acc, cell) => {
    const key = cell.industry || 'Khác'
    if (!acc[key]) acc[key] = []
    acc[key].push(cell)
    return acc
  }, {})

  const industries = Object.entries(byIndustry).sort((a, b) => b[1].length - a[1].length)

  if (loading) {
    return (
      <div className="card-glass p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-accent animate-pulse" />
          <span className="text-sm font-semibold">Bản Đồ Nhiệt Thị Trường</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="h-14 w-16 bg-surface2 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="card-glass p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" />
          Bản Đồ Nhiệt Thị Trường
        </h3>
        {lastUpdate && (
          <span className="text-xs text-muted">
            {lastUpdate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-rose-500 inline-block" />
          Giảm mạnh
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-gold/20 border border-gold/40 inline-block" />
          Đứng giá
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
          Tăng mạnh
        </span>
        <span className="ml-auto text-muted/60 italic">Click để xem chi tiết</span>
      </div>

      {/* Selected cell info bar */}
      {selected && (
        <div className="mb-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1">
            <span className="font-bold text-gray-100 text-base">{selected.symbol}</span>
            <span className="text-sm text-gray-300">{formatVND(selected.price)}</span>
            <span className={`text-sm font-semibold ${selected.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {selected.changePct >= 0 ? '+' : ''}{selected.changePct.toFixed(2)}%
            </span>
            <span className="text-xs text-muted">{selected.industry}</span>
          </div>
          <div className="flex items-center gap-2">
            {onViewChart && (
              <button
                onClick={() => { onViewChart(selected.symbol); setSelected(null) }}
                className="flex items-center gap-1.5 text-xs bg-surface2 hover:bg-border text-gray-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Xem Chart
              </button>
            )}
            <button
              onClick={() => { onAnalyze(selected.symbol); setSelected(null) }}
              className="flex items-center gap-1.5 text-xs bg-accent/20 hover:bg-accent/30 text-accent border border-accent/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Bot className="w-3.5 h-3.5" />
              Phân tích AI
            </button>
            <button
              onClick={() => setSelected(null)}
              className="text-muted hover:text-gray-300 p-1 transition-colors"
              title="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Heatmap grouped by industry */}
      {cells.length === 0 ? (
        <div className="text-center text-muted py-8 text-sm">
          Không tải được dữ liệu heatmap
        </div>
      ) : (
        <div className="space-y-3">
          {industries.map(([industry, stocks]) => (
            <div key={industry}>
              <p className="text-xs text-muted/70 mb-1.5 font-medium tracking-wide uppercase text-[10px]">
                {industry}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {stocks.map((cell) => (
                  <button
                    key={cell.symbol}
                    onClick={() => setSelected(selected?.symbol === cell.symbol ? null : cell)}
                    title={`${cell.symbol}: ${cell.changePct >= 0 ? '+' : ''}${cell.changePct.toFixed(2)}%`}
                    className={`
                      rounded-lg px-2.5 py-2 text-center transition-all
                      hover:scale-105 hover:shadow-lg hover:z-10 cursor-pointer
                      min-w-[60px] border border-white/5 ${getHeatColor(cell.changePct)}
                      ${selected?.symbol === cell.symbol ? 'ring-2 ring-accent ring-offset-1 ring-offset-bg scale-105' : ''}
                    `}
                  >
                    <div className="text-xs font-bold leading-tight">{cell.symbol}</div>
                    <div className="text-[11px] mt-0.5 opacity-90 font-medium">
                      {cell.changePct >= 0 ? '+' : ''}{cell.changePct.toFixed(2)}%
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
