import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyToken } from '@/lib/jwt'

function getAdminClient() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY
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

// GET /api/admin/users — list all users (admin only)
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getAdminClient()
  if (!sb) return NextResponse.json({ error: 'Admin client not configured. Set SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 })

  const { data: users, error } = await sb
    .from('app_users')
    .select('id, username, role, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ users })
}

// PATCH /api/admin/users — update role
export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getAdminClient()
  if (!sb) return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 })

  const { userId, role } = await request.json()
  if (!userId || !['admin', 'user'].includes(role)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  if (userId === admin.sub) {
    return NextResponse.json({ error: 'Không thể tự đổi role của mình' }, { status: 400 })
  }

  const { error } = await sb.from('app_users').update({ role }).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
