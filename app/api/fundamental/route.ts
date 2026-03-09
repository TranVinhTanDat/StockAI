import { NextRequest, NextResponse } from 'next/server'
import { fetchFundamental } from '@/lib/tcbs'

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')

  if (!symbol) {
    return NextResponse.json(
      { error: 'Missing symbol parameter' },
      { status: 400 }
    )
  }

  try {
    const data = await fetchFundamental(symbol)
    return NextResponse.json(data)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch fundamental'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
