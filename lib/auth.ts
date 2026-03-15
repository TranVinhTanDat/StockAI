import { getSupabase, isSupabaseConfigured } from './supabase'

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'user'
  created_at: string
}

export async function signIn(email: string, password: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase chưa được cấu hình')
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signUp(email: string, password: string, fullName?: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase chưa được cấu hình')
  const { error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || '' } },
  })
  if (error) throw new Error(error.message)
}

export async function signOut(): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  await sb.auth.signOut()
}

export function isAuthEnabled(): boolean {
  return isSupabaseConfigured()
}
