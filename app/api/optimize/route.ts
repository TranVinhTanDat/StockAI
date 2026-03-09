import { NextRequest, NextResponse } from 'next/server'
import { optimizePortfolio } from '@/lib/claude'
import { INDUSTRY_MAP } from '@/lib/utils'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { holdings } = body

    if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
      return NextResponse.json(
        { error: 'No holdings provided' },
        { status: 400 }
      )
    }

    if (!process.env.CLAUDE_API_KEY) {
      return NextResponse.json(
        { error: 'Claude API key not configured' },
        { status: 500 }
      )
    }

    const totalValue = holdings.reduce(
      (sum: number, h: { qty: number; currentPrice: number }) =>
        sum + h.qty * h.currentPrice,
      0
    )

    const enriched = holdings.map(
      (h: { symbol: string; qty: number; avgCost: number; currentPrice: number }) => ({
        symbol: h.symbol,
        qty: h.qty,
        avgCost: h.avgCost,
        currentPrice: h.currentPrice,
        industry: INDUSTRY_MAP[h.symbol] || 'Khác',
        weight: totalValue > 0 ? ((h.qty * h.currentPrice) / totalValue) * 100 : 0,
        pnlPct:
          h.avgCost > 0
            ? ((h.currentPrice - h.avgCost) / h.avgCost) * 100
            : 0,
      })
    )

    const result = await optimizePortfolio({
      holdings: enriched,
      totalValue,
    })

    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Optimization failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
