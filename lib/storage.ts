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
  const userId = getUserId()
  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      const { data } = await sb
        .from('watchlist')
        .select('symbol')
        .eq('user_id', userId)
        .order('added_at', { ascending: true })
      return data?.map((d) => d.symbol) || []
    }
  }
  return getLocal<string[]>('stockai_watchlist', DEFAULT_WATCHLIST)
}

export async function addToWatchlist(symbol: string): Promise<void> {
  const userId = getUserId()
  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      await sb.from('watchlist').upsert({ user_id: userId, symbol })
      return
    }
  }
  const list = getLocal<string[]>('stockai_watchlist', DEFAULT_WATCHLIST)
  if (!list.includes(symbol)) {
    list.push(symbol)
    setLocal('stockai_watchlist', list)
  }
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
  const userId = getUserId()
  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      await sb
        .from('watchlist')
        .delete()
        .eq('user_id', userId)
        .eq('symbol', symbol)
      return
    }
  }
  const list = getLocal<string[]>('stockai_watchlist', DEFAULT_WATCHLIST)
  setLocal(
    'stockai_watchlist',
    list.filter((s) => s !== symbol)
  )
}

// ─── Portfolio ───────────────────────────────────────────

export async function getPortfolio(): Promise<PortfolioHolding[]> {
  const userId = getUserId()
  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      const { data } = await sb
        .from('portfolio')
        .select('*')
        .eq('user_id', userId)
      return (data as PortfolioHolding[]) || []
    }
  }
  return getLocal<PortfolioHolding[]>('stockai_portfolio', [])
}

export async function upsertHolding(
  holding: Partial<PortfolioHolding> & { symbol: string }
): Promise<void> {
  const userId = getUserId()
  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      const existing = await sb
        .from('portfolio')
        .select('*')
        .eq('user_id', userId)
        .eq('symbol', holding.symbol)
        .single()

      if (existing.data) {
        await sb
          .from('portfolio')
          .update({
            qty: holding.qty,
            avg_cost: holding.avg_cost,
            total_cost: holding.total_cost,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.data.id)
      } else {
        await sb.from('portfolio').insert({
          user_id: userId,
          ...holding,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }
      return
    }
  }
  const portfolio = getLocal<PortfolioHolding[]>('stockai_portfolio', [])
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
  setLocal('stockai_portfolio', portfolio)
}

export async function removeHolding(symbol: string): Promise<void> {
  const userId = getUserId()
  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      await sb
        .from('portfolio')
        .delete()
        .eq('user_id', userId)
        .eq('symbol', symbol)
      return
    }
  }
  const portfolio = getLocal<PortfolioHolding[]>('stockai_portfolio', [])
  setLocal(
    'stockai_portfolio',
    portfolio.filter((h) => h.symbol !== symbol)
  )
}

// ─── Trades ──────────────────────────────────────────────

export async function getTrades(): Promise<Trade[]> {
  const userId = getUserId()
  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      const { data } = await sb
        .from('trades')
        .select('*')
        .eq('user_id', userId)
        .order('traded_at', { ascending: false })
        .limit(50)
      return (data as Trade[]) || []
    }
  }
  return getLocal<Trade[]>('stockai_trades', [])
}

export async function addTrade(trade: Omit<Trade, 'id'>): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      await sb.from('trades').insert(trade)
      return
    }
  }
  const trades = getLocal<Trade[]>('stockai_trades', [])
  trades.unshift({ id: generateId(), ...trade })
  setLocal('stockai_trades', trades)
}

// ─── Balance ─────────────────────────────────────────────

export async function getBalance(): Promise<Balance> {
  const userId = getUserId()
  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      const { data } = await sb
        .from('balance')
        .select('*')
        .eq('user_id', userId)
        .single()
      if (data) return data as Balance
      await sb
        .from('balance')
        .insert({ user_id: userId, cash: 500_000_000 })
      return {
        user_id: userId,
        cash: 500_000_000,
        updated_at: new Date().toISOString(),
      }
    }
  }
  return getLocal<Balance>('stockai_balance', {
    user_id: userId,
    cash: 500_000_000,
    updated_at: new Date().toISOString(),
  })
}

export async function updateBalance(cash: number): Promise<void> {
  const userId = getUserId()
  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      await sb
        .from('balance')
        .upsert({
          user_id: userId,
          cash,
          updated_at: new Date().toISOString(),
        })
      return
    }
  }
  setLocal('stockai_balance', {
    user_id: userId,
    cash,
    updated_at: new Date().toISOString(),
  })
}

// ─── Analyses ────────────────────────────────────────────

export async function getAnalyses(): Promise<SavedAnalysis[]> {
  const userId = getUserId()
  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      const { data } = await sb
        .from('analyses')
        .select('*')
        .eq('user_id', userId)
        .order('analyzed_at', { ascending: false })
        .limit(10)
      return (data as SavedAnalysis[]) || []
    }
  }
  return getLocal<SavedAnalysis[]>('stockai_analyses', [])
}

export async function saveAnalysis(
  symbol: string,
  result: AnalysisResult
): Promise<void> {
  const userId = getUserId()
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

  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      await sb.from('analyses').insert(entry)
      return
    }
  }
  const analyses = getLocal<SavedAnalysis[]>('stockai_analyses', [])
  analyses.unshift(entry)
  if (analyses.length > 20) analyses.splice(20)
  setLocal('stockai_analyses', analyses)
}

// ─── Alerts ──────────────────────────────────────────────

export async function getAlerts(): Promise<Alert[]> {
  const userId = getUserId()
  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      const { data } = await sb
        .from('alerts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      return (data as Alert[]) || []
    }
  }
  return getLocal<Alert[]>('stockai_alerts', [])
}

export async function addAlert(
  alert: Omit<Alert, 'id' | 'triggered_at' | 'created_at'>
): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      await sb.from('alerts').insert({
        ...alert,
        triggered_at: null,
        created_at: new Date().toISOString(),
      })
      return
    }
  }
  const alerts = getLocal<Alert[]>('stockai_alerts', [])
  alerts.unshift({
    id: generateId(),
    ...alert,
    triggered_at: null,
    created_at: new Date().toISOString(),
  })
  setLocal('stockai_alerts', alerts)
}

export async function updateAlert(
  id: string,
  updates: Partial<Alert>
): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      await sb.from('alerts').update(updates).eq('id', id)
      return
    }
  }
  const alerts = getLocal<Alert[]>('stockai_alerts', [])
  const idx = alerts.findIndex((a) => a.id === id)
  if (idx >= 0) {
    alerts[idx] = { ...alerts[idx], ...updates }
    setLocal('stockai_alerts', alerts)
  }
}

export async function deleteAlert(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = getSupabase()
    if (sb) {
      await sb.from('alerts').delete().eq('id', id)
      return
    }
  }
  const alerts = getLocal<Alert[]>('stockai_alerts', [])
  setLocal(
    'stockai_alerts',
    alerts.filter((a) => a.id !== id)
  )
}
