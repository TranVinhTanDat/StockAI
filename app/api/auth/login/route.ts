import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { signToken } from '@/lib/jwt'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' }, { status: 400 })
    }

    const sb = getAdminClient()
    if (!sb) {
      return NextResponse.json({ error: 'Server chưa được cấu hình (thiếu SUPABASE_SERVICE_ROLE_KEY)' }, { status: 500 })
    }

    const { data: user } = await sb
      .from('app_users')
      .select('id, username, password_hash, role')
      .eq('username', (username as string).toLowerCase().trim())
      .single()

    if (!user) {
      return NextResponse.json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password as string, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' }, { status: 401 })
    }

    const token = await signToken({ sub: user.id, username: user.username, role: user.role })
    return NextResponse.json({ token })
  } catch {
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 })
  }
}
