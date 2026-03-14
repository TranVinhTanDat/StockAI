'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { HistoryData } from '@/types'

export type TechnicalSignalType =
  | 'RSI_OVERSOLD'     // RSI < 30
  | 'RSI_OVERBOUGHT'   // RSI > 70
  | 'MACD_BULLISH'     // MACD crosses above signal (golden cross)
  | 'MACD_BEARISH'     // MACD crosses below signal (death cross)
  | 'VOLUME_SPIKE'     // Volume > 2x average

export interface TechnicalSignal {
  id: string
  symbol: string
  type: TechnicalSignalType
  description: string
  value: number       // the indicator value
  detectedAt: string  // ISO string
  strength: 'medium' | 'strong'
}

const CACHE_KEY = 'sai_tech_signals'
const CHECK_INTERVAL = 5 * 60 * 1000 // 5 minutes

function loadCachedSignals(): TechnicalSignal[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const { signals, cachedAt } = JSON.parse(raw)
    // Keep signals from last 24h
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    if (new Date(cachedAt).getTime() < cutoff) return []
    return signals as TechnicalSignal[]
  } catch {
    return []
  }
}

function saveCachedSignals(signals: TechnicalSignal[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ signals, cachedAt: new Date().toISOString() }))
  } catch {}
}

async function checkSymbol(symbol: string): Promise<TechnicalSignal[]> {
  const signals: TechnicalSignal[] = []
  try {
    const res = await fetch(`/api/history?symbol=${symbol}&days=60`)
    if (!res.ok) return signals
    const data: HistoryData = await res.json()

    const { rsi, macd } = data.indicators
    const candles = data.candles

    // ── RSI signals ──────────────────────────────────────
    const latestRsi = rsi.filter((v) => !isNaN(v)).at(-1)
    if (latestRsi !== undefined) {
      if (latestRsi < 30) {
        signals.push({
          id: `${symbol}_RSI_OVERSOLD_${Date.now()}`,
          symbol,
          type: 'RSI_OVERSOLD',
          description: `RSI=${latestRsi.toFixed(1)} — Vùng quá bán, có thể đảo chiều tăng`,
          value: latestRsi,
          detectedAt: new Date().toISOString(),
          strength: latestRsi < 25 ? 'strong' : 'medium',
        })
      } else if (latestRsi > 70) {
        signals.push({
          id: `${symbol}_RSI_OVERBOUGHT_${Date.now()}`,
          symbol,
          type: 'RSI_OVERBOUGHT',
          description: `RSI=${latestRsi.toFixed(1)} — Vùng quá mua, áp lực bán tăng`,
          value: latestRsi,
          detectedAt: new Date().toISOString(),
          strength: latestRsi > 80 ? 'strong' : 'medium',
        })
      }
    }

    // ── MACD crossover ────────────────────────────────────
    if (macd.length >= 2) {
      const validMacd = macd.filter((m) => !isNaN(m.macd) && !isNaN(m.signal))
      if (validMacd.length >= 2) {
        const prev = validMacd[validMacd.length - 2]
        const curr = validMacd[validMacd.length - 1]

        // Bullish crossover: MACD crosses above signal
        if (prev.macd < prev.signal && curr.macd > curr.signal) {
          signals.push({
            id: `${symbol}_MACD_BULLISH_${Date.now()}`,
            symbol,
            type: 'MACD_BULLISH',
            description: `MACD cắt lên đường signal — Tín hiệu mua kỹ thuật`,
            value: curr.macd,
            detectedAt: new Date().toISOString(),
            strength: curr.macd > 0 ? 'strong' : 'medium',
          })
        }
        // Bearish crossover: MACD crosses below signal
        else if (prev.macd > prev.signal && curr.macd < curr.signal) {
          signals.push({
            id: `${symbol}_MACD_BEARISH_${Date.now()}`,
            symbol,
            type: 'MACD_BEARISH',
            description: `MACD cắt xuống đường signal — Tín hiệu bán kỹ thuật`,
            value: curr.macd,
            detectedAt: new Date().toISOString(),
            strength: curr.macd < 0 ? 'strong' : 'medium',
          })
        }
      }
    }

    // ── Volume spike ──────────────────────────────────────
    if (candles.length >= 21) {
      const recent = candles.slice(-21)
      const last = recent[recent.length - 1]
      const avg20 = recent.slice(0, 20).reduce((s, c) => s + c.volume, 0) / 20
      if (avg20 > 0 && last.volume > avg20 * 2.0) {
        signals.push({
          id: `${symbol}_VOLUME_SPIKE_${Date.now()}`,
          symbol,
          type: 'VOLUME_SPIKE',
          description: `KL=${(last.volume / 1000).toFixed(0)}K CP (gấp ${(last.volume / avg20).toFixed(1)}x TB20)`,
          value: last.volume / avg20,
          detectedAt: new Date().toISOString(),
          strength: last.volume > avg20 * 3 ? 'strong' : 'medium',
        })
      }
    }
  } catch {
    // silently fail per symbol
  }
  return signals
}

export function useTechnicalAlerts(symbols: string[]) {
  const [signals, setSignals] = useState<TechnicalSignal[]>([])

  // Load from localStorage only on client (avoids SSR hydration mismatch)
  useEffect(() => {
    setSignals(loadCachedSignals())
  }, [])
  const [checking, setChecking] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const symbolsRef = useRef(symbols)
  symbolsRef.current = symbols

  const runCheck = useCallback(async () => {
    if (symbolsRef.current.length === 0) return
    setChecking(true)
    try {
      // Check in batches of 3 to avoid hammering the API
      const newSignals: TechnicalSignal[] = []
      const syms = symbolsRef.current.slice(0, 10) // limit to 10 max
      for (let i = 0; i < syms.length; i += 3) {
        const batch = syms.slice(i, i + 3)
        const results = await Promise.all(batch.map(checkSymbol))
        results.forEach((r) => newSignals.push(...r))
      }

      if (newSignals.length > 0) {
        // Only keep most recent signal per symbol+type combo
        const unique = newSignals.reduce<Map<string, TechnicalSignal>>((map, s) => {
          const key = `${s.symbol}_${s.type}`
          if (!map.has(key)) map.set(key, s)
          return map
        }, new Map())

        const deduped = Array.from(unique.values())
          .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())

        setSignals(deduped)
        saveCachedSignals(deduped)

        // Browser notification for strong signals
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          deduped
            .filter((s) => s.strength === 'strong')
            .slice(0, 3)
            .forEach((s) => {
              new Notification(`StockAI VN — ${s.symbol}`, { body: s.description })
            })
        }
      }
      setLastChecked(new Date())
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    if (symbols.length === 0) return
    // Initial check
    runCheck()
    // Periodic check every 5 minutes
    const interval = setInterval(runCheck, CHECK_INTERVAL)
    return () => clearInterval(interval)
  }, [runCheck, symbols.length])

  const dismissSignal = useCallback((id: string) => {
    setSignals((prev) => {
      const next = prev.filter((s) => s.id !== id)
      saveCachedSignals(next)
      return next
    })
  }, [])

  const dismissAll = useCallback(() => {
    setSignals([])
    saveCachedSignals([])
  }, [])

  return { signals, checking, lastChecked, runCheck, dismissSignal, dismissAll }
}
