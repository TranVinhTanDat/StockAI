import { NextRequest, NextResponse } from 'next/server'
import { fetchQuote } from '@/lib/tcbs'

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')

  if (!symbol) {
    return NextResponse.json(
      { error: 'Missing symbol parameter' },
      { status: 400 }
    )
  }

  try {
    const quote = await fetchQuote(symbol)
    return NextResponse.json(quote)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch quote'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
