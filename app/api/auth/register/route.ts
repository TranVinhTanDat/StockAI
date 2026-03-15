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

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  try {
    const { username, email, password } = await request.json()

    if (!username || !email || !password) {
      return NextResponse.json({ error: 'Thiếu tên đăng nhập, email hoặc mật khẩu' }, { status: 400 })
    }

    if (!USERNAME_REGEX.test(username as string)) {
      return NextResponse.json(
        { error: 'Tên đăng nhập 3–20 ký tự, chỉ gồm chữ, số, dấu gạch dưới' },
        { status: 400 }
      )
    }

    if (!EMAIL_REGEX.test(email as string)) {
      return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 })
    }

    if ((password as string).length < 6) {
      return NextResponse.json({ error: 'Mật khẩu tối thiểu 6 ký tự' }, { status: 400 })
    }

    const sb = getAdminClient()
    if (!sb) {
      return NextResponse.json({ error: 'Server chưa được cấu hình (thiếu SUPABASE_SERVICE_ROLE_KEY)' }, { status: 500 })
    }

    const normalizedUsername = (username as string).toLowerCase().trim()
    const normalizedEmail = (email as string).toLowerCase().trim()

    // Check username taken
    const { data: existingUser } = await sb
      .from('app_users')
      .select('id')
      .eq('username', normalizedUsername)
      .maybeSingle()

    if (existingUser) {
      return NextResponse.json({ error: 'Tên đăng nhập đã được sử dụng' }, { status: 409 })
    }

    // Check email taken
    const { data: existingEmail } = await sb
      .from('app_users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingEmail) {
      return NextResponse.json({ error: 'Email đã được đăng ký với tài khoản khác' }, { status: 409 })
    }

    const password_hash = await bcrypt.hash(password as string, 10)
    const { data: newUser, error } = await sb
      .from('app_users')
      .insert({ username: normalizedUsername, email: normalizedEmail, password_hash, role: 'user' })
      .select('id, username, role')
      .single()

    if (error || !newUser) {
      console.error('[register] insert error:', error?.message)
      return NextResponse.json({ error: error?.message || 'Không thể tạo tài khoản, thử lại sau' }, { status: 500 })
    }

    const token = await signToken({ sub: newUser.id, username: newUser.username, role: newUser.role })
    return NextResponse.json({ token })
  } catch (err) {
    console.error('[register] unexpected error:', err)
    return NextResponse.json({ error: 'Lỗi server không xác định' }, { status: 500 })
  }
}
