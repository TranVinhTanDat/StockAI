import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { jwtVerify } from 'jose'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-please-change-in-production')
}

// POST { reset_token, newPassword } — set new password using reset token
export async function POST(request: NextRequest) {
  const { reset_token, newPassword } = await request.json()
  if (!reset_token || !newPassword) {
    return NextResponse.json({ error: 'Thiếu reset_token hoặc mật khẩu mới' }, { status: 400 })
  }
  if ((newPassword as string).length < 6) {
    return NextResponse.json({ error: 'Mật khẩu tối thiểu 6 ký tự' }, { status: 400 })
  }

  // Verify reset token
  let email: string
  try {
    const { payload } = await jwtVerify(reset_token, getSecret())
    if ((payload as Record<string, unknown>).purpose !== 'reset') throw new Error('Invalid purpose')
    email = payload.email as string
    if (!email) throw new Error('No email in token')
  } catch {
    return NextResponse.json({ error: 'Reset token không hợp lệ hoặc đã hết hạn' }, { status: 400 })
  }

  const sb = getAdminClient()
  if (!sb) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

  const password_hash = await bcrypt.hash(newPassword as string, 10)
  const { error } = await sb
    .from('app_users')
    .update({ password_hash })
    .eq('email', email.toLowerCase().trim())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
