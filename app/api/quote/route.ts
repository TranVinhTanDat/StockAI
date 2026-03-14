import { NextRequest, NextResponse } from 'next/server'
import { fetchQuote } from '@/lib/tcbs'

async function fetchWithRetry(symbol: string, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchQuote(symbol)
    } catch (error) {
      if (i === retries) throw error
      // Wait before retry (stagger to avoid rate limit)
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw new Error('Exhausted retries')
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')

  if (!symbol) {
    return NextResponse.json(
      { error: 'Missing symbol parameter' },
      { status: 400 }
    )
  }

  try {
    const quote = await fetchWithRetry(symbol.toUpperCase())
    return NextResponse.json(quote)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch quote'
    console.error(`[quote] ${symbol}: ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

