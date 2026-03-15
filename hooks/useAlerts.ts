'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getAlerts,
  addAlert,
  updateAlert,
  deleteAlert,
} from '@/lib/storage'
import { getUserId } from '@/lib/utils'
import type { Alert } from '@/types'

// ── Web Push helpers ───────────────────────────────────────────────────────────

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const arr = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i)
  return arr.buffer
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready
    return reg
  } catch {
    return null
  }
}

async function subscribeToPush(reg: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  if (!VAPID_PUBLIC_KEY) return null
  try {
    const existing = await reg.pushManager.getSubscription()
    if (existing) return existing
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  } catch {
    return null
  }
}

async function sendSubscriptionToServer(sub: PushSubscription, token?: string): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers,
      body: JSON.stringify({ subscription: sub.toJSON(), anonymousId: getUserId() }),
    })
  } catch {
    // Non-critical — ignore errors
  }
}

async function sendPushNotification(payload: {
  title: string
  body: string
  tag?: string
  url?: string
}, endpoint: string, token?: string): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    await fetch('/api/push/notify', {
      method: 'POST',
      headers,
      body: JSON.stringify({ endpoint, payload }),
    })
  } catch {
    // Non-critical
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useAlerts(token?: string) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pushSubscription, setPushSubscription] = useState<PushSubscription | null>(null)
  const alertsRef = useRef(alerts)
  alertsRef.current = alerts

  const reload = useCallback(async () => {
    const list = await getAlerts()
    setAlerts(list)
  }, [])

  useEffect(() => {
    reload().then(() => setIsLoading(false))
  }, [reload])

  // Register SW on mount (silently)
  useEffect(() => {
    registerServiceWorker().catch(() => {/* silent */})
  }, [])

  const create = useCallback(
    async (symbol: string, condition: 'ABOVE' | 'BELOW', targetPrice: number) => {
      await addAlert({
        user_id: getUserId(),
        symbol: symbol.toUpperCase(),
        condition,
        target_price: targetPrice,
        is_active: true,
      })
      await reload()
    },
    [reload]
  )

  const toggle = useCallback(
    async (id: string, isActive: boolean) => {
      await updateAlert(id, { is_active: isActive })
      await reload()
    },
    [reload]
  )

  const remove = useCallback(
    async (id: string) => {
      await deleteAlert(id)
      await reload()
    },
    [reload]
  )

  /**
   * Request notification permission + register Web Push subscription.
   * Returns 'granted' | 'denied' | 'unsupported'.
   */
  const enablePushNotifications = useCallback(async (): Promise<'granted' | 'denied' | 'unsupported'> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'

    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return 'denied'

    const reg = await registerServiceWorker()
    if (reg) {
      const sub = await subscribeToPush(reg)
      if (sub) {
        setPushSubscription(sub)
        await sendSubscriptionToServer(sub, token)
      }
    }

    return 'granted'
  }, [token])

  /**
   * Check active alerts against current prices. Fires notifications when triggered.
   */
  const checkAlerts = useCallback(
    async (prices: Record<string, number>) => {
      const active = alertsRef.current.filter((a) => a.is_active && !a.triggered_at)
      let anyTriggered = false

      for (const alert of active) {
        const price = prices[alert.symbol]
        if (!price) continue

        const triggered =
          (alert.condition === 'ABOVE' && price >= alert.target_price) ||
          (alert.condition === 'BELOW' && price <= alert.target_price)

        if (!triggered) continue

        anyTriggered = true
        await updateAlert(alert.id, {
          triggered_at: new Date().toISOString(),
          is_active: false,
        })

        const direction = alert.condition === 'ABOVE' ? 'vượt ngưỡng' : 'xuống dưới ngưỡng'
        const notifTitle = `StockAI VN — ${alert.symbol} ${direction}`
        const notifBody = `${alert.symbol} ${direction} ${alert.target_price.toLocaleString('vi-VN')}₫ (Giá hiện tại: ${price.toLocaleString('vi-VN')}₫)`

        // Browser notification (works when tab is open)
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(notifTitle, {
            body: notifBody,
            icon: '/logo.svg',
            tag: `alert-${alert.id}`,
          })
        }

        // Web Push notification (works even when tab is closed/background on phone)
        const sub = pushSubscription
          || (typeof window !== 'undefined' && 'serviceWorker' in navigator
            ? await navigator.serviceWorker.ready
                .then(r => r.pushManager.getSubscription())
                .catch(() => null)
            : null)

        if (sub?.endpoint) {
          sendPushNotification(
            { title: notifTitle, body: notifBody, tag: `alert-${alert.id}`, url: '/' },
            sub.endpoint,
            token,
          )
        }
      }

      if (anyTriggered) await reload()
    },
    [reload, pushSubscription, token]
  )

  return { alerts, isLoading, create, toggle, remove, checkAlerts, reload, enablePushNotifications, pushSubscription }
}
