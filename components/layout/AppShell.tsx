'use client'

import { RefObject, useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp, Bot, Newspaper, Briefcase, Wrench, Bell,
  Table2, BarChart2, History, MoreHorizontal, X,
  LogIn, LogOut, User, Shield,
} from 'lucide-react'
import MarketTicker from './MarketTicker'

export type SectionKey = 'market' | 'analysis' | 'history' | 'news' | 'portfolio' | 'tools' | 'alerts' | 'admin'

export const NAV_ITEMS: {
  key: SectionKey
  label: string
  short: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { key: 'market',   label: 'Thị Trường', short: 'Thị',  icon: TrendingUp },
  { key: 'analysis', label: 'Phân Tích',  short: 'Phân', icon: Bot        },
  { key: 'history',  label: 'Lịch Sử AI', short: 'Lịch', icon: History    },
  { key: 'news',     label: 'Tin Tức',    short: 'Tin',  icon: Newspaper  },
  { key: 'portfolio',label: 'Danh Mục',   short: 'Danh', icon: Briefcase  },
  { key: 'tools',    label: 'Công Cụ',    short: 'Công', icon: Wrench     },
  { key: 'alerts',   label: 'Cảnh Báo',  short: 'Cảnh', icon: Bell       },
]

// Mobile bottom bar: 5 most-used sections
const MOBILE_MAIN: SectionKey[] = ['market', 'analysis', 'history', 'news', 'portfolio']
// Mobile "Thêm" drawer: remaining sections
const MOBILE_MORE: SectionKey[] = ['tools', 'alerts']

interface AppShellProps {
  activeSection: SectionKey
  onSectionChange: (s: SectionKey) => void
  contentRef: RefObject<HTMLDivElement | null>
  children: React.ReactNode
  // Auth
  userName?: string | null
  isAdmin?: boolean
  isAuthEnabled?: boolean
  onLoginClick?: () => void
  onLogout?: () => void
}

export default function AppShell({
  activeSection,
  onSectionChange,
  contentRef,
  children,
  userName,
  isAdmin = false,
  isAuthEnabled = false,
  onLoginClick,
  onLogout,
}: AppShellProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const current = NAV_ITEMS.find(n => n.key === activeSection)

  const handleNav = (key: SectionKey) => {
    onSectionChange(key)
    setMoreOpen(false)
  }

  const mobileMainItems = NAV_ITEMS.filter(n => MOBILE_MAIN.includes(n.key))
  const mobileMoreItems = NAV_ITEMS.filter(n => MOBILE_MORE.includes(n.key))
  const moreIsActive = MOBILE_MORE.includes(activeSection)

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">

      {/* ═══════════════════════════════════════
          DESKTOP SIDEBAR  (hidden on mobile)
      ═══════════════════════════════════════ */}
      <aside className="hidden md:flex flex-col w-56 flex-shrink-0 bg-surface border-r border-border/60">

        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border/40 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center ring-1 ring-accent/20 flex-shrink-0">
            <TrendingUp className="w-4.5 h-4.5 text-accent" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-100 leading-tight">StockAI VN</div>
            <div className="text-[10px] text-muted leading-tight">AI · VPS · Vietcap</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {/* Bảng Giá — at top, separate page link */}
          <Link
            href="/priceboard"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:bg-surface2 hover:text-gray-200 transition-all w-full mb-1"
          >
            <Table2 className="w-[18px] h-[18px] flex-shrink-0" />
            <span className="truncate">Bảng Giá</span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-accent/20 text-accent rounded font-semibold">Live</span>
          </Link>
          <div className="border-t border-border/40 mb-1" />
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
            const isActive = activeSection === key
            return (
              <button
                key={key}
                onClick={() => onSectionChange(key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface2 hover:text-gray-200'
                }`}
              >
                <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-accent' : ''}`} />
                <span className="truncate">{label}</span>
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />}
              </button>
            )
          })}

          {/* Admin nav item — only for admin users */}
          {isAdmin && (
            <>
              <div className="border-t border-border/40 my-1" />
              <button
                onClick={() => onSectionChange('admin')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeSection === 'admin' ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface2 hover:text-gray-200'
                }`}
              >
                <Shield className="w-[18px] h-[18px] flex-shrink-0" />
                <span>Quản Lý</span>
                {activeSection === 'admin' && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />}
              </button>
            </>
          )}
        </nav>

        {/* Credit */}
        <div className="px-5 py-2 flex-shrink-0">
          <p className="text-[10px] text-muted/40 text-center tracking-wide">
            Designed by{' '}
            <span className="text-accent/60 font-semibold" style={{ fontStyle: 'italic' }}>
              Trần Đạt
            </span>
          </p>
        </div>

        {/* Sidebar footer — auth section (always visible) */}
        <div className="px-3 py-3 border-t border-border/40 flex-shrink-0">
          {userName ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-surface2/60">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent text-[10px] font-bold">{userName.charAt(0).toUpperCase()}</span>
                </div>
                <span className="text-xs text-gray-300 truncate flex-1">{userName}</span>
                {isAdmin && <Shield className="w-3 h-3 text-accent flex-shrink-0" />}
              </div>
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-muted hover:text-red-400 hover:bg-red-400/5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Đăng xuất
              </button>
            </div>
          ) : isAuthEnabled ? (
            <button
              onClick={onLoginClick}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              Đăng nhập
            </button>
          ) : (
            <p className="text-[10px] text-muted/50 leading-relaxed text-center">
              Dữ liệu realtime · Chỉ để tham khảo
            </p>
          )}
        </div>
      </aside>

      {/* ═══════════════════════════════════════
          MAIN CONTENT AREA
      ═══════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center h-12 px-3 border-b border-border/40 bg-surface flex-shrink-0 gap-2">
          {/* Logo — left */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-sm font-bold text-gray-100">StockAI VN</span>
          </div>

          {/* Current section — center, fills remaining space */}
          {current && (
            <div className="flex items-center gap-1 text-[11px] font-semibold text-accent/80 flex-1 min-w-0 justify-center">
              <current.icon className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{current.label}</span>
            </div>
          )}

          {/* Right actions — icon-only, always same width */}
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
            {/* Bảng Giá */}
            <Link
              href="/priceboard"
              title="Bảng Giá Live"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
            >
              <BarChart2 className="w-4 h-4" />
            </Link>
            {/* Auth */}
            {userName ? (
              <button
                onClick={onLogout}
                title={`Đăng xuất (${userName})`}
                className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center flex-shrink-0"
              >
                <span className="text-accent text-xs font-bold">{userName.charAt(0).toUpperCase()}</span>
              </button>
            ) : isAuthEnabled ? (
              <button
                onClick={onLoginClick}
                title="Đăng nhập"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors flex-shrink-0"
              >
                <LogIn className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </header>

        {/* Market Ticker (sticky) */}
        <div className="flex-shrink-0">
          <MarketTicker />
        </div>

        {/* Scrollable content */}
        <main
          ref={contentRef}
          className="flex-1 overflow-y-auto overscroll-contain pb-16 md:pb-0"
        >
          {children}
        </main>
      </div>

      {/* ═══════════════════════════════════════
          MOBILE BOTTOM BAR  (hidden on desktop)
      ═══════════════════════════════════════ */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-50 h-16 bg-surface/95 backdrop-blur-sm border-t border-border/60 flex items-stretch">
        {mobileMainItems.map(({ key, short, icon: Icon }) => {
          const isActive = activeSection === key
          return (
            <button
              key={key}
              onClick={() => { handleNav(key) }}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${
                isActive ? 'text-accent' : 'text-muted active:text-gray-300'
              }`}
            >
              <div className={`relative flex items-center justify-center w-8 h-5 ${
                isActive ? 'after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:bg-accent after:rounded-full' : ''
              }`}>
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
              </div>
              <span className={`text-[10px] font-medium leading-none transition-colors ${
                isActive ? 'text-accent' : 'text-muted'
              }`}>
                {short}
              </span>
            </button>
          )
        })}

        {/* Thêm / More button */}
        <button
          onClick={() => setMoreOpen(v => !v)}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${
            moreIsActive || moreOpen ? 'text-accent' : 'text-muted active:text-gray-300'
          }`}
        >
          <div className={`relative flex items-center justify-center w-8 h-5 ${
            moreIsActive || moreOpen ? 'after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:bg-accent after:rounded-full' : ''
          }`}>
            {moreOpen
              ? <X className="w-5 h-5 scale-110 text-accent" />
              : <MoreHorizontal className="w-5 h-5" />
            }
          </div>
          <span className={`text-[10px] font-medium leading-none ${
            moreIsActive || moreOpen ? 'text-accent' : 'text-muted'
          }`}>
            Thêm
          </span>
        </button>
      </nav>

      {/* ═══════════════════════════════════════
          MOBILE "THÊM" DRAWER
      ═══════════════════════════════════════ */}
      {moreOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setMoreOpen(false)}
          />
          {/* Drawer panel */}
          <div className="md:hidden fixed bottom-16 left-0 right-0 z-40 bg-surface border-t border-border/60 shadow-2xl px-3 py-3 space-y-1">
            <p className="text-[10px] text-muted/60 uppercase tracking-wider font-semibold px-4 pb-1">Thêm tùy chọn</p>

            {/* Bảng Giá Live link */}
            <Link
              href="/priceboard"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-muted hover:bg-surface2 hover:text-gray-200 transition-all"
            >
              <Table2 className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1">Bảng Giá</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-accent/20 text-accent rounded font-semibold">Live</span>
            </Link>

            {/* Remaining nav items */}
            {mobileMoreItems.map(({ key, label, icon: Icon }) => {
              const isActive = activeSection === key
              return (
                <button
                  key={key}
                  onClick={() => handleNav(key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface2 hover:text-gray-200'
                  }`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-accent' : ''}`} />
                  <span className="flex-1 text-left">{label}</span>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />}
                </button>
              )
            })}

            {/* Admin item */}
            {isAdmin && (
              <>
                <div className="border-t border-border/40 my-1" />
                <button
                  onClick={() => handleNav('admin')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    activeSection === 'admin' ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface2 hover:text-gray-200'
                  }`}
                >
                  <Shield className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1 text-left">Quản Lý</span>
                  {activeSection === 'admin' && <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />}
                </button>
              </>
            )}

            {/* Credit */}
            <div className="border-t border-border/40 my-1" />
            <p className="text-[11px] text-muted/40 text-center py-2 tracking-wide">
              Designed by{' '}
              <span className="text-accent/60 font-semibold" style={{ fontStyle: 'italic' }}>
                Trần Đạt
              </span>
            </p>

            {/* Auth section */}
            <div className="border-t border-border/40 my-1" />
            {userName ? (
              <div className="space-y-1">
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-surface2/60">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-accent text-xs font-bold">{userName.charAt(0).toUpperCase()}</span>
                  </div>
                  <span className="text-sm text-gray-300 flex-1 truncate">{userName}</span>
                  {isAdmin && <Shield className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
                </div>
                <button
                  onClick={() => { setMoreOpen(false); onLogout?.() }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400/80 hover:bg-red-400/5 hover:text-red-400 transition-all"
                >
                  <LogOut className="w-5 h-5 flex-shrink-0" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            ) : isAuthEnabled ? (
              <button
                onClick={() => { setMoreOpen(false); onLoginClick?.() }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-accent/10 text-accent border border-accent/20 transition-all"
              >
                <LogIn className="w-5 h-5 flex-shrink-0" />
                <span>Đăng nhập</span>
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
