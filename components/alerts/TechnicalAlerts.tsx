'use client'

import { useState } from 'react'
import { useTechnicalAlerts, type TechnicalSignal } from '@/hooks/useTechnicalAlerts'
import { useWatchlist } from '@/hooks/useWatchlist'
import { POPULAR_SYMBOLS } from '@/lib/utils'
import { Zap, RefreshCw, X, XCircle, Activity, TrendingUp, TrendingDown, BarChart2 } from 'lucide-react'

function getSignalIcon(type: TechnicalSignal['type']) {
  switch (type) {
    case 'RSI_OVERSOLD': return <TrendingUp className="w-4 h-4 text-accent" />
    case 'RSI_OVERBOUGHT': return <TrendingDown className="w-4 h-4 text-danger" />
    case 'MACD_BULLISH': return <TrendingUp className="w-4 h-4 text-accent" />
    case 'MACD_BEARISH': return <TrendingDown className="w-4 h-4 text-danger" />
    case 'VOLUME_SPIKE': return <BarChart2 className="w-4 h-4 text-gold" />
  }
}

function getSignalBadgeStyle(type: TechnicalSignal['type'], strength: TechnicalSignal['strength']) {
  const isBullish = type === 'RSI_OVERSOLD' || type === 'MACD_BULLISH'
  const isNeutral = type === 'VOLUME_SPIKE'
  if (isNeutral) return 'bg-gold/10 border-gold/30 text-gold'
  if (isBullish) return 'bg-accent/10 border-accent/30 text-accent'
  return 'bg-danger/10 border-danger/30 text-danger'
}

function getSignalLabel(type: TechnicalSignal['type']): string {
  switch (type) {
    case 'RSI_OVERSOLD': return 'RSI Quá bán'
    case 'RSI_OVERBOUGHT': return 'RSI Quá mua'
    case 'MACD_BULLISH': return 'MACD Mua'
    case 'MACD_BEARISH': return 'MACD Bán'
    case 'VOLUME_SPIKE': return 'Đột biến KL'
  }
}

interface Props {
  onAnalyze?: (symbol: string) => void
}

export default function TechnicalAlerts({ onAnalyze }: Props) {
  const { symbols: watchlist } = useWatchlist()
  // Combine watchlist + a few popular symbols (deduped, max 10)
  const seen = new Set<string>()
  const symbols: string[] = []
  for (const s of [...watchlist, ...POPULAR_SYMBOLS.slice(0, 6)]) {
    if (!seen.has(s)) { seen.add(s); symbols.push(s) }
    if (symbols.length >= 10) break
  }

  const { signals, checking, lastChecked, runCheck, dismissSignal, dismissAll } = useTechnicalAlerts(symbols)
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="card-glass overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold flex-1 text-left"
        >
          <Activity className="w-4 h-4 text-accent" />
          Tín Hiệu Kỹ Thuật
          {signals.length > 0 && (
            <span className="ml-1.5 px-2 py-0.5 bg-accent/20 text-accent text-xs rounded-full font-bold">
              {signals.length}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2">
          {signals.length > 0 && (
            <button
              onClick={dismissAll}
              className="text-xs text-muted hover:text-danger transition-colors"
            >
              Xóa tất cả
            </button>
          )}
          <button
            onClick={runCheck}
            disabled={checking}
            className="text-muted hover:text-accent transition-colors disabled:opacity-50"
            title="Quét ngay"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div>
          {/* Status bar */}
          <div className="px-4 py-2 border-b border-border/50 bg-surface2/30 flex items-center gap-3 text-xs text-muted">
            <span>
              Theo dõi {symbols.length} mã
            </span>
            {lastChecked && (
              <span className="ml-auto">
                Quét lúc {lastChecked.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {checking && (
              <span className="flex items-center gap-1 text-accent">
                <Zap className="w-3 h-3 animate-pulse" />
                Đang quét...
              </span>
            )}
          </div>

          {/* Signals list */}
          {signals.length === 0 ? (
            <div className="p-6 text-center text-muted">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {checking ? 'Đang phân tích...' : 'Chưa phát hiện tín hiệu kỹ thuật'}
              </p>
              {!checking && (
                <p className="text-xs mt-1 opacity-70">Quét lại sau 5 phút hoặc bấm làm mới</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {signals.map((signal) => (
                <div
                  key={signal.id}
                  className="px-4 py-3 flex items-start gap-3 hover:bg-surface2/30 transition-colors"
                >
                  {/* Icon */}
                  <div className="mt-0.5 shrink-0">{getSignalIcon(signal.type)}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <button
                        onClick={() => onAnalyze?.(signal.symbol)}
                        className="font-bold text-sm hover:text-accent transition-colors"
                      >
                        {signal.symbol}
                      </button>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${getSignalBadgeStyle(signal.type, signal.strength)}`}
                      >
                        {getSignalLabel(signal.type)}
                      </span>
                      {signal.strength === 'strong' && (
                        <span className="text-xs text-gold font-medium">⚡ Mạnh</span>
                      )}
                    </div>
                    <p className="text-xs text-muted leading-snug">{signal.description}</p>
                  </div>

                  {/* Time + dismiss */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-muted">
                      {new Date(signal.detectedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      onClick={() => dismissSignal(signal.id)}
                      className="text-muted hover:text-danger transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
