import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await fetch(
      'https://api.exchangerate-api.com/v4/latest/USD',
      { next: { revalidate: 300 } }
    )

    if (!res.ok) {
      throw new Error('Failed to fetch exchange rates')
    }

    const data = await res.json()

    return NextResponse.json({
      usdVnd: data.rates?.VND || 24850,
      eurVnd: (data.rates?.VND || 24850) / (data.rates?.EUR || 0.92),
      updatedAt: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json({
      usdVnd: 24850,
      eurVnd: 27000,
      updatedAt: new Date().toISOString(),
    })
  }
}
