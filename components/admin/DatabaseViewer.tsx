'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { Database, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

const TABLES = [
  'app_users',
  'watchlist',
  'analyses',
  'analysis_cache',
  'portfolio',
  'trades',
  'balance',
  'alerts',
  'optimize_results',
  'predictions',
  'push_subscriptions',
]

const ORDER_COL: Record<string, string> = {
  app_users:        'created_at',
  watchlist:        'added_at',
  analyses:         'analyzed_at',
  analysis_cache:   'created_at',
  portfolio:        'created_at',
  trades:           'traded_at',
  balance:          'updated_at',
  alerts:           'created_at',
  optimize_results: 'analyzed_at',
  predictions:      'predicted_at',
  push_subscriptions: 'updated_at',
}

interface TableData {
  rows: Record<string, unknown>[]
  count: number
  error?: string
}

function JsonCell({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false)
  if (value === null || value === undefined) return <span className="text-muted/50">null</span>
  if (typeof value === 'boolean') return <span className={value ? 'text-green-400' : 'text-red-400'}>{String(value)}</span>
  if (typeof value === 'object') {
    const str = JSON.stringify(value)
    const preview = str.length > 60 ? str.slice(0, 60) + '…' : str
    return (
      <button onClick={() => setExpanded(!expanded)} className="text-left text-xs">
        {expanded
          ? <pre className="text-blue-300 whitespace-pre-wrap max-w-xs">{JSON.stringify(value, null, 2)}</pre>
          : <span className="text-blue-300/70 font-mono">{preview}</span>
        }
      </button>
    )
  }
  const s = String(value)
  if (s.length > 80) return <span className="text-gray-300 font-mono text-xs" title={s}>{s.slice(0, 80)}…</span>
  return <span className="text-gray-300 font-mono text-xs">{s}</span>
}

function TableView({ name, data, loading }: { name: string; data: TableData | null; loading: boolean }) {
  if (loading) return (
    <div className="flex items-center justify-center h-24 text-muted text-sm">
      <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Đang tải…
    </div>
  )
  if (!data) return null
  if (data.error) return <p className="text-red-400 text-sm p-3">{data.error}</p>
  if (data.rows.length === 0) return (
    <p className="text-muted text-sm p-3 italic">Bảng trống (0 rows)</p>
  )

  const cols = Object.keys(data.rows[0])
  return (
    <div className="overflow-auto max-h-96">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-bg z-10">
          <tr>
            {cols.map(c => (
              <th key={c} className="text-left px-3 py-2 border-b border-border/40 text-muted font-medium whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i} className="border-b border-border/20 hover:bg-surface/60">
              {cols.map(c => (
                <td key={c} className="px-3 py-1.5 align-top max-w-xs">
                  <JsonCell value={row[c]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function DatabaseViewer() {
  const [tableData, setTableData] = useState<Record<string, TableData>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<string | null>('app_users')
  const [counts, setCounts] = useState<Record<string, number>>({})

  const fetchTable = useCallback(async (table: string) => {
    const sb = getSupabase()
    if (!sb) return
    setLoading(prev => ({ ...prev, [table]: true }))
    try {
      const { data, error, count } = await sb
        .from(table)
        .select('*', { count: 'exact' })
        .order(ORDER_COL[table] ?? 'id', { ascending: false })
        .limit(100)
      if (error) {
        setTableData(prev => ({ ...prev, [table]: { rows: [], count: 0, error: error.message } }))
      } else {
        setTableData(prev => ({ ...prev, [table]: { rows: data ?? [], count: count ?? 0 } }))
        setCounts(prev => ({ ...prev, [table]: count ?? 0 }))
      }
    } catch (e) {
      setTableData(prev => ({ ...prev, [table]: { rows: [], count: 0, error: String(e) } }))
    } finally {
      setLoading(prev => ({ ...prev, [table]: false }))
    }
  }, [])

  // Load all counts on mount
  useEffect(() => {
    const sb = getSupabase()
    if (!sb) return
    TABLES.forEach(async (t) => {
      const { count } = await sb.from(t).select('*', { count: 'exact', head: true })
      setCounts(prev => ({ ...prev, [t]: count ?? 0 }))
    })
  }, [])

  // Load table when expanded
  useEffect(() => {
    if (expanded && !tableData[expanded]) {
      fetchTable(expanded)
    }
  }, [expanded, tableData, fetchTable])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-4">
        <Database className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold text-gray-100">Database Viewer</h2>
        <span className="text-xs text-muted ml-auto">Hiển thị tối đa 100 rows/bảng</span>
      </div>

      {TABLES.map(table => {
        const isOpen = expanded === table
        const count = counts[table]
        const isLoading = loading[table]

        return (
          <div key={table} className="border border-border/40 rounded-xl overflow-hidden">
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setExpanded(isOpen ? null : table)
                if (!isOpen && !tableData[table]) fetchTable(table)
              }}
              onKeyDown={(e) => e.key === 'Enter' && setExpanded(isOpen ? null : table)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-surface hover:bg-surface/80 transition-colors cursor-pointer select-none"
            >
              {isOpen
                ? <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" />
                : <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" />
              }
              <span className="font-mono text-sm text-gray-200">{table}</span>
              {count !== undefined && (
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                  count > 0 ? 'bg-accent/15 text-accent' : 'bg-border/30 text-muted'
                }`}>
                  {count} rows
                </span>
              )}
              {isLoading && <RefreshCw className="w-3 h-3 text-muted animate-spin ml-2" />}
              <button
                onClick={(e) => { e.stopPropagation(); fetchTable(table) }}
                className="ml-1 p-1 hover:text-accent text-muted transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            {isOpen && (
              <TableView
                name={table}
                data={tableData[table] ?? null}
                loading={!!isLoading}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
