import type { AnalysisResult, QuoteData } from '@/types'
import { getScopedStorageKey } from './storage'

/** Cache TTL: 4 hours — covers one full trading session */
const CACHE_TTL_MS = 4 * 60 * 60 * 1000
const KEY_PREFIX = 'sai_ac_'

function getKey(symbol: string): string {
  // User-scoped so different users don't share analysis cache
  return getScopedStorageKey(`${KEY_PREFIX}${symbol.toUpperCase()}`)
}

export interface CachedAnalysisEntry {
  symbol: string
  result: AnalysisResult
  quote: QuoteData
  cachedAt: string   // ISO string
  expiresAt: string  // ISO string
}

export function getCachedAnalysis(symbol: string): CachedAnalysisEntry | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(getKey(symbol))
    if (!raw) return null
    const entry: CachedAnalysisEntry = JSON.parse(raw)
    if (Date.now() > new Date(entry.expiresAt).getTime()) {
      localStorage.removeItem(getKey(symbol))
      return null
    }
    return entry
  } catch {
    return null
  }
}

export function setCachedAnalysis(
  symbol: string,
  result: AnalysisResult,
  quote: QuoteData
): void {
  if (typeof window === 'undefined') return
  try {
    const now = new Date()
    const entry: CachedAnalysisEntry = {
      symbol: symbol.toUpperCase(),
      result,
      quote,
      cachedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + CACHE_TTL_MS).toISOString(),
    }
    localStorage.setItem(getKey(symbol), JSON.stringify(entry))
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}

export function clearCachedAnalysis(symbol: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(getKey(symbol))
}

/** Returns human-readable cache age: "vừa xong", "15 phút trước", "2 giờ trước" */
export function formatCacheAge(cachedAt: string): string {
  const ageMs = Date.now() - new Date(cachedAt).getTime()
  const mins = Math.floor(ageMs / 60_000)
  if (mins < 1) return 'vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hrs = Math.floor(mins / 60)
  return `${hrs} giờ trước`
}

/** Returns remaining TTL as "còn X giờ Y phút" */
export function formatCacheTTL(expiresAt: string): string {
  const remaining = new Date(expiresAt).getTime() - Date.now()
  if (remaining <= 0) return 'hết hạn'
  const mins = Math.floor(remaining / 60_000)
  if (mins < 60) return `còn ${mins} phút`
  const hrs = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `còn ${hrs}g${m}p` : `còn ${hrs} giờ`
}
