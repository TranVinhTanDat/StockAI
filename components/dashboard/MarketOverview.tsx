'use client'

import { useEffect, useState } from 'react'
import { formatVND, formatPct, getChangeColor, getChangeBg } from '@/lib/utils'
import type { QuoteData, ExchangeRate } from '@/types'
import { TrendingUp, DollarSign, SmilePlus, Bot } from 'lucide-react'

export default function MarketOverview() {
  const [vnIndex, setVnIndex] = useState<QuoteData | null>(null)
  const [exchange, setExchange] = useState<ExchangeRate | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [quoteRes, exchangeRes] = await Promise.all([
          fetch('/api/quote?symbol=VCB'),
          fetch('/api/exchange'),
        ])
        if (quoteRes.ok) setVnIndex(await quoteRes.json())
        if (exchangeRes.ok) setExchange(await exchangeRes.json())
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

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
      <div className="card-glass p-5">
        <div className="flex items-center gap-2 text-muted text-sm mb-2">
          <TrendingUp className="w-4 h-4" />
          VN-Index (VCB proxy)
        </div>
        {vnIndex ? (
          <>
            <div className="text-2xl font-bold">
              {formatVND(vnIndex.price)}
            </div>
            <div className={`text-sm font-medium ${getChangeColor(vnIndex.changePct)}`}>
              {vnIndex.change > 0 ? '+' : ''}{formatVND(vnIndex.change)} {formatPct(vnIndex.changePct)}
            </div>
          </>
        ) : (
          <div className="text-muted">Không có dữ liệu</div>
        )}
      </div>

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

      <div className="card-glass p-5">
        <div className="flex items-center gap-2 text-muted text-sm mb-2">
          <SmilePlus className="w-4 h-4" />
          Tâm Lý Thị Trường
        </div>
        <div className="text-2xl font-bold">Trung Lập</div>
        <div className="mt-2 h-2 bg-surface2 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-danger via-gold to-accent rounded-full" style={{ width: '55%' }} />
        </div>
      </div>

      <div className="card-glass p-5">
        <div className="flex items-center gap-2 text-muted text-sm mb-2">
          <Bot className="w-4 h-4" />
          AI Hôm Nay
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent" />
            <span className="text-sm">MUA: chờ phân tích</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gold" />
            <span className="text-sm">GIỮ: chờ phân tích</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-danger" />
            <span className="text-sm">BÁN: chờ phân tích</span>
          </div>
        </div>
      </div>
    </div>
  )
}
