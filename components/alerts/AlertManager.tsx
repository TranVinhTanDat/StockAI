'use client'

import { useState, useEffect, useRef } from 'react'
import { useAlerts } from '@/hooks/useAlerts'
import { formatVND, timeAgo } from '@/lib/utils'
import { Bell, BellOff, Trash2, Plus, Smartphone, CheckCircle, Settings } from 'lucide-react'

// -- Helpers --

function formatPriceInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return parseInt(digits, 10).toLocaleString('vi-VN').replace(/,/g, '.')
}

function parsePriceInput(formatted: string): number {
  return parseFloat(formatted.replace(/\./g, '')) || 0
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
        on ? 'bg-accent' : 'bg-surface2 border border-border/60'
      }`}
      role="switch"
      aria-checked={on}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function openNotificationSettings() {
  alert('Nhấn vào biểu tượng 🔒 hoặc ℹ️ trên thanh địa chỉ → Thông báo → Chọn "Cho phép", rồi bật lại công tắc')
}

// -- Main component --

export default function AlertManager({ token }: { token?: string }) {
  const { alerts, isLoading, create, toggle, remove, enablePushNotifications } = useAlerts(token)
  const [symbol,          setSymbol]          = useState('')
  const [condition,       setCondition]       = useState<'ABOVE' | 'BELOW'>('ABOVE')
  const [priceDisplay,    setPriceDisplay]    = useState('')
  const [notifPerm,       setNotifPerm]       = useState<NotificationPermission>('default')
  const [pushEnabled,     setPushEnabled]     = useState(false)
  const [pushLoading,     setPushLoading]     = useState(false)
  const [pushUnsupported, setPushUnsupported] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Check if push notifications are supported at all
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
    if (!supported) {
      setPushUnsupported(true)
      return
    }
    const perm = Notification.permission
    setNotifPerm(perm)
    setPushEnabled(perm === 'granted')
  }, [])

  const handleTogglePush = async () => {
    if (pushUnsupported) {
      alert('Trình duyệt của bạn chưa hỗ trợ thông báo đẩy.\n\niOS: Thêm trang vào Màn hình chính (Add to Home Screen) rồi mở từ đó.\nAndroid: Dùng Chrome để nhận thông báo.')
      return
    }
    if (pushEnabled) {
      openNotificationSettings()
      return
    }
    if (notifPerm === 'denied') {
      openNotificationSettings()
      return
    }
    setPushLoading(true)
    const result = await enablePushNotifications()
    setPushLoading(false)
    if (result === 'granted') { setNotifPerm('granted'); setPushEnabled(true) }
    else if (result === 'denied') { setNotifPerm('denied'); setPushEnabled(false) }
    else if (result === 'unsupported') { setPushUnsupported(true) }
  }

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPriceDisplay(formatPriceInput(e.target.value))
  }

  const handleCreate = async () => {
    const price = parsePriceInput(priceDisplay)
    if (!symbol || !price || price <= 0) return
    await create(symbol, condition, price)
    setSymbol('')
    setPriceDisplay('')
    inputRef.current?.focus()
  }

  return (
    <div className="card-glass overflow-hidden">
      <div className="p-5 border-b border-border">

        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4 text-gold" />
            Cảnh Báo Giá
            {alerts.filter(a => a.is_active).length > 0 && (
              <span className="text-xs bg-gold/15 text-gold px-1.5 py-0.5 rounded-full font-semibold">
                {alerts.filter(a => a.is_active).length} đang bật
              </span>
            )}
          </h3>

          {/* Push notification toggle */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <Smartphone className={`w-3.5 h-3.5 ${pushUnsupported ? 'text-muted/40' : 'text-muted'}`} />
              <span className="text-xs text-muted hidden sm:block">Thông báo điện thoại</span>
            </div>
            {pushLoading ? (
              <span className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin inline-block" />
            ) : pushUnsupported ? (
              <button
                onClick={handleTogglePush}
                className="flex items-center gap-1 px-2 py-1 bg-surface2 border border-border/60 text-muted/60 text-[11px] rounded-lg active:bg-surface min-h-[36px]"
                title="Trình duyệt chưa hỗ trợ"
              >
                <BellOff className="w-3 h-3" />
                <span className="hidden sm:inline">Chưa hỗ trợ</span>
              </button>
            ) : (
              <div className="flex items-center justify-center min-h-[44px] min-w-[44px]">
                <Toggle on={pushEnabled} onChange={handleTogglePush} />
              </div>
            )}
          </div>
        </div>

        {/* Unsupported state */}
        {pushUnsupported && (
          <div className="mb-4 flex items-start gap-3 bg-surface2 border border-border/60 rounded-xl p-3.5">
            <Smartphone className="w-4 h-4 text-muted flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-muted mb-0.5">Thông báo chưa khả dụng trên trình duyệt này</p>
              <p className="text-[11px] text-muted/70 leading-relaxed">
                iOS: Nhấn <span className="font-medium">Chia sẻ</span> → <span className="font-medium">Thêm vào Màn hình chính</span>, rồi mở app từ đó để nhận thông báo.
                <br />Android: Sử dụng Chrome để bật thông báo đẩy.
              </p>
            </div>
          </div>
        )}

        {/* Denied state */}
        {!pushUnsupported && notifPerm === 'denied' && (
          <div className="mb-4 flex items-start gap-3 bg-surface2 border border-border/60 rounded-xl p-3.5">
            <BellOff className="w-4 h-4 text-muted flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-muted mb-0.5">Thông báo đang bị chặn</p>
              <p className="text-[11px] text-muted/70 leading-relaxed">
                Nhấn biểu tượng 🔒 trên thanh địa chỉ → Thông báo → Cho phép, rồi bật lại công tắc
              </p>
            </div>
            <button
              onClick={openNotificationSettings}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-surface border border-border/60 text-muted hover:text-accent rounded-lg text-[11px] transition-colors"
            >
              <Settings className="w-3 h-3" />
              Gỡ chặn
            </button>
          </div>
        )}

        {/* Default hint */}
        {!pushUnsupported && notifPerm === 'default' && !pushEnabled && (
          <div className="mb-4 flex items-center gap-2 bg-gold/5 border border-gold/15 rounded-xl px-3.5 py-2.5">
            <Smartphone className="w-3.5 h-3.5 text-gold flex-shrink-0" />
            <p className="text-[11px] text-muted/80">
              Bật công tắc để nhận thông báo khi giá chạm ngưỡng — kể cả khi tắt tab
            </p>
          </div>
        )}

        {/* Enabled */}
        {!pushUnsupported && pushEnabled && (
          <div className="mb-4 flex items-center gap-2 bg-green-400/5 border border-green-400/15 rounded-xl px-3.5 py-2.5">
            <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            <p className="text-[11px] text-green-400">
              Thông báo điện thoại đã bật
            </p>
          </div>
        )}

        {/* Input form */}
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="text"
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Mã CP"
            className="input-dark text-sm w-20"
            maxLength={10}
          />
          <select
            value={condition}
            onChange={e => setCondition(e.target.value as 'ABOVE' | 'BELOW')}
            className="input-dark text-sm"
          >
            <option value="ABOVE">&uarr; Vượt trên</option>
            <option value="BELOW">&darr; Xuống dưới</option>
          </select>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={priceDisplay}
              onChange={handlePriceChange}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="25.350"
              className="input-dark text-sm w-36 pr-6"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted pointer-events-none">₫</span>
          </div>
          <button
            onClick={handleCreate}
            disabled={!symbol || !priceDisplay}
            className="btn-primary py-2 px-4 text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Thêm
          </button>
        </div>
      </div>

      {/* Alert list */}
      <div className="divide-y divide-border/50">
        {isLoading ? (
          <div className="p-4 text-center text-muted text-sm">Đang tải...</div>
        ) : alerts.length === 0 ? (
          <div className="p-8 text-center text-muted">
            <BellOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Chưa có cảnh báo nào</p>
            <p className="text-xs text-muted/60 mt-1">Nhập mã CP và giá ngưỡng (vd: 25.350) rồi nhấn Thêm</p>
          </div>
        ) : (
          alerts.map(alert => (
            <div
              key={alert.id}
              className={`px-5 py-3 flex items-center gap-3 ${alert.triggered_at ? 'opacity-50' : ''}`}
            >
              <Toggle
                on={!!alert.is_active}
                onChange={() => toggle(alert.id, !alert.is_active)}
                disabled={!!alert.triggered_at}
              />
              <span className="font-semibold text-sm w-12">{alert.symbol}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                alert.condition === 'ABOVE'
                  ? 'bg-green-400/10 text-green-400 border border-green-400/20'
                  : 'bg-red-400/10 text-red-400 border border-red-400/20'
              }`}>
                {alert.condition === 'ABOVE' ? 'Vượt' : 'Dưới'}
              </span>
              <span className="text-sm font-medium font-mono">{formatVND(alert.target_price)}</span>
              {alert.triggered_at && (
                <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Đã kích hoạt {timeAgo(alert.triggered_at)}
                </span>
              )}
              <button
                onClick={() => remove(alert.id)}
                className="ml-auto text-muted hover:text-danger transition-colors"
                title="Xoá cảnh báo"
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
