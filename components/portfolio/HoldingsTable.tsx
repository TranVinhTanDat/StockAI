'use client'

import { useState, Fragment } from 'react'
import type { PortfolioHolding } from '@/types'
import { formatVND, formatPct, getChangeColor } from '@/lib/utils'
import { Pencil, Trash2, Check, X } from 'lucide-react'

interface HoldingsTableProps {
  holdings: PortfolioHolding[]
  prices: Record<string, number>
  onSell?: (symbol: string) => void
  onEdit?: (symbol: string, qty: number, avgCost: number) => Promise<void>
  onDelete?: (symbol: string) => Promise<void>
}

function toDisplay(n: number): string {
  if (!n) return ''
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function parseDisplay(val: string): number {
  return parseFloat(val.replace(/\./g, '')) || 0
}

export default function HoldingsTable({ holdings, prices, onSell, onEdit, onDelete }: HoldingsTableProps) {
  const [editSymbol, setEditSymbol] = useState<string | null>(null)
  const [editQty, setEditQty] = useState('')
  const [editCost, setEditCost] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const startEdit = (h: PortfolioHolding) => {
    setEditSymbol(h.symbol)
    setEditQty(String(h.qty))
    setEditCost(toDisplay(h.avg_cost))
  }

  const cancelEdit = () => {
    setEditSymbol(null)
    setEditQty('')
    setEditCost('')
  }

  const saveEdit = async (symbol: string) => {
    if (!onEdit) return
    const qty = parseInt(editQty) || 0
    const avgCost = parseDisplay(editCost)
    if (qty <= 0 || avgCost <= 0) return
    setSaving(true)
    try {
      await onEdit(symbol, qty, avgCost)
      cancelEdit()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (symbol: string) => {
    if (!onDelete) return
    if (!confirm(`Xóa ${symbol} khỏi danh mục?`)) return
    setDeleting(symbol)
    try {
      await onDelete(symbol)
    } finally {
      setDeleting(null)
    }
  }

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
              <th className="px-4 py-3 text-center w-28" />
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const currentPrice = prices[h.symbol] || h.avg_cost
              const value = h.qty * currentPrice
              const pnl = value - h.total_cost
              const pnlPct = h.total_cost > 0 ? (pnl / h.total_cost) * 100 : 0
              const isEditing = editSymbol === h.symbol

              return (
                <Fragment key={h.symbol}>
                  <tr
                    className={`border-b border-border/50 transition-colors ${isEditing ? 'bg-surface2' : 'hover:bg-surface2/50'}`}
                  >
                    <td className="px-4 py-3 font-semibold">{h.symbol}</td>
                    <td className="px-4 py-3 text-right">{h.qty.toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-3 text-right text-muted">{formatVND(h.avg_cost)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatVND(currentPrice)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${getChangeColor(pnl)}`}>
                      {pnl >= 0 ? '+' : ''}{formatVND(pnl)}
                    </td>
                    <td className={`px-4 py-3 text-right ${getChangeColor(pnlPct)}`}>
                      {formatPct(pnlPct)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {onSell && (
                          <button onClick={() => onSell(h.symbol)}
                            className="text-xs text-danger hover:text-danger/80 font-medium transition-colors">
                            Bán
                          </button>
                        )}
                        {onEdit && (
                          <button onClick={() => isEditing ? cancelEdit() : startEdit(h)}
                            className="p-1 text-muted hover:text-accent transition-colors rounded"
                            title="Sửa">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => handleDelete(h.symbol)}
                            disabled={deleting === h.symbol}
                            className="p-1 text-muted hover:text-danger transition-colors rounded disabled:opacity-40"
                            title="Xóa">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Inline edit row */}
                  {isEditing && (
                    <tr className="bg-surface2/80 border-b border-accent/20">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <div>
                            <label className="text-xs text-muted block mb-1">Số lượng mới</label>
                            <input type="number" value={editQty}
                              onChange={(e) => setEditQty(e.target.value)}
                              className="input-dark text-sm w-28" min={1} />
                          </div>
                          <div>
                            <label className="text-xs text-muted block mb-1">Giá vốn TB mới (VNĐ)</label>
                            <input type="text" value={editCost}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/\./g, '').replace(/[^\d]/g, '')
                                setEditCost(raw ? Number(raw).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')
                              }}
                              className="input-dark text-sm w-36" inputMode="numeric" />
                          </div>
                          <div className="flex gap-2 pb-0.5">
                            <button onClick={() => saveEdit(h.symbol)} disabled={saving}
                              className="flex items-center gap-1 bg-accent text-bg text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors">
                              <Check className="w-3.5 h-3.5" />
                              {saving ? 'Đang lưu...' : 'Lưu'}
                            </button>
                            <button onClick={cancelEdit}
                              className="flex items-center gap-1 bg-surface2 text-muted text-xs px-3 py-1.5 rounded-lg hover:text-gray-100 transition-colors">
                              <X className="w-3.5 h-3.5" />
                              Hủy
                            </button>
                          </div>
                          <p className="text-[10px] text-muted/60 w-full">
                            Tổng vốn mới: {formatVND(parseDisplay(editCost) * (parseInt(editQty) || 0))}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
