'use client'

import { useState } from 'react'
import { formatVND, formatPct } from '@/lib/utils'
import { TrendingUp } from 'lucide-react'

export default function ProfitCalculator() {
  const [buyPrice, setBuyPrice] = useState('')
  const [sellPrice, setSellPrice] = useState('')
  const [qty, setQty] = useState('')
  const [days, setDays] = useState('')

  const bp = parseFloat(buyPrice) || 0
  const sp = parseFloat(sellPrice) || 0
  const q = parseInt(qty) || 0
  const d = parseInt(days) || 0

  const buyValue = bp * q
  const buyFee = buyValue * 0.0015
  const totalBuy = buyValue + buyFee

  const sellValue = sp * q
  const sellFee = sellValue * 0.0025
  const sellTax = sellValue * 0.001
  const totalSell = sellValue - sellFee - sellTax

  const profit = totalSell - totalBuy
  const roi = totalBuy > 0 ? (profit / totalBuy) * 100 : 0
  const annualizedRoi =
    d > 0 && totalBuy > 0
      ? (Math.pow(totalSell / totalBuy, 365 / d) - 1) * 100
      : 0

  return (
    <div className="space-y-4">
      <h3 className="font-semibold flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-accent" />
        Tính Lãi/Lỗ
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted mb-1 block">Giá mua</label>
          <input
            type="number"
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
            placeholder="80000"
            className="input-dark w-full text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Giá bán</label>
          <input
            type="number"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            placeholder="95000"
            className="input-dark w-full text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Số lượng</label>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="100"
            className="input-dark w-full text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Số ngày giữ</label>
          <input
            type="number"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="90"
            className="input-dark w-full text-sm"
          />
        </div>
      </div>

      {bp > 0 && sp > 0 && q > 0 && (
        <div className="bg-surface2 rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Tổng mua (gồm phí):</span>
            <span>{formatVND(totalBuy)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Tổng bán (trừ phí+thuế):</span>
            <span>{formatVND(totalSell)}</span>
          </div>
          <div className="flex justify-between font-medium border-t border-border pt-2">
            <span>Lãi/Lỗ:</span>
            <span className={profit >= 0 ? 'text-accent' : 'text-danger'}>
              {profit >= 0 ? '+' : ''}{formatVND(profit)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">ROI:</span>
            <span className={roi >= 0 ? 'text-accent' : 'text-danger'}>
              {formatPct(roi)}
            </span>
          </div>
          {d > 0 && (
            <div className="flex justify-between">
              <span className="text-muted">ROI quy năm:</span>
              <span className={annualizedRoi >= 0 ? 'text-accent' : 'text-danger'}>
                {formatPct(annualizedRoi)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
