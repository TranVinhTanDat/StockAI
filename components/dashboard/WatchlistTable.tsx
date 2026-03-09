'use client'

import { useState, useCallback } from 'react'
import { useWatchlist } from '@/hooks/useWatchlist'
import { useMultiQuote } from '@/hooks/useQuote'
import {
  formatVND,
  formatPct,
  formatVolume,
  getChangeColor,
  getChangeBg,
} from '@/lib/utils'
import { Star, Search, Plus, X, BarChart3 } from 'lucide-react'

interface WatchlistTableProps {
  onAnalyze?: (symbol: string) => void
}

export default function WatchlistTable({ onAnalyze }: WatchlistTableProps) {
  const { symbols, add, remove, has } = useWatchlist()
  const { quotes, isLoading } = useMultiQuote(symbols)
  const [searchInput, setSearchInput] = useState('')
  const [adding, setAdding] = useState(false)

  const handleAdd = useCallback(async () => {
    const symbol = searchInput.trim().toUpperCase()
    if (!symbol) return
    setAdding(true)
    try {
      const res = await fetch(`/api/quote?symbol=${symbol}`)
      if (res.ok) {
        await add(symbol)
        setSearchInput('')
      } else {
        alert(`Mã ${symbol} không tồn tại`)
      }
    } catch {
      alert('Lỗi khi thêm mã')
    } finally {
      setAdding(false)
    }
  }, [searchInput, add])

  return (
    <div className="card-glass overflow-hidden">
      <div className="p-4 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Bảng Giá Watchlist</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Thêm mã CP..."
              className="input-dark pl-9 pr-3 py-1.5 text-sm w-36"
              maxLength={10}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !searchInput.trim()}
            className="btn-primary py-1.5 px-3 text-sm flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted text-xs uppercase">
              <th className="px-4 py-3 text-left w-10" />
              <th className="px-4 py-3 text-left">Mã</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Tên</th>
              <th className="px-4 py-3 text-right">Giá</th>
              <th className="px-4 py-3 text-right">+/-</th>
              <th className="px-4 py-3 text-right">%</th>
              <th className="px-4 py-3 text-right hidden lg:table-cell">KL</th>
              <th className="px-4 py-3 text-center w-24" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50 animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 w-4 bg-border rounded" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-12 bg-border rounded" /></td>
                  <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 w-24 bg-border rounded" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-20 bg-border rounded ml-auto" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 bg-border rounded ml-auto" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-14 bg-border rounded ml-auto" /></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 w-14 bg-border rounded ml-auto" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 bg-border rounded mx-auto" /></td>
                </tr>
              ))
            ) : symbols.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted">
                  Chưa có mã trong watchlist. Thêm mã để theo dõi.
                </td>
              </tr>
            ) : (
              symbols.map((symbol) => {
                const q = quotes[symbol]
                return (
                  <tr
                    key={symbol}
                    className="border-b border-border/50 hover:bg-surface2/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => remove(symbol)}
                        className="text-gold hover:text-gold/70 transition-colors"
                        title="Xóa khỏi watchlist"
                      >
                        <Star className="w-4 h-4 fill-current" />
                      </button>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-100">
                      {symbol}
                    </td>
                    <td className="px-4 py-3 text-muted hidden md:table-cell truncate max-w-[200px]">
                      {q?.name || '...'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {q ? formatVND(q.price) : '---'}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${q ? getChangeColor(q.change) : ''}`}>
                      {q ? `${q.change > 0 ? '+' : ''}${formatVND(q.change)}` : '---'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {q ? (
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getChangeBg(q.changePct)}`}>
                          {formatPct(q.changePct)}
                        </span>
                      ) : '---'}
                    </td>
                    <td className="px-4 py-3 text-right text-muted hidden lg:table-cell">
                      {q ? formatVolume(q.volume) : '---'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => onAnalyze?.(symbol)}
                        className="text-accent hover:text-accent/80 transition-colors text-xs font-medium flex items-center gap-1 mx-auto"
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        Phân tích
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
