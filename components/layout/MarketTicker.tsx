'use client'

import { useMultiQuote } from '@/hooks/useQuote'
import { formatVND, formatPct, getChangeColor } from '@/lib/utils'
import { POPULAR_SYMBOLS } from '@/lib/utils'

const TICKER_SYMBOLS = POPULAR_SYMBOLS.slice(0, 10)

export default function MarketTicker() {
  const { quotes, isLoading } = useMultiQuote(TICKER_SYMBOLS)

  if (isLoading) {
    return (
      <div className="bg-surface2/50 border-b border-border h-8 flex items-center overflow-hidden">
        <div className="animate-pulse flex gap-8 px-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-3 w-24 bg-border rounded" />
          ))}
        </div>
      </div>
    )
  }

  const items = TICKER_SYMBOLS.map((s) => quotes[s]).filter(Boolean)
  if (items.length === 0) return null

  return (
    <div className="bg-surface2/50 border-b border-border h-8 overflow-hidden">
      <div className="animate-ticker flex items-center h-full whitespace-nowrap">
        {[...items, ...items].map((q, i) => (
          <span key={`${q.symbol}-${i}`} className="inline-flex items-center gap-1.5 px-4 text-xs font-medium">
            <span className="text-gray-300 font-semibold">{q.symbol}</span>
            <span className="text-gray-400">{formatVND(q.price)}</span>
            <span className={getChangeColor(q.changePct)}>
              {formatPct(q.changePct)}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
