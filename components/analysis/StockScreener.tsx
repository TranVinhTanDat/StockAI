'use client'

import { useState, useCallback } from 'react'
import { Search, Zap, TrendingUp, TrendingDown, Minus, RefreshCw, Filter } from 'lucide-react'
import type { SmartScoreResult } from '@/lib/smartScore'

// Top 60 VN stocks: VN30 + VNMID + some liquids
const VN_STOCK_LIST = [
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

interface ScreenerRow {
  symbol: string
  price: number
  recommendation: string
  overallScore: number
  technicalScore: number
  fundamentalScore: number
  sentimentScore: number
  targetPrice: number
  stopLoss: number
  rrRatio: number
  changePct: number
  status: 'pending' | 'done' | 'error'
}

type RecFilter = 'ALL' | 'MUA MẠNH' | 'MUA' | 'GIỬ' | 'BÁN' | 'BÁN MẠNH'

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

  const scan = useCallback(async () => {
    const symbols = useCustom && customSymbols.trim()
      ? customSymbols.toUpperCase().split(/[\s,]+/).filter(Boolean)
      : VN_STOCK_LIST

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
            results.push({ symbol: sym, price: 0, recommendation: '—', overallScore: 0, technicalScore: 0, fundamentalScore: 0, sentimentScore: 0, targetPrice: 0, stopLoss: 0, rrRatio: 0, changePct: 0, status: 'error' })
            return
          }
          const d: SmartScoreResult & { changePct?: number } = await res.json()
          results.push({
            symbol: sym,
            price: d.price,
            recommendation: d.recommendation,
            overallScore: d.overallScore,
            technicalScore: d.technical.score,
            fundamentalScore: d.fundamental.score,
            sentimentScore: d.sentiment.score,
            targetPrice: d.targetPrice,
            stopLoss: d.stopLoss,
            rrRatio: d.rrRatio,
            changePct: d.changePct ?? 0,
            status: 'done',
          })
        } catch {
          results.push({ symbol: sym, price: 0, recommendation: '—', overallScore: 0, technicalScore: 0, fundamentalScore: 0, sentimentScore: 0, targetPrice: 0, stopLoss: 0, rrRatio: 0, changePct: 0, status: 'error' })
        }
      }))
      setProgress(Math.min(i + BATCH, symbols.length))
      setRows([...results])
      if (i + BATCH < symbols.length) await new Promise(r => setTimeout(r, 300))
    }

    setScanning(false)
  }, [useCustom, customSymbols])

  const filtered = rows
    .filter(r => r.status === 'done')
    .filter(r => filter === 'ALL' || r.recommendation === filter)
    .filter(r => r.overallScore >= minScore)
    .sort((a, b) => {
      if (sortBy === 'score') return b.overallScore - a.overallScore
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card-glass p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-accent" />
            <span className="font-semibold text-sm">Bộ Lọc Cổ Phiếu</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20 font-bold">SCANNER</span>
          </div>
          <p className="text-[11px] text-muted flex-1">Quét SmartScore tự động {VN_STOCK_LIST.length} mã VN30+VNMID — xếp hạng theo điểm</p>
          <button
            onClick={scan}
            disabled={scanning}
            className="px-4 py-2 bg-accent text-bg text-sm font-semibold rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {scanning
              ? <><span className="w-4 h-4 border-2 border-bg/30 border-t-bg rounded-full animate-spin" />Đang quét {progress}/{total}</>
              : <><Zap className="w-4 h-4" />Quét {total || VN_STOCK_LIST.length} mã</>
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

      {/* Summary badges (after scan) */}
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

      {/* Table */}
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
                  >Điểm{sortBy === 'score' && ' ↓'}</th>
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
                    <td className={`px-3 py-2 text-right font-bold ${getScoreColor(row.overallScore)}`}>{row.overallScore}</td>
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
            <span>{filtered.length} mã · Sắp xếp theo: {sortBy === 'score' ? 'Điểm tổng' : sortBy === 'tech' ? 'Kỹ thuật' : sortBy === 'fund' ? 'Cơ bản' : sortBy === 'sent' ? 'Tâm lý' : 'R/R'}</span>
            <span className="flex items-center gap-1"><Filter className="w-3 h-3" />KT=Kỹ thuật · CB=Cơ bản · TL=Tâm lý · R/R=Risk/Reward</span>
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
          <p className="text-sm text-muted">Nhấn <span className="text-accent font-semibold">Quét</span> để phân tích {VN_STOCK_LIST.length} mã cổ phiếu</p>
          <p className="text-[11px] text-muted/60">Mỗi mã chạy SmartScore đầy đủ · Thời gian ~2-3 phút · Xếp hạng theo điểm tổng hợp</p>
        </div>
      )}
    </div>
  )
}
