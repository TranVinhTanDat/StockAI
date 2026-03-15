'use client'

import { useState } from 'react'
import { X, User, Lock, Mail, LogIn, UserPlus, Loader2, Clock } from 'lucide-react'
import { useAuthContext } from './AuthContext'

// When NEXT_PUBLIC_ALLOW_REGISTRATION=false, hide the signup tab
const ALLOW_REGISTRATION = process.env.NEXT_PUBLIC_ALLOW_REGISTRATION !== 'false'

interface LoginModalProps {
  onClose: () => void
}

export default function LoginModal({ onClose }: LoginModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { signIn, signUp, daysRemaining } = useAuthContext()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signin') {
        await signIn(username, password)
      } else {
        await signUp(username, password, email)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
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
          <div>
            <h2 className="text-base font-semibold text-gray-100">
              {mode === 'signin' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </h2>
            {daysRemaining !== null && (
              <p className="text-xs text-accent flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                Còn {daysRemaining} ngày
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface2 text-muted hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs — hide signup tab when registration is disabled */}
        <div className="flex border-b border-border/40">
          <button
            onClick={() => { setMode('signin'); setError('') }}
            className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              mode === 'signin' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-gray-200'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" /> Đăng nhập
          </button>
          {ALLOW_REGISTRATION && (
            <button
              onClick={() => { setMode('signup'); setError('') }}
              className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                mode === 'signup' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-gray-200'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" /> Đăng ký
            </button>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="Tên đăng nhập"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="w-full pl-9 pr-3 py-2.5 bg-surface2 border border-border/60 rounded-xl text-sm text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </div>

          {mode === 'signup' && (
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full pl-9 pr-3 py-2.5 bg-surface2 border border-border/60 rounded-xl text-sm text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent"
              />
            </div>
          )}

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="password"
              placeholder="Mật khẩu"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className="w-full pl-9 pr-3 py-2.5 bg-surface2 border border-border/60 rounded-xl text-sm text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-accent text-bg rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {mode === 'signin' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </button>

          <p className="text-[10px] text-muted/70 text-center leading-relaxed">
            {mode === 'signup'
              ? 'Tên đăng nhập: 3–20 ký tự (chữ, số, gạch dưới). Mật khẩu tối thiểu 6 ký tự.'
              : 'Token đăng nhập có hiệu lực 7 ngày.'}
          </p>
        </form>
      </div>
    </div>
  )
}
