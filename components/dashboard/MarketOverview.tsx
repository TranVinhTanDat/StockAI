'use client'

import { useEffect, useState } from 'react'
import { formatPct, getChangeColor } from '@/lib/utils'
import type { ExchangeRate, MarketIndexData } from '@/types'
import { getAnalyses } from '@/lib/storage'
import { TrendingUp, DollarSign, SmilePlus, Bot } from 'lucide-react'

export default function MarketOverview() {
  const [marketData, setMarketData] = useState<MarketIndexData | null>(null)
  const [exchange, setExchange] = useState<ExchangeRate | null>(null)
  const [aiStats, setAiStats] = useState<{ buy: number; hold: number; sell: number }>({ buy: 0, hold: 0, sell: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [marketRes, exchangeRes] = await Promise.all([
          fetch('/api/market-index'),
          fetch('/api/exchange'),
        ])
        if (marketRes.ok) setMarketData(await marketRes.json())
        if (exchangeRes.ok) setExchange(await exchangeRes.json())

        // Count today's analysis recommendations
        try {
          const analyses = await getAnalyses()
          const today = new Date().toDateString()
          const todayAnalyses = analyses.filter(
            (a) => new Date(a.analyzed_at).toDateString() === today
          )
          const buy = todayAnalyses.filter((a) =>
            a.recommendation.includes('MUA')
          ).length
          const hold = todayAnalyses.filter(
            (a) => a.recommendation === 'GIỮ'
          ).length
          const sell = todayAnalyses.filter((a) =>
            a.recommendation.includes('BÁN')
          ).length
          setAiStats({ buy, hold, sell })
        } catch {
          // silently fail
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }
    load()

    // Auto-refresh every 60s
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [])

  // Calculate sentiment from market breadth
  const sentiment = marketData
    ? (() => {
        const total =
          marketData.breadth.advancing +
          marketData.breadth.declining +
          marketData.breadth.unchanged
        if (total === 0) return 50
        return Math.round((marketData.breadth.advancing / total) * 100)
      })()
    : 50

  const sentimentLabel =
    sentiment >= 65 ? 'Lạc quan 😊' : sentiment >= 40 ? 'Trung Lập 😐' : 'Bi quan 😟'

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-glass p-5 animate-pulse">
            <div className="h-4 w-20 bg-border rounded mb-3" />
            <div className="h-8 w-32 bg-border rounded mb-2" />
            <div className="h-3 w-24 bg-border rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* VN-Index */}
      <div className="card-glass p-5">
        <div className="flex items-center gap-2 text-muted text-sm mb-2">
          <TrendingUp className="w-4 h-4" />
          VN-Index
        </div>
        {marketData ? (
          <>
            <div className="text-2xl font-bold">
              {marketData.vnindex.value.toLocaleString('vi-VN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div
              className={`text-sm font-medium ${getChangeColor(
                marketData.vnindex.changePct
              )}`}
            >
              {marketData.vnindex.change >= 0 ? '+' : ''}
              {marketData.vnindex.change.toFixed(2)}{' '}
              {formatPct(marketData.vnindex.changePct)}
            </div>
          </>
        ) : (
          <div className="text-muted">Không có dữ liệu</div>
        )}
      </div>

      {/* USD/VND */}
      <div className="card-glass p-5">
        <div className="flex items-center gap-2 text-muted text-sm mb-2">
          <DollarSign className="w-4 h-4" />
          USD/VND
        </div>
        {exchange ? (
          <>
            <div className="text-2xl font-bold">
              {exchange.usdVnd.toLocaleString('vi-VN')}
            </div>
            <div className="text-sm text-muted">
              EUR/VND: {Math.round(exchange.eurVnd).toLocaleString('vi-VN')}
            </div>
          </>
        ) : (
          <div className="text-muted">Không có dữ liệu</div>
        )}
      </div>

      {/* Market Sentiment */}
      <div className="card-glass p-5">
        <div className="flex items-center gap-2 text-muted text-sm mb-2">
          <SmilePlus className="w-4 h-4" />
          Tâm Lý Thị Trường
        </div>
        <div className="text-2xl font-bold">{sentimentLabel}</div>
        <div className="mt-2 h-2 bg-surface2 rounded-full overflow-hidden relative">
          <div
            className="absolute inset-0 bg-gradient-to-r from-danger via-gold to-accent rounded-full opacity-30"
          />
          <div
            className="absolute top-0 bottom-0 w-2.5 h-2.5 bg-white rounded-full shadow-lg transition-all duration-500"
            style={{ left: `calc(${sentiment}% - 5px)`, top: '-1px' }}
          />
        </div>
        {marketData && (
          <div className="flex items-center gap-3 mt-2 text-xs text-muted">
            <span className="text-accent">▲ {marketData.breadth.advancing}</span>
            <span>— {marketData.breadth.unchanged}</span>
            <span className="text-danger">▼ {marketData.breadth.declining}</span>
          </div>
        )}
      </div>

      {/* AI Today */}
      <div className="card-glass p-5">
        <div className="flex items-center gap-2 text-muted text-sm mb-2">
          <Bot className="w-4 h-4" />
          AI Hôm Nay
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent" />
            <span className="text-sm">
              MUA: <span className="font-semibold text-accent">{aiStats.buy || '—'}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gold" />
            <span className="text-sm">
              GIỮ: <span className="font-semibold text-gold">{aiStats.hold || '—'}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-danger" />
            <span className="text-sm">
              BÁN: <span className="font-semibold text-danger">{aiStats.sell || '—'}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
