import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { verifyToken } from '@/lib/jwt'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// POST { currentPassword, newPassword } + Bearer JWT — change password for logged-in user
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!rawToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await verifyToken(rawToken)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { currentPassword, newPassword } = await request.json()
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Thiếu mật khẩu hiện tại hoặc mật khẩu mới' }, { status: 400 })
  }
  if ((newPassword as string).length < 6) {
    return NextResponse.json({ error: 'Mật khẩu mới tối thiểu 6 ký tự' }, { status: 400 })
  }

  const sb = getAdminClient()
  if (!sb) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

  // Fetch current password hash
  const { data: user } = await sb
    .from('app_users')
    .select('id, password_hash')
    .eq('id', payload.sub)
    .maybeSingle()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const valid = await bcrypt.compare(currentPassword as string, user.password_hash)
  if (!valid) {
    return NextResponse.json({ error: 'Mật khẩu hiện tại không đúng' }, { status: 400 })
  }

  const password_hash = await bcrypt.hash(newPassword as string, 10)
  const { error } = await sb
    .from('app_users')
    .update({ password_hash })
    .eq('id', payload.sub)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
