'use client'

import { useEffect, useState } from 'react'
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react'
import { INDUSTRY_MAP } from '@/lib/utils'
import { formatVND } from '@/lib/utils'

interface PeerData {
  symbol: string
  price: number
  changePct: number
  pe: number
  roe: number
  marketCap: number
}

interface Props {
  symbol: string
  industry?: string
}

// Find industry peers from INDUSTRY_MAP
function getPeers(symbol: string, industry: string): string[] {
  return Object.entries(INDUSTRY_MAP)
    .filter(([s, ind]) => ind === industry && s !== symbol)
    .map(([s]) => s)
    .slice(0, 5)
}

export default function IndustryComparison({ symbol, industry }: Props) {
  const [peers, setPeers] = useState<PeerData[]>([])
  const [current, setCurrent] = useState<PeerData | null>(null)
  const [loading, setLoading] = useState(true)

  const resolvedIndustry = industry || INDUSTRY_MAP[symbol] || ''
  const peerSymbols = resolvedIndustry ? getPeers(symbol, resolvedIndustry) : []

  useEffect(() => {
    if (!symbol) return
    const allSymbols = [symbol, ...peerSymbols]
    if (allSymbols.length === 0) { setLoading(false); return }

    setLoading(true)
    Promise.allSettled(
      allSymbols.map((s) =>
        fetch(`/api/quote?symbol=${s}`).then((r) => r.ok ? r.json() : null)
      )
    ).then((results) => {
      const data: PeerData[] = []
      results.forEach((res, i) => {
        if (res.status === 'fulfilled' && res.value && !res.value.error) {
          const q = res.value
          data.push({
            symbol: allSymbols[i],
            price: q.price || 0,
            changePct: q.changePct || 0,
            pe: 0, // Will be enriched if fundamental data available
            roe: 0,
            marketCap: q.marketCap || 0,
          })
        }
      })
      const curr = data.find((d) => d.symbol === symbol)
      const others = data.filter((d) => d.symbol !== symbol)
      setCurrent(curr || null)
      setPeers(others)
    }).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, resolvedIndustry])

  if (!resolvedIndustry || peerSymbols.length === 0) return null

  if (loading) {
    return (
      <div className="card-glass p-4 animate-pulse">
        <div className="h-4 w-48 bg-border rounded mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 bg-border/50 rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (!current && peers.length === 0) return null

  const allData = current ? [current, ...peers] : peers
  const maxPrice = Math.max(...allData.map((d) => d.price))

  return (
    <div className="card-glass overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold flex items-center gap-2 text-sm">
          <BarChart3 className="w-4 h-4 text-accent" />
          So Sánh Cùng Ngành
          <span className="text-xs text-muted font-normal">· {resolvedIndustry}</span>
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Mã</th>
              <th className="px-3 py-2.5 text-right font-medium">Giá</th>
              <th className="px-3 py-2.5 text-right font-medium">% Ngày</th>
              <th className="px-4 py-2.5 text-left font-medium">Biểu giá</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {allData.map((d) => {
              const isTarget = d.symbol === symbol
              const barWidth = maxPrice > 0 ? (d.price / maxPrice) * 100 : 0
              return (
                <tr
                  key={d.symbol}
                  className={`hover:bg-surface2/30 transition-colors ${isTarget ? 'bg-accent/5' : ''}`}
                >
                  <td className="px-4 py-2.5">
                    <span className={`font-semibold text-sm ${isTarget ? 'text-accent' : 'text-gray-200'}`}>
                      {d.symbol}
                    </span>
                    {isTarget && (
                      <span className="ml-1.5 text-[10px] bg-accent/20 text-accent px-1 py-0.5 rounded">
                        đang xem
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                    {formatVND(d.price)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className={`text-xs font-medium flex items-center justify-end gap-0.5 ${d.changePct > 0 ? 'text-accent' : d.changePct < 0 ? 'text-danger' : 'text-gold'}`}>
                      {d.changePct > 0
                        ? <TrendingUp className="w-3 h-3" />
                        : d.changePct < 0
                          ? <TrendingDown className="w-3 h-3" />
                          : null}
                      {d.changePct > 0 ? '+' : ''}{d.changePct.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 w-32">
                    <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isTarget ? 'bg-accent' : 'bg-border'}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
