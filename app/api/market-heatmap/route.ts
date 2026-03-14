import { NextResponse } from 'next/server'
import { INDUSTRY_MAP } from '@/lib/utils'

const VPS_QUOTE_URL = 'https://bgapidatafeed.vps.com.vn/getliststockdata'

const HEATMAP_SYMBOLS = [
  'FPT', 'VNM', 'VIC', 'HPG', 'MWG', 'VHM', 'TCB', 'BID', 'VCB', 'GAS',
  'MBB', 'ACB', 'STB', 'SSI', 'MSN', 'SAB', 'PLX', 'CTG', 'VPB', 'NLG',
  'VCI', 'HCM', 'REE', 'PNJ', 'DGC', 'NVL', 'PDR', 'KDH', 'HSG', 'POW',
]

export interface HeatmapCell {
  symbol: string
  price: number
  changePct: number
  industry: string
}

// VPS API returns these fields — some may be strings despite numeric appearance
interface VPSRaw {
  sym?: string
  lastPrice?: number | string
  r?: number | string   // reference (previous close) price
  changePc?: number | string  // % change — comes as string e.g. "0.90"
}

export async function GET() {
  try {
    const batch = HEATMAP_SYMBOLS.join(',')
    const res = await fetch(`${VPS_QUOTE_URL}/${batch}`, {
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      return NextResponse.json({ error: `VPS API ${res.status}` }, { status: 502 })
    }

    const raw: VPSRaw[] = await res.json()
    const items = Array.isArray(raw) ? raw : [raw]

    const cells: HeatmapCell[] = items
      .filter((q) => q.sym)
      .map((q) => {
        const symbol = (q.sym as string).toUpperCase()

        // lastPrice is a number in thousands VND
        const price = (parseFloat(String(q.lastPrice || 0))) * 1000

        // changePc comes as a string like "0.90" — parse it
        const changePct = q.changePc !== undefined && q.changePc !== null
          ? parseFloat(String(q.changePc))
          : (() => {
              const ref = parseFloat(String(q.r || 0)) * 1000
              return ref > 0 ? ((price - ref) / ref) * 100 : 0
            })()

        return {
          symbol,
          price,
          changePct: isNaN(changePct) ? 0 : parseFloat(changePct.toFixed(2)),
          industry: INDUSTRY_MAP[symbol] || 'Khác',
        }
      })

    return NextResponse.json(cells)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
