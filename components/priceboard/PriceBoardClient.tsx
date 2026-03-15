'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import Link from 'next/link'
import {
  Search, Star, StarOff, RefreshCw, TrendingUp,
  X, ChevronUp, ChevronDown, ArrowLeft,
  Clock,
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

type SortKey = 'sym' | 'price' | 'changePct' | 'vol' | 'ceil' | 'floor' | 'ref'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0): string {
  if (!n) return '—'
  return n.toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtVol(n: number): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('vi-VN')
}

function fmtPrice(p: number): string {
  if (!p) return '—'
  return (p / 1000).toFixed(2)
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
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${open ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-muted'}`}>
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
    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface2/60 rounded-lg border border-border/40">
      <span className="text-xs text-muted font-medium">{name}</span>
      <span className="text-sm font-bold text-gray-100">{fmt(value, 2)}</span>
      <span className={`text-xs font-semibold ${up ? 'text-green-400' : 'text-red-400'}`}>
        {up ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
      </span>
    </div>
  )
}

// ─── Price Row ────────────────────────────────────────────────────────────────

function PriceRow({
  stock, isFav, onToggleFav, onSelect, isSelected, prevPrice,
}: {
  stock: StockBoard; isFav: boolean
  onToggleFav: () => void; onSelect: () => void; isSelected: boolean
  prevPrice?: number
}) {
  const pc = priceClass(stock.price, stock.ref, stock.ceil, stock.floor)
  const cc = changeClass(stock.changePct)

  const flashRef = useRef<HTMLTableRowElement>(null)
  const prevRef  = useRef<number | undefined>(prevPrice)
  useEffect(() => {
    if (prevRef.current !== undefined && prevRef.current !== stock.price && flashRef.current) {
      const dir = stock.price > prevRef.current ? 'flash-up' : 'flash-down'
      flashRef.current.classList.add(dir)
      setTimeout(() => flashRef.current?.classList.remove(dir), 600)
    }
    prevRef.current = stock.price
  }, [stock.price])

  return (
    <tr
      ref={flashRef}
      onClick={onSelect}
      className={`border-b border-border/20 cursor-pointer transition-colors hover:bg-surface2/40 ${isSelected ? 'bg-accent/5 border-l-2 border-l-accent' : ''}`}
    >
      <td className="w-8 py-2 pl-2 text-center">
        <button
          onClick={e => { e.stopPropagation(); onToggleFav() }}
          className={`p-0.5 rounded transition-colors ${isFav ? 'text-yellow-400' : 'text-muted hover:text-yellow-400'}`}
        >
          {isFav ? <Star className="w-3 h-3 fill-current" /> : <StarOff className="w-3 h-3" />}
        </button>
      </td>
      <td className="py-2 pl-1 pr-2">
        <span className="text-sm font-bold text-gray-100">{stock.sym}</span>
      </td>
      <td className="py-2 px-2 hidden lg:table-cell max-w-[140px]">
        <span className="text-xs text-muted truncate block">{stock.name}</span>
      </td>
      <td className="py-2 px-2 text-right">
        <span className="text-xs text-yellow-400 font-mono">{fmtPrice(stock.ref)}</span>
      </td>
      <td className="py-2 px-1 text-right">
        <span className="text-xs text-fuchsia-400 font-mono">{fmtPrice(stock.ceil)}</span>
      </td>
      <td className="py-2 px-1 text-right">
        <span className="text-xs text-cyan-400 font-mono">{fmtPrice(stock.floor)}</span>
      </td>
      {/* Best bid */}
      <td className="py-2 px-1 text-right hidden xl:table-cell">
        {stock.bid[0].p > 0 ? (
          <div>
            <div className="text-xs text-green-400 font-mono">{fmtPrice(stock.bid[0].p)}</div>
            <div className="text-[10px] text-muted">{fmtVol(stock.bid[0].v)}</div>
          </div>
        ) : <span className="text-muted text-xs">—</span>}
      </td>
      {/* Current price */}
      <td className="py-2 px-2 text-right">
        <span className={`text-sm font-bold font-mono ${pc}`}>{fmtPrice(stock.price)}</span>
      </td>
      <td className="py-2 px-1 text-right">
        <div className={`text-xs font-semibold ${cc}`}>
          {stock.changePct >= 0 ? '+' : ''}{stock.changePct.toFixed(2)}%
        </div>
        <div className={`text-[10px] ${cc}`}>
          {stock.change >= 0 ? '+' : ''}{fmtPrice(stock.change)}
        </div>
      </td>
      {/* Best ask */}
      <td className="py-2 px-1 text-right hidden xl:table-cell">
        {stock.ask[0].p > 0 ? (
          <div>
            <div className="text-xs text-red-400 font-mono">{fmtPrice(stock.ask[0].p)}</div>
            <div className="text-[10px] text-muted">{fmtVol(stock.ask[0].v)}</div>
          </div>
        ) : <span className="text-muted text-xs">—</span>}
      </td>
      <td className="py-2 px-2 text-right">
        <span className="text-xs text-muted">{fmtVol(stock.vol)}</span>
      </td>
      <td className="py-2 px-2 text-right hidden md:table-cell">
        {(stock.foreignBuy > 0 || stock.foreignSell > 0) ? (
          <div className="text-[10px]">
            <div className="text-green-400">{fmtVol(stock.foreignBuy)}</div>
            <div className="text-red-400">{fmtVol(stock.foreignSell)}</div>
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
  const prevPricesRef = useRef<Record<string, number>>({})

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

  // Track previous prices for flash animation
  useEffect(() => {
    if (data?.stocks) {
      data.stocks.forEach(s => { prevPricesRef.current[s.sym] = s.price })
    }
  }, [data])

  // Filter + sort
  const stocks = useMemo(() => {
    let list = data?.stocks ?? []
    if (mainGroup === 'favorites') {
      list = list.filter(s => favorites.includes(s.sym))
    }
    if (search.trim()) {
      const q = search.trim().toUpperCase()
      list = list.filter(s => s.sym.includes(q) || s.name.toLowerCase().includes(search.toLowerCase()))
    }
    return [...list].sort((a, b) => {
      let diff = 0
      if      (sortKey === 'sym')       diff = a.sym.localeCompare(b.sym)
      else if (sortKey === 'price')     diff = a.price - b.price
      else if (sortKey === 'changePct') diff = a.changePct - b.changePct
      else if (sortKey === 'vol')       diff = a.vol - b.vol
      else if (sortKey === 'ref')       diff = a.ref - b.ref
      else if (sortKey === 'ceil')      diff = a.ceil - b.ceil
      else if (sortKey === 'floor')     diff = a.floor - b.floor
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
      className={`py-2 px-2 text-right text-[10px] font-semibold text-muted uppercase tracking-wider cursor-pointer hover:text-gray-200 select-none ${className}`}
      onClick={() => handleSort(k)}
    >
      <span className="inline-flex items-center gap-0.5 justify-end">{label}<SortIcon k={k} /></span>
    </th>
  )

  const upCount   = (data?.stocks ?? []).filter(s => s.changePct > 0).length
  const downCount = (data?.stocks ?? []).filter(s => s.changePct < 0).length
  const refCount  = (data?.stocks ?? []).filter(s => Math.abs(s.changePct) < 0.01).length

  const subList = mainGroup !== 'favorites' ? SUB_GROUPS[mainGroup] : []

  return (
    <div className="flex flex-col h-dvh bg-bg overflow-hidden">

      {/* ══ Top bar ══ */}
      <header className="flex items-center gap-3 px-4 py-2.5 bg-surface border-b border-border/60 flex-shrink-0 flex-wrap">
        <Link href="/" className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity mr-2">
          <ArrowLeft className="w-4 h-4 text-muted" />
          <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
            <TrendingUp className="w-3.5 h-3.5 text-accent" />
          </div>
          <span className="text-sm font-bold text-gray-100">StockAI VN</span>
        </Link>

        {/* Market indices */}
        <div className="flex items-center gap-2 flex-wrap">
          {data?.vnIndex  && <IndexChip name="VN-Index"  {...data.vnIndex}  />}
          {data?.hnxIndex && <IndexChip name="HNX-Index" {...data.hnxIndex} />}
        </div>

        <div className="ml-auto flex items-center gap-3 flex-wrap">
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="text-green-400 font-semibold">{upCount}↑</span>
            <span className="text-yellow-400">{refCount}→</span>
            <span className="text-red-400 font-semibold">{downCount}↓</span>
          </div>
          <MarketClock />
          <button onClick={() => mutate()} className="p-1.5 rounded-lg text-muted hover:text-accent transition-colors" title="Làm mới">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* ══ Main group tabs ══ */}
      <div className="flex items-center gap-0.5 px-4 pt-2 pb-0 bg-surface/90 border-b border-border/40 flex-shrink-0">
        {MAIN_GROUPS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleMainGroup(tab.key)}
            className={`relative px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
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
      <div className="flex items-center gap-2 px-4 py-2 bg-surface2 border-b border-border/40 flex-shrink-0 flex-wrap">
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
        <div className="flex items-center gap-1.5 bg-surface border border-border/40 rounded-lg px-2.5 py-1.5 min-w-[160px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-muted flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value.toUpperCase())}
            placeholder="Tìm mã hoặc tên..."
            className="bg-transparent text-sm text-gray-200 placeholder:text-muted outline-none w-full"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted hover:text-gray-200">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {search && <span className="text-xs text-muted">{stocks.length} kết quả</span>}
      </div>

      {/* ══ Main content ══ */}
      <div className="flex-1 flex min-h-0">

        {/* Table */}
        <div className="flex-1 overflow-auto min-w-0">
          {isLoading && !data ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
            </div>
          ) : stocks.length === 0 ? (
            <div className="text-center text-muted py-20 text-sm">
              {mainGroup === 'favorites' && favorites.length === 0
                ? 'Chưa có mã yêu thích. Nhấn ⭐ để thêm.'
                : 'Không tìm thấy mã nào.'}
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-surface border-b border-border/60">
                <tr className="text-left">
                  <th className="w-8 py-2 pl-2" />
                  <Th k="sym"       label="Mã"      className="text-left" />
                  <th className="py-2 px-2 text-left text-[10px] font-semibold text-muted uppercase tracking-wider hidden lg:table-cell">Tên CT</th>
                  <Th k="ref"       label="TC" />
                  <Th k="ceil"      label="Trần" />
                  <Th k="floor"     label="Sàn" />
                  <th className="py-2 px-1 text-right text-[10px] font-semibold text-muted uppercase hidden xl:table-cell">Mua tốt</th>
                  <Th k="price"     label="Giá" />
                  <Th k="changePct" label="%±" />
                  <th className="py-2 px-1 text-right text-[10px] font-semibold text-muted uppercase hidden xl:table-cell">Bán tốt</th>
                  <Th k="vol"       label="KL Khớp" />
                  <th className="py-2 px-2 text-right text-[10px] font-semibold text-muted uppercase hidden md:table-cell">NN Mua/Bán</th>
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
                    prevPrice={prevPricesRef.current[stock.sym]}
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

      {/* Flash animation + scrollbar hide */}
      <style jsx global>{`
        .flash-up   { animation: flash-green 0.6s ease; }
        .flash-down { animation: flash-red   0.6s ease; }
        @keyframes flash-green { 0%,100% { background: transparent } 30% { background: rgba(34,197,94,0.15) } }
        @keyframes flash-red   { 0%,100% { background: transparent } 30% { background: rgba(239,68,68,0.15)  } }
        .no-scrollbar { scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
