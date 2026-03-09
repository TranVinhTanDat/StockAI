'use client'

import type { PortfolioHolding } from '@/types'
import { formatVND, formatPct, getChangeColor } from '@/lib/utils'

interface HoldingsTableProps {
  holdings: PortfolioHolding[]
  prices: Record<string, number>
  onSell?: (symbol: string) => void
}

export default function HoldingsTable({
  holdings,
  prices,
  onSell,
}: HoldingsTableProps) {
  if (holdings.length === 0) {
    return (
      <div className="card-glass p-8 text-center text-muted">
        <p className="text-sm">Chưa có cổ phiếu trong danh mục</p>
        <p className="text-xs mt-1">Mua cổ phiếu để bắt đầu</p>
      </div>
    )
  }

  return (
    <div className="card-glass overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold">Danh Mục Đầu Tư</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted text-xs uppercase">
              <th className="px-4 py-3 text-left">Mã</th>
              <th className="px-4 py-3 text-right">SL</th>
              <th className="px-4 py-3 text-right">Giá vốn</th>
              <th className="px-4 py-3 text-right">Giá TT</th>
              <th className="px-4 py-3 text-right">Lãi/Lỗ</th>
              <th className="px-4 py-3 text-right">%</th>
              <th className="px-4 py-3 text-center w-20" />
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const currentPrice = prices[h.symbol] || h.avg_cost
              const value = h.qty * currentPrice
              const pnl = value - h.total_cost
              const pnlPct =
                h.total_cost > 0 ? (pnl / h.total_cost) * 100 : 0

              return (
                <tr
                  key={h.symbol}
                  className="border-b border-border/50 hover:bg-surface2/50 transition-colors"
                >
                  <td className="px-4 py-3 font-semibold">{h.symbol}</td>
                  <td className="px-4 py-3 text-right">
                    {h.qty.toLocaleString('vi-VN')}
                  </td>
                  <td className="px-4 py-3 text-right text-muted">
                    {formatVND(h.avg_cost)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatVND(currentPrice)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${getChangeColor(pnl)}`}
                  >
                    {pnl >= 0 ? '+' : ''}
                    {formatVND(pnl)}
                  </td>
                  <td className={`px-4 py-3 text-right ${getChangeColor(pnlPct)}`}>
                    {formatPct(pnlPct)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => onSell?.(h.symbol)}
                      className="text-xs text-danger hover:text-danger/80 font-medium transition-colors"
                    >
                      Bán
                    </button>
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
