'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import useSWR from 'swr'
import Link from 'next/link'
import {
  Search, Star, StarOff, RefreshCw,
  X, ChevronUp, ChevronDown, ArrowLeft, Clock,
  Activity,
} from 'lucide-react'
import type { StockBoard } from '@/lib/priceboard-data'

const StockDetailModal = dynamic(() => import('./StockDetailModal'), { ssr: false })

// ─── Tab Structure ────────────────────────────────────────────────────────────

type MainGroup = 'hose' | 'hnx' | 'upcom' | 'sector' | 'favorites'

const MAIN_GROUPS: { key: MainGroup; label: string }[] = [
  { key: 'hose',      label: 'HOSE' },
  { key: 'hnx',       label: 'HNX' },
  { key: 'upcom',     label: 'UPCOM' },
  { key: 'sector',    label: 'Ngành' },
  { key: 'favorites', label: '⭐ YT' },
]

const SUB_GROUPS: Record<MainGroup, { key: string; label: string }[]> = {
  hose: [
    { key: 'vn30',        label: 'VN30' },
    { key: 'vn100',       label: 'VN100' },
    { key: 'hose',        label: 'HOSE' },
    { key: 'vnmidcap',    label: 'VN MidCap' },
    { key: 'vnsmallcap',  label: 'VN SmallCap' },
    { key: 'vnallshare',  label: 'VN AllShare' },
    { key: 'vndiamond',   label: 'VN Diamond' },
    { key: 'vnfinlead',   label: 'VN FinLead' },
    { key: 'vnfinselect', label: 'VN FinSelect' },
    { key: 'vndividend',  label: 'VN Dividend' },
    { key: 'vnmitech',    label: 'VN MiTech' },
  ],
  hnx: [
    { key: 'hnx30', label: 'HNX30' },
    { key: 'hnx',   label: 'HNX' },
  ],
  upcom: [
    { key: 'upcom', label: 'UPCOM' },
  ],
  sector: [
    { key: 'vnfin',  label: 'Tài Chính' },
    { key: 'vnind',  label: 'Công Nghiệp' },
    { key: 'vnmat',  label: 'Vật Liệu' },
    { key: 'vnit',   label: 'CNTT' },
    { key: 'vnreal', label: 'BĐS' },
    { key: 'vncons', label: 'Tiêu Dùng' },
    { key: 'vnene',  label: 'Năng Lượng' },
    { key: 'vnheal', label: 'Y Tế' },
  ],
  favorites: [],
}

const DEFAULT_SUB: Record<MainGroup, string> = {
  hose: 'vn30', hnx: 'hnx30', upcom: 'upcom', sector: 'vnfin', favorites: 'favorites',
}

type SortKey = 'sym' | 'price' | 'changePct' | 'vol' | 'ceil' | 'floor' | 'ref' | 'foreignNet'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0): string {
  if (!n) return '—'
  return n.toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtVol(n: number): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('vi-VN')
}

function fmtPrice(p: number): string {
  if (!p) return '—'
  return (p / 1000).toFixed(2)
}

function fmtVal(val: number): string {
  if (!val) return '—'
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}T`
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(0)}M`
  return `${(val / 1_000).toFixed(0)}K`
}

function priceClass(price: number, ref: number, ceil: number, floor: number): string {
  if (!price || !ref) return 'text-gray-400'
  const eps = 50
  if (price >= ceil - eps) return 'text-fuchsia-400 font-bold'
  if (price <= floor + eps) return 'text-cyan-400 font-bold'
  if (Math.abs(price - ref) <= eps) return 'text-yellow-400'
  if (price > ref) return 'text-green-400'
  if (price < ref) return 'text-red-400'
  return 'text-yellow-400'
}

function changeClass(v: number): string {
  if (v > 0) return 'text-green-400'
  if (v < 0) return 'text-red-400'
  return 'text-yellow-400'
}

function isMarketOpen(): boolean {
  const now = new Date()
  const vn = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
  const h = vn.getHours(), m = vn.getMinutes()
  const day = vn.getDay()
  if (day === 0 || day === 6) return false
  const mins = h * 60 + m
  return (mins >= 9 * 60 && mins <= 11 * 60 + 30) || (mins >= 13 * 60 && mins <= 15 * 60)
}

// ─── Clock ────────────────────────────────────────────────────────────────────

function MarketClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => {
      const vn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
      setTime(vn.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  const open = isMarketOpen()
  return (
    <div className="flex items-center gap-2 text-xs">
      <Clock className="w-3.5 h-3.5 text-muted" />
      <span className="text-gray-300 font-mono">{time}</span>
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${open ? 'bg-green-500/20 text-green-400 animate-pulse' : 'bg-gray-500/20 text-muted'}`}>
        {open ? '● ĐANG KHỚP' : '○ Đóng cửa'}
      </span>
    </div>
  )
}

// ─── Index Chip ───────────────────────────────────────────────────────────────

function IndexChip({ name, value, change, changePct }: { name: string; value: number; change: number; changePct: number }) {
  if (!value) return null
  const up = change >= 0
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
      up ? 'bg-green-500/8 border-green-500/25' : 'bg-red-500/8 border-red-500/25'
    }`}>
      <span className="text-xs text-muted font-medium">{name}</span>
      <span className="text-sm font-bold text-gray-100 font-mono">{fmt(value, 2)}</span>
      <span className={`text-xs font-bold ${up ? 'text-green-400' : 'text-red-400'}`}>
        {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)} ({Math.abs(changePct).toFixed(2)}%)
      </span>
    </div>
  )
}

// ─── Flash TD ─────────────────────────────────────────────────────────────────
// Per-cell flash: lights up green or red when value changes

function FlashTd({ value, className, children }: { value: number; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLTableCellElement>(null)
  const prevRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (prevRef.current !== undefined && prevRef.current !== value && ref.current) {
      const cls = value > prevRef.current ? 'cell-flash-up' : 'cell-flash-down'
      ref.current.classList.add(cls)
      const el = ref.current
      setTimeout(() => el?.classList.remove(cls), 900)
    }
    prevRef.current = value
  }, [value])

  return <td ref={ref} className={className}>{children}</td>
}

// ─── Compact 3-level OrderBook columns ────────────────────────────────────────

function BidCol({ levels }: { levels: { p: number; v: number }[] }) {
  const valid = levels.filter(l => l.p > 0)
  return (
    <td className="py-1 px-1 hidden xl:table-cell w-[88px]">
      {valid.length === 0
        ? <span className="text-muted text-xs block text-right">—</span>
        : valid.map((l, i) => (
          <div key={i} className="flex items-center justify-end gap-1 leading-[1.45]">
            <span className="text-[10px] text-muted font-mono">{fmtVol(l.v)}</span>
            <span className="text-[11px] text-green-400 font-mono font-semibold w-[38px] text-right">{fmtPrice(l.p)}</span>
          </div>
        ))
      }
    </td>
  )
}

function AskCol({ levels }: { levels: { p: number; v: number }[] }) {
  const valid = levels.filter(l => l.p > 0)
  return (
    <td className="py-1 px-1 hidden xl:table-cell w-[88px]">
      {valid.length === 0
        ? <span className="text-muted text-xs block text-left">—</span>
        : valid.map((l, i) => (
          <div key={i} className="flex items-center justify-start gap-1 leading-[1.45]">
            <span className="text-[11px] text-red-400 font-mono font-semibold w-[38px]">{fmtPrice(l.p)}</span>
            <span className="text-[10px] text-muted font-mono">{fmtVol(l.v)}</span>
          </div>
        ))
      }
    </td>
  )
}

// ─── Price Row ────────────────────────────────────────────────────────────────

function PriceRow({
  stock, isFav, onToggleFav, onSelect, isSelected,
}: {
  stock: StockBoard; isFav: boolean
  onToggleFav: () => void; onSelect: () => void; isSelected: boolean
}) {
  const pc = priceClass(stock.price, stock.ref, stock.ceil, stock.floor)
  const cc = changeClass(stock.changePct)
  const foreignNet = stock.foreignBuy - stock.foreignSell
  const foreignColor = foreignNet > 0 ? 'text-green-400' : foreignNet < 0 ? 'text-red-400' : 'text-muted'

  // Subtle row tint based on change direction
  const rowTint = stock.changePct >= 6.9
    ? 'bg-fuchsia-900/10'
    : stock.changePct <= -6.9
    ? 'bg-cyan-900/10'
    : stock.changePct > 1
    ? 'bg-green-900/5'
    : stock.changePct < -1
    ? 'bg-red-900/5'
    : ''

  return (
    <tr
      onClick={onSelect}
      className={`border-b border-border/15 cursor-pointer transition-all hover:bg-surface2/50 active:scale-[0.998] ${rowTint} ${
        isSelected ? 'bg-accent/8 border-l-2 border-l-accent' : ''
      }`}
    >
      {/* Favorite */}
      <td className="w-8 py-1.5 pl-2 text-center">
        <button
          onClick={e => { e.stopPropagation(); onToggleFav() }}
          className={`p-0.5 rounded transition-colors ${isFav ? 'text-yellow-400' : 'text-border hover:text-yellow-400'}`}
        >
          {isFav ? <Star className="w-3 h-3 fill-current" /> : <StarOff className="w-3 h-3" />}
        </button>
      </td>

      {/* Symbol */}
      <td className="py-1.5 pl-1 pr-2 min-w-[44px]">
        <span className="text-xs font-bold text-gray-100 tracking-wide">{stock.sym}</span>
      </td>

      {/* Company name */}
      <td className="py-1.5 px-2 hidden lg:table-cell max-w-[130px]">
        <span className="text-[11px] text-muted truncate block">{stock.name}</span>
      </td>

      {/* Ref */}
      <td className="py-1.5 px-1 text-right">
        <span className="text-[11px] text-yellow-400/80 font-mono">{fmtPrice(stock.ref)}</span>
      </td>

      {/* Ceil */}
      <td className="py-1.5 px-1 text-right hidden sm:table-cell">
        <span className="text-[11px] text-fuchsia-400/80 font-mono">{fmtPrice(stock.ceil)}</span>
      </td>

      {/* Floor */}
      <td className="py-1.5 px-1 text-right hidden sm:table-cell">
        <span className="text-[11px] text-cyan-400/80 font-mono">{fmtPrice(stock.floor)}</span>
      </td>

      {/* 3-level Bid book */}
      <BidCol levels={stock.bid} />

      {/* Current price — FLASH CELL */}
      <FlashTd value={stock.price} className="py-1.5 px-2 text-right">
        <span className={`text-sm font-bold font-mono ${pc}`}>{fmtPrice(stock.price)}</span>
      </FlashTd>

      {/* Change — FLASH CELL */}
      <FlashTd value={stock.changePct} className="py-1.5 px-1 text-right min-w-[70px]">
        <div className={`text-xs font-bold ${cc}`}>
          {stock.changePct >= 0 ? '+' : ''}{stock.changePct.toFixed(2)}%
        </div>
        <div className={`text-[10px] font-mono ${cc} opacity-80`}>
          {stock.change >= 0 ? '+' : ''}{fmtPrice(stock.change)}
        </div>
      </FlashTd>

      {/* 3-level Ask book */}
      <AskCol levels={stock.ask} />

      {/* Volume */}
      <td className="py-1.5 px-2 text-right">
        <div className="text-[11px] text-gray-300 font-mono">{fmtVol(stock.vol)}</div>
        {stock.totalVal > 0 && (
          <div className="text-[10px] text-muted">{fmtVal(stock.totalVal)}</div>
        )}
      </td>

      {/* Foreign buy/sell/net */}
      <td className="py-1.5 px-2 text-right hidden md:table-cell min-w-[72px]">
        {(stock.foreignBuy > 0 || stock.foreignSell > 0) ? (
          <div className="text-[10px] space-y-px">
            <div className="text-green-400 font-mono">{fmtVol(stock.foreignBuy)}</div>
            <div className="text-red-400 font-mono">{fmtVol(stock.foreignSell)}</div>
            <div className={`font-semibold font-mono ${foreignColor}`}>
              {foreignNet >= 0 ? '+' : ''}{fmtVol(Math.abs(foreignNet))}
            </div>
          </div>
        ) : <span className="text-muted text-xs">—</span>}
      </td>
    </tr>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then(r => { if (!r.ok) throw new Error(); return r.json() })

export default function PriceBoardClient() {
  const [mainGroup, setMainGroup] = useState<MainGroup>('hose')
  const [subGroup,  setSubGroup]  = useState<string>('vn30')
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState<string | null>(null)
  const [favorites, setFavorites] = useState<string[]>([])
  const [sortKey,   setSortKey]   = useState<SortKey>('sym')
  const [sortAsc,   setSortAsc]   = useState(true)

  // Load favorites from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pb_favorites')
      if (saved) setFavorites(JSON.parse(saved))
    } catch { /* */ }
  }, [])

  const toggleFav = useCallback((sym: string) => {
    setFavorites(prev => {
      const next = prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
      try { localStorage.setItem('pb_favorites', JSON.stringify(next)) } catch { /* */ }
      return next
    })
  }, [])

  const handleMainGroup = (g: MainGroup) => {
    setMainGroup(g)
    setSubGroup(DEFAULT_SUB[g])
    setSelected(null)
  }

  // Determine API URL
  const apiGroup = mainGroup === 'favorites' ? 'all' : subGroup
  const apiUrl = mainGroup === 'favorites' && favorites.length > 0
    ? `/api/priceboard?symbols=${favorites.join(',')}&withIndex=1`
    : `/api/priceboard?group=${apiGroup}&withIndex=1`

  const shouldFetch = mainGroup !== 'favorites' || favorites.length > 0

  const { data, isLoading, mutate } = useSWR<{
    stocks: StockBoard[]
    vnIndex: { value: number; change: number; changePct: number } | null
    hnxIndex: { value: number; change: number; changePct: number } | null
    ts: number
  }>(
    shouldFetch ? apiUrl : null,
    fetcher,
    { refreshInterval: isMarketOpen() ? 5000 : 30000, revalidateOnFocus: false }
  )

  // Global symbol lookup — fires when search looks like a stock code (2-8 uppercase letters/digits)
  const searchCode = search.trim().toUpperCase()
  const isCodeLike = /^[A-Z][A-Z0-9]{1,7}$/.test(searchCode)
  const globalSearchUrl = isCodeLike ? `/api/priceboard?symbols=${encodeURIComponent(searchCode)}` : null
  const { data: globalSearchData } = useSWR<{ stocks: StockBoard[] }>(
    globalSearchUrl,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 3000 }
  )

  // Filter + sort
  const stocks = useMemo(() => {
    let list = data?.stocks ?? []
    if (mainGroup === 'favorites') {
      list = list.filter(s => favorites.includes(s.sym))
    }
    if (search.trim()) {
      const q = search.trim().toUpperCase()
      const localMatches = list.filter(s => s.sym.includes(q) || s.name.toLowerCase().includes(search.toLowerCase()))
      // Merge: local results first, then any global search results not already in local
      const globalExtra = (globalSearchData?.stocks ?? []).filter(
        gs => !localMatches.some(ls => ls.sym === gs.sym)
      )
      list = [...localMatches, ...globalExtra]
    }
    return [...list].sort((a, b) => {
      let diff = 0
      if      (sortKey === 'sym')        diff = a.sym.localeCompare(b.sym)
      else if (sortKey === 'price')      diff = a.price - b.price
      else if (sortKey === 'changePct')  diff = a.changePct - b.changePct
      else if (sortKey === 'vol')        diff = a.vol - b.vol
      else if (sortKey === 'ref')        diff = a.ref - b.ref
      else if (sortKey === 'ceil')       diff = a.ceil - b.ceil
      else if (sortKey === 'floor')      diff = a.floor - b.floor
      else if (sortKey === 'foreignNet') diff = (a.foreignBuy - a.foreignSell) - (b.foreignBuy - b.foreignSell)
      return sortAsc ? diff : -diff
    })
  }, [data, search, sortKey, sortAsc, mainGroup, favorites])

  const selectedStock = stocks.find(s => s.sym === selected) ?? null

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronUp className="w-3 h-3 opacity-20" />
    return sortAsc ? <ChevronUp className="w-3 h-3 text-accent" /> : <ChevronDown className="w-3 h-3 text-accent" />
  }

  const Th = ({ k, label, className = '' }: { k: SortKey; label: string; className?: string }) => (
    <th
      className={`py-2 px-2 text-right text-[10px] font-semibold text-muted uppercase tracking-wider cursor-pointer hover:text-gray-200 select-none whitespace-nowrap ${className}`}
      onClick={() => handleSort(k)}
    >
      <span className="inline-flex items-center gap-0.5 justify-end">{label}<SortIcon k={k} /></span>
    </th>
  )

  const allStocks = data?.stocks ?? []
  const upCount    = allStocks.filter(s => s.changePct > 0.05).length
  const downCount  = allStocks.filter(s => s.changePct < -0.05).length
  const refCount   = allStocks.filter(s => Math.abs(s.changePct) <= 0.05).length
  const totalUp    = upCount + downCount + refCount
  const upPct      = totalUp > 0 ? (upCount / totalUp) * 100 : 0
  const downPct    = totalUp > 0 ? (downCount / totalUp) * 100 : 0

  const subList = mainGroup !== 'favorites' ? SUB_GROUPS[mainGroup] : []

  return (
    <div className="flex flex-col h-dvh bg-bg overflow-hidden">

      {/* ══ Top bar ══ */}
      <header className="flex items-center gap-3 px-4 py-2 bg-surface border-b border-border/60 flex-shrink-0 flex-wrap">
        <Link href="/" className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity mr-1">
          <ArrowLeft className="w-4 h-4 text-muted" />
          <Image src="/logo.png" alt="StockAI VN" width={28} height={28} className="rounded-lg" priority />
          <span className="text-sm font-bold text-gray-100">StockAI VN</span>
        </Link>

        {/* Market indices */}
        <div className="flex items-center gap-2 flex-wrap">
          {data?.vnIndex  && <IndexChip name="VN-Index"  {...data.vnIndex}  />}
          {data?.hnxIndex && <IndexChip name="HNX-Index" {...data.hnxIndex} />}
        </div>

        <div className="ml-auto flex items-center gap-3 flex-wrap">
          {/* Market breadth */}
          {totalUp > 0 && (
            <div className="hidden sm:flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-green-400 font-semibold">{upCount}↑</span>
                <span className="text-yellow-400">{refCount}→</span>
                <span className="text-red-400 font-semibold">{downCount}↓</span>
              </div>
              {/* Breadth bar */}
              <div className="flex h-1 rounded-full overflow-hidden w-24 bg-border/40">
                <div className="bg-green-500/80 transition-all" style={{ width: `${upPct}%` }} />
                <div className="bg-yellow-500/60 flex-1" />
                <div className="bg-red-500/80 transition-all" style={{ width: `${downPct}%` }} />
              </div>
            </div>
          )}
          <MarketClock />
          <button onClick={() => mutate()} className="p-1.5 rounded-lg text-muted hover:text-accent transition-colors" title="Làm mới">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-accent' : ''}`} />
          </button>
        </div>
      </header>

      {/* ══ Main group tabs ══ */}
      <div className="flex items-center gap-0.5 px-4 pt-1.5 pb-0 bg-surface/90 border-b border-border/40 flex-shrink-0">
        {MAIN_GROUPS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleMainGroup(tab.key)}
            className={`relative px-4 py-1.5 text-xs font-semibold rounded-t-lg transition-colors ${
              mainGroup === tab.key
                ? 'bg-surface2 text-accent border border-border/60 border-b-surface2 -mb-px z-10'
                : 'text-muted hover:text-gray-200 hover:bg-surface2/40'
            }`}
          >
            {tab.label}
            {tab.key === 'favorites' && favorites.length > 0 && (
              <span className="ml-1 text-[10px] text-yellow-400">({favorites.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* ══ Sub-group + search bar ══ */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-surface2/80 border-b border-border/30 flex-shrink-0 flex-wrap">
        {/* Sub-tabs */}
        {subList.length > 0 && (
          <div className="flex overflow-x-auto no-scrollbar gap-1 flex-1">
            {subList.map(sub => (
              <button
                key={sub.key}
                onClick={() => { setSubGroup(sub.key); setSelected(null) }}
                className={`flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                  subGroup === sub.key
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'text-muted hover:text-gray-200 hover:bg-surface/60'
                }`}
              >
                {sub.label}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-1.5 bg-surface border border-border/40 rounded-lg px-2.5 py-1 min-w-[150px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-muted flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value.toUpperCase())}
            placeholder="Tìm mã..."
            className="bg-transparent text-sm text-gray-200 placeholder:text-muted outline-none w-full"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted hover:text-gray-200">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {search && <span className="text-xs text-muted">{stocks.length} kết quả</span>}

        {/* Legend */}
        <div className="hidden md:flex items-center gap-3 text-[10px] text-muted ml-auto">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-fuchsia-400/60 inline-block" />Trần</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-cyan-400/60 inline-block" />Sàn</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-400/60 inline-block" />TC</span>
          <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-accent" />Giá nhấp nháy khi thay đổi</span>
        </div>
      </div>

      {/* ══ Main content ══ */}
      <div className="flex-1 flex min-h-0">

        {/* Table */}
        <div className="flex-1 overflow-auto min-w-0">
          {isLoading && !data ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
              <p className="text-xs text-muted">Đang tải dữ liệu thị trường...</p>
            </div>
          ) : stocks.length === 0 ? (
            <div className="text-center text-muted py-20 text-sm">
              {mainGroup === 'favorites' && favorites.length === 0
                ? 'Chưa có mã yêu thích. Nhấn ⭐ để thêm vào danh sách theo dõi.'
                : 'Không tìm thấy mã nào.'}
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-surface border-b-2 border-border/60">
                <tr>
                  <th className="w-8 py-2 pl-2" />
                  <Th k="sym"        label="Mã"       className="text-left pl-1" />
                  <th className="py-2 px-2 text-left text-[10px] font-semibold text-muted uppercase tracking-wider hidden lg:table-cell">Tên CT</th>
                  <Th k="ref"        label="TC" />
                  <Th k="ceil"       label="Trần"     className="hidden sm:table-cell" />
                  <Th k="floor"      label="Sàn"      className="hidden sm:table-cell" />
                  <th className="py-2 px-1 text-center text-[10px] font-semibold text-green-400/70 uppercase hidden xl:table-cell w-[88px]">Dư Mua</th>
                  <Th k="price"      label="Giá" />
                  <Th k="changePct"  label="%±" />
                  <th className="py-2 px-1 text-center text-[10px] font-semibold text-red-400/70 uppercase hidden xl:table-cell w-[88px]">Dư Bán</th>
                  <Th k="vol"        label="KL Khớp" />
                  <Th k="foreignNet" label="NN Mua/Bán/Net" className="hidden md:table-cell" />
                </tr>
              </thead>
              <tbody>
                {stocks.map(stock => (
                  <PriceRow
                    key={stock.sym}
                    stock={stock}
                    isFav={favorites.includes(stock.sym)}
                    onToggleFav={() => toggleFav(stock.sym)}
                    onSelect={() => setSelected(selected === stock.sym ? null : stock.sym)}
                    isSelected={selected === stock.sym}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Stock detail modal */}
      {selectedStock && (
        <StockDetailModal stock={selectedStock} onClose={() => setSelected(null)} />
      )}

      {/* Cell flash animation + scrollbar hide */}
      <style jsx global>{`
        /* Per-cell flash animations */
        .cell-flash-up   { animation: cf-green 0.9s ease; }
        .cell-flash-down { animation: cf-red   0.9s ease; }
        @keyframes cf-green {
          0%   { background: transparent; }
          20%  { background: rgba(34, 197, 94, 0.30); }
          100% { background: transparent; }
        }
        @keyframes cf-red {
          0%   { background: transparent; }
          20%  { background: rgba(239, 68, 68, 0.30); }
          100% { background: transparent; }
        }
        .no-scrollbar { scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        /* Thin table scrollbar */
        .overflow-auto::-webkit-scrollbar { width: 4px; height: 4px; }
        .overflow-auto::-webkit-scrollbar-track { background: transparent; }
        .overflow-auto::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>
    </div>
  )
}
