import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyToken } from '@/lib/jwt'

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || url.includes('xxx')) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

// POST /api/push/subscribe — save push subscription for current user
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const userId = rawToken ? (await verifyToken(rawToken))?.sub : null

    const body = await request.json()
    const { subscription, anonymousId } = body

    if (!subscription?.endpoint) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }

    const sb = getServerSupabase()
    if (!sb) {
      // No Supabase — just acknowledge (push won't work server-side without storage)
      return NextResponse.json({ ok: true, stored: false })
    }

    // Upsert subscription by endpoint
    await sb.from('push_subscriptions').upsert({
      endpoint: subscription.endpoint,
      subscription: subscription,
      user_id: userId || null,
      anonymous_id: anonymousId || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' })

    return NextResponse.json({ ok: true, stored: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/push/subscribe — remove subscription
export async function DELETE(request: NextRequest) {
  try {
    const { endpoint } = await request.json()
    if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

    const sb = getServerSupabase()
    if (!sb) return NextResponse.json({ ok: true })

    await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
