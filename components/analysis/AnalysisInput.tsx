'use client'

import { useState, useRef, useEffect } from 'react'
import { POPULAR_SYMBOLS } from '@/lib/utils'
import { Search, Sparkles } from 'lucide-react'

interface AnalysisInputProps {
  onAnalyze: (symbol: string) => void
  isLoading: boolean
  initialSymbol?: string
}

export default function AnalysisInput({
  onAnalyze,
  isLoading,
  initialSymbol,
}: AnalysisInputProps) {
  const [input, setInput] = useState(initialSymbol || '')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (initialSymbol) {
      setInput(initialSymbol)
    }
  }, [initialSymbol])

  const filtered = POPULAR_SYMBOLS.filter((s) =>
    s.includes(input.toUpperCase())
  ).slice(0, 8)

  const handleSubmit = () => {
    const symbol = input.trim().toUpperCase()
    if (symbol && !isLoading) {
      onAnalyze(symbol)
      setShowSuggestions(false)
    }
  }

  return (
    <div className="relative max-w-xl mx-auto">
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value.toUpperCase())
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Nhập mã cổ phiếu: FPT, VNM, HPG..."
            className="input-dark w-full pl-12 pr-4 py-3.5 text-base"
            maxLength={10}
            disabled={isLoading}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={isLoading || !input.trim()}
          className="btn-primary py-3.5 px-6 flex items-center gap-2 text-base disabled:opacity-50 whitespace-nowrap"
        >
          <Sparkles className="w-5 h-5" />
          {isLoading ? 'Đang phân tích...' : 'Phân Tích AI'}
        </button>
      </div>

      {showSuggestions && filtered.length > 0 && input.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-xl z-10 overflow-hidden">
          {filtered.map((s) => (
            <button
              key={s}
              onMouseDown={() => {
                if (isLoading) return
                setInput(s)
                setShowSuggestions(false)
                onAnalyze(s)
              }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface2 transition-colors flex items-center gap-2"
            >
              <span className="font-semibold text-gray-100">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
