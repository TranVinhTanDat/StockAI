import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyToken } from '@/lib/jwt'
import { sendAlertEmail } from '@/lib/email'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// POST { alertId, currentPrice } — trigger an alert and send email
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!rawToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await verifyToken(rawToken)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const sb = getAdminClient()
  if (!sb) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

  const { alertId, currentPrice } = await request.json()
  if (!alertId || currentPrice === undefined) {
    return NextResponse.json({ error: 'Missing alertId or currentPrice' }, { status: 400 })
  }

  // Fetch the alert — must belong to user and be active
  const { data: alert, error: alertErr } = await sb
    .from('alerts')
    .select('id, user_id, symbol, condition, target_price, is_active, triggered_at')
    .eq('id', alertId)
    .eq('user_id', payload.sub)
    .maybeSingle()

  if (alertErr || !alert) {
    return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
  }
  if (!alert.is_active || alert.triggered_at) {
    return NextResponse.json({ ok: true, skipped: true }) // already triggered
  }

  // Mark as triggered
  await sb
    .from('alerts')
    .update({ is_active: false, triggered_at: new Date().toISOString() })
    .eq('id', alertId)

  // Fetch user email
  const { data: user } = await sb
    .from('app_users')
    .select('email')
    .eq('id', payload.sub)
    .maybeSingle()

  if (user?.email) {
    try {
      await sendAlertEmail(user.email, {
        symbol: alert.symbol,
        condition: alert.condition as 'ABOVE' | 'BELOW',
        targetPrice: alert.target_price,
        currentPrice,
      })
    } catch (e) {
      console.error('[Alert trigger] Email send failed:', e)
      // Don't fail the request — alert is already marked triggered
    }
  }

  return NextResponse.json({ ok: true })
}
