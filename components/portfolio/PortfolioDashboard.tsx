'use client'

import { useState } from 'react'
import { formatVND, formatPct, getChangeColor } from '@/lib/utils'
import type { PortfolioHolding, Balance } from '@/types'
import { Wallet, TrendingUp, TrendingDown, Banknote, Pencil, Check, X } from 'lucide-react'

interface PortfolioDashboardProps {
  holdings: PortfolioHolding[]
  balance: Balance
  prices: Record<string, number>
  onUpdateCash?: (amount: number) => Promise<void>
}

function parseVND(val: string): number {
  return parseFloat(val.replace(/[^\d]/g, '')) || 0
}

export default function PortfolioDashboard({
  holdings,
  balance,
  prices,
  onUpdateCash,
}: PortfolioDashboardProps) {
  const [editingCash, setEditingCash] = useState(false)
  const [cashInput, setCashInput] = useState('')
  const [saving, setSaving] = useState(false)

  const portfolioValue = holdings.reduce((sum, h) => {
    const price = prices[h.symbol] || h.avg_cost
    return sum + h.qty * price
  }, 0)

  const totalCost = holdings.reduce((sum, h) => sum + h.total_cost, 0)
  const totalPnl = portfolioValue - totalCost
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0
  const totalAssets = balance.cash + portfolioValue

  const handleEditCash = () => {
    setCashInput(Math.round(balance.cash).toString())
    setEditingCash(true)
  }

  const handleSaveCash = async () => {
    if (!onUpdateCash) return
    const amount = parseVND(cashInput)
    if (amount < 0) return
    setSaving(true)
    try {
      await onUpdateCash(amount)
      setEditingCash(false)
    } finally {
      setSaving(false)
    }
  }

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

      {/* Tiền Mặt — editable */}
      <div className="card-glass p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-muted text-sm">
            <Banknote className="w-4 h-4" />
            Tiền Mặt
          </div>
          {onUpdateCash && !editingCash && (
            <button
              onClick={handleEditCash}
              className="text-muted hover:text-accent transition-colors"
              title="Cập nhật số dư"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {editingCash ? (
          <div className="space-y-2">
            <input
              type="text"
              value={Number(cashInput).toLocaleString('vi-VN')}
              onChange={(e) => setCashInput(e.target.value.replace(/\./g, '').replace(/[^\d]/g, ''))}
              className="input-dark w-full text-sm font-medium"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveCash}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-accent/20 hover:bg-accent/30 text-accent rounded-lg text-xs font-medium transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
              <button
                onClick={() => setEditingCash(false)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-surface2 hover:bg-border text-muted rounded-lg text-xs transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Hủy
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold">{formatVND(balance.cash)}</div>
            <div className="text-xs text-muted mt-1">
              {totalAssets > 0
                ? `${((balance.cash / totalAssets) * 100).toFixed(1)}% tổng TS`
                : '100%'}
            </div>
          </>
        )}
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
