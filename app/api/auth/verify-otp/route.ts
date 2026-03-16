import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-please-change-in-production')
}

// POST { email, otp } — verify OTP and return short-lived reset token
export async function POST(request: NextRequest) {
  const { email, otp } = await request.json()
  if (!email || !otp) {
    return NextResponse.json({ error: 'Thiếu email hoặc OTP' }, { status: 400 })
  }

  const sb = getAdminClient()
  if (!sb) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

  const now = new Date().toISOString()

  // Find valid, unused OTP
  const { data: record } = await sb
    .from('password_reset_otps')
    .select('id, email, otp, expires_at, used_at')
    .eq('email', email.toLowerCase().trim())
    .eq('otp', otp)
    .is('used_at', null)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!record) {
    return NextResponse.json({ error: 'OTP không đúng hoặc đã hết hạn' }, { status: 400 })
  }

  // Mark OTP as used
  await sb
    .from('password_reset_otps')
    .update({ used_at: now })
    .eq('id', record.id)

  // Issue a short-lived reset token (15 min)
  const reset_token = await new SignJWT({ email: record.email, purpose: 'reset' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getSecret())

  return NextResponse.json({ reset_token })
}
