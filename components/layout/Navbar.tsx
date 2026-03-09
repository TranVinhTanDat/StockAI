'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  TrendingUp,
  BarChart3,
  CandlestickChart,
  Newspaper,
  Briefcase,
  Wrench,
  Menu,
  X,
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Thị Trường', href: '#market', icon: TrendingUp },
  { label: 'Phân Tích', href: '#analysis', icon: BarChart3 },
  { label: 'Biểu Đồ', href: '#chart', icon: CandlestickChart },
  { label: 'Tin Tức', href: '#news', icon: Newspaper },
  { label: 'Danh Mục', href: '#portfolio', icon: Briefcase },
  { label: 'Công Cụ', href: '#tools', icon: Wrench },
]

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  const scrollTo = (href: string) => {
    setMobileOpen(false)
    const el = document.querySelector(href)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <nav className="sticky top-0 z-50 bg-bg/80 backdrop-blur-xl border-b border-border">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <button
          onClick={() => scrollTo('#market')}
          className="flex items-center gap-2 font-extrabold text-xl"
        >
          <TrendingUp className="w-6 h-6 text-accent" />
          <span className="gradient-text">StockAI VN</span>
        </button>

        <div className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.href}
              onClick={() => scrollTo(item.href)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium',
                'text-muted hover:text-gray-100 hover:bg-surface2 transition-colors'
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>

        <button
          className="md:hidden p-2 text-muted hover:text-gray-100"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-surface border-b border-border px-4 py-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.href}
              onClick={() => scrollTo(item.href)}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-gray-100 hover:bg-surface2 transition-colors"
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  )
}
