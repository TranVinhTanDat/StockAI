'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { HistoryData } from '@/types'

interface ChartOverlays {
  recommendation: string
  targetPrice: number
  stopLoss: number
  entryLow: number
  entryHigh: number
  support: number
  resistance: number
  sma200: number
  currentPrice: number
}

interface CandlestickChartProps {
  symbol: string
  isVisible?: boolean
  overlays?: ChartOverlays
}

type PriceSeriesLike = { priceToCoordinate: (price: number) => number | null }

const CHART_H = 400
const PRICE_SCALE_W = 65

export default function CandlestickChart({ symbol, isVisible = true, overlays }: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof import('lightweight-charts').createChart> | null>(null)
  const resizeHandlerRef = useRef<(() => void) | null>(null)
  const subCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const candleSeriesRef = useRef<PriceSeriesLike | null>(null)
  const visibleRangeRef = useRef<{ from: number; to: number } | null>(null)
  const drawSubCanvasRef = useRef<(() => void) | null>(null)
  const drawZoneOverlayRef = useRef<(() => void) | null>(null)

  const [data, setData] = useState<HistoryData | null>(null)
  const [days, setDays] = useState(90)
  const [loading, setLoading] = useState(false)
  const [showSMA20, setShowSMA20] = useState(true)
  const [showSMA50, setShowSMA50] = useState(true)
  const [showBB, setShowBB] = useState(false)
  const [showSMA200, setShowSMA200] = useState(true)
  const [showZones, setShowZones] = useState(true)
  const [showGuide, setShowGuide] = useState(false)
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

      ctx.fillStyle = '#f43f5e12'
      ctx.fillRect(pad.l, pad.t, cw, (ch * 30) / 100)
      ctx.fillStyle = '#00d4aa12'
      ctx.fillRect(pad.l, pad.t + (ch * 70) / 100, cw, (ch * 30) / 100)

      ctx.strokeStyle = '#f43f5e50'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(pad.l, pad.t + (ch * 30) / 100); ctx.lineTo(pad.l + cw, pad.t + (ch * 30) / 100); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(pad.l, pad.t + (ch * 70) / 100); ctx.lineTo(pad.l + cw, pad.t + (ch * 70) / 100); ctx.stroke()
      ctx.setLineDash([])

      const latest = validRsi[validRsi.length - 1].v
      ctx.beginPath()
      validRsi.forEach(({ x, v }, i) => {
        const y = pad.t + ch * (1 - v / 100)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.strokeStyle = latest > 70 ? '#f43f5e' : latest < 30 ? '#00d4aa' : '#3b82f6'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.fillStyle = '#f43f5e80'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'
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

      ctx.strokeStyle = '#1e2d4580'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(pad.l, midY); ctx.lineTo(pad.l + cw, midY); ctx.stroke()

      validMacd.forEach((v, i) => {
        const barH = (Math.abs(v.histogram) / maxAbs) * (ch / 2)
        ctx.fillStyle = v.histogram >= 0 ? '#00d4aa55' : '#f43f5e55'
        if (v.histogram >= 0) ctx.fillRect(pad.l + i * bw, midY - barH, Math.max(bw - 1, 1), barH)
        else ctx.fillRect(pad.l + i * bw, midY, Math.max(bw - 1, 1), barH)
      })

      ctx.beginPath()
      validMacd.forEach((v, i) => {
        const x = pad.l + i * xStep; const y = midY - (v.macd / maxAbs) * (ch / 2)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.strokeStyle = '#00d4aa'; ctx.lineWidth = 1.5; ctx.stroke()

      ctx.beginPath()
      validMacd.forEach((v, i) => {
        const x = pad.l + i * xStep; const y = midY - (v.signal / maxAbs) * (ch / 2)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = 1.5; ctx.stroke()

      const latest = validMacd[validMacd.length - 1]
      ctx.fillStyle = '#7a8ba0'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'
      if (latest.macd != null && !isNaN(latest.macd)) ctx.fillText(`MACD ${latest.macd.toFixed(1)}`, w - pad.r + 4, 14)
      if (latest.signal != null && !isNaN(latest.signal)) ctx.fillText(`Sig ${latest.signal.toFixed(1)}`, w - pad.r + 4, 26)
      if (latest.histogram != null && !isNaN(latest.histogram)) {
        ctx.fillStyle = latest.histogram >= 0 ? '#00d4aa' : '#f43f5e'
        ctx.fillText(`H ${latest.histogram >= 0 ? '+' : ''}${latest.histogram.toFixed(1)}`, w - pad.r + 4, 38)
      }
    }
  }, [data, activePane])

  drawSubCanvasRef.current = drawSubCanvas

  useEffect(() => { drawSubCanvas() }, [drawSubCanvas])

  // ── Draw zone overlay canvas ─────────────────────────────────────────────────
  const drawZoneOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return

    // Use chartContainerRef width as reliable source
    const containerW = chartContainerRef.current?.clientWidth || canvas.parentElement?.clientWidth || canvas.offsetWidth || 0
    const w = containerW > 0 ? containerW : 600

    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = CHART_H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, CHART_H)

    const series = candleSeriesRef.current
    if (!showZones || !overlays || !series) return

    const plotW = w - PRICE_SCALE_W

    const yOf = (price: number): number | null => {
      if (price <= 0) return null
      const y = series.priceToCoordinate(price)
      return y ?? null
    }

    const { targetPrice, stopLoss, entryLow, entryHigh, support, resistance } = overlays

    // Parse hex #rrggbb → [r, g, b]
    const hex2rgb = (hex: string): [number, number, number] => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ]

    // Rounded rect path helper
    const rrect = (x: number, y: number, rw: number, rh: number, r: number) => {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + rw - r, y); ctx.quadraticCurveTo(x + rw, y, x + rw, y + r)
      ctx.lineTo(x + rw, y + rh - r); ctx.quadraticCurveTo(x + rw, y + rh, x + rw - r, y + rh)
      ctx.lineTo(x + r, y + rh); ctx.quadraticCurveTo(x, y + rh, x, y + rh - r)
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.closePath()
    }

    // Beautiful zone band with gradient + glow + label badge
    const drawZone = (
      pHigh: number, pLow: number,
      hex: string,
      label: string,
    ) => {
      const y1 = yOf(pHigh); const y2 = yOf(pLow)
      if (y1 == null || y2 == null) return
      const top = Math.min(y1, y2)
      const bot = Math.max(y1, y2)
      const bandH = Math.max(bot - top, 3)
      const [r, g, b] = hex2rgb(hex)

      // ── Gradient fill (left → right fade) ──────────────────────────────────
      const grad = ctx.createLinearGradient(0, 0, plotW, 0)
      grad.addColorStop(0,   `rgba(${r},${g},${b},0.35)`)
      grad.addColorStop(0.35, `rgba(${r},${g},${b},0.22)`)
      grad.addColorStop(1,   `rgba(${r},${g},${b},0.07)`)
      ctx.fillStyle = grad
      ctx.fillRect(4, top, plotW - 4, bandH)

      // ── Left accent bar (5px solid glow strip) ─────────────────────────────
      ctx.save()
      ctx.shadowColor = hex; ctx.shadowBlur = 10
      ctx.fillStyle = `rgba(${r},${g},${b},1)`
      ctx.fillRect(0, top, 5, bandH)
      ctx.restore()

      // ── Top & bottom border with glow ──────────────────────────────────────
      ctx.save()
      ctx.shadowColor = hex
      ctx.shadowBlur = 12
      ctx.strokeStyle = `rgba(${r},${g},${b},1)`
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.beginPath(); ctx.moveTo(4, top); ctx.lineTo(plotW, top); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(4, bot); ctx.lineTo(plotW, bot); ctx.stroke()
      ctx.restore()

      // ── Label badge ─────────────────────────────────────────────────────────
      if (bandH >= 14) {
        const labelText = label
        ctx.font = 'bold 9.5px -apple-system, sans-serif'
        const tw = ctx.measureText(labelText).width
        const lx = 10
        const ly = top + Math.min(14, bandH * 0.68)
        const px = 6, py = 3
        const bx = lx - px, by = ly - 12 - py, bw = tw + px * 2, bh = 16 + py * 2

        // Badge bg
        ctx.save()
        ctx.shadowColor = hex; ctx.shadowBlur = 6
        rrect(bx, by, bw, bh, 4)
        ctx.fillStyle = `rgba(${r},${g},${b},0.22)`
        ctx.fill()
        ctx.strokeStyle = `rgba(${r},${g},${b},0.6)`
        ctx.lineWidth = 0.8
        ctx.stroke()
        ctx.restore()

        // Badge text
        ctx.fillStyle = `rgb(${Math.min(r + 60, 255)},${Math.min(g + 60, 255)},${Math.min(b + 60, 255)})`
        ctx.textAlign = 'left'
        ctx.fillText(labelText, lx, ly)
      }
    }

    // Glowing dotted line for support / resistance
    const drawGlowDot = (price: number, hex: string, label: string) => {
      const y = yOf(price)
      if (y == null) return
      const [r, g, b] = hex2rgb(hex)
      ctx.save()
      ctx.shadowColor = hex; ctx.shadowBlur = 6
      ctx.strokeStyle = `rgba(${r},${g},${b},0.75)`
      ctx.lineWidth = 1.2
      ctx.setLineDash([6, 5])
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
      if (label) {
        ctx.fillStyle = `rgba(${r},${g},${b},0.85)`
        ctx.font = '9px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(label, 8, y - 4)
      }
    }

    // ── Render order: back → front ──────────────────────────────────────────
    if (resistance > 0) drawGlowDot(resistance, '#f97316', '◆ Kháng cự')
    if (support    > 0) drawGlowDot(support,    '#00d4aa', '◆ Hỗ trợ')

    // Target — thin gold band ±0.6%
    if (targetPrice > 0)
      drawZone(targetPrice * 1.006, targetPrice * 0.994, '#f59e0b', '🎯 Chốt lời')

    // Entry / buy zone — green band
    if (entryLow > 0 && entryHigh > 0 && entryHigh >= entryLow)
      drawZone(entryHigh, entryLow, '#22c55e', '▶ VÙNG MUA — Tích lũy khi giá về đây')

    // Stop loss — red band ±0.7%
    if (stopLoss > 0)
      drawZone(stopLoss * 1.005, stopLoss * 0.993, '#ef4444', '✂ Cắt lỗ — Thoát nếu đóng cửa dưới đây')

  }, [overlays, showZones])

  drawZoneOverlayRef.current = drawZoneOverlay

  useEffect(() => { drawZoneOverlay() }, [drawZoneOverlay])

  // Also redraw when overlays/showZones change with a delay (ensures series is ready)
  useEffect(() => {
    const t = setTimeout(() => { drawZoneOverlayRef.current?.() }, 50)
    return () => clearTimeout(t)
  }, [overlays, showZones])

  // ── Build main Lightweight Chart ────────────────────────────────────────────
  useEffect(() => {
    if (!data?.candles?.length || !chartContainerRef.current) return
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
        height: CHART_H,
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

      candleSeriesRef.current = candleSeries

      const candleData = data.candles.map((c) => ({
        time: c.time as string,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      candleSeries.setData(candleData)

      const mapIndicator = (values: number[]) =>
        values
          .map((v, i) => ({
            time: i < data.candles.length ? (data.candles[i].time as string) : '',
            value: v,
          }))
          .filter((d) => d.value != null && !isNaN(d.value) && d.time !== '')

      if (showSMA20 && data.indicators?.sma20) {
        const s = chart.addSeries(LineSeries, { color: '#f5a623', lineWidth: 1, priceLineVisible: false })
        s.setData(mapIndicator(data.indicators.sma20))
      }

      if (showSMA50 && data.indicators?.sma50) {
        const s = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, priceLineVisible: false })
        s.setData(mapIndicator(data.indicators.sma50))
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
        const mid   = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, priceLineVisible: false })
        upper.setData(mapBB((v) => v.upper))
        lower.setData(mapBB((v) => v.lower))
        mid.setData(mapBB((v) => v.middle))
      }

      // SMA200
      if (showSMA200 && data.candles.length >= 200) {
        const closes = data.candles.map((c) => c.close)
        const sma200Data = closes
          .map((_, i) => {
            if (i < 199) return null
            const slice = closes.slice(i - 199, i + 1)
            return { time: data.candles[i].time as string, value: slice.reduce((a, b) => a + b, 0) / 200 }
          })
          .filter((d): d is { time: string; value: number } => d !== null)
        const s200 = chart.addSeries(LineSeries, { color: '#ec4899', lineWidth: 2, priceLineVisible: false })
        s200.setData(sma200Data)
      }

      chart.timeScale().fitContent()

      // Draw zone overlay after chart fully settles (double RAF + fallback timeout)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          drawZoneOverlayRef.current?.()
        })
      })
      setTimeout(() => { drawZoneOverlayRef.current?.() }, 200)

      // Sync canvases on scroll/zoom
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) {
          visibleRangeRef.current = range
          drawSubCanvasRef.current?.()
          drawZoneOverlayRef.current?.()
        }
      })

      const handleResize = () => {
        drawSubCanvasRef.current?.()
        drawZoneOverlayRef.current?.()
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
  }, [data, showSMA20, showSMA50, showBB, showSMA200, isVisible])

  // ── Guide panel content ──────────────────────────────────────────────────────
  const recColor =
    overlays?.recommendation?.includes('MUA') ? '#4ade80' :
    overlays?.recommendation?.includes('BÁN') ? '#f87171' : '#facc15'

  return (
    <div className="card-glass overflow-hidden">
      {/* ── Controls ── */}
      <div className="p-3 border-b border-border flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-sm mr-2">Biểu Đồ {symbol}</h3>

        {/* Period buttons */}
        <div className="flex gap-1">
          {[{ label: '1T', value: 30 }, { label: '3T', value: 90 }, { label: '6T', value: 180 }, { label: '1N', value: 365 }].map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setDays(opt.value); setIsCustom(false) }}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                !isCustom && days === opt.value ? 'bg-accent text-bg' : 'bg-surface2 text-muted hover:text-gray-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => setIsCustom(v => !v)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${isCustom ? 'bg-accent text-bg' : 'bg-surface2 text-muted hover:text-gray-100'}`}
          >
            Tùy chỉnh
          </button>
        </div>

        {isCustom && (
          <div className="flex items-center gap-1.5 text-xs">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="bg-surface2 border border-border/60 rounded px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-accent" />
            <span className="text-muted">→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="bg-surface2 border border-border/60 rounded px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-accent" />
          </div>
        )}

        {/* Indicator toggles */}
        <div className="flex gap-1 ml-auto flex-wrap">
          {[
            { label: 'SMA20',  active: showSMA20,  toggle: () => setShowSMA20(v => !v),   color: '#f5a623' },
            { label: 'SMA50',  active: showSMA50,  toggle: () => setShowSMA50(v => !v),   color: '#3b82f6' },
            { label: 'SMA200', active: showSMA200, toggle: () => setShowSMA200(v => !v),  color: '#ec4899' },
            { label: 'BB',     active: showBB,     toggle: () => setShowBB(v => !v),      color: '#a855f7' },
            ...(overlays ? [{ label: 'Vùng', active: showZones, toggle: () => setShowZones(v => !v), color: '#22c55e' }] : []),
          ].map((ind) => (
            <button key={ind.label} onClick={ind.toggle}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all flex items-center gap-1 ${
                ind.active ? 'bg-surface2 text-gray-100 ring-1 ring-white/10' : 'text-muted hover:text-gray-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full transition-colors" style={{ backgroundColor: ind.active ? ind.color : '#3a4a5a' }} />
              {ind.label}
            </button>
          ))}

          {/* Guide toggle — only when overlays exist */}
          {overlays && (
            <button
              onClick={() => setShowGuide(v => !v)}
              title="Hướng dẫn đọc vùng phân tích"
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all flex items-center gap-1 ${
                showGuide ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30' : 'text-muted hover:text-blue-300'
              }`}
            >
              <span className="text-[11px]">ℹ</span> Hướng dẫn
            </button>
          )}
        </div>
      </div>

      {/* ── Zone legend bar (when overlays active) ── */}
      {overlays && showZones && (
        <div className="flex items-center gap-3 px-3 py-1.5 bg-surface/30 border-b border-border/50 flex-wrap">
          <span className="text-[10px] text-muted font-medium tracking-wide uppercase">Vùng phân tích:</span>
          {[
            { color: '#f59e0b', label: 'Chốt lời', dotted: false },
            { color: '#4ade80', label: 'Vùng Mua',  dotted: false },
            { color: '#f87171', label: 'Cắt lỗ',    dotted: false },
            { color: '#00d4aa', label: 'Hỗ trợ',    dotted: true },
            { color: '#f97316', label: 'Kháng cự',  dotted: true },
          ].map((z) => (
            <div key={z.label} className="flex items-center gap-1">
              {z.dotted
                ? <span className="w-5 border-t border-dashed" style={{ borderColor: z.color }} />
                : <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: z.color + '28', borderColor: z.color + '90' }} />
              }
              <span className="text-[10px]" style={{ color: z.color }}>{z.label}</span>
            </div>
          ))}
          <span className="ml-auto text-[10px] text-muted">
            Khuyến nghị: <span className="font-bold" style={{ color: recColor }}>{overlays.recommendation}</span>
          </span>
        </div>
      )}

      {/* ── Main chart ── */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/60" style={{ height: CHART_H }}>
            <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
          </div>
        )}
        <div ref={chartContainerRef} className="w-full" style={{ height: CHART_H }} />
        {/* Zone overlay canvas — z-index 100 ensures it's above LW Charts internal canvases */}
        <canvas
          ref={overlayCanvasRef}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: CHART_H,
            display: 'block', pointerEvents: 'none',
            zIndex: 100,
          }}
        />
      </div>

      {/* ── Guide panel ── */}
      {overlays && showGuide && (
        <div className="border-t border-border bg-[#0b1220] px-4 py-4 space-y-3 text-[10px]">

          {/* ── Tiêu đề + giải thích khái niệm ── */}
          <div className="flex items-start gap-2">
            <span className="text-blue-400 text-xs mt-0.5 flex-shrink-0">ℹ</span>
            <div>
              <p className="text-xs font-bold text-gray-200 mb-1">Đường nào đi vào vùng → tín hiệu gì → làm gì?</p>
              <p className="text-muted leading-relaxed">
                Nhìn thẳng trên biểu đồ: khi đường{' '}
                <span style={{ color: '#f5a623' }}>SMA20</span>,{' '}
                <span style={{ color: '#3b82f6' }}>SMA50</span>,{' '}
                <span style={{ color: '#ec4899' }}>SMA200</span> hoặc dải{' '}
                <span style={{ color: '#a855f7' }}>BB</span>{' '}
                đi xuyên qua một vùng màu → áp dụng quy tắc tương ứng bên dưới. Đây là tín hiệu hội tụ mạnh hơn chỉ xem RSI/MACD đơn thuần.
              </p>
            </div>
          </div>

          {/* ── Chú giải màu đường ── */}
          <div className="flex flex-wrap gap-3 px-2 py-1.5 rounded bg-[#0d1526] border border-[#1e2d4540]">
            {[
              { color: '#f5a623', label: 'SMA20 — đường cam ngắn hạn (20 phiên)' },
              { color: '#3b82f6', label: 'SMA50 — đường xanh trung hạn (50 phiên)' },
              { color: '#ec4899', label: 'SMA200 — đường hồng dài hạn (200 phiên)' },
              { color: '#a855f7', label: 'BB — dải tím (Bollinger Bands)' },
            ].map(({ color, label }) => (
              <span key={color} className="flex items-center gap-1.5">
                <span className="w-4 border-t-2" style={{ borderColor: color }} />
                <span style={{ color }} className="font-medium">{label}</span>
              </span>
            ))}
          </div>

          {/* ── VÙNG MUA ── */}
          <div className="rounded-lg border border-[#22c55e35] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#22c55e18]">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#22c55e]" />
              <span className="font-bold text-green-400">▶ VÙNG MUA (dải xanh) — đường nào đi qua?</span>
            </div>
            <div className="grid grid-cols-[148px_1fr_110px] bg-[#080f1c] px-3 py-1 gap-3 text-muted font-semibold uppercase tracking-wider" style={{ fontSize: 9 }}>
              <p>Đường đi qua vùng</p><p>Tín hiệu</p><p>Hành động</p>
            </div>
            <div className="divide-y divide-[#22c55e15]">
              {([
                { line: 'SMA20 (cam) trong vùng', lc: '#f5a623', sig: 'Giá bật từ SMA20 ngay trong vùng xanh — hỗ trợ động ngắn hạn xác nhận', act: 'Mua 30%', ac: '#4ade80' },
                { line: 'SMA50 (xanh) trong vùng', lc: '#3b82f6', sig: 'SMA50 đi qua vùng mua — hỗ trợ trung hạn mạnh, xu hướng tăng còn tốt', act: 'Mua 40%', ac: '#4ade80' },
                { line: 'SMA200 (hồng) trong vùng', lc: '#ec4899', sig: 'SMA200 nằm trong vùng — hỗ trợ dài hạn quan trọng nhất, giá về vùng giá trị', act: 'Mua 50%', ac: '#4ade80' },
                { line: 'BB Lower (tím) trong vùng', lc: '#a855f7', sig: 'BB Lower + vùng mua = oversold kép — tín hiệu mua mạnh nhất, hiếm gặp', act: 'Mua 40%', ac: '#4ade80' },
                { line: '⚠ SMA20 nằm TRÊN giá', lc: '#6b7280', sig: 'Giá dưới SMA20 khi chạm vùng xanh — xu hướng ngắn hạn chưa hỗ trợ', act: 'Mua ≤ 10%', ac: '#fbbf24' },
                { line: '⛔ Cả 3 SMA đều trên giá', lc: '#4b5563', sig: 'Xu hướng ngắn, trung, dài đều giảm — vùng mua chưa đáng tin cậy', act: 'Không mua', ac: '#f87171' },
              ] as { line: string; lc: string; sig: string; act: string; ac: string }[]).map(({ line, lc, sig, act, ac }) => (
                <div key={line} className="grid grid-cols-[148px_1fr_110px] bg-[#0b1220] px-3 py-1.5 gap-3 items-start">
                  <p className="font-semibold leading-relaxed" style={{ color: lc }}>{line}</p>
                  <p className="text-gray-400 leading-relaxed">{sig}</p>
                  <p className="font-bold leading-relaxed" style={{ color: ac }}>→ {act}</p>
                </div>
              ))}
            </div>
            <div className="px-3 py-1.5 bg-[#22c55e0a] text-green-400/80">
              <span className="font-semibold text-green-400">Xác nhận thêm qua tab:</span>{' '}
              RSI 30–55 ✅ + VOL cao hơn trung bình ✅ + MACD histogram xanh ✅ → đủ 3: mua mạnh lần 1. Mua thêm 30% nếu giá giữ vùng sau 1–2 phiên.
            </div>
          </div>

          {/* ── VÙNG CHỐT LỜI ── */}
          <div className="rounded-lg border border-[#f59e0b30] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f59e0b15]">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#f59e0b]" />
              <span className="font-bold text-yellow-400">🎯 VÙNG CHỐT LỜI (dải vàng) — đường nào đi qua?</span>
            </div>
            <div className="grid grid-cols-[148px_1fr_110px] bg-[#080f1c] px-3 py-1 gap-3 text-muted font-semibold uppercase tracking-wider" style={{ fontSize: 9 }}>
              <p>Đường / Trạng thái</p><p>Tín hiệu</p><p>Hành động</p>
            </div>
            <div className="divide-y divide-[#f59e0b18]">
              {([
                { line: 'BB Upper (tím) trong vùng', lc: '#a855f7', sig: 'BB Upper chạm vùng vàng — overbought kép, áp lực chốt lời tăng mạnh', act: 'Chốt 50% ngay', ac: '#fbbf24' },
                { line: 'Giá xa SMA20 > 7%', lc: '#f5a623', sig: 'Giá vượt quá xa SMA20 (cam) — overextended ngắn hạn, dễ điều chỉnh', act: 'Chốt 30–40%', ac: '#fbbf24' },
                { line: 'Giá xa SMA200 > 15%', lc: '#ec4899', sig: 'Giá vượt quá xa SMA200 (hồng) — overextended dài hạn, hiếm xảy ra', act: 'Chốt 40–50%', ac: '#fbbf24' },
                { line: 'SMA20 bắt kịp vùng vàng', lc: '#f5a623', sig: 'SMA20 vừa chạm lên đến vùng chốt — xu hướng còn mạnh, chưa phải đỉnh', act: 'Chốt nhẹ 15%', ac: '#a3e635' },
              ] as { line: string; lc: string; sig: string; act: string; ac: string }[]).map(({ line, lc, sig, act, ac }) => (
                <div key={line} className="grid grid-cols-[148px_1fr_110px] bg-[#0b1220] px-3 py-1.5 gap-3 items-start">
                  <p className="font-semibold leading-relaxed" style={{ color: lc }}>{line}</p>
                  <p className="text-gray-400 leading-relaxed">{sig}</p>
                  <p className="font-bold leading-relaxed" style={{ color: ac }}>→ {act}</p>
                </div>
              ))}
            </div>
            <div className="px-3 py-1.5 bg-[#f59e0b08] text-yellow-400/80">
              <span className="font-semibold text-yellow-400">Xác nhận thêm qua tab:</span>{' '}
              RSI {'>'}68 ✅ + VOL giảm khi giá tăng ✅ + MACD histogram xanh đang thấp dần ✅ → Chốt 30–50%. Dịch stop loss lên bảo vệ lợi nhuận còn lại.
            </div>
          </div>

          {/* ── VÙNG CẮT LỖ ── */}
          <div className="rounded-lg border border-[#ef444440] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#ef444418]">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#ef4444]" />
              <span className="font-bold text-red-400">✂ VÙNG CẮT LỖ (dải đỏ) — phản ứng ngay</span>
              <span className="ml-auto text-red-500/70">Bắt buộc khi nến đóng cửa dưới vùng</span>
            </div>
            <div className="grid grid-cols-[148px_1fr_110px] bg-[#080f1c] px-3 py-1 gap-3 text-muted font-semibold uppercase tracking-wider" style={{ fontSize: 9 }}>
              <p>Đường / Trạng thái</p><p>Tín hiệu</p><p>Hành động</p>
            </div>
            <div className="divide-y divide-[#ef444418]">
              {([
                { line: 'Giá đóng cửa dưới SMA200', lc: '#ec4899', sig: 'Mất hỗ trợ dài hạn quan trọng nhất — xu hướng chuyển sang giảm dài hạn', act: 'Cắt 100% ngay', ac: '#f87171' },
                { line: 'SMA20 cắt dưới SMA50 (Death Cross)', lc: '#f5a623', sig: 'Đảo chiều trung hạn xác nhận — áp lực bán sẽ còn leo thang', act: 'Cắt 70–100%', ac: '#f87171' },
                { line: 'BB Lower trong vùng đỏ', lc: '#a855f7', sig: 'Giá thủng BB Lower khi trong vùng cắt lỗ — panic sell đang xảy ra', act: 'Cắt ngay', ac: '#f87171' },
                { line: 'SMA20 vẫn trên SMA50', lc: '#6b7280', sig: 'Xu hướng ngắn hạn chưa bị phá hoàn toàn — có thể là retest giả', act: 'Chờ 1 phiên đóng cửa', ac: '#fbbf24' },
              ] as { line: string; lc: string; sig: string; act: string; ac: string }[]).map(({ line, lc, sig, act, ac }) => (
                <div key={line} className="grid grid-cols-[148px_1fr_110px] bg-[#0b1220] px-3 py-1.5 gap-3 items-start">
                  <p className="font-semibold leading-relaxed" style={{ color: lc }}>{line}</p>
                  <p className="text-gray-400 leading-relaxed">{sig}</p>
                  <p className="font-bold leading-relaxed" style={{ color: ac }}>→ {act}</p>
                </div>
              ))}
            </div>
            <div className="px-3 py-1.5 bg-[#ef444408] text-red-400/80">
              <span className="font-semibold text-red-400">Nguyên tắc vàng:</span>{' '}
              Đóng cửa dưới vùng đỏ = thoát 100%. Tab VOL cao + MACD đỏ sâu → không cần chờ thêm. Bảo toàn vốn quan trọng hơn mọi kỳ vọng hồi phục.
            </div>
          </div>

          {/* ── Hỗ trợ / Kháng cự ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-[#00d4aa25] bg-[#00d4aa06] px-3 py-2 space-y-1.5">
              <p className="font-bold text-[#00d4aa]">◆ ĐƯỜNG HỖ TRỢ (cyan ---)</p>
              <p className="text-muted leading-relaxed">
                <span className="text-[#3b82f6]">SMA50</span> hoặc <span className="text-[#ec4899]">SMA200</span> gần đường hỗ trợ
                → <span className="text-[#00d4aa]">double support, bounce mạnh → mua thêm 10–15%</span>
              </p>
              <p className="text-muted leading-relaxed">
                <span className="text-[#a855f7]">BB Middle</span> gần hỗ trợ
                → <span className="text-[#00d4aa]">dynamic support, giữ nguyên vị thế</span>
              </p>
              <p className="text-gray-500">⚠ Giá phá dưới hỗ trợ + VOL cao → thoát ngay</p>
            </div>
            <div className="rounded-lg border border-[#f9731625] bg-[#f9731606] px-3 py-2 space-y-1.5">
              <p className="font-bold text-[#f97316]">◆ ĐƯỜNG KHÁNG CỰ (cam ---)</p>
              <p className="text-muted leading-relaxed">
                <span className="text-[#a855f7]">BB Upper</span> gần kháng cự
                → <span className="text-[#f97316]">kháng cự kép rất mạnh → chốt 20–30%</span>
              </p>
              <p className="text-muted leading-relaxed">
                <span className="text-[#f5a623]">SMA20</span> hướng lên + VOL cao khi phá qua
                → <span className="text-[#f97316]">breakout xác nhận → giữ hoặc mua thêm</span>
              </p>
              <p className="text-gray-500">⚠ VOL thấp khi chạm kháng cự → chưa phá, chờ</p>
            </div>
          </div>

          {/* ── Tip theo khuyến nghị ── */}
          <div className="flex items-start gap-2 rounded-lg px-3 py-2 leading-relaxed"
               style={{ background: recColor + '0d', border: `1px solid ${recColor}28` }}>
            <span className="flex-shrink-0 mt-0.5">💡</span>
            <p className="text-gray-300">
              <span className="font-bold" style={{ color: recColor }}>{symbol} — {overlays.recommendation}:</span>{' '}
              {overlays.recommendation === 'MUA MẠNH' && 'Chờ giá về vùng xanh có SMA50 hoặc SMA200 đi qua — đó là cơ hội mua tốt nhất. SMA200 trong vùng xanh + RSI < 50 + VOL tăng → mua 50%. Đặt stop ngay tại vùng đỏ.'}
              {overlays.recommendation === 'MUA' && 'Chờ vùng xanh có SMA20 hoặc SMA50 bên trong. RSI 35–50 + VOL cao hơn trung bình → mua 30% lần 1. Tránh mua khi tất cả SMA đều đang trên giá.'}
              {overlays.recommendation === 'GIỮ' && 'Theo dõi vùng đỏ: SMA20 cắt xuống dưới SMA50 trong vùng đỏ → cắt ngay. Theo dõi vùng vàng: BB Upper chạm vùng vàng → chốt 30–40%.'}
              {overlays.recommendation === 'BÁN' && 'Không mua thêm. Ưu tiên chốt khi BB Upper tiếp cận vùng vàng. Nếu giá đóng cửa dưới SMA200 → cắt lỗ toàn bộ ngay lập tức.'}
              {overlays.recommendation === 'BÁN MẠNH' && 'Thoát ngay nếu chưa thoát — không cần kiểm tra thêm điều kiện. Đứng ngoài đến khi giá về vùng xanh có SMA200 đi qua + RSI < 35.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Sub-pane tabs + canvas ── */}
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
            <canvas ref={subCanvasRef} className="w-full" style={{ height: 90, display: 'block' }} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
