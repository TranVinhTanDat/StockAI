'use client'

import { useRef, useEffect, useMemo } from 'react'
import type { PortfolioHolding } from '@/types'
import { INDUSTRY_MAP } from '@/lib/utils'

interface AllocationChartProps {
  holdings: PortfolioHolding[]
  prices: Record<string, number>
}

const COLORS = [
  '#00d4aa', '#3b82f6', '#f5a623', '#f43f5e', '#a855f7',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
]

export default function AllocationChart({ holdings, prices }: AllocationChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const data = useMemo(() => holdings.map((h) => {
    const price = prices[h.symbol] || h.avg_cost
    return {
      label: h.symbol,
      value: h.qty * price,
      industry: INDUSTRY_MAP[h.symbol] || 'Khác',
    }
  }), [holdings, prices])

  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx || total === 0) return

    const dpr = window.devicePixelRatio || 1
    const size = 200
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, size, size)

    const cx = size / 2
    const cy = size / 2
    const radius = 80

    let startAngle = -Math.PI / 2
    data.forEach((d, i) => {
      const sliceAngle = (d.value / total) * 2 * Math.PI
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle)
      ctx.fillStyle = COLORS[i % COLORS.length]
      ctx.fill()
      startAngle += sliceAngle
    })

    // Inner circle for donut effect
    ctx.beginPath()
    ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2)
    ctx.fillStyle = '#131929'
    ctx.fill()
  }, [data, total])

  if (data.length === 0) {
    return null
  }

  return (
    <div className="card-glass p-5">
      <h3 className="font-semibold mb-4">Phân Bổ Danh Mục</h3>
      <div className="flex items-center gap-6">
        <canvas
          ref={canvasRef}
          className="w-[200px] h-[200px]"
          style={{ width: 200, height: 200 }}
        />
        <div className="flex-1 space-y-1.5">
          {data.map((d, i) => (
            <div key={d.label} className="flex items-center gap-2 text-sm">
              <span
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="font-medium w-12">{d.label}</span>
              <span className="text-muted text-xs">{d.industry}</span>
              <span className="ml-auto text-xs">
                {total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
