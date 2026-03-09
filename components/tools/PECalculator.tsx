'use client'

import { useState } from 'react'
import { formatVND } from '@/lib/utils'

const SECTOR_PE: Record<string, number> = {
  'Ngân hàng': 9,
  'Bất động sản': 15,
  'Công nghệ': 22,
  'Tiêu dùng': 18,
  'Thép': 8,
  'Năng lượng': 12,
  'Chứng khoán': 14,
  'Bảo hiểm': 13,
  'Bán lẻ': 20,
  'Dầu khí': 10,
}

export default function PECalculator() {
  const [price, setPrice] = useState('')
  const [eps, setEps] = useState('')
  const [sector, setSector] = useState('Ngân hàng')

  const p = parseFloat(price) || 0
  const e = parseFloat(eps) || 0
  const pe = e > 0 ? p / e : 0
  const sectorPe = SECTOR_PE[sector]
  const fairValue = e * sectorPe
  const diff = fairValue > 0 ? ((p - fairValue) / fairValue) * 100 : 0
  const verdict =
    diff < -20
      ? { text: 'Rất rẻ', color: 'text-accent' }
      : diff < -5
        ? { text: 'Hợp lý', color: 'text-accent' }
        : diff < 15
          ? { text: 'Bình thường', color: 'text-gold' }
          : { text: 'Đắt', color: 'text-danger' }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Tính P/E & Định Giá</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted mb-1 block">Giá thị trường (₫)</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="85000"
            className="input-dark w-full text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">EPS (₫/cổ phiếu)</label>
          <input
            type="number"
            value={eps}
            onChange={(e) => setEps(e.target.value)}
            placeholder="5000"
            className="input-dark w-full text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted mb-1 block">Ngành</label>
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className="input-dark w-full text-sm"
        >
          {Object.keys(SECTOR_PE).map((s) => (
            <option key={s} value={s}>{s} (P/E TB: {SECTOR_PE[s]}x)</option>
          ))}
        </select>
      </div>

      {p > 0 && e > 0 && (
        <div className="bg-surface2 rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">P/E hiện tại:</span>
            <span className="font-bold text-xl">{pe.toFixed(1)}x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">P/E ngành {sector}:</span>
            <span>{sectorPe}x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Giá hợp lý:</span>
            <span className="font-medium">{formatVND(fairValue)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <span className="text-muted">So giá hợp lý:</span>
            <span className={`font-semibold ${diff >= 0 ? 'text-danger' : 'text-accent'}`}>
              {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Nhận xét:</span>
            <span className={`font-semibold ${verdict.color}`}>{verdict.text}</span>
          </div>
        </div>
      )}
    </div>
  )
}
