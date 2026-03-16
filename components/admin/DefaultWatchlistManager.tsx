'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthContext } from '@/components/auth/AuthContext'
import { List, Plus, Trash2, RefreshCw, Star } from 'lucide-react'

interface WatchlistItem {
  id: string
  symbol: string
  sort_order: number
  added_at: string
}

export default function DefaultWatchlistManager() {
  const { token } = useAuthContext()
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/default-watchlist')
      const data = await res.json()
      setItems(data.items ?? [])
    } catch {
      setError('Không thể tải danh sách')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const addSymbol = async () => {
    const sym = input.trim().toUpperCase()
    if (!sym) return
    setAdding(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/admin/default-watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ symbol: sym }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Lỗi thêm'); return }
      setItems(prev => [...prev, data.item])
      setInput('')
      setSuccess(`Đã thêm ${sym}`)
      setTimeout(() => setSuccess(''), 2500)
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setAdding(false)
    }
  }

  const removeItem = async (id: string, sym: string) => {
    setError('')
    try {
      const res = await fetch(`/api/admin/default-watchlist?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Lỗi xóa'); return }
      setItems(prev => prev.filter(i => i.id !== id))
      setSuccess(`Đã xóa ${sym}`)
      setTimeout(() => setSuccess(''), 2500)
    } catch {
      setError('Lỗi kết nối')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Star className="w-4 h-4 text-gold" />
        <h2 className="text-sm font-semibold text-gray-100">Watchlist mặc định</h2>
        <span className="text-xs text-muted ml-1">(auto-copy khi user mới đăng nhập)</span>
        <button
          onClick={fetchItems}
          className="ml-auto p-1.5 hover:text-accent text-muted transition-colors"
          title="Làm mới"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Add form */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <List className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
          <input
            type="text"
            placeholder="Thêm mã CK (VD: VNM)"
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && addSymbol()}
            className="w-full pl-8 pr-3 py-2 bg-bg border border-border/60 rounded-xl text-sm text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent font-mono"
          />
        </div>
        <button
          onClick={addSymbol}
          disabled={adding || !input.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent text-bg rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Thêm
        </button>
      </div>

      {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
      {success && <p className="text-xs text-green-400 bg-green-400/10 rounded-lg px-3 py-2">{success}</p>}

      {/* Items list */}
      {loading ? (
        <div className="flex items-center justify-center h-16 text-muted text-sm">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Đang tải…
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted italic text-center py-4">Chưa có mã nào. User mới sẽ dùng watchlist mặc định (FPT, VNM…)</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center justify-between px-3 py-2 bg-bg border border-border/40 rounded-xl group"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted/60 w-4 text-right">{idx + 1}</span>
                <span className="font-mono text-sm font-semibold text-gray-100">{item.symbol}</span>
              </div>
              <button
                onClick={() => removeItem(item.id, item.symbol)}
                className="p-1 text-muted hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Xóa"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
