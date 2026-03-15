'use client'

import { useState, useEffect, useCallback } from 'react'
import { setJwtUserId } from '@/lib/storage'

export interface AuthUser {
  id: string
  username: string
  role: 'admin' | 'user'
  exp: number
}

interface AuthState {
  user: AuthUser | null
  isAdmin: boolean
  isLoading: boolean
  isAuthEnabled: boolean
  daysRemaining: number | null
  token: string | null
}

const TOKEN_KEY = 'stockai_jwt'

/** Client-side JWT decode (no signature verification — server validates) */
function decodeToken(token: string): AuthUser | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const pad = parts[1].length % 4
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/') + (pad ? '='.repeat(4 - pad) : '')
    const payload = JSON.parse(atob(b64))
    if (!payload.sub || !payload.username || !payload.role || !payload.exp) return null
    if (payload.exp * 1000 < Date.now()) return null // expired
    return { id: payload.sub, username: payload.username, role: payload.role, exp: payload.exp }
  } catch {
    return null
  }
}

function calcDaysRemaining(exp: number): number {
  return Math.max(0, Math.floor((exp * 1000 - Date.now()) / (1000 * 60 * 60 * 24)))
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAdmin: false,
    isLoading: true,
    isAuthEnabled: true,
    daysRemaining: null,
    token: null,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem(TOKEN_KEY)
    if (stored) {
      const user = decodeToken(stored)
      if (user) {
        setJwtUserId(user.id)
        setState({
          user,
          isAdmin: user.role === 'admin',
          isLoading: false,
          isAuthEnabled: true,
          daysRemaining: calcDaysRemaining(user.exp),
          token: stored,
        })
        return
      }
      localStorage.removeItem(TOKEN_KEY) // expired / invalid
    }
    setState(s => ({ ...s, isLoading: false }))
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Đăng nhập thất bại')
    const { token } = data as { token: string }
    localStorage.setItem(TOKEN_KEY, token)
    const user = decodeToken(token)!
    setJwtUserId(user.id)
    setState({
      user,
      isAdmin: user.role === 'admin',
      isLoading: false,
      isAuthEnabled: true,
      daysRemaining: calcDaysRemaining(user.exp),
      token,
    })
  }, [])

  const signUp = useCallback(async (username: string, password: string, email: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Đăng ký thất bại')
    const { token } = data as { token: string }
    localStorage.setItem(TOKEN_KEY, token)
    const user = decodeToken(token)!
    setJwtUserId(user.id)
    setState({
      user,
      isAdmin: user.role === 'admin',
      isLoading: false,
      isAuthEnabled: true,
      daysRemaining: calcDaysRemaining(user.exp),
      token,
    })
  }, [])

  const signOut = useCallback(() => {
    if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY)
    setJwtUserId(null)
    setState({ user: null, isAdmin: false, isLoading: false, isAuthEnabled: true, daysRemaining: null, token: null })
  }, [])

  return { ...state, signIn, signUp, signOut }
}
