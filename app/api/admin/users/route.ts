import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { verifyToken } from '@/lib/jwt'

function getAdminClient() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!rawToken) return null
  const payload = await verifyToken(rawToken)
  if (!payload || payload.role !== 'admin') return null
  return payload
}

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/
const EMAIL_REGEX    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── GET /api/admin/users ── list all users with analysis stats ─────────────────
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getAdminClient()
  if (!sb) return NextResponse.json({ error: 'Admin client not configured. Set SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 })

  // Select without is_active (column may not exist yet)
  const { data: users, error } = await sb
    .from('app_users')
    .select('id, username, email, role, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!users) return NextResponse.json({ users: [] })

  // Try to get analysis counts — non-critical, ignore if fails
  const countMap: Record<string, number> = {}
  try {
    const { data: cacheCounts } = await sb
      .from('analysis_cache')
      .select('created_by')
    if (cacheCounts) {
      for (const row of cacheCounts) {
        const uid = (row as Record<string, string>).created_by
        if (uid) countMap[uid] = (countMap[uid] || 0) + 1
      }
    }
  } catch { /* column may not exist */ }

  const enriched = users.map(u => ({
    ...u,
    is_active: true, // default; update DB schema to support locking
    analysisCount: countMap[u.id] || 0,
  }))

  return NextResponse.json({ users: enriched })
}

// ── POST /api/admin/users ── create user ──────────────────────────────────────
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getAdminClient()
  if (!sb) return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 })

  const { username, email, password, role } = await request.json()

  if (!username || !email || !password) {
    return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
  }
  if (!USERNAME_REGEX.test(username as string)) {
    return NextResponse.json({ error: 'Tên đăng nhập 3–20 ký tự, chỉ gồm chữ, số, dấu _' }, { status: 400 })
  }
  if (!EMAIL_REGEX.test(email as string)) {
    return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 })
  }
  if ((password as string).length < 6) {
    return NextResponse.json({ error: 'Mật khẩu tối thiểu 6 ký tự' }, { status: 400 })
  }
  if (role && !['admin', 'user'].includes(role)) {
    return NextResponse.json({ error: 'Role không hợp lệ' }, { status: 400 })
  }

  const normUser  = (username as string).toLowerCase().trim()
  const normEmail = (email as string).toLowerCase().trim()

  // Check username duplicate
  const { data: existingUser } = await sb.from('app_users').select('id').eq('username', normUser).maybeSingle()
  if (existingUser) return NextResponse.json({ error: 'Tên đăng nhập đã tồn tại' }, { status: 409 })

  // Check email duplicate
  const { data: existingEmail } = await sb.from('app_users').select('id').eq('email', normEmail).maybeSingle()
  if (existingEmail) return NextResponse.json({ error: 'Email đã được sử dụng' }, { status: 409 })

  const password_hash = await bcrypt.hash(password as string, 10)
  const { data: newUser, error } = await sb
    .from('app_users')
    .insert({ username: normUser, email: normEmail, password_hash, role: role || 'user' })
    .select('id, username, email, role, created_at')
    .single()

  if (error || !newUser) {
    return NextResponse.json({ error: error?.message || 'Không thể tạo người dùng' }, { status: 500 })
  }

  return NextResponse.json({ user: newUser })
}

// ── PATCH /api/admin/users ── update user ─────────────────────────────────────
export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getAdminClient()
  if (!sb) return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 })

  const { userId, username, email, role, newPassword, is_active } = await request.json()

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  // Prevent admin from demoting themselves
  if (userId === admin.sub && role && role !== 'admin') {
    return NextResponse.json({ error: 'Không thể tự đổi role của mình' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if (username !== undefined) {
    if (!USERNAME_REGEX.test(username as string)) {
      return NextResponse.json({ error: 'Tên đăng nhập không hợp lệ' }, { status: 400 })
    }
    updates.username = (username as string).toLowerCase().trim()
  }

  if (email !== undefined) {
    if (!EMAIL_REGEX.test(email as string)) {
      return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 })
    }
    updates.email = (email as string).toLowerCase().trim()
  }

  if (role !== undefined) {
    if (!['admin', 'user'].includes(role)) {
      return NextResponse.json({ error: 'Role không hợp lệ' }, { status: 400 })
    }
    updates.role = role
  }

  // is_active support: only set if column exists (gracefully ignored by Supabase if not)
  if (is_active !== undefined) {
    updates.is_active = Boolean(is_active)
  }

  if (newPassword !== undefined) {
    if ((newPassword as string).length < 6) {
      return NextResponse.json({ error: 'Mật khẩu mới tối thiểu 6 ký tự' }, { status: 400 })
    }
    updates.password_hash = await bcrypt.hash(newPassword as string, 10)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Không có gì để cập nhật' }, { status: 400 })
  }

  const { error } = await sb.from('app_users').update(updates).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// ── DELETE /api/admin/users ── delete user(s) ─────────────────────────────────
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getAdminClient()
  if (!sb) return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 })

  const { userId, userIds } = await request.json()

  const ids: string[] = userIds || (userId ? [userId] : [])
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Missing userId / userIds' }, { status: 400 })
  }

  // Prevent deleting self
  if (ids.includes(admin.sub)) {
    return NextResponse.json({ error: 'Không thể xoá tài khoản của chính mình' }, { status: 400 })
  }

  const { error } = await sb.from('app_users').delete().in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, deleted: ids.length })
}
