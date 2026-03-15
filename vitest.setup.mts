import '@testing-library/jest-dom'

// Mock Next.js environment
process.env.NEXT_PUBLIC_SUPABASE_URL = ''
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ''
process.env.SUPABASE_SERVICE_ROLE_KEY = ''
process.env.CLAUDE_API_KEY = 'test-key'
