'use client'

import { useState } from 'react'
import type { PortfolioHolding } from '@/types'
import { Bot, X, Loader2 } from 'lucide-react'

interface OptimizeModalProps {
  holdings: PortfolioHolding[]
  prices: Record<string, number>
}

interface OptimizeResult {
  analysis: string
  suggestions: string[]
  rebalancePlan: string
}

export default function OptimizeModal({ holdings, prices }: OptimizeModalProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<OptimizeResult | null>(null)
  const [error, setError] = useState('')

  const handleOptimize = async () => {
    if (holdings.length === 0) return
    setLoading(true)
    setError('')
    setResult(null)

    const holdingsWithPrice = holdings.map((h) => ({
      symbol: h.symbol,
      qty: h.qty,
      avgCost: h.avg_cost,
      currentPrice: prices[h.symbol] || h.avg_cost,
    }))

    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: holdingsWithPrice }),
      })
      if (!res.ok) throw new Error('Optimization failed')
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); handleOptimize() }}
        disabled={holdings.length === 0}
        className="btn-primary flex items-center gap-2 disabled:opacity-50"
      >
        <Bot className="w-4 h-4" />
        AI Tối Ưu Danh Mục
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card-glass w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Bot className="w-5 h-5 text-accent" />
                AI Phân Tích Danh Mục
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="text-muted hover:text-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {loading && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="w-8 h-8 text-accent animate-spin" />
                  <p className="text-muted text-sm">AI đang phân tích danh mục...</p>
                </div>
              )}

              {error && (
                <div className="text-danger text-sm text-center py-4">{error}</div>
              )}

              {result && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-accent mb-2">Nhận Xét Tổng Quan</h4>
                    <p className="text-sm text-gray-300 leading-relaxed">{result.analysis}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gold mb-2">Gợi Ý</h4>
                    <ul className="space-y-2">
                      {result.suggestions.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-accent mt-0.5 flex-shrink-0">→</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-blue-400 mb-2">Kế Hoạch Tái Cơ Cấu</h4>
                    <p className="text-sm text-gray-300 leading-relaxed bg-surface2 rounded-lg p-4">
                      {result.rebalancePlan}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
