'use client'

import { useState, useEffect } from 'react'
import { useAlerts } from '@/hooks/useAlerts'
import { formatVND, timeAgo } from '@/lib/utils'
import { Bell, BellOff, Trash2, Plus } from 'lucide-react'

export default function AlertManager() {
  const { alerts, isLoading, create, toggle, remove } = useAlerts()
  const [symbol, setSymbol] = useState('')
  const [condition, setCondition] = useState<'ABOVE' | 'BELOW'>('ABOVE')
  const [targetPrice, setTargetPrice] = useState('')
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    if ('Notification' in window) {
      setNotifPermission(Notification.permission)
    }
  }, [])

  const requestPermission = async () => {
    const perm = await Notification.requestPermission()
    setNotifPermission(perm)
  }

  const handleCreate = async () => {
    const price = parseFloat(targetPrice)
    if (!symbol || !price) return
    await create(symbol, condition, price)
    setSymbol('')
    setTargetPrice('')
  }

  return (
    <div className="card-glass overflow-hidden">
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4 text-gold" />
            Cảnh Báo Giá
          </h3>
          {notifPermission !== 'granted' && (
            <button
              onClick={requestPermission}
              className="text-xs text-accent hover:text-accent/80 transition-colors"
            >
              Bật thông báo
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Mã CP"
            className="input-dark text-sm w-20"
            maxLength={10}
          />
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as 'ABOVE' | 'BELOW')}
            className="input-dark text-sm"
          >
            <option value="ABOVE">Vượt trên</option>
            <option value="BELOW">Xuống dưới</option>
          </select>
          <input
            type="number"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            placeholder="Giá ngưỡng"
            className="input-dark text-sm w-32"
          />
          <button
            onClick={handleCreate}
            disabled={!symbol || !targetPrice}
            className="btn-primary py-2 px-4 text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Thêm
          </button>
        </div>
      </div>

      <div className="divide-y divide-border/50">
        {isLoading ? (
          <div className="p-4 text-center text-muted text-sm">Đang tải...</div>
        ) : alerts.length === 0 ? (
          <div className="p-8 text-center text-muted">
            <BellOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Chưa có cảnh báo nào</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`px-5 py-3 flex items-center gap-3 ${
                alert.triggered_at ? 'opacity-50' : ''
              }`}
            >
              <button
                onClick={() => toggle(alert.id, !alert.is_active)}
                className={`flex-shrink-0 transition-colors ${
                  alert.is_active ? 'text-gold' : 'text-muted'
                }`}
              >
                {alert.is_active ? (
                  <Bell className="w-4 h-4 fill-current" />
                ) : (
                  <BellOff className="w-4 h-4" />
                )}
              </button>
              <span className="font-semibold text-sm w-12">{alert.symbol}</span>
              <span className="text-xs text-muted">
                {alert.condition === 'ABOVE' ? 'Vượt' : 'Dưới'}
              </span>
              <span className="text-sm font-medium">
                {formatVND(alert.target_price)}
              </span>
              {alert.triggered_at && (
                <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded">
                  Đã kích hoạt {timeAgo(alert.triggered_at)}
                </span>
              )}
              <button
                onClick={() => remove(alert.id)}
                className="ml-auto text-muted hover:text-danger transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
