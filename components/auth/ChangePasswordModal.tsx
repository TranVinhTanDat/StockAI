'use client'

import { useState } from 'react'
import { X, Lock, Loader2, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { useAuthContext } from './AuthContext'

interface Props {
  onClose: () => void
}

function PwField({
  placeholder,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
}: {
  placeholder: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  required?: boolean
  minLength?: number
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
      <input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="w-full pl-9 pr-9 py-2.5 bg-surface2 border border-border/60 rounded-xl text-sm text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-gray-300 transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

export default function ChangePasswordModal({ onClose }: Props) {
  const { token } = useAuthContext()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu mới không khớp')
      return
    }
    if (newPassword.length < 6) {
      setError('Mật khẩu mới tối thiểu 6 ký tự')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Có lỗi xảy ra')
        return
      }
      setSuccess(true)
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-border/60 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/40">
          <h2 className="text-base font-semibold text-gray-100">Đổi mật khẩu</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface2 text-muted hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto" />
            <p className="text-sm font-semibold text-gray-100">Đổi mật khẩu thành công!</p>
            <p className="text-xs text-muted">Mật khẩu của bạn đã được cập nhật.</p>
            <button
              onClick={onClose}
              className="mt-2 px-6 py-2 bg-accent text-bg rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors"
            >
              Đóng
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-3">
            <PwField
              placeholder="Mật khẩu hiện tại"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              required
            />
            <PwField
              placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              required
              minLength={6}
            />
            <PwField
              placeholder="Xác nhận mật khẩu mới"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              required
            />

            {error && (
              <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-accent text-bg rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Đổi mật khẩu
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
