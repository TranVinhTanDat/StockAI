import { getSupabase, isSupabaseConfigured } from './supabase'
import type {
  PortfolioHolding,
  Trade,
  SavedAnalysis,
  Alert,
  Balance,
  AnalysisResult,
  SavedPrediction,
  PredictionItem,
  OptimizeResult,
  SavedOptimizeResult,
} from '@/types'
import { generateId, getUserId } from './utils'

// Override user ID when auth is active
let _authUserId: string | null = null

// Auth-ready promise — resolves when _authUserId is first set (handles race condition on mount)
let _authReadyResolve: (() => void) | null = null
let _authReadyPromise: Promise<void> | null = null
function getAuthReadyPromise(): Promise<void> {
  if (_authUserId !== null) return Promise.resolve()
  if (!_authReadyPromise) {
    _authReadyPromise = new Promise(resolve => { _authReadyResolve = resolve })
  }
  return _authReadyPromise
}

export function setStorageUserId(id: string | null): void {
  _authUserId = id
  if (id !== null && _authReadyResolve) {
    _authReadyResolve()
    _authReadyResolve = null
    _authReadyPromise = null
  }
}
function getEffectiveUserId(): string { return _authUserId || _jwtUserId || getUserId() }
// Only use Supabase when user is actually authenticated (prevents 406/403 from RLS)
function shouldUseSupabase(): boolean { return isSupabaseConfigured() && _authUserId !== null }

// JWT user ID for scoping localStorage keys per user
let _jwtUserId: string | null = null
export function setJwtUserId(id: string | null): void { _jwtUserId = id }
// Scope localStorage key to the current JWT user (prevents sharing data across accounts)
function getLocalKey(base: string): string {
  const uid = _jwtUserId
  return uid ? `${base}_${uid.replace(/-/g, '').slice(0, 10)}` : base
}

// ─── LocalStorage helpers ────────────────────────────────

function getLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : fallback
  } catch {
    return fallback
  }
}

function setLocal<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

// ─── Watchlist ───────────────────────────────────────────

const DEFAULT_WATCHLIST = ['FPT', 'VNM', 'VIC', 'HPG', 'MWG', 'VHM', 'TCB', 'BID', 'VCB', 'GAS']

// Delta localStorage keys — separate added/removed from admin defaults
function wlAddedKey(): string  { return getLocalKey('stockai_wl_added')   }
function wlRemovedKey(): string { return getLocalKey('stockai_wl_removed') }

// Fetch admin's default watchlist symbols (public API, no auth needed)
async function fetchAdminDefaults(): Promise<string[]> {
  if (typeof window === 'undefined') return DEFAULT_WATCHLIST
  try {
    const res = await fetch('/api/admin/default-watchlist', {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return DEFAULT_WATCHLIST
    const data = await res.json()
    if (Array.isArray(data.items) && data.items.length > 0) {
      return data.items.map((i: { symbol: string }) => i.symbol)
    }
  } catch { /* network error — use fallback */ }
  return DEFAULT_WATCHLIST
}

export async function getWatchlist(): Promise<string[]> {
  const userId = getEffectiveUserId()
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      // Load user's watchlist and admin defaults in parallel
      const [watchlistRes, defaultsRes] = await Promise.all([
        sb.from('watchlist').select('symbol').eq('user_id', userId).order('added_at', { ascending: true }),
        sb.from('default_watchlist').select('symbol').order('sort_order', { ascending: true }),
      ])
      if (watchlistRes.error) return getLocal<string[]>(getLocalKey('stockai_watchlist'), DEFAULT_WATCHLIST)

      const symbols    = watchlistRes.data?.map((d) => d.symbol) ?? []
      const adminSyms  = defaultsRes.data?.map((d) => d.symbol) ?? []

      // Use localStorage "removed" list so user can permanently hide a default
      const removed = getLocal<string[]>(wlRemovedKey(), [])

      // Find admin defaults not yet in user's watchlist (and not explicitly removed by user)
      const newFromAdmin = adminSyms.filter(s => !symbols.includes(s) && !removed.includes(s))

      if (newFromAdmin.length > 0) {
        // Upsert new defaults into user's watchlist table
        await sb.from('watchlist').upsert(
          newFromAdmin.map(s => ({ user_id: userId, symbol: s })),
          { onConflict: 'user_id,symbol' }
        )
        return [...symbols, ...newFromAdmin]
      }

      // First time user with no symbols and no admin defaults
      if (symbols.length === 0 && adminSyms.length === 0) return DEFAULT_WATCHLIST

      return symbols.length > 0 ? symbols : adminSyms
    }
  }

  // ── localStorage delta model ──────────────────────────
  // Display = adminDefaults + userAdded - userRemoved
  const adminDefaults = await fetchAdminDefaults()
  const added   = getLocal<string[]>(wlAddedKey(),   [])
  const removed = getLocal<string[]>(wlRemovedKey(), [])
  const merged = adminDefaults.concat(added).filter((s, i, arr) => arr.indexOf(s) === i)
  const combined = merged.filter(s => !removed.includes(s))
  return combined
}

export async function addToWatchlist(symbol: string): Promise<void> {
  const userId = getEffectiveUserId()
  // Always remove from "removed" list when user explicitly re-adds
  const removed = getLocal<string[]>(wlRemovedKey(), []).filter(s => s !== symbol)
  setLocal(wlRemovedKey(), removed)
  const added = getLocal<string[]>(wlAddedKey(), [])
  if (!added.includes(symbol)) setLocal(wlAddedKey(), [...added, symbol])

  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { error } = await sb.from('watchlist').upsert(
        { user_id: userId, symbol },
        { onConflict: 'user_id,symbol' }
      )
      if (error) console.error('[Watchlist] Supabase upsert error:', error)
    }
    return
  }
  // localStorage-only mode: delta keys already updated above
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
  const userId = getEffectiveUserId()
  // Always track user's explicit removals in localStorage (prevents auto-re-add from admin defaults)
  const removedList = getLocal<string[]>(wlRemovedKey(), [])
  if (!removedList.includes(symbol)) setLocal(wlRemovedKey(), [...removedList, symbol])
  const addedList = getLocal<string[]>(wlAddedKey(), []).filter(s => s !== symbol)
  setLocal(wlAddedKey(), addedList)

  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { error } = await sb
        .from('watchlist')
        .delete()
        .eq('user_id', userId)
        .eq('symbol', symbol)
      if (error) console.error('[Watchlist] Supabase delete error:', error)
    }
    return
  }
  // localStorage-only mode: delta keys already updated above
}

// ─── Portfolio ───────────────────────────────────────────

export async function getPortfolio(): Promise<PortfolioHolding[]> {
  const userId = getEffectiveUserId()
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { data, error } = await sb
        .from('portfolio')
        .select('*')
        .eq('user_id', userId)
      if (error) return getLocal<PortfolioHolding[]>(getLocalKey('stockai_portfolio'), [])
      return (data as PortfolioHolding[]) || []
    }
  }
  return getLocal<PortfolioHolding[]>(getLocalKey('stockai_portfolio'), [])
}

export async function upsertHolding(
  holding: Partial<PortfolioHolding> & { symbol: string }
): Promise<void> {
  const userId = getEffectiveUserId()
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const existing = await sb
        .from('portfolio')
        .select('*')
        .eq('user_id', userId)
        .eq('symbol', holding.symbol)
        .maybeSingle()

      if (!existing.error && existing.data) {
        const { error } = await sb
          .from('portfolio')
          .update({
            qty: holding.qty,
            avg_cost: holding.avg_cost,
            total_cost: holding.total_cost,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.data.id)
        if (!error) return
      } else if (!existing.error) {
        const { error } = await sb.from('portfolio').insert({
          user_id: userId,
          ...holding,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        if (!error) return
      }
    }
  }
  const portfolio = getLocal<PortfolioHolding[]>(getLocalKey('stockai_portfolio'), [])
  const idx = portfolio.findIndex((h) => h.symbol === holding.symbol)
  if (idx >= 0) {
    portfolio[idx] = {
      ...portfolio[idx],
      ...holding,
      updated_at: new Date().toISOString(),
    }
  } else {
    portfolio.push({
      id: generateId(),
      user_id: userId,
      qty: 0,
      avg_cost: 0,
      total_cost: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...holding,
    })
  }
  setLocal(getLocalKey('stockai_portfolio'), portfolio)
}

export async function removeHolding(symbol: string): Promise<void> {
  const userId = getEffectiveUserId()
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { error } = await sb
        .from('portfolio')
        .delete()
        .eq('user_id', userId)
        .eq('symbol', symbol)
      if (!error) return
    }
  }
  const portfolio = getLocal<PortfolioHolding[]>(getLocalKey('stockai_portfolio'), [])
  setLocal(
    getLocalKey('stockai_portfolio'),
    portfolio.filter((h) => h.symbol !== symbol)
  )
}

// ─── Trades ──────────────────────────────────────────────

export async function getTrades(): Promise<Trade[]> {
  const userId = getEffectiveUserId()
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { data, error } = await sb
        .from('trades')
        .select('*')
        .eq('user_id', userId)
        .order('traded_at', { ascending: false })
        .limit(50)
      if (error) return getLocal<Trade[]>(getLocalKey('stockai_trades'), [])
      return (data as Trade[]) || []
    }
  }
  return getLocal<Trade[]>(getLocalKey('stockai_trades'), [])
}

export async function addTrade(trade: Omit<Trade, 'id'>): Promise<void> {
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { error } = await sb.from('trades').insert(trade)
      if (!error) return
    }
  }
  const trades = getLocal<Trade[]>(getLocalKey('stockai_trades'), [])
  trades.unshift({ id: generateId(), ...trade })
  setLocal(getLocalKey('stockai_trades'), trades)
}

// ─── Balance ─────────────────────────────────────────────

export async function getBalance(): Promise<Balance> {
  const userId = getEffectiveUserId()
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { data, error } = await sb
        .from('balance')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (!error && data) {
        return data as Balance
      }
      // No row or error → return in-memory default (row will be created on first updateBalance call)
      // Do NOT write here to avoid race condition 409 from concurrent mounts
    }
  }
  return getLocal<Balance>(getLocalKey('stockai_balance'), {
    user_id: userId,
    cash: 500_000_000,
    updated_at: new Date().toISOString(),
  })
}

export async function updateBalance(cash: number): Promise<void> {
  const userId = getEffectiveUserId()
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { error } = await sb
        .from('balance')
        .upsert(
          { user_id: userId, cash, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
      if (!error) return
    }
  }
  setLocal(getLocalKey('stockai_balance'), {
    user_id: userId,
    cash,
    updated_at: new Date().toISOString(),
  })
}

// ─── Analyses ────────────────────────────────────────────

export async function getAnalyses(): Promise<SavedAnalysis[]> {
  const userId = getEffectiveUserId()
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { data, error } = await sb
        .from('analyses')
        .select('*')
        .eq('user_id', userId)
        .order('analyzed_at', { ascending: false })
        .limit(10)
      if (error) return getLocal<SavedAnalysis[]>(getLocalKey('stockai_analyses'), [])
      return (data as SavedAnalysis[]) || []
    }
  }
  return getLocal<SavedAnalysis[]>(getLocalKey('stockai_analyses'), [])
}

// Prevent concurrent saves for same (user, symbol)
const _savingSet = new Set<string>()

export async function saveAnalysis(
  symbol: string,
  result: AnalysisResult
): Promise<void> {
  const userId = getEffectiveUserId()
  const saveKey = `${userId}_${symbol}`
  if (_savingSet.has(saveKey)) return
  _savingSet.add(saveKey)
  try {
    await _saveAnalysisInner(symbol, result, userId)
  } finally {
    _savingSet.delete(saveKey)
  }
}

async function _saveAnalysisInner(
  symbol: string,
  result: AnalysisResult,
  userId: string
): Promise<void> {
  const entry: SavedAnalysis = {
    id: generateId(),
    user_id: userId,
    symbol,
    recommendation: result.recommendation,
    confidence: result.confidence,
    target_price: result.targetPrice,
    stop_loss: result.stopLoss,
    full_result: result,
    analyzed_at: new Date().toISOString(),
  }

  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      // Delete existing row for this (user_id, symbol), then insert fresh
      // _savingSet above ensures no concurrent calls can race here
      await sb.from('analyses').delete().eq('user_id', userId).eq('symbol', symbol)
      const { error } = await sb.from('analyses').insert(entry)
      if (error) console.error('[Analysis] Supabase insert error:', error.code, error.message)
      if (!error) return
    }
  }
  const analyses = getLocal<SavedAnalysis[]>(getLocalKey('stockai_analyses'), [])
  // Upsert: remove old entry for same symbol, then add new one at top
  const filtered = analyses.filter((a) => a.symbol !== symbol)
  filtered.unshift(entry)
  if (filtered.length > 20) filtered.splice(20)
  setLocal(getLocalKey('stockai_analyses'), filtered)
}

// ─── Alerts ──────────────────────────────────────────────

export async function getAlerts(): Promise<Alert[]> {
  const userId = getEffectiveUserId()
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { data, error } = await sb
        .from('alerts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) return getLocal<Alert[]>(getLocalKey('stockai_alerts'), [])
      return (data as Alert[]) || []
    }
  }
  return getLocal<Alert[]>(getLocalKey('stockai_alerts'), [])
}

export async function addAlert(
  alert: Omit<Alert, 'id' | 'triggered_at' | 'created_at'>
): Promise<void> {
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { error } = await sb.from('alerts').insert({
        ...alert,
        triggered_at: null,
        created_at: new Date().toISOString(),
      })
      if (!error) return
    }
  }
  const alerts = getLocal<Alert[]>(getLocalKey('stockai_alerts'), [])
  alerts.unshift({
    id: generateId(),
    ...alert,
    triggered_at: null,
    created_at: new Date().toISOString(),
  })
  setLocal(getLocalKey('stockai_alerts'), alerts)
}

export async function updateAlert(
  id: string,
  updates: Partial<Alert>
): Promise<void> {
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { error } = await sb.from('alerts').update(updates).eq('id', id)
      if (!error) return
    }
  }
  const alerts = getLocal<Alert[]>(getLocalKey('stockai_alerts'), [])
  const idx = alerts.findIndex((a) => a.id === id)
  if (idx >= 0) {
    alerts[idx] = { ...alerts[idx], ...updates }
    setLocal(getLocalKey('stockai_alerts'), alerts)
  }
}

export async function deleteAlert(id: string): Promise<void> {
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { error } = await sb.from('alerts').delete().eq('id', id)
      if (!error) return
    }
  }
  const alerts = getLocal<Alert[]>(getLocalKey('stockai_alerts'), [])
  setLocal(
    getLocalKey('stockai_alerts'),
    alerts.filter((a) => a.id !== id)
  )
}

// ─── Expose scoped key helper (for analysisCache.ts) ─────────────────────────
export function getScopedStorageKey(base: string): string {
  return getLocalKey(base)
}

// ─── Optimize Result Cache ────────────────────────────────

export async function getOptimizeResult(): Promise<SavedOptimizeResult | null> {
  const userId = getEffectiveUserId()
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { data, error } = await sb
        .from('optimize_results')
        .select('*')
        .eq('user_id', userId)
        .order('analyzed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!error && data) return data as SavedOptimizeResult
    }
  }
  const saved = getLocal<SavedOptimizeResult | null>(getLocalKey('stockai_optimize_result'), null)
  return saved
}

export async function saveOptimizeResult(result: OptimizeResult): Promise<void> {
  const userId = getEffectiveUserId()
  const entry: SavedOptimizeResult = {
    id: generateId(),
    user_id: userId,
    result,
    analyzed_at: new Date().toISOString(),
  }
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      await sb.from('optimize_results').delete().eq('user_id', userId)
      const { error } = await sb.from('optimize_results').insert(entry)
      if (!error) return
    }
  }
  setLocal(getLocalKey('stockai_optimize_result'), entry)
}

// ─── Predictions ──────────────────────────────────────────

export async function getAllPredictions(): Promise<SavedPrediction[]> {
  const userId = getEffectiveUserId()
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { data, error } = await sb
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .order('predicted_at', { ascending: false })
      if (!error && data) return data as SavedPrediction[]
    }
  }
  return getLocal<SavedPrediction[]>(getLocalKey('stockai_predictions'), [])
}

export async function getPredictions(style: string): Promise<SavedPrediction | null> {
  const userId = getEffectiveUserId()
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { data, error } = await sb
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .eq('style', style)
        .order('predicted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!error && data) return data as SavedPrediction
    }
  }
  const all = getLocal<SavedPrediction[]>(getLocalKey('stockai_predictions'), [])
  return all.find((p) => p.style === style) ?? null
}

export async function savePredictions(style: string, predictions: PredictionItem[]): Promise<void> {
  const userId = getEffectiveUserId()
  const entry: SavedPrediction = {
    id: generateId(),
    user_id: userId,
    style,
    predictions,
    predicted_at: new Date().toISOString(),
  }
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      await sb.from('predictions').delete().eq('user_id', userId).eq('style', style)
      const { error } = await sb.from('predictions').insert(entry)
      if (!error) return
    }
  }
  const all = getLocal<SavedPrediction[]>(getLocalKey('stockai_predictions'), [])
  const filtered = all.filter((p) => p.style !== style)
  filtered.unshift(entry)
  if (filtered.length > 10) filtered.splice(10)
  setLocal(getLocalKey('stockai_predictions'), filtered)
}

// ─── Chat History ─────────────────────────────────────────

interface ChatSessionEntry {
  symbol: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  updatedAt: string
}

const MAX_CHAT_SESSIONS = 10   // keep up to 10 symbols
const MAX_CHAT_MESSAGES = 60   // keep up to 60 messages per session

export function getChatHistory(symbol: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const all = getLocal<ChatSessionEntry[]>(getLocalKey('stockai_chat_history'), [])
  return all.find((s) => s.symbol === symbol)?.messages ?? []
}

export function saveChatHistory(symbol: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>): void {
  const all = getLocal<ChatSessionEntry[]>(getLocalKey('stockai_chat_history'), [])
  const filtered = all.filter((s) => s.symbol !== symbol)
  const trimmed = messages.slice(-MAX_CHAT_MESSAGES)
  filtered.unshift({ symbol, messages: trimmed, updatedAt: new Date().toISOString() })
  if (filtered.length > MAX_CHAT_SESSIONS) filtered.splice(MAX_CHAT_SESSIONS)
  setLocal(getLocalKey('stockai_chat_history'), filtered)
}

export function clearChatHistory(symbol: string): void {
  const all = getLocal<ChatSessionEntry[]>(getLocalKey('stockai_chat_history'), [])
  setLocal(getLocalKey('stockai_chat_history'), all.filter((s) => s.symbol !== symbol))
}

export function getAllChatSessions(): ChatSessionEntry[] {
  return getLocal<ChatSessionEntry[]>(getLocalKey('stockai_chat_history'), [])
}

// ─── Report Analyses Cache ─────────────────────────────────────────────────────
// Stores AI analysis results for analyst reports.
// Pattern: localStorage (instant) + Supabase (cross-device persistence).

export interface ReportAnalysisEntry {
  id: string
  user_id: string
  report_id: string   // e.g. "cafef_FPT_0" or Vietcap report id
  symbol: string
  source: string      // 'cafef' | 'vietcap'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis: Record<string, any>
  cached_at: string
}

function reportCacheLocalKey(source: string, symbol: string): string {
  return getLocalKey(`stockai_rpt_${source}_${symbol}`)
}

/** Load all cached analyses for a given source+symbol (from localStorage). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getLocalReportAnalyses(source: string, symbol: string): Record<string, any> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(reportCacheLocalKey(source, symbol)) || '{}')
  } catch { return {} }
}

/** Save an analysis result — localStorage immediately + Supabase async. */
export async function saveReportAnalysis(
  reportId: string,
  symbol: string,
  source: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis: Record<string, any>
): Promise<void> {
  const userId = getEffectiveUserId()

  // 1. Save to localStorage immediately (instant UX)
  const localCache = getLocalReportAnalyses(source, symbol)
  localCache[reportId] = { ...analysis, cachedAt: analysis.cachedAt || new Date().toISOString() }
  // Evict oldest if > 20 entries
  const keys = Object.keys(localCache)
  if (keys.length > 20) {
    const oldest = keys.sort((a, b) =>
      (localCache[a]?.cachedAt ?? '').localeCompare(localCache[b]?.cachedAt ?? '')
    )[0]
    delete localCache[oldest]
  }
  try { localStorage.setItem(reportCacheLocalKey(source, symbol), JSON.stringify(localCache)) } catch {}

  // 2. Save to Supabase async (background, non-blocking)
  if (!shouldUseSupabase()) return
  const sb = getSupabase()
  if (!sb) return

  const entry: ReportAnalysisEntry = {
    id: generateId(),
    user_id: userId,
    report_id: reportId,
    symbol,
    source,
    analysis,
    cached_at: analysis.cachedAt || new Date().toISOString(),
  }

  // DELETE + INSERT: safer than upsert with new primary key (avoids PK conflict)
  sb.from('report_analyses')
    .delete()
    .eq('user_id', userId)
    .eq('report_id', reportId)
    .then(() => sb.from('report_analyses').insert(entry))
    .then(({ error }) => {
      if (error) console.error('[ReportAnalysis] Supabase insert error:', error.message)
    })
}

/** Load cached analyses from Supabase for a given symbol (for cross-device sync on mount). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadReportAnalysesFromCloud(symbol: string): Promise<Record<string, any>> {
  if (!isSupabaseConfigured()) return {}

  // Wait for auth to restore (up to 3s) — fixes race condition on component mount
  await Promise.race([
    getAuthReadyPromise(),
    new Promise(resolve => setTimeout(resolve, 3000)),
  ])

  if (!shouldUseSupabase()) return {}
  const sb = getSupabase()
  if (!sb) return {}

  try {
    const userId = getEffectiveUserId()
    const { data, error } = await sb
      .from('report_analyses')
      .select('report_id, source, analysis, cached_at')
      .eq('user_id', userId)
      .eq('symbol', symbol)
      .order('cached_at', { ascending: false })
      .limit(50)

    if (error || !data) return {}

    // Group by source and populate localStorage cache
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = {}
    for (const row of data) {
      const entry = { ...row.analysis, cachedAt: row.cached_at }
      result[row.report_id] = entry
      // Sync back to localStorage for instant load next time
      const localCache = getLocalReportAnalyses(row.source, symbol)
      localCache[row.report_id] = entry
      try { localStorage.setItem(reportCacheLocalKey(row.source, symbol), JSON.stringify(localCache)) } catch {}
    }
    return result
  } catch { return {} }
}
