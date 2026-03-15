import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || url.includes('xxx')) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

function setupVapid() {
  const publicKey  = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const email      = process.env.VAPID_EMAIL || 'mailto:admin@stockai.vn'
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(email, publicKey, privateKey)
  return true
}

// POST /api/push/notify — send push notification to a specific endpoint or all user's endpoints
export async function POST(request: NextRequest) {
  try {
    if (!setupVapid()) {
      // VAPID not configured — silently succeed (browser notification handles it)
      return NextResponse.json({ ok: true, sent: 0, reason: 'vapid_not_configured' })
    }

    const { endpoint, userId, anonymousId, payload } = await request.json()

    const sb = getServerSupabase()
    if (!sb) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'no_db' })
    }

    // Find subscriptions to notify
    let query = sb.from('push_subscriptions').select('subscription, endpoint')
    if (endpoint) {
      query = query.eq('endpoint', endpoint)
    } else if (userId) {
      query = query.eq('user_id', userId)
    } else if (anonymousId) {
      query = query.eq('anonymous_id', anonymousId)
    } else {
      return NextResponse.json({ error: 'Provide endpoint, userId, or anonymousId' }, { status: 400 })
    }

    const { data: rows } = await query
    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'no_subscriptions' })
    }

    const notification = JSON.stringify({
      title: payload?.title || 'StockAI VN — Cảnh báo giá',
      body: payload?.body || '',
      tag: payload?.tag || 'stockai-alert',
      url: payload?.url || '/',
    })

    let sent = 0
    const staleEndpoints: string[] = []

    await Promise.all(
      rows.map(async (row) => {
        try {
          await webpush.sendNotification(row.subscription, notification)
          sent++
        } catch (err: unknown) {
          // 410 Gone = subscription expired, remove it
          if (err && typeof err === 'object' && 'statusCode' in err) {
            const status = (err as { statusCode: number }).statusCode
            if (status === 410 || status === 404) {
              staleEndpoints.push(row.endpoint)
            }
          }
        }
      })
    )

    // Cleanup stale subscriptions
    if (staleEndpoints.length > 0) {
      await sb.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
    }

    return NextResponse.json({ ok: true, sent })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
