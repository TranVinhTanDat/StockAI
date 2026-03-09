'use client'

import { useState } from 'react'
import { formatVND } from '@/lib/utils'
import { Calculator } from 'lucide-react'

export default function FeeCalculator() {
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState('')
  const [type, setType] = useState<'BUY' | 'SELL'>('BUY')

  const p = parseFloat(price) || 0
  const q = parseInt(qty) || 0
  const value = p * q

  const buyFee = value * 0.0015
  const sellFee = value * 0.0025
  const sellTax = value * 0.001
  const totalBuy = value + buyFee
  const totalSell = value - sellFee - sellTax

  return (
    <div className="space-y-4">
      <h3 className="font-semibold flex items-center gap-2">
        <Calculator className="w-4 h-4 text-accent" />
        Tính Phí Giao Dịch
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted mb-1 block">Giá (VNĐ)</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="85000"
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
      </div>

      {value > 0 && (
        <div className="bg-surface2 rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Giá trị GD:</span>
            <span className="font-medium">{formatVND(value)}</span>
          </div>
          <div className="border-t border-border pt-2">
            <p className="text-xs text-accent font-medium mb-1">MUA</p>
            <div className="flex justify-between">
              <span className="text-muted">Phí MG (0.15%):</span>
              <span>{formatVND(buyFee)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Tổng trả:</span>
              <span className="text-danger">{formatVND(totalBuy)}</span>
            </div>
          </div>
          <div className="border-t border-border pt-2">
            <p className="text-xs text-danger font-medium mb-1">BÁN</p>
            <div className="flex justify-between">
              <span className="text-muted">Phí MG (0.25%):</span>
              <span>{formatVND(sellFee)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Thuế (0.1%):</span>
              <span>{formatVND(sellTax)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Tổng nhận:</span>
              <span className="text-accent">{formatVND(totalSell)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
