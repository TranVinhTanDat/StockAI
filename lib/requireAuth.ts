import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, type JWTPayload } from './jwt'

const AUTH_ERROR = 'Vui lòng đăng nhập để sử dụng tính năng AI'
const EXPIRED_ERROR = 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại'

/** Returns the verified JWT payload, or a 401 NextResponse to return immediately. */
export async function requireAuth(
  request: NextRequest
): Promise<{ payload: JWTPayload; error: null } | { payload: null; error: NextResponse }> {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return { payload: null, error: NextResponse.json({ error: AUTH_ERROR }, { status: 401 }) }
  }

  const payload = await verifyToken(token)
  if (!payload) {
    return { payload: null, error: NextResponse.json({ error: EXPIRED_ERROR }, { status: 401 }) }
  }

  return { payload, error: null }
}

/** Read JWT token from localStorage (client-side only) */
export function getClientToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('stockai_jwt')
}
