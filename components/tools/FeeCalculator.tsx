'use client'

import { useState } from 'react'
import { formatVND } from '@/lib/utils'
import { Calculator } from 'lucide-react'

function useDotInput(initial = '') {
  const [val, setVal] = useState(initial)
  const num = parseFloat(val.replace(/\./g, '')) || 0
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\./g, '').replace(/[^\d]/g, '')
    setVal(raw ? Number(raw).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')
  }
  return { val, num, onChange }
}

export default function FeeCalculator() {
  const price = useDotInput()
  const qty = useDotInput()
  const [type] = useState<'both'>('both')

  const p = price.num
  const q = qty.num
  const value = p * q

  const buyFee = value * 0.0015
  const sellFee = value * 0.0025
  const sellTax = value * 0.001
  const totalBuy = value + buyFee
  const totalSell = value - sellFee - sellTax

  void type // suppress unused warning

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
            type="text"
            value={price.val}
            onChange={price.onChange}
            placeholder="85.000"
            className="input-dark w-full text-sm"
            inputMode="numeric"
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Số lượng</label>
          <input
            type="text"
            value={qty.val}
            onChange={qty.onChange}
            placeholder="1.000"
            className="input-dark w-full text-sm"
            inputMode="numeric"
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
              <span className="text-muted">Phí MG (0,15%):</span>
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
              <span className="text-muted">Phí MG (0,25%):</span>
              <span>{formatVND(sellFee)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Thuế (0,1%):</span>
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
