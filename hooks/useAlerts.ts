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

export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const alertsRef = useRef(alerts)
  alertsRef.current = alerts

  const reload = useCallback(async () => {
    const list = await getAlerts()
    setAlerts(list)
  }, [])

  useEffect(() => {
    reload().then(() => setIsLoading(false))
  }, [reload])

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

  // Use ref for alerts to break circular dependency
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

        if (triggered) {
          anyTriggered = true
          await updateAlert(alert.id, {
            triggered_at: new Date().toISOString(),
            is_active: false,
          })

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('StockAI VN', {
              body: `${alert.symbol} ${alert.condition === 'ABOVE' ? 'vượt' : 'xuống dưới'} ${alert.target_price.toLocaleString('vi-VN')}₫ (Giá: ${price.toLocaleString('vi-VN')}₫)`,
            })
          }
        }
      }
      if (anyTriggered) await reload()
    },
    [reload]
  )

  return { alerts, isLoading, create, toggle, remove, checkAlerts }
}
