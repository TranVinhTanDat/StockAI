'use client'

import { useState, useEffect, useRef } from 'react'
import { formatVND } from '@/lib/utils'
import { ShoppingCart, RefreshCw } from 'lucide-react'

interface TradeFormProps {
  onBuy: (symbol: string, qty: number, price: number) => Promise<void>
  onSell: (symbol: string, qty: number, price: number) => Promise<void>
  cash: number
  initialSymbol?: string | null
  initialType?: 'BUY' | 'SELL'
}

function toDisplayPrice(n: number): string {
  if (!n) return ''
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function parseDisplayPrice(val: string): number {
  return parseFloat(val.replace(/\./g, '')) || 0
}

export default function TradeForm({ onBuy, onSell, cash, initialSymbol, initialType }: TradeFormProps) {
  const [symbol, setSymbol] = useState(initialSymbol || '')
  const [qty, setQty] = useState('')
  const [priceInput, setPriceInput] = useState('')
  const [type, setType] = useState<'BUY' | 'SELL'>(initialType || 'BUY')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fetchingPrice, setFetchingPrice] = useState(false)
  const userEdited = useRef(false)

  useEffect(() => {
    if (initialSymbol) {
      setSymbol(initialSymbol)
      setType(initialType || 'SELL')
    }
  }, [initialSymbol, initialType])

  // Auto-fetch market price when symbol changes (only if user hasn't manually edited)
  useEffect(() => {
    if (symbol.length < 2) {
      if (!userEdited.current) setPriceInput('')
      return
    }
    userEdited.current = false
    const timer = setTimeout(async () => {
      setFetchingPrice(true)
      try {
        const res = await fetch(`/api/quote?symbol=${symbol}`)
        if (res.ok) {
          const data = await res.json()
          if (data.price && !userEdited.current) setPriceInput(toDisplayPrice(data.price))
        }
      } catch { /* ignore */ }
      finally { setFetchingPrice(false) }
    }, 500)
    return () => clearTimeout(timer)
  }, [symbol])

  const price = parseDisplayPrice(priceInput)
  const qtyNum = parseInt(qty) || 0
  const fee = type === 'BUY' ? price * qtyNum * 0.0015 : price * qtyNum * 0.0025
  const tax = type === 'SELL' ? price * qtyNum * 0.001 : 0
  const total = type === 'BUY' ? price * qtyNum + fee : price * qtyNum - fee - tax

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\./g, '').replace(/[^\d]/g, '')
    userEdited.current = true
    setPriceInput(raw ? Number(raw).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')
  }

  const fetchMarketPrice = async () => {
    if (symbol.length < 2) return
    setFetchingPrice(true)
    userEdited.current = false
    try {
      const res = await fetch(`/api/quote?symbol=${symbol}`)
      if (res.ok) {
        const data = await res.json()
        if (data.price) setPriceInput(toDisplayPrice(data.price))
      }
    } catch { /* ignore */ }
    finally { setFetchingPrice(false) }
  }

  const handleSubmit = async () => {
    if (!symbol || qtyNum <= 0 || price <= 0) return
    setError('')
    setLoading(true)
    try {
      if (type === 'BUY') await onBuy(symbol, qtyNum, price)
      else await onSell(symbol, qtyNum, price)
      setSymbol('')
      setQty('')
      setPriceInput('')
      userEdited.current = false
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi giao dịch')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card-glass p-5">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <ShoppingCart className="w-4 h-4 text-accent" />
        Giao Dịch
      </h3>

      <div className="space-y-3">
        <div className="flex gap-2">
          <button onClick={() => setType('BUY')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              type === 'BUY' ? 'bg-accent text-bg' : 'bg-surface2 text-muted hover:text-gray-100'
            }`}>
            MUA
          </button>
          <button onClick={() => setType('SELL')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              type === 'SELL' ? 'bg-danger text-white' : 'bg-surface2 text-muted hover:text-gray-100'
            }`}>
            BÁN
          </button>
        </div>

        <div>
          <label className="text-xs text-muted mb-1 block">Mã CP</label>
          <input type="text" value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="VD: FPT" className="input-dark w-full text-sm" maxLength={10} />
        </div>

        <div>
          <label className="text-xs text-muted mb-1 block">Số lượng</label>
          <input type="number" value={qty} onChange={(e) => setQty(e.target.value)}
            placeholder="100" className="input-dark w-full text-sm" min={1} step={100} />
        </div>

        {/* Editable price — auto-filled from market but overridable for historical prices */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-muted">Giá (VNĐ)</label>
            <button onClick={fetchMarketPrice} disabled={fetchingPrice || symbol.length < 2}
              className="flex items-center gap-1 text-[10px] text-accent hover:text-accent/80 disabled:opacity-40 transition-colors">
              <RefreshCw className={`w-3 h-3 ${fetchingPrice ? 'animate-spin' : ''}`} />
              {fetchingPrice ? 'Đang lấy...' : 'Lấy giá TT'}
            </button>
          </div>
          <input type="text" value={priceInput} onChange={handlePriceChange}
            placeholder="Tự động từ thị trường hoặc nhập giá lịch sử"
            className="input-dark w-full text-sm" inputMode="numeric" />
          <p className="text-[10px] text-muted/50 mt-0.5">Nhập giá lịch sử để ghi nhận đúng giá vốn</p>
        </div>

        {price > 0 && qtyNum > 0 && (
          <div className="bg-surface2 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Giá trị GD:</span>
              <span className="font-medium">{formatVND(price * qtyNum)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Phí {type === 'BUY' ? '0,15%' : '0,25%'}:</span>
              <span>{formatVND(fee)}</span>
            </div>
            {tax > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">Thuế 0,1%:</span>
                <span>{formatVND(tax)}</span>
              </div>
            )}
            <div className="flex justify-between font-medium border-t border-border pt-1 mt-1">
              <span>Tổng {type === 'BUY' ? 'trả' : 'nhận'}:</span>
              <span className={type === 'BUY' ? 'text-danger' : 'text-accent'}>{formatVND(total)}</span>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        <button onClick={handleSubmit}
          disabled={loading || !symbol || qtyNum <= 0 || price <= 0}
          className={`w-full py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${
            type === 'BUY' ? 'btn-primary' : 'btn-danger'
          }`}>
          {loading ? 'Đang xử lý...' : `${type === 'BUY' ? 'Mua' : 'Bán'} ${symbol || '...'}`}
        </button>

        <p className="text-xs text-muted text-center">Tiền mặt: {formatVND(cash)}</p>
      </div>
    </div>
  )
}
