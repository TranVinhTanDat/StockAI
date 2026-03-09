'use client'

import { formatVND, formatPct, getChangeColor } from '@/lib/utils'
import type { PortfolioHolding, Balance } from '@/types'
import { Wallet, TrendingUp, TrendingDown, Banknote } from 'lucide-react'

interface PortfolioDashboardProps {
  holdings: PortfolioHolding[]
  balance: Balance
  prices: Record<string, number>
}

export default function PortfolioDashboard({
  holdings,
  balance,
  prices,
}: PortfolioDashboardProps) {
  const portfolioValue = holdings.reduce((sum, h) => {
    const price = prices[h.symbol] || h.avg_cost
    return sum + h.qty * price
  }, 0)

  const totalCost = holdings.reduce((sum, h) => sum + h.total_cost, 0)
  const totalPnl = portfolioValue - totalCost
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0
  const totalAssets = balance.cash + portfolioValue

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="card-glass p-5">
        <div className="flex items-center gap-2 text-muted text-sm mb-2">
          <Wallet className="w-4 h-4" />
          Tổng Tài Sản
        </div>
        <div className="text-2xl font-bold">{formatVND(totalAssets)}</div>
        <div className="text-xs text-muted mt-1">
          CP: {formatVND(portfolioValue)} + Tiền: {formatVND(balance.cash)}
        </div>
      </div>

      <div className="card-glass p-5">
        <div className="flex items-center gap-2 text-muted text-sm mb-2">
          {totalPnl >= 0 ? (
            <TrendingUp className="w-4 h-4 text-accent" />
          ) : (
            <TrendingDown className="w-4 h-4 text-danger" />
          )}
          Lãi/Lỗ
        </div>
        <div className={`text-2xl font-bold ${getChangeColor(totalPnl)}`}>
          {totalPnl >= 0 ? '+' : ''}
          {formatVND(totalPnl)}
        </div>
        <div className={`text-sm ${getChangeColor(totalPnlPct)}`}>
          {formatPct(totalPnlPct)}
        </div>
      </div>

      <div className="card-glass p-5">
        <div className="flex items-center gap-2 text-muted text-sm mb-2">
          <Banknote className="w-4 h-4" />
          Tiền Mặt
        </div>
        <div className="text-2xl font-bold">{formatVND(balance.cash)}</div>
        <div className="text-xs text-muted mt-1">
          {totalAssets > 0
            ? `${((balance.cash / totalAssets) * 100).toFixed(1)}% tổng TS`
            : '100%'}
        </div>
      </div>

      <div className="card-glass p-5">
        <div className="flex items-center gap-2 text-muted text-sm mb-2">
          <BarChart3Icon />
          Số Mã Đang Giữ
        </div>
        <div className="text-2xl font-bold">{holdings.length}</div>
        <div className="text-xs text-muted mt-1">
          Vốn đầu tư: {formatVND(totalCost)}
        </div>
      </div>
    </div>
  )
}

function BarChart3Icon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="M7 16h2v-4H7z" /><path d="M11 16h2V8h-2z" /><path d="M15 16h2v-6h-2z" />
    </svg>
  )
}
