'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { formatVND } from '@/lib/utils'

function useDotInput(initial = '') {
  const [val, setVal] = useState(initial)
  const num = parseFloat(val.replace(/\./g, '')) || 0
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\./g, '').replace(/[^\d]/g, '')
    setVal(raw ? Number(raw).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')
  }
  return { val, num, onChange }
}

export default function DCASimulator() {
  const monthly = useDotInput('5.000.000')
  const [months, setMonths] = useState('24')
  const [growth, setGrowth] = useState('15')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const m = monthly.num
  const n = parseInt(months) || 0
  const g = parseFloat(growth) / 100 / 12 // monthly rate

  const rows = useMemo(() => {
    const result: Array<{ month: number; invested: number; value: number; pnl: number }> = []
    let value = 0
    for (let i = 1; i <= Math.min(n, 120); i++) {
      value = (value + m) * (1 + g)
      result.push({
        month: i,
        invested: m * i,
        value: Math.round(value),
        pnl: Math.round(value - m * i),
      })
    }
    return result
  }, [m, n, g])

  const last = rows[rows.length - 1]
  const totalInvested = m * n
  const finalValue = last?.value || 0
  const totalPnl = finalValue - totalInvested
  const roi = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || rows.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.offsetWidth || 400
    const h = 160
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const maxVal = Math.max(...rows.map(r => r.value))
    if (maxVal === 0) return
    const padL = 16, padR = 16, padT = 12, padB = 12
    const chartW = w - padL - padR
    const chartH = h - padT - padB
    const xStep = rows.length > 1 ? chartW / (rows.length - 1) : chartW

    // Fill area between invested and value
    ctx.beginPath()
    rows.forEach((r, i) => {
      const x = padL + i * xStep
      const y = padT + chartH * (1 - r.value / maxVal)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    for (let i = rows.length - 1; i >= 0; i--) {
      ctx.lineTo(padL + i * xStep, padT + chartH * (1 - rows[i].invested / maxVal))
    }
    ctx.closePath()
    ctx.fillStyle = 'rgba(0,212,170,0.08)'
    ctx.fill()

    // Invested line
    ctx.beginPath()
    rows.forEach((r, i) => {
      const x = padL + i * xStep
      const y = padT + chartH * (1 - r.invested / maxVal)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.strokeStyle = '#7a8ba0'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.stroke()
    ctx.setLineDash([])

    // Value line
    ctx.beginPath()
    rows.forEach((r, i) => {
      const x = padL + i * xStep
      const y = padT + chartH * (1 - r.value / maxVal)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.strokeStyle = '#00d4aa'
    ctx.lineWidth = 2.5
    ctx.stroke()
  }, [rows])

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Mô Phỏng DCA</h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs text-muted mb-1 block">Mỗi tháng (₫)</label>
          <input
            type="text"
            value={monthly.val}
            onChange={monthly.onChange}
            placeholder="5.000.000"
            className="input-dark w-full text-sm"
            inputMode="numeric"
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Số tháng</label>
          <input
            type="number"
            value={months}
            onChange={e => setMonths(e.target.value)}
            placeholder="24"
            className="input-dark w-full text-sm"
            min={1}
            max={120}
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Tăng trưởng/năm %</label>
          <input
            type="number"
            value={growth}
            onChange={e => setGrowth(e.target.value)}
            placeholder="15"
            className="input-dark w-full text-sm"
            step={1}
          />
        </div>
      </div>

      {last && (
        <>
          <div className="bg-surface2 rounded-lg p-4 grid grid-cols-3 gap-2 sm:gap-4 text-sm">
            <div>
              <p className="text-muted text-xs">Tổng đầu tư</p>
              <p className="font-semibold text-gray-200">{formatVND(totalInvested)}</p>
            </div>
            <div>
              <p className="text-muted text-xs">Giá trị cuối</p>
              <p className="font-semibold text-accent">{formatVND(finalValue)}</p>
            </div>
            <div>
              <p className="text-muted text-xs">Lãi / ROI</p>
              <p className={`font-semibold ${roi >= 0 ? 'text-accent' : 'text-danger'}`}>
                {formatVND(totalPnl)} ({roi >= 0 ? '+' : ''}{roi.toFixed(1)}%)
              </p>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            className="w-full rounded-lg bg-surface2"
            style={{ height: 160 }}
          />

          <div className="flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 bg-muted/60 border-dashed border-t border-muted" />
              Vốn đầu tư
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 bg-accent" />
              Giá trị danh mục
            </span>
          </div>
        </>
      )}
    </div>
  )
}
