import { NextRequest, NextResponse } from 'next/server'
import {
  VN30, VN100, VN_MIDCAP, VN_SMALLCAP, VN_DIAMOND,
  VN_FIN_LEAD, VN_FIN_SELECT, VN_DIVIDEND, VN_MITECH,
  VN_FIN, VN_IND, VN_MAT, VN_IT, VN_REAL, VN_CONS, VN_ENE, VN_HEAL,
  HNX30, HNX_ALL, UPCOM_POPULAR, EXTENDED, HOSE_FULL,
  COMPANY_NAMES,
} from '@/lib/priceboard-data'
import type { StockBoard } from '@/lib/priceboard-data'

export type { StockBoard }

const VPS_QUOTE_URL = 'https://bgapidatafeed.vps.com.vn/getliststockdata'
const VPS_INDEX_URL = 'https://bgapidatafeed.vps.com.vn/getIndexIntraday'

const EXCHANGE_MAP: Record<string, string> = {
  STO: 'HOSE', HNO: 'HNX', UPC: 'UPCOM',
}

// ─── VPS raw type ─────────────────────────────────────────────────────────────
interface VPSRaw {
  sym: string; mc?: string; marketId?: string
  lastPrice?: number; c?: number; r?: number
  ce?: number; f?: number; fl?: number
  hp?: number; lp?: number; ot?: number
  lot?: number; lastVolume?: number; vol?: number
  pcp?: number; change?: number; aveP?: number; val?: number
  g1?: number; gv1?: number; g2?: number; gv2?: number; g3?: number; gv3?: number
  s1?: number; sv1?: number; s2?: number; sv2?: number; s3?: number; sv3?: number
  nmVolume?: number; nsVolume?: number
  t?: number
}

function normalize(raw: VPSRaw): StockBoard {
  const mc = raw.marketId || raw.mc || 'STO'
  const price = (raw.lastPrice || raw.c || 0) * 1000
  const ref = (raw.r || 0) * 1000

  let ceil = (raw.ce || 0) * 1000
  let floor = (raw.f || raw.fl || 0) * 1000
  if (ceil === 0 && ref > 0) {
    const pct = mc === 'HNO' ? 0.10 : mc === 'UPC' ? 0.15 : 0.07
    ceil  = Math.round(ref * (1 + pct) / 100) * 100
    floor = Math.round(ref * (1 - pct) / 100) * 100
  }

  const change = price - ref
  const changePct = ref > 0 ? (change / ref) * 100 : 0

  return {
    sym: raw.sym,
    name: COMPANY_NAMES[raw.sym] || raw.sym,
    exchange: EXCHANGE_MAP[mc] || 'HOSE',
    price, ref, ceil, floor,
    high: (raw.hp || 0) * 1000,
    low: (raw.lp || 0) * 1000,
    open: (raw.ot || 0) * 1000,
    avgPrice: (raw.aveP || 0) * 1000,
    vol: raw.lot || raw.lastVolume || raw.vol || 0,
    totalVal: raw.val || 0,
    change,
    changePct,
    bid: [
      { p: (raw.g1 || 0) * 1000, v: raw.gv1 || 0 },
      { p: (raw.g2 || 0) * 1000, v: raw.gv2 || 0 },
      { p: (raw.g3 || 0) * 1000, v: raw.gv3 || 0 },
    ],
    ask: [
      { p: (raw.s1 || 0) * 1000, v: raw.sv1 || 0 },
      { p: (raw.s2 || 0) * 1000, v: raw.sv2 || 0 },
      { p: (raw.s3 || 0) * 1000, v: raw.sv3 || 0 },
    ],
    foreignBuy: raw.nmVolume || 0,
    foreignSell: raw.nsVolume || 0,
    updatedAt: raw.t ? raw.t * 1000 : Date.now(),
  }
}

async function fetchVPSBatch(symbols: string[]): Promise<StockBoard[]> {
  if (symbols.length === 0) return []
  const results: StockBoard[] = []
  for (let i = 0; i < symbols.length; i += 100) {
    const batch = symbols.slice(i, i + 100).join(',')
    try {
      const res = await fetch(`${VPS_QUOTE_URL}/${batch}`, {
        cache: 'no-store',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) continue
      const json = await res.json()
      const arr: VPSRaw[] = Array.isArray(json) ? json : [json]
      results.push(...arr.filter(v => v && v.sym).map(normalize))
    } catch { /* partial results ok */ }
  }
  return results
}

async function fetchIndex(indexCode: string): Promise<{ value: number; change: number; changePct: number } | null> {
  try {
    const res = await fetch(`${VPS_INDEX_URL}/${indexCode}`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const json = await res.json()
    const arr = Array.isArray(json) ? json : (json.data || [])
    if (arr.length === 0) return null
    const last = arr[arr.length - 1]
    const value = last.indexValue || last.c || last.value || 0
    const change = last.change || last.d || 0
    const changePct = last.percentChange || last.pct || (value > 0 ? change / (value - change) * 100 : 0)
    return { value, change, changePct }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const group = searchParams.get('group') || 'vn30'
  const symbolsParam = searchParams.get('symbols')
  const withIndex = searchParams.get('withIndex') === '1'

  let symbols: string[]
  if (symbolsParam) {
    symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  } else {
    switch (group) {
      case 'vn30':        symbols = VN30; break
      case 'vn100':       symbols = VN100; break
      case 'vnmidcap':    symbols = VN_MIDCAP; break
      case 'vnsmallcap':  symbols = VN_SMALLCAP; break
      case 'vnallshare':  symbols = Array.from(new Set([...VN100, ...VN_MIDCAP, ...VN_SMALLCAP])); break
      case 'hose':        symbols = HOSE_FULL; break
      case 'vndiamond':   symbols = VN_DIAMOND; break
      case 'vnfinlead':   symbols = VN_FIN_LEAD; break
      case 'vnfinselect': symbols = VN_FIN_SELECT; break
      case 'vndividend':  symbols = VN_DIVIDEND; break
      case 'vnmitech':    symbols = VN_MITECH; break
      case 'hnx30':       symbols = HNX30; break
      case 'hnx':         symbols = HNX_ALL; break
      case 'upcom':       symbols = UPCOM_POPULAR; break
      case 'upcom_all':   symbols = UPCOM_POPULAR; break
      case 'vnfin':       symbols = VN_FIN; break
      case 'vnind':       symbols = VN_IND; break
      case 'vnmat':       symbols = VN_MAT; break
      case 'vnit':        symbols = VN_IT; break
      case 'vnreal':      symbols = VN_REAL; break
      case 'vncons':      symbols = VN_CONS; break
      case 'vnene':       symbols = VN_ENE; break
      case 'vnheal':      symbols = VN_HEAL; break
      case 'all':         symbols = Array.from(new Set([...HOSE_FULL, ...HNX_ALL, ...UPCOM_POPULAR])); break
      case 'extended':    symbols = EXTENDED; break
      default:            symbols = VN30
    }
  }

  const [stocks, vnIndex, hnxIndex] = await Promise.all([
    fetchVPSBatch(symbols),
    withIndex ? fetchIndex('VNINDEX') : Promise.resolve(null),
    withIndex ? fetchIndex('HNXINDEX') : Promise.resolve(null),
  ])

  return NextResponse.json({ stocks, vnIndex, hnxIndex, ts: Date.now() })
}
