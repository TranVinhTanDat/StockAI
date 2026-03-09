'use client'

import { useEffect, useRef, useState } from 'react'
import type { HistoryData } from '@/types'

interface CandlestickChartProps {
  symbol: string
}

export default function CandlestickChart({ symbol }: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof import('lightweight-charts').createChart> | null>(null)
  const resizeHandlerRef = useRef<(() => void) | null>(null)
  const [data, setData] = useState<HistoryData | null>(null)
  const [days, setDays] = useState(90)
  const [loading, setLoading] = useState(false)
  const [showSMA20, setShowSMA20] = useState(true)
  const [showSMA50, setShowSMA50] = useState(true)
  const [showBB, setShowBB] = useState(false)
  const [activePane, setActivePane] = useState<'volume' | 'rsi' | 'macd'>('volume')

  useEffect(() => {
    if (!symbol) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/history?symbol=${symbol}&days=${days}`)
      .then((r) => {
        if (!r.ok) throw new Error('Fetch failed')
        return r.json()
      })
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [symbol, days])

  useEffect(() => {
    if (!data?.candles?.length || !chartContainerRef.current) return

    // Clean up previous resize handler
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
        width: container.clientWidth,
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

      // Helper to safely map indicator to chart data
      const mapIndicator = (values: number[]) =>
        values
          .map((v, i) => ({
            time: i < data.candles.length ? (data.candles[i].time as string) : '',
            value: v,
          }))
          .filter((d) => !isNaN(d.value) && d.time)

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
            .filter((d) => !isNaN(d.value) && d.time)

        const upper = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, lineStyle: 2, priceLineVisible: false })
        const lower = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, lineStyle: 2, priceLineVisible: false })
        const mid = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, priceLineVisible: false })
        upper.setData(mapBB((v) => v.upper))
        lower.setData(mapBB((v) => v.lower))
        mid.setData(mapBB((v) => v.middle))
      }

      chart.timeScale().fitContent()

      // Resize handler — stored in ref for proper cleanup
      const handleResize = () => {
        const el = chartContainerRef.current
        if (el && chartRef.current) {
          chartRef.current.applyOptions({ width: el.clientWidth })
        }
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
  }, [data, showSMA20, showSMA50, showBB])

  const renderSubPane = () => {
    if (!data?.candles?.length) return null

    if (activePane === 'rsi') {
      const rsiValues = (data.indicators?.rsi || []).filter((v) => !isNaN(v))
      const latest = rsiValues[rsiValues.length - 1]
      return (
        <div className="p-4">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted">RSI(14):</span>
            <span className={`font-medium ${latest > 70 ? 'text-danger' : latest < 30 ? 'text-accent' : 'text-gray-100'}`}>
              {latest?.toFixed(1) || '---'}
            </span>
            <span className="text-xs text-muted">
              {latest > 70 ? 'Quá mua' : latest < 30 ? 'Quá bán' : 'Trung lập'}
            </span>
          </div>
          <div className="mt-2 h-2 bg-surface2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${latest > 70 ? 'bg-danger' : latest < 30 ? 'bg-accent' : 'bg-blue-400'}`}
              style={{ width: `${latest || 50}%` }}
            />
          </div>
        </div>
      )
    }

    if (activePane === 'macd') {
      const macdValues = (data.indicators?.macd || []).filter((v) => !isNaN(v.macd))
      const latest = macdValues[macdValues.length - 1]
      return (
        <div className="p-4">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted">MACD:</span>
            <span className="font-medium text-accent">{latest?.macd?.toFixed(0) || '---'}</span>
            <span className="text-muted">Signal:</span>
            <span className="font-medium text-danger">{latest?.signal?.toFixed(0) || '---'}</span>
            <span className="text-muted">Hist:</span>
            <span className={`font-medium ${(latest?.histogram || 0) >= 0 ? 'text-accent' : 'text-danger'}`}>
              {latest?.histogram?.toFixed(0) || '---'}
            </span>
          </div>
        </div>
      )
    }

    // Volume
    const latestCandle = data.candles[data.candles.length - 1]
    return (
      <div className="p-4">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted">Volume:</span>
          <span className="font-medium">
            {latestCandle?.volume?.toLocaleString('vi-VN') || '---'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="card-glass overflow-hidden">
      <div className="p-4 border-b border-border flex flex-wrap items-center gap-2">
        <h3 className="font-semibold mr-4">Biểu Đồ {symbol}</h3>
        <div className="flex gap-1">
          {[
            { label: '1T', value: 30 },
            { label: '3T', value: 90 },
            { label: '6T', value: 180 },
            { label: '1N', value: 365 },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                days === opt.value
                  ? 'bg-accent text-bg'
                  : 'bg-surface2 text-muted hover:text-gray-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
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

      {loading ? (
        <div className="h-[400px] flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      ) : (
        <div ref={chartContainerRef} className="w-full" />
      )}

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
        {renderSubPane()}
      </div>
    </div>
  )
}
