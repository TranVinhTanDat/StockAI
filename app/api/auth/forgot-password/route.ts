import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendOtpEmail } from '@/lib/email'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

// POST { email } — generate OTP and send email
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ ok: true }) // always succeed (don't reveal email existence)
    }

    const sb = getAdminClient()
    if (!sb) {
      return NextResponse.json({ ok: true }) // silent fail if not configured
    }

    // Look up user by email
    const { data: user } = await sb
      .from('app_users')
      .select('id, username, email')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle()

    if (!user) {
      return NextResponse.json({ ok: true }) // don't reveal existence
    }

    const otp = generateOtp()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min

    await sb.from('password_reset_otps').insert({
      email: user.email,
      otp,
      expires_at: expiresAt,
    })

    await sendOtpEmail(user.email, otp, user.username)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[forgot-password]', e)
    return NextResponse.json({ ok: true }) // always succeed to avoid info leak
  }
}
