'use client'

import { useState, useEffect, useRef } from 'react'
import { X, User, Lock, Mail, LogIn, UserPlus, Loader2, Clock, KeyRound, CheckCircle, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { useAuthContext } from './AuthContext'

// When NEXT_PUBLIC_ALLOW_REGISTRATION=false, hide the signup tab
const ALLOW_REGISTRATION = process.env.NEXT_PUBLIC_ALLOW_REGISTRATION !== 'false'

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

interface LoginModalProps {
  onClose: () => void
}

// Forgot password steps
type ForgotStep = 'email' | 'otp' | 'done'

export default function LoginModal({ onClose }: LoginModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotStep, setForgotStep] = useState<ForgotStep>('email')
  const [otp, setOtp] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [countdown, setCountdown] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { signIn, signUp, daysRemaining } = useAuthContext()

  // Countdown timer for OTP expiry (10 min)
  useEffect(() => {
    if (forgotStep === 'otp' && countdown === 0) {
      setCountdown(600)
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forgotStep])

  const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signin') {
        await signIn(username, password)
        setSuccessMsg('Đăng nhập thành công! Chào mừng bạn trở lại.')
      } else {
        await signUp(username, password, email)
        setSuccessMsg('Tạo tài khoản thành công! Chào mừng bạn.')
      }
      setTimeout(() => onClose(), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      })
      // Always move to OTP step (don't reveal if email exists)
      setForgotStep('otp')
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) { setError('Mật khẩu không khớp'); return }
    if (newPassword.length < 6) { setError('Mật khẩu tối thiểu 6 ký tự'); return }
    setLoading(true)
    try {
      // Step 1: verify OTP
      const otpRes = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, otp }),
      })
      const otpData = await otpRes.json()
      if (!otpRes.ok) { setError(otpData.error || 'OTP không đúng'); return }

      const token = otpData.reset_token
      setResetToken(token)

      // Step 2: reset password
      const resetRes = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_token: token, newPassword }),
      })
      const resetData = await resetRes.json()
      if (!resetRes.ok) { setError(resetData.error || 'Lỗi đặt lại mật khẩu'); return }

      setForgotStep('done')
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setLoading(false)
    }
  }

  const resetForgot = () => {
    setForgotStep('email')
    setForgotEmail('')
    setOtp('')
    setNewPassword('')
    setConfirmPassword('')
    setResetToken('')
    setError('')
    if (countdownRef.current) clearInterval(countdownRef.current)
    setCountdown(0)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-border/60 shadow-2xl overflow-hidden">

        {/* Success toast */}
        {successMsg && (
          <div className="flex items-center gap-2 px-5 py-3 bg-green-500/15 border-b border-green-500/20 text-green-400 text-sm font-medium animate-pulse">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {successMsg}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="StockAI VN" className="w-9 h-9 rounded-xl flex-shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-gray-100">
                {mode === 'signin' ? 'Đăng nhập' : mode === 'signup' ? 'Tạo tài khoản' : 'Quên mật khẩu'}
              </h2>
              {mode === 'signin' && daysRemaining !== null && (
                <p className="text-xs text-accent flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />
                  Còn {daysRemaining} ngày
                </p>
              )}
              {mode === 'forgot' && forgotStep === 'otp' && (
                <p className="text-xs text-muted mt-0.5">
                  Nhập OTP gửi đến <span className="text-gray-200">{forgotEmail}</span>
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface2 text-muted hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs — only show for signin/signup */}
        {mode !== 'forgot' && (
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
        )}

        {/* ── Forgot password flow ── */}
        {mode === 'forgot' && (
          <div className="p-5">
            {forgotStep === 'done' ? (
              <div className="text-center space-y-3 py-4">
                <CheckCircle className="w-10 h-10 text-green-400 mx-auto" />
                <p className="text-sm font-semibold text-gray-100">Đặt lại mật khẩu thành công!</p>
                <p className="text-xs text-muted">Bạn có thể đăng nhập với mật khẩu mới.</p>
                <button
                  onClick={() => { resetForgot(); setMode('signin') }}
                  className="mt-1 px-6 py-2 bg-accent text-bg rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors"
                >
                  Đăng nhập ngay
                </button>
              </div>
            ) : forgotStep === 'email' ? (
              <form onSubmit={handleSendOtp} className="space-y-3">
                <p className="text-xs text-muted">Nhập email đã đăng ký. Chúng tôi sẽ gửi mã OTP để đặt lại mật khẩu.</p>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="email"
                    placeholder="Email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full pl-9 pr-3 py-2.5 bg-surface2 border border-border/60 rounded-xl text-sm text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent"
                  />
                </div>
                {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-accent text-bg rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  Gửi mã OTP
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setError('') }}
                  className="w-full text-xs text-muted hover:text-gray-200 transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" /> Quay lại đăng nhập
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted">Mã OTP 6 số</p>
                  {countdown > 0 ? (
                    <span className="text-xs text-accent font-mono">{formatCountdown(countdown)}</span>
                  ) : (
                    <span className="text-xs text-red-400">Hết hạn</span>
                  )}
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="text"
                    placeholder="Nhập mã OTP (6 số)"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    maxLength={6}
                    inputMode="numeric"
                    className="w-full pl-9 pr-3 py-2.5 bg-surface2 border border-border/60 rounded-xl text-sm text-gray-200 placeholder:text-muted focus:outline-none focus:border-accent font-mono tracking-widest"
                  />
                </div>
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
                {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6 || countdown === 0}
                  className="w-full py-2.5 bg-accent text-bg rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Đặt lại mật khẩu
                </button>
                <button
                  type="button"
                  onClick={() => { resetForgot() }}
                  className="w-full text-xs text-muted hover:text-gray-200 transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" /> Gửi lại OTP
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── Sign in / Sign up form ── */}
        {mode !== 'forgot' && (
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

            <PwField
              placeholder="Mật khẩu"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
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
              {mode === 'signin' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </button>

            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError('') }}
                className="w-full text-xs text-muted hover:text-accent transition-colors text-center"
              >
                Quên mật khẩu?
              </button>
            )}

            <p className="text-[10px] text-muted/70 text-center leading-relaxed">
              {mode === 'signup'
                ? 'Tên đăng nhập: 3–20 ký tự (chữ, số, gạch dưới). Mật khẩu tối thiểu 6 ký tự.'
                : 'Token đăng nhập có hiệu lực 7 ngày.'}
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
