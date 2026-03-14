import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

function isValidSupabaseUrl(url: string): boolean {
  // Reject placeholders like https://xxx.supabase.co
  if (!url) return false
  if (url.includes('xxx')) return false
  if (!url.startsWith('https://')) return false
  if (url === 'https://.supabase.co') return false
  return true
}

function isValidSupabaseKey(key: string): boolean {
  if (!key) return false
  if (key === 'eyJ...') return false
  if (key.length < 20) return false
  return true
}

export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key || !isValidSupabaseUrl(url) || !isValidSupabaseKey(key)) return null

  if (!supabaseInstance) {
    supabaseInstance = createClient(url, key)
  }
  return supabaseInstance
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  return isValidSupabaseUrl(url) && isValidSupabaseKey(key)
}

