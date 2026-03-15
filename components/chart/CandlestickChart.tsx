'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { HistoryData } from '@/types'

interface CandlestickChartProps {
  symbol: string
  isVisible?: boolean
}

export default function CandlestickChart({ symbol, isVisible = true }: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof import('lightweight-charts').createChart> | null>(null)
  const resizeHandlerRef = useRef<(() => void) | null>(null)
  const subCanvasRef = useRef<HTMLCanvasElement>(null)
  const visibleRangeRef = useRef<{ from: number; to: number } | null>(null)
  const drawSubCanvasRef = useRef<(() => void) | null>(null)

  const [data, setData] = useState<HistoryData | null>(null)
  const [days, setDays] = useState(90)
  const [loading, setLoading] = useState(false)
  const [showSMA20, setShowSMA20] = useState(true)
  const [showSMA50, setShowSMA50] = useState(true)
  const [showBB, setShowBB] = useState(false)
  const [activePane, setActivePane] = useState<'volume' | 'rsi' | 'macd'>('volume')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [isCustom, setIsCustom] = useState(false)

  // Build API URL
  const historyUrl = (() => {
    if (isCustom && customFrom && customTo) {
      return `/api/history?symbol=${symbol}&from=${customFrom}&to=${customTo}`
    }
    return `/api/history?symbol=${symbol}&days=${days}`
  })()

  useEffect(() => {
    if (!symbol) return
    let cancelled = false
    setLoading(true)
    fetch(historyUrl)
      .then((r) => {
        if (!r.ok) throw new Error('Fetch failed')
        return r.json()
      })
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [symbol, historyUrl])

  // ── Draw sub-pane canvas (synced to visible range) ──────────────────────────
  const drawSubCanvas = useCallback(() => {
    const canvas = subCanvasRef.current
    if (!canvas || !data?.candles?.length) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Determine visible range
    const totalCandles = data.candles.length
    const range = visibleRangeRef.current
    const startIdx = range ? Math.max(0, Math.floor(range.from)) : 0
    const endIdx = range ? Math.min(totalCandles - 1, Math.ceil(range.to)) : totalCandles - 1

    const dpr = window.devicePixelRatio || 1
    const w = canvas.offsetWidth || 600
    const h = 90
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const pad = { l: 4, r: 60, t: 6, b: 6 }
    const cw = w - pad.l - pad.r
    const ch = h - pad.t - pad.b

    const visibleCandles = data.candles.slice(startIdx, endIdx + 1)
    const visibleCount = visibleCandles.length
    if (visibleCount === 0) return

    if (activePane === 'volume') {
      const vols = visibleCandles.map((c) => c.volume)
      const maxVol = Math.max(...vols, 1)
      const bw = cw / visibleCount

      vols.forEach((v, i) => {
        const barH = (v / maxVol) * ch
        const isUp = visibleCandles[i].close >= visibleCandles[i].open
        ctx.fillStyle = isUp ? '#00d4aa66' : '#f43f5e66'
        ctx.fillRect(pad.l + i * bw + 0.5, pad.t + ch - barH, Math.max(bw - 1, 1), barH)
      })

      // Latest volume label
      const latest = vols[vols.length - 1]
      ctx.fillStyle = '#7a8ba0'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`Vol: ${latest >= 1_000_000 ? (latest / 1_000_000).toFixed(1) + 'M' : (latest / 1_000).toFixed(0) + 'K'}`, w - pad.r + 4, 14)
    }

    if (activePane === 'rsi') {
      const rsiSlice = (data.indicators?.rsi || []).slice(startIdx, endIdx + 1)
      const validRsi: { x: number; v: number }[] = []
      rsiSlice.forEach((v, i) => {
        if (v != null && !isNaN(v)) validRsi.push({ x: pad.l + (i / (visibleCount - 1)) * cw, v })
      })
      if (validRsi.length < 2) return

      // Zones
      ctx.fillStyle = '#f43f5e12'
      ctx.fillRect(pad.l, pad.t, cw, (ch * 30) / 100)         // overbought zone top
      ctx.fillStyle = '#00d4aa12'
      ctx.fillRect(pad.l, pad.t + (ch * 70) / 100, cw, (ch * 30) / 100) // oversold zone bottom

      // Dashed lines at 70 / 30
      ctx.strokeStyle = '#f43f5e50'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(pad.l, pad.t + (ch * 30) / 100)
      ctx.lineTo(pad.l + cw, pad.t + (ch * 30) / 100)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(pad.l, pad.t + (ch * 70) / 100)
      ctx.lineTo(pad.l + cw, pad.t + (ch * 70) / 100)
      ctx.stroke()
      ctx.setLineDash([])

      // RSI line
      const latest = validRsi[validRsi.length - 1].v
      ctx.beginPath()
      validRsi.forEach(({ x, v }, i) => {
        const y = pad.t + ch * (1 - v / 100)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.strokeStyle = latest > 70 ? '#f43f5e' : latest < 30 ? '#00d4aa' : '#3b82f6'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Labels
      ctx.fillStyle = '#f43f5e80'
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('70', w - pad.r + 4, pad.t + (ch * 30) / 100 + 3)
      ctx.fillStyle = '#00d4aa80'
      ctx.fillText('30', w - pad.r + 4, pad.t + (ch * 70) / 100 + 3)
      if (latest != null && !isNaN(latest)) {
        ctx.fillStyle = ctx.strokeStyle
        ctx.fillText(`RSI: ${latest.toFixed(1)}`, w - pad.r + 4, 14)
      }
    }

    if (activePane === 'macd') {
      const macdSlice = (data.indicators?.macd || []).slice(startIdx, endIdx + 1)
      const validMacd = macdSlice.filter(
        (v) => v.macd != null && v.signal != null && !isNaN(v.macd) && !isNaN(v.signal)
      )
      if (validMacd.length < 2) return

      const histVals = validMacd.map((v) => v.histogram)
      const maxAbs = Math.max(...histVals.map(Math.abs), 0.001)
      const midY = pad.t + ch / 2
      const xStep = cw / (validMacd.length - 1)
      const bw = cw / validMacd.length

      // Zero line
      ctx.strokeStyle = '#1e2d4580'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pad.l, midY)
      ctx.lineTo(pad.l + cw, midY)
      ctx.stroke()

      // Histogram bars
      validMacd.forEach((v, i) => {
        const barH = (Math.abs(v.histogram) / maxAbs) * (ch / 2)
        ctx.fillStyle = v.histogram >= 0 ? '#00d4aa55' : '#f43f5e55'
        if (v.histogram >= 0) {
          ctx.fillRect(pad.l + i * bw, midY - barH, Math.max(bw - 1, 1), barH)
        } else {
          ctx.fillRect(pad.l + i * bw, midY, Math.max(bw - 1, 1), barH)
        }
      })

      // MACD line
      ctx.beginPath()
      validMacd.forEach((v, i) => {
        const x = pad.l + i * xStep
        const y = midY - (v.macd / maxAbs) * (ch / 2)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.strokeStyle = '#00d4aa'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Signal line
      ctx.beginPath()
      validMacd.forEach((v, i) => {
        const x = pad.l + i * xStep
        const y = midY - (v.signal / maxAbs) * (ch / 2)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.strokeStyle = '#f43f5e'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Labels
      const latest = validMacd[validMacd.length - 1]
      ctx.fillStyle = '#7a8ba0'
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'left'
      if (latest.macd != null && !isNaN(latest.macd)) {
        ctx.fillText(`MACD ${latest.macd.toFixed(1)}`, w - pad.r + 4, 14)
      }
      if (latest.signal != null && !isNaN(latest.signal)) {
        ctx.fillText(`Sig ${latest.signal.toFixed(1)}`, w - pad.r + 4, 26)
      }
      if (latest.histogram != null && !isNaN(latest.histogram)) {
        ctx.fillStyle = latest.histogram >= 0 ? '#00d4aa' : '#f43f5e'
        ctx.fillText(`H ${latest.histogram >= 0 ? '+' : ''}${latest.histogram.toFixed(1)}`, w - pad.r + 4, 38)
      }
    }
  }, [data, activePane])

  // Keep ref updated so chart subscription can call latest version
  drawSubCanvasRef.current = drawSubCanvas

  useEffect(() => {
    drawSubCanvas()
  }, [drawSubCanvas])

  // ── Build main Lightweight Chart ────────────────────────────────────────────
  useEffect(() => {
    if (!data?.candles?.length || !chartContainerRef.current) return
    // Don't create chart while section is hidden (container.clientWidth = 0)
    if (!isVisible) return

    if (resizeHandlerRef.current) {
      window.removeEventListener('resize', resizeHandlerRef.current)
      resizeHandlerRef.current = null
    }

    const loadChart = async () => {
      const { createChart, CandlestickSeries, LineSeries } = await import('lightweight-charts')

      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }

      const container = chartContainerRef.current
      if (!container) return

      const chart = createChart(container, {
        autoSize: true,
        height: 400,
        layout: {
          background: { color: '#131929' },
          textColor: '#7a8ba0',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: '#1e2d4520' },
          horzLines: { color: '#1e2d4520' },
        },
        crosshair: { mode: 0 },
        timeScale: { borderColor: '#1e2d45', timeVisible: false },
        rightPriceScale: { borderColor: '#1e2d45' },
      })

      chartRef.current = chart

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#00d4aa',
        downColor: '#f43f5e',
        borderUpColor: '#00d4aa',
        borderDownColor: '#f43f5e',
        wickUpColor: '#00d4aa',
        wickDownColor: '#f43f5e',
      })

      const candleData = data.candles.map((c) => ({
        time: c.time as string,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      candleSeries.setData(candleData)

      // Helper to map indicator to chart data
      const mapIndicator = (values: number[]) =>
        values
          .map((v, i) => ({
            time: i < data.candles.length ? (data.candles[i].time as string) : '',
            value: v,
          }))
          .filter((d) => d.value != null && !isNaN(d.value) && d.time !== '')

      if (showSMA20 && data.indicators?.sma20) {
        const series = chart.addSeries(LineSeries, { color: '#f5a623', lineWidth: 1, priceLineVisible: false })
        series.setData(mapIndicator(data.indicators.sma20))
      }

      if (showSMA50 && data.indicators?.sma50) {
        const series = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, priceLineVisible: false })
        series.setData(mapIndicator(data.indicators.sma50))
      }

      if (showBB && data.indicators?.bb) {
        const bbData = data.indicators.bb
        const mapBB = (fn: (v: { upper: number; middle: number; lower: number }) => number) =>
          bbData
            .map((v, i) => ({
              time: i < data.candles.length ? (data.candles[i].time as string) : '',
              value: fn(v),
            }))
            .filter((d) => d.value != null && !isNaN(d.value) && d.time !== '')

        const upper = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, lineStyle: 2, priceLineVisible: false })
        const lower = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, lineStyle: 2, priceLineVisible: false })
        const mid = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, priceLineVisible: false })
        upper.setData(mapBB((v) => v.upper))
        lower.setData(mapBB((v) => v.lower))
        mid.setData(mapBB((v) => v.middle))
      }

      chart.timeScale().fitContent()

      // ── Sync sub-pane with main chart zoom/scroll ──────────────────────────
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) {
          visibleRangeRef.current = range
          drawSubCanvasRef.current?.()
        }
      })

      // Resize sub-canvas on window resize (chart itself handles resize via autoSize)
      const handleResize = () => {
        drawSubCanvasRef.current?.()
      }
      resizeHandlerRef.current = handleResize
      window.addEventListener('resize', handleResize)
    }

    loadChart()

    return () => {
      if (resizeHandlerRef.current) {
        window.removeEventListener('resize', resizeHandlerRef.current)
        resizeHandlerRef.current = null
      }
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [data, showSMA20, showSMA50, showBB, isVisible])

  return (
    <div className="card-glass overflow-hidden">
      {/* Controls */}
      <div className="p-4 border-b border-border flex flex-wrap items-center gap-2">
        <h3 className="font-semibold mr-4">Biểu Đồ {symbol}</h3>
        <div className="flex gap-1 flex-wrap">
          {[
            { label: '1T', value: 30 },
            { label: '3T', value: 90 },
            { label: '6T', value: 180 },
            { label: '1N', value: 365 },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setDays(opt.value); setIsCustom(false) }}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                !isCustom && days === opt.value
                  ? 'bg-accent text-bg'
                  : 'bg-surface2 text-muted hover:text-gray-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => setIsCustom(v => !v)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              isCustom ? 'bg-accent text-bg' : 'bg-surface2 text-muted hover:text-gray-100'
            }`}
          >
            Tùy chỉnh
          </button>
        </div>

        {/* Custom date range */}
        {isCustom && (
          <div className="flex items-center gap-1.5 text-xs">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="bg-surface2 border border-border/60 rounded px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-accent"
            />
            <span className="text-muted">→</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="bg-surface2 border border-border/60 rounded px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-accent"
            />
          </div>
        )}
        <div className="flex gap-1 ml-auto">
          {[
            { label: 'SMA20', active: showSMA20, toggle: () => setShowSMA20(!showSMA20), color: '#f5a623' },
            { label: 'SMA50', active: showSMA50, toggle: () => setShowSMA50(!showSMA50), color: '#3b82f6' },
            { label: 'BB', active: showBB, toggle: () => setShowBB(!showBB), color: '#a855f7' },
          ].map((ind) => (
            <button
              key={ind.label}
              onClick={ind.toggle}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                ind.active ? 'bg-surface2 text-gray-100' : 'text-muted hover:text-gray-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ind.active ? ind.color : '#7a8ba0' }} />
              {ind.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main chart — container always in DOM so autoSize can detect visibility changes */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/60" style={{ height: 400 }}>
            <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
          </div>
        )}
        <div ref={chartContainerRef} className="w-full" style={{ height: 400 }} />
      </div>

      {/* Sub-pane tabs + canvas */}
      <div className="border-t border-border">
        <div className="flex border-b border-border">
          {(['volume', 'rsi', 'macd'] as const).map((pane) => (
            <button
              key={pane}
              onClick={() => setActivePane(pane)}
              className={`flex-1 py-2 text-xs font-medium text-center border-b-2 transition-colors ${
                activePane === pane ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-gray-300'
              }`}
            >
              {pane.toUpperCase()}
            </button>
          ))}
        </div>
        {data?.candles?.length ? (
          <div className="px-0 py-2">
            <canvas
              ref={subCanvasRef}
              className="w-full"
              style={{ height: 90, display: 'block' }}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
