'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthContext } from '@/components/auth/AuthContext'
import UserManagement from '@/components/admin/UserManagement'
import DatabaseViewer from '@/components/admin/DatabaseViewer'
import DefaultWatchlistManager from '@/components/admin/DefaultWatchlistManager'
import {
  ArrowLeft, TrendingUp, Shield, Users,
  BarChart2, Bell, Database,
} from 'lucide-react'

// ── Stats card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType
  label: string
  value: string | number
  color: string
}) {
  return (
    <div className="bg-surface border border-border/40 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="text-lg font-bold text-gray-100">{value}</p>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user, isLoading } = useAuthContext()
  const router = useRouter()

  // Redirect if not admin
  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) {
      router.replace('/')
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!user || user.role !== 'admin') return null

  return (
    <div className="min-h-screen bg-bg text-gray-200">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <ArrowLeft className="w-4 h-4 text-muted" />
            <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-sm font-bold text-gray-100">StockAI VN</span>
          </Link>

          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-accent" />
            <h1 className="text-sm font-semibold">Trang quản trị</h1>
            <span className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded-full border border-accent/20">
              Admin
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3 text-xs text-muted">
            <span>Đăng nhập với: <span className="text-accent font-medium">{user.username}</span></span>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Quick nav */}
        <div className="flex flex-wrap gap-2">
          {[
            { href: '/', icon: TrendingUp, label: 'Bảng điểm' },
            { href: '/analysis-history', icon: BarChart2, label: 'Lịch sử phân tích' },
            { href: '/priceboard', icon: Users, label: 'Bảng giá' },
          ].map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border/40 rounded-lg text-xs text-muted hover:text-accent hover:border-accent/30 transition-colors"
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          ))}
        </div>

        {/* Overview cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Users}    label="Tổng người dùng"  value="—"   color="bg-accent/10 text-accent" />
          <StatCard icon={Shield}   label="Admin"             value="—"   color="bg-gold/10 text-gold" />
          <StatCard icon={BarChart2} label="Phân tích AI"    value="—"   color="bg-blue-400/10 text-blue-400" />
          <StatCard icon={Bell}     label="Cảnh báo"          value="—"   color="bg-green-400/10 text-green-400" />
        </div>

        {/* User management */}
        <div className="bg-surface rounded-2xl border border-border/40 p-5">
          <UserManagement />
        </div>

        {/* Default watchlist */}
        <div className="bg-surface rounded-2xl border border-border/40 p-5">
          <DefaultWatchlistManager />
        </div>

        {/* Database viewer */}
        <div className="bg-surface rounded-2xl border border-border/40 p-5">
          <DatabaseViewer />
        </div>

      </div>
    </div>
  )
}
