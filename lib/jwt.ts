import { SignJWT, jwtVerify, type JWTPayload as JosePayload } from 'jose'

const JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60 // 7 days

export interface JWTPayload {
  sub: string
  username: string
  role: 'admin' | 'user'
  exp?: number
  iat?: number
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || 'dev-secret-please-change-in-production'
  return new TextEncoder().encode(secret)
}

export async function signToken(payload: Pick<JWTPayload, 'sub' | 'username' | 'role'>): Promise<string> {
  return await new SignJWT({ username: payload.username, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${JWT_EXPIRY_SECONDS}s`)
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const p = payload as JosePayload & { username?: string; role?: string }
    if (!p.sub || !p.username || !p.role) return null
    return {
      sub: p.sub,
      username: p.username as string,
      role: p.role as 'admin' | 'user',
      exp: p.exp,
      iat: p.iat,
    }
  } catch {
    return null
  }
}
