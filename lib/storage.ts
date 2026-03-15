import { getSupabase, isSupabaseConfigured } from './supabase'
import type {
  PortfolioHolding,
  Trade,
  SavedAnalysis,
  Alert,
  Balance,
  AnalysisResult,
} from '@/types'
import { generateId, getUserId } from './utils'

// Override user ID when auth is active
let _authUserId: string | null = null
export function setStorageUserId(id: string | null): void { _authUserId = id }
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

export async function getWatchlist(): Promise<string[]> {
  const userId = getEffectiveUserId()
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { data, error } = await sb
        .from('watchlist')
        .select('symbol')
        .eq('user_id', userId)
        .order('added_at', { ascending: true })
      if (error) return getLocal<string[]>(getLocalKey('stockai_watchlist'), DEFAULT_WATCHLIST)
      return data?.map((d) => d.symbol) ?? DEFAULT_WATCHLIST
    }
  }
  return getLocal<string[]>(getLocalKey('stockai_watchlist'), DEFAULT_WATCHLIST)
}

export async function addToWatchlist(symbol: string): Promise<void> {
  const userId = getEffectiveUserId()
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { error } = await sb.from('watchlist').upsert({ user_id: userId, symbol })
      if (!error) return
    }
  }
  const list = [...getLocal<string[]>(getLocalKey('stockai_watchlist'), DEFAULT_WATCHLIST)]
  if (!list.includes(symbol)) {
    list.push(symbol)
    setLocal(getLocalKey('stockai_watchlist'), list)
  }
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
  const userId = getEffectiveUserId()
  if (shouldUseSupabase()) {
    const sb = getSupabase()
    if (sb) {
      const { error } = await sb
        .from('watchlist')
        .delete()
        .eq('user_id', userId)
        .eq('symbol', symbol)
      if (!error) return
    }
  }
  const list = getLocal<string[]>(getLocalKey('stockai_watchlist'), DEFAULT_WATCHLIST)
  setLocal(
    getLocalKey('stockai_watchlist'),
    list.filter((s) => s !== symbol)
  )
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
        .single()

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
        .single()
      if (error) {
        // Table doesn't exist yet → fall through to localStorage
      } else if (data) {
        return data as Balance
      } else {
        // Table exists but no row → create default
        await sb.from('balance').insert({ user_id: userId, cash: 500_000_000 })
        return { user_id: userId, cash: 500_000_000, updated_at: new Date().toISOString() }
      }
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
        .upsert({
          user_id: userId,
          cash,
          updated_at: new Date().toISOString(),
        })
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

export async function saveAnalysis(
  symbol: string,
  result: AnalysisResult
): Promise<void> {
  const userId = getEffectiveUserId()
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
      // Remove old entry for same user+symbol before inserting (upsert by symbol)
      await sb.from('analyses').delete().eq('user_id', userId).eq('symbol', symbol)
      const { error } = await sb.from('analyses').insert(entry)
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
