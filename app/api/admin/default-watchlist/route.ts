import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyToken } from '@/lib/jwt'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!rawToken) return null
  const payload = await verifyToken(rawToken)
  if (!payload || payload.role !== 'admin') return null
  return payload
}

// GET — list default watchlist (public, no auth required)
export async function GET() {
  const sb = getAdminClient()
  if (!sb) return NextResponse.json({ items: [] })

  const { data, error } = await sb
    .from('default_watchlist')
    .select('id, symbol, sort_order, added_at')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

// POST — add symbol (admin only)
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getAdminClient()
  if (!sb) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

  const { symbol } = await request.json()
  if (!symbol || typeof symbol !== 'string') {
    return NextResponse.json({ error: 'Thiếu symbol' }, { status: 400 })
  }
  const sym = symbol.trim().toUpperCase()

  // Get next sort_order
  const { data: last } = await sb
    .from('default_watchlist')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sortOrder = (last?.sort_order ?? -1) + 1

  const { data, error } = await sb
    .from('default_watchlist')
    .insert({ symbol: sym, sort_order: sortOrder, added_by: admin.sub })
    .select('id, symbol, sort_order, added_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `${sym} đã có trong danh sách mặc định` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data })
}

// DELETE — remove symbol (admin only)
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getAdminClient()
  if (!sb) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await sb.from('default_watchlist').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
