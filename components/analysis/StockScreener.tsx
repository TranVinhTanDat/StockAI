'use client'

import { useState, useCallback } from 'react'
import { Search, Zap, Filter } from 'lucide-react'
import type { SmartScoreResult } from '@/lib/smartScore'

// ─── Investment Style Configurations ─────────────────────────────────────────

type InvestStyle = 'all' | 'swing' | 'longterm' | 'dca' | 'dividend' | 'etf' | 'growth'

interface StyleConfig {
  label: string
  icon: string
  desc: string
  stocks: string[]
  weights: { tech: number; fund: number; sent: number }
}

// Top 60 VN stocks: VN30 + VNMID + some liquids (default pool)
const ALL_STOCKS = [
  // VN30
  'VCB','BID','CTG','TCB','MBB','ACB','VPB','HDB','STB','MSB',
  'VIC','VHM','VRE','NVL','PDR',
  'VNM','SAB','MSN','MCH','MWG','PNJ',
  'FPT','CMG',
  'HPG','HSG','NKG',
  'GAS','PLX','PVD','PVS',
  'VJC','HVN',
  'SSI','VND','HCM','VCI',
  'REE','GMD','HAH',
  // VNMID
  'DHC','DGC','DPM','DCM','TDC','KBC','IDC',
  'CTR','FTS','BSR','OIL',
  'LPB','BAB','NAB',
  'DXG','KDH','HDC',
  'VHC','ANV',
]

const STYLE_CONFIGS: Record<InvestStyle, StyleConfig> = {
  all: {
    label: 'Tất Cả',
    icon: '🔍',
    desc: `Quét ${ALL_STOCKS.length} mã VN30+VNMID · SmartScore tiêu chuẩn (KT 30% + CB 40% + TL 30%)`,
    stocks: ALL_STOCKS,
    weights: { tech: 0.30, fund: 0.40, sent: 0.30 },
  },
  swing: {
    label: 'Lướt Sóng',
    icon: '⚡',
    desc: 'Ưu tiên kỹ thuật (55%): ADX, RSI, MACD, dòng tiền NN — giao dịch 5–15 ngày',
    stocks: ['HPG','SSI','VND','HCM','VCI','PDR','NVL','VJC','VPB','STB','HDB','MSB','HSG','NKG','DXG','KDH','BSR','PVD','PLX','FTS','TCB','MBB','ACB','VCB','CTG','BID','FPT','CMG','VIC'],
    weights: { tech: 0.55, fund: 0.15, sent: 0.30 },
  },
  longterm: {
    label: 'Dài Hạn',
    icon: '🏛️',
    desc: 'Ưu tiên cơ bản (55%): ROE cao, tăng trưởng lợi nhuận bền vững, P/E hợp lý — nắm ≥1 năm',
    stocks: ['VCB','FPT','VNM','HPG','ACB','TCB','MWG','REE','GAS','SAB','MSN','MBB','VIC','CTG','BID','DHC','DGC','PNJ','VHM','CMG','VCI','HCM','SSI','VHC','ANV','GMD','HAH','DPM','DCM','FTS'],
    weights: { tech: 0.20, fund: 0.55, sent: 0.25 },
  },
  dca: {
    label: 'DCA',
    icon: '📅',
    desc: 'Mua đều hàng tháng: Mã ổn định, cơ bản (50%) vững, ít biến động — tích lũy dài hạn',
    stocks: ['VNM','VCB','GAS','REE','FPT','PNJ','SAB','MSN','DHC','MWG','ACB','BID','CTG','VHM','TCB','HPG','MBB','VCI','DPM','DCM','HAH','GMD','ANV','VHC','DGC'],
    weights: { tech: 0.25, fund: 0.50, sent: 0.25 },
  },
  dividend: {
    label: 'Cổ Tức',
    icon: '💰',
    desc: 'Ưu tiên cổ tức tiền mặt đều đặn, cơ bản (55%): Yield cao, ROE ổn định, ít biến động',
    stocks: ['GAS','REE','VNM','PNJ','SAB','DHC','DGC','DPM','DCM','FPT','MSN','FTS','VHC','ANV','CTR','GMD','HAH','OIL','PLX','VCB','ACB','BID','CTG','MBB','HPG'],
    weights: { tech: 0.15, fund: 0.55, sent: 0.30 },
  },
  etf: {
    label: 'VN30',
    icon: '📊',
    desc: 'Rổ chỉ số VN30 — trọng số cân bằng KT/CB/TL, phù hợp theo dõi thị trường chung',
    stocks: ['VCB','BID','CTG','TCB','MBB','ACB','VPB','HDB','STB','VIC','VHM','VRE','VNM','SAB','MSN','MWG','FPT','HPG','GAS','PLX','VJC','SSI','VND','HCM','VCI','REE','GMD','MSB','PNJ','NVL'],
    weights: { tech: 0.30, fund: 0.40, sent: 0.30 },
  },
  growth: {
    label: 'Tăng Trưởng',
    icon: '🚀',
    desc: 'Ưu tiên cơ bản (45%): EPS tăng mạnh, doanh thu bùng nổ, ngành hưởng lợi chu kỳ',
    stocks: ['FPT','CMG','HPG','HSG','NKG','DGC','DHC','MCH','VCI','HCM','SSI','MWG','PNJ','CTR','VHC','DXG','KDH','VPB','TCB','ACB','VCB','BID','CTG','MBB','VIC'],
    weights: { tech: 0.30, fund: 0.45, sent: 0.25 },
  },
}

const STYLE_ORDER: InvestStyle[] = ['all', 'swing', 'longterm', 'dca', 'dividend', 'etf', 'growth']

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScreenerRow {
  symbol: string
  price: number
  recommendation: string
  overallScore: number
  technicalScore: number
  fundamentalScore: number
  sentimentScore: number
  styleScore: number
  targetPrice: number
  stopLoss: number
  rrRatio: number
  changePct: number
  status: 'pending' | 'done' | 'error'
}

type RecFilter = 'ALL' | 'MUA MẠNH' | 'MUA' | 'GIỬ' | 'BÁN' | 'BÁN MẠNH'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRecColor(rec: string) {
  if (rec === 'MUA MẠNH') return 'text-emerald-400'
  if (rec === 'MUA')      return 'text-green-400'
  if (rec === 'GIỬ')     return 'text-yellow-400'
  if (rec === 'BÁN')      return 'text-orange-400'
  if (rec === 'BÁN MẠNH') return 'text-red-400'
  return 'text-muted'
}

function getRecBadge(rec: string) {
  if (rec === 'MUA MẠNH') return 'bg-emerald-400/10 border-emerald-400/30 text-emerald-400'
  if (rec === 'MUA')      return 'bg-green-400/10 border-green-400/30 text-green-400'
  if (rec === 'GIỬ')     return 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400'
  if (rec === 'BÁN')      return 'bg-orange-400/10 border-orange-400/30 text-orange-400'
  if (rec === 'BÁN MẠNH') return 'bg-red-400/10 border-red-400/30 text-red-400'
  return 'bg-surface2 text-muted'
}

function getScoreColor(s: number) {
  if (s >= 70) return 'text-emerald-400'
  if (s >= 55) return 'text-green-400'
  if (s >= 45) return 'text-yellow-400'
  if (s >= 30) return 'text-orange-400'
  return 'text-red-400'
}

function fmtPrice(n: number) {
  if (!n) return '—'
  return n.toLocaleString('vi-VN') + '₫'
}

function computeStyleScore(row: Pick<ScreenerRow, 'technicalScore' | 'fundamentalScore' | 'sentimentScore'>, style: InvestStyle): number {
  const w = STYLE_CONFIGS[style].weights
  return Math.round(row.technicalScore * w.tech + row.fundamentalScore * w.fund + row.sentimentScore * w.sent)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StockScreener() {
  const [rows, setRows] = useState<ScreenerRow[]>([])
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<RecFilter>('ALL')
  const [sortBy, setSortBy] = useState<'score' | 'tech' | 'fund' | 'sent' | 'rr'>('score')
  const [minScore, setMinScore] = useState(0)
  const [customSymbols, setCustomSymbols] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [investStyle, setInvestStyle] = useState<InvestStyle>('all')

  const scan = useCallback(async () => {
    const symbols = useCustom && customSymbols.trim()
      ? customSymbols.toUpperCase().split(/[\s,]+/).filter(Boolean)
      : STYLE_CONFIGS[investStyle].stocks

    setScanning(true)
    setRows([])
    setProgress(0)
    setTotal(symbols.length)

    const BATCH = 5
    const results: ScreenerRow[] = []

    for (let i = 0; i < symbols.length; i += BATCH) {
      const batch = symbols.slice(i, i + BATCH)
      await Promise.all(batch.map(async (sym) => {
        try {
          const res = await fetch(`/api/smart-analyze?symbol=${sym}`, { signal: AbortSignal.timeout(12000) })
          if (!res.ok) {
            results.push({ symbol: sym, price: 0, recommendation: '—', overallScore: 0, technicalScore: 0, fundamentalScore: 0, sentimentScore: 0, styleScore: 0, targetPrice: 0, stopLoss: 0, rrRatio: 0, changePct: 0, status: 'error' })
            return
          }
          const d: SmartScoreResult & { changePct?: number } = await res.json()
          const tech = d.technical.score
          const fund = d.fundamental.score
          const sent = d.sentiment.score
          results.push({
            symbol: sym,
            price: d.price,
            recommendation: d.recommendation,
            overallScore: d.overallScore,
            technicalScore: tech,
            fundamentalScore: fund,
            sentimentScore: sent,
            styleScore: computeStyleScore({ technicalScore: tech, fundamentalScore: fund, sentimentScore: sent }, investStyle),
            targetPrice: d.targetPrice,
            stopLoss: d.stopLoss,
            rrRatio: d.rrRatio,
            changePct: d.changePct ?? 0,
            status: 'done',
          })
        } catch {
          results.push({ symbol: sym, price: 0, recommendation: '—', overallScore: 0, technicalScore: 0, fundamentalScore: 0, sentimentScore: 0, styleScore: 0, targetPrice: 0, stopLoss: 0, rrRatio: 0, changePct: 0, status: 'error' })
        }
      }))
      setProgress(Math.min(i + BATCH, symbols.length))
      setRows([...results])
      if (i + BATCH < symbols.length) await new Promise(r => setTimeout(r, 300))
    }

    setScanning(false)
  }, [useCustom, customSymbols, investStyle])

  const activeConfig = STYLE_CONFIGS[investStyle]
  const effectivePool = useCustom && customSymbols.trim() ? customSymbols.toUpperCase().split(/[\s,]+/).filter(Boolean) : activeConfig.stocks

  // Sort key: when style is not 'all', prioritize styleScore for 'score' sort
  const primaryScore = (r: ScreenerRow) => investStyle !== 'all' && sortBy === 'score' ? r.styleScore : r.overallScore

  const filtered = rows
    .filter(r => r.status === 'done')
    .filter(r => filter === 'ALL' || r.recommendation === filter)
    .filter(r => (investStyle !== 'all' && sortBy === 'score' ? r.styleScore : r.overallScore) >= minScore)
    .sort((a, b) => {
      if (sortBy === 'score') return primaryScore(b) - primaryScore(a)
      if (sortBy === 'tech')  return b.technicalScore - a.technicalScore
      if (sortBy === 'fund')  return b.fundamentalScore - a.fundamentalScore
      if (sortBy === 'sent')  return b.sentimentScore - a.sentimentScore
      if (sortBy === 'rr')    return b.rrRatio - a.rrRatio
      return 0
    })

  const errors = rows.filter(r => r.status === 'error').length

  const recCounts = {
    'MUA MẠNH': rows.filter(r => r.recommendation === 'MUA MẠNH').length,
    'MUA':      rows.filter(r => r.recommendation === 'MUA').length,
    'GIỬ':     rows.filter(r => r.recommendation === 'GIỬ').length,
    'BÁN':      rows.filter(r => r.recommendation === 'BÁN').length,
    'BÁN MẠNH': rows.filter(r => r.recommendation === 'BÁN MẠNH').length,
  }

  const scoreLabel = investStyle !== 'all' ? 'Điểm Phong Cách' : 'Điểm'
  const displayScore = (r: ScreenerRow) => investStyle !== 'all' ? r.styleScore : r.overallScore

  return (
    <div className="space-y-4">

      {/* ── Style Tabs ── */}
      <div className="card-glass p-3">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-[11px] text-muted font-medium">Phong cách đầu tư:</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_ORDER.map(style => {
            const cfg = STYLE_CONFIGS[style]
            const active = investStyle === style
            return (
              <button
                key={style}
                onClick={() => { setInvestStyle(style); setRows([]); setProgress(0) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  active
                    ? 'bg-accent/20 border-accent/40 text-accent'
                    : 'bg-surface2 border-border/50 text-muted hover:text-gray-200 hover:border-border'
                }`}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
                {!useCustom && (
                  <span className={`text-[9px] px-1 rounded ${active ? 'bg-accent/20 text-accent/70' : 'bg-surface text-muted/60'}`}>
                    {cfg.stocks.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Style description banner */}
        <div className="mt-2.5 flex items-center gap-2 text-[11px] text-muted/80 bg-surface2/50 rounded-lg px-3 py-2 border border-border/30">
          <span className="text-base leading-none">{activeConfig.icon}</span>
          <span>{activeConfig.desc}</span>
          {investStyle !== 'all' && (
            <span className="ml-auto flex gap-2 flex-shrink-0 text-[10px]">
              <span className="text-blue-400">KT {Math.round(activeConfig.weights.tech * 100)}%</span>
              <span className="text-green-400">CB {Math.round(activeConfig.weights.fund * 100)}%</span>
              <span className="text-purple-400">TL {Math.round(activeConfig.weights.sent * 100)}%</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Header / Scan controls ── */}
      <div className="card-glass p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-accent" />
            <span className="font-semibold text-sm">Bộ Lọc Cổ Phiếu</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20 font-bold">SCANNER</span>
          </div>
          <p className="text-[11px] text-muted flex-1">
            {useCustom ? 'Mã tùy chỉnh' : `${effectivePool.length} mã · ${activeConfig.label}`} — xếp hạng theo {investStyle !== 'all' ? 'điểm phong cách' : 'điểm tổng'}
          </p>
          <button
            onClick={scan}
            disabled={scanning}
            className="px-4 py-2 bg-accent text-bg text-sm font-semibold rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {scanning
              ? <><span className="w-4 h-4 border-2 border-bg/30 border-t-bg rounded-full animate-spin" />Đang quét {progress}/{total}</>
              : <><Zap className="w-4 h-4" />Quét {effectivePool.length} mã</>
            }
          </button>
        </div>

        {/* Custom symbols */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="use-custom"
            checked={useCustom}
            onChange={e => setUseCustom(e.target.checked)}
            className="w-3.5 h-3.5 accent-[var(--accent)]"
          />
          <label htmlFor="use-custom" className="text-[11px] text-muted cursor-pointer">Mã tùy chỉnh:</label>
          <input
            type="text"
            value={customSymbols}
            onChange={e => setCustomSymbols(e.target.value.toUpperCase())}
            placeholder="VD: FPT, VNM, ACB, HPG"
            disabled={!useCustom}
            className="flex-1 bg-surface2 border border-border/60 rounded px-2.5 py-1 text-xs text-gray-200 placeholder-muted/50 focus:outline-none focus:border-accent disabled:opacity-40"
          />
        </div>

        {/* Progress bar */}
        {scanning && total > 0 && (
          <div className="w-full bg-surface2 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${(progress / total) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* ── Summary badges (after scan) ── */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[11px] text-muted font-medium">Kết quả:</span>
          {(['ALL', 'MUA MẠNH', 'MUA', 'GIỬ', 'BÁN', 'BÁN MẠNH'] as RecFilter[]).map(rec => {
            const count = rec === 'ALL' ? rows.filter(r => r.status === 'done').length : recCounts[rec as keyof typeof recCounts]
            if (rec !== 'ALL' && !count) return null
            return (
              <button key={rec}
                onClick={() => setFilter(rec)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  filter === rec ? getRecBadge(rec === 'ALL' ? '' : rec) + ' ring-1 ring-white/10' : 'border-border/40 text-muted hover:text-gray-200'
                }`}
              >
                {rec === 'ALL' ? `Tất cả (${count})` : `${rec} (${count})`}
              </button>
            )
          })}
          {errors > 0 && <span className="text-[11px] text-red-400/60">{errors} lỗi</span>}
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">
            <span>Điểm tối thiểu:</span>
            {[0, 40, 55, 70].map(v => (
              <button key={v} onClick={() => setMinScore(v)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${minScore === v ? 'bg-accent/20 text-accent' : 'text-muted hover:text-gray-200'}`}
              >{v === 0 ? 'Tất cả' : `≥${v}`}</button>
            ))}
          </span>
        </div>
      )}

      {/* ── Table ── */}
      {filtered.length > 0 && (
        <div className="card-glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-surface/30">
                  <th className="text-left px-3 py-2.5 text-muted font-medium w-12">#</th>
                  <th className="text-left px-3 py-2.5 text-muted font-medium">Mã</th>
                  <th className="text-right px-3 py-2.5 text-muted font-medium">Giá</th>
                  <th className="text-center px-2 py-2.5 text-muted font-medium">Khuyến nghị</th>
                  <th
                    className={`text-right px-3 py-2.5 font-medium cursor-pointer hover:text-accent ${sortBy === 'score' ? 'text-accent' : 'text-muted'}`}
                    onClick={() => setSortBy('score')}
                  >
                    {investStyle !== 'all' ? 'Điểm PC' : 'Điểm'}{sortBy === 'score' && ' ↓'}
                  </th>
                  <th
                    className={`text-right px-2 py-2.5 font-medium cursor-pointer hover:text-accent hidden sm:table-cell ${sortBy === 'tech' ? 'text-accent' : 'text-muted'}`}
                    onClick={() => setSortBy('tech')}
                  >KT{sortBy === 'tech' && ' ↓'}</th>
                  <th
                    className={`text-right px-2 py-2.5 font-medium cursor-pointer hover:text-accent hidden sm:table-cell ${sortBy === 'fund' ? 'text-accent' : 'text-muted'}`}
                    onClick={() => setSortBy('fund')}
                  >CB{sortBy === 'fund' && ' ↓'}</th>
                  <th
                    className={`text-right px-2 py-2.5 font-medium cursor-pointer hover:text-accent hidden sm:table-cell ${sortBy === 'sent' ? 'text-accent' : 'text-muted'}`}
                    onClick={() => setSortBy('sent')}
                  >TL{sortBy === 'sent' && ' ↓'}</th>
                  <th className="text-right px-3 py-2.5 text-muted font-medium hidden md:table-cell">Mục tiêu</th>
                  <th className="text-right px-3 py-2.5 text-muted font-medium hidden md:table-cell">Cắt lỗ</th>
                  <th
                    className={`text-right px-3 py-2.5 font-medium cursor-pointer hover:text-accent hidden lg:table-cell ${sortBy === 'rr' ? 'text-accent' : 'text-muted'}`}
                    onClick={() => setSortBy('rr')}
                  >R/R{sortBy === 'rr' && ' ↓'}</th>
                  <th className="text-right px-3 py-2.5 text-muted font-medium hidden sm:table-cell">%1N</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filtered.map((row, idx) => (
                  <tr key={row.symbol} className="hover:bg-surface2/40 transition-colors">
                    <td className="px-3 py-2 text-muted/60">{idx + 1}</td>
                    <td className="px-3 py-2 font-bold text-accent">{row.symbol}</td>
                    <td className="px-3 py-2 text-right text-gray-200 font-medium">{fmtPrice(row.price)}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${getRecBadge(row.recommendation)}`}>
                        {row.recommendation}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right font-bold ${getScoreColor(displayScore(row))}`}>
                      {displayScore(row)}
                      {investStyle !== 'all' && row.overallScore !== row.styleScore && (
                        <span className="text-[9px] text-muted/50 ml-0.5">({row.overallScore})</span>
                      )}
                    </td>
                    <td className={`px-2 py-2 text-right hidden sm:table-cell ${getScoreColor(row.technicalScore)}`}>{row.technicalScore}</td>
                    <td className={`px-2 py-2 text-right hidden sm:table-cell ${getScoreColor(row.fundamentalScore)}`}>{row.fundamentalScore}</td>
                    <td className={`px-2 py-2 text-right hidden sm:table-cell ${getScoreColor(row.sentimentScore)}`}>{row.sentimentScore}</td>
                    <td className="px-3 py-2 text-right text-green-400 hidden md:table-cell">
                      {row.targetPrice > 0 ? (
                        <span title={fmtPrice(row.targetPrice)}>
                          +{Math.round((row.targetPrice - row.price) / row.price * 100)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-red-400 hidden md:table-cell">
                      {row.stopLoss > 0 && row.stopLoss < row.price ? (
                        <span title={fmtPrice(row.stopLoss)}>
                          -{Math.round((row.price - row.stopLoss) / row.price * 100)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right hidden lg:table-cell font-medium ${row.rrRatio >= 2 ? 'text-green-400' : row.rrRatio >= 1 ? 'text-yellow-400' : 'text-muted'}`}>
                      {row.rrRatio > 0 ? `${row.rrRatio}:1` : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right hidden sm:table-cell ${row.changePct > 0 ? 'text-green-400' : row.changePct < 0 ? 'text-red-400' : 'text-muted'}`}>
                      {row.changePct !== 0 ? `${row.changePct > 0 ? '+' : ''}${row.changePct.toFixed(2)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-border/30 flex items-center justify-between text-[10px] text-muted">
            <span>
              {filtered.length} mã · {activeConfig.label} ·
              Sắp xếp: {sortBy === 'score' ? (investStyle !== 'all' ? 'Điểm phong cách' : 'Điểm tổng') : sortBy === 'tech' ? 'Kỹ thuật' : sortBy === 'fund' ? 'Cơ bản' : sortBy === 'sent' ? 'Tâm lý' : 'R/R'}
            </span>
            <span className="flex items-center gap-1">
              <Filter className="w-3 h-3" />
              KT=Kỹ thuật · CB=Cơ bản · TL=Tâm lý · PC=Phong cách
            </span>
          </div>
        </div>
      )}

      {rows.length > 0 && filtered.length === 0 && (
        <div className="card-glass p-8 text-center text-muted text-sm">
          Không có mã nào khớp bộ lọc hiện tại
        </div>
      )}

      {rows.length === 0 && !scanning && (
        <div className="card-glass p-8 text-center space-y-2">
          <Search className="w-8 h-8 text-muted/40 mx-auto" />
          <p className="text-sm text-muted">
            Nhấn <span className="text-accent font-semibold">Quét</span> để phân tích{' '}
            <span className="text-accent font-semibold">{effectivePool.length} mã</span>{' '}
            <span className="text-gray-400">· {activeConfig.label}</span>
          </p>
          <p className="text-[11px] text-muted/60">
            Mỗi mã chạy SmartScore đầy đủ · Thời gian ~{Math.ceil(effectivePool.length / 5) * 0.4 + 1}-{Math.ceil(effectivePool.length / 5) * 0.8 + 2} phút
            {investStyle !== 'all' && ` · ${scoreLabel}: KT ${Math.round(activeConfig.weights.tech * 100)}% + CB ${Math.round(activeConfig.weights.fund * 100)}% + TL ${Math.round(activeConfig.weights.sent * 100)}%`}
          </p>
        </div>
      )}
    </div>
  )
}
