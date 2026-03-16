'use client'

const ALLOW_REGISTRATION = process.env.NEXT_PUBLIC_ALLOW_REGISTRATION !== 'false'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'

import AppShell, { type SectionKey } from '@/components/layout/AppShell'
import MarketOverview from '@/components/dashboard/MarketOverview'
import WatchlistTable from '@/components/dashboard/WatchlistTable'
import StockPredictions from '@/components/dashboard/StockPredictions'
import MarketHeatmap from '@/components/dashboard/MarketHeatmap'
import FearGreedGauge from '@/components/dashboard/FearGreedGauge'
import CompanyProfile from '@/components/analysis/CompanyProfile'
import CafefCompanyData from '@/components/analysis/CafefCompanyData'
import AnalysisInput from '@/components/analysis/AnalysisInput'
import LoadingSteps from '@/components/analysis/LoadingSteps'
import AnalysisResult from '@/components/analysis/AnalysisResult'
import AnalysisHistory from '@/components/analysis/AnalysisHistory'
import AnalystReports from '@/components/analysis/AnalystReports'
import IndustryComparison from '@/components/analysis/IndustryComparison'
import NewsFeed from '@/components/news/NewsFeed'
import MarketDiary from '@/components/news/MarketDiary'
import PortfolioDashboard from '@/components/portfolio/PortfolioDashboard'
import TradeForm from '@/components/portfolio/TradeForm'
import HoldingsTable from '@/components/portfolio/HoldingsTable'
import AllocationChart from '@/components/portfolio/AllocationChart'
import OptimizeModal from '@/components/portfolio/OptimizeModal'
import FeeCalculator from '@/components/tools/FeeCalculator'
import ProfitCalculator from '@/components/tools/ProfitCalculator'
import DCASimulator from '@/components/tools/DCASimulator'
import PECalculator from '@/components/tools/PECalculator'
import Glossary from '@/components/tools/Glossary'
import AlertManager from '@/components/alerts/AlertManager'
import TechnicalAlerts from '@/components/alerts/TechnicalAlerts'
import { usePortfolio } from '@/hooks/usePortfolio'
import { useMultiQuote } from '@/hooks/useQuote'
import { useAlerts } from '@/hooks/useAlerts'
import type { AnalysisResult as AnalysisResultType, QuoteData, HistoryData, FundamentalData, NewsItem, SavedAnalysis } from '@/types'
import { getCachedAnalysis, setCachedAnalysis, clearCachedAnalysis } from '@/lib/analysisCache'
import { TrendingUp, Bot, Newspaper, Briefcase, Wrench, Bell, BarChart3, Map, History, Shield } from 'lucide-react'
import { useAuthContext } from '@/components/auth/AuthContext'
const LoginModal = dynamic(() => import('@/components/auth/LoginModal'), { ssr: false })
const ChangePasswordModal = dynamic(() => import('@/components/auth/ChangePasswordModal'), { ssr: false })
const UserManagement = dynamic(() => import('@/components/admin/UserManagement'), { ssr: false })

const CandlestickChart = dynamic(
  () => import('@/components/chart/CandlestickChart'),
  {
    ssr: false,
    loading: () => (
      <div className="card-glass h-[480px] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    ),
  }
)

interface HoldingSnapshot { qty: number; avgCost: number; totalCost: number }

type AnalysisState =
  | { status: 'idle' }
  | { status: 'loading'; step: number }
  | { status: 'done'; result: AnalysisResultType; quote: QuoteData; symbol: string; fromCache: boolean; cachedAt?: string; expiresAt?: string; currentHolding?: HoldingSnapshot | null }
  | { status: 'error'; message: string }

// Consistent section padding wrapper
function SectionWrap({ children }: { children: React.ReactNode }) {
  return <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">{children}</div>
}

function SectionTitle({ icon: Icon, title, color = 'text-accent' }: {
  icon: React.ComponentType<{ className?: string }>; title: string; color?: string
}) {
  return (
    <h2 className="text-xl font-bold flex items-center gap-2">
      <Icon className={`w-5 h-5 ${color}`} />
      {title}
    </h2>
  )
}

export default function Home() {
  const [activeSection, setActiveSection] = useState<SectionKey>('market')
  const [analysisState, setAnalysisState] = useState<AnalysisState>({ status: 'idle' })
  const [chartSymbol, setChartSymbol] = useState('FPT')
  const [showLogin, setShowLogin] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)

  const { user, isAdmin, isAuthEnabled, signOut } = useAuthContext()
  const [pendingSymbol, setPendingSymbol] = useState<string | null>(null)
  const [activeToolTab, setActiveToolTab] = useState<'fee' | 'profit' | 'dca' | 'pe' | 'glossary'>('fee')
  const [sellSymbol, setSellSymbol] = useState<string | null>(null)

  const contentRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  const { holdings, balance, buy, sell, editHolding, deleteHolding, setCash, reload: reloadPortfolio } = usePortfolio()
  const { checkAlerts, reload: reloadAlerts } = useAlerts()

  // Reload all user-specific data when auth state changes (login / logout)
  const prevUserIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const uid = user?.id
    if (uid !== prevUserIdRef.current) {
      prevUserIdRef.current = uid
      reloadPortfolio()
      reloadAlerts()
    }
  }, [user?.id, reloadPortfolio, reloadAlerts])

  const holdingSymbols = useMemo(() => holdings.map(h => h.symbol), [holdings])
  const { quotes: portfolioPrices } = useMultiQuote(holdingSymbols)
  const pricesMap = useMemo(() => {
    const map: Record<string, number> = {}
    holdingSymbols.forEach(s => { if (portfolioPrices[s]) map[s] = portfolioPrices[s].price })
    return map
  }, [holdingSymbols, portfolioPrices])

  // Alert checker
  const checkAlertsRef = useRef(checkAlerts)
  checkAlertsRef.current = checkAlerts
  const pricesMapRef = useRef(pricesMap)
  pricesMapRef.current = pricesMap
  useEffect(() => {
    const id = setInterval(() => {
      if (Object.keys(pricesMapRef.current).length > 0) checkAlertsRef.current(pricesMapRef.current)
    }, 60000)
    return () => clearInterval(id)
  }, [])

  const handleSectionChange = useCallback((s: SectionKey) => {
    setActiveSection(s)
    requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0, behavior: 'instant' }))
  }, [])

  // ── Analysis pipeline ──────────────────────────────────────────────────────
  const runFullAnalysis = useCallback(async (
    upper: string,
    holdingsForSymbol?: HoldingSnapshot | null,
    forceRefresh = false
  ) => {
    setAnalysisState({ status: 'loading', step: 0 })
    const quoteRes = await fetch(`/api/quote?symbol=${upper}`)
    if (!quoteRes.ok) throw new Error('Không tìm thấy mã ' + upper)
    const quote: QuoteData = await quoteRes.json()

    setAnalysisState({ status: 'loading', step: 1 })
    const historyRes = await fetch(`/api/history?symbol=${upper}&days=90`)
    const history: HistoryData = historyRes.ok
      ? await historyRes.json()
      : { candles: [], indicators: { sma20: [], sma50: [], rsi: [], macd: [], bb: [] } }

    setAnalysisState({ status: 'loading', step: 2 })
    const fundRes = await fetch(`/api/fundamental?symbol=${upper}`)
    const fundamental: FundamentalData = fundRes.ok
      ? await fundRes.json()
      : { pe: 0, eps: 0, roe: 0, roa: 0, debtEquity: 0, revenueGrowth: 0, profitGrowth: 0, dividendYield: 0, bookValue: 0, tcbsRating: 0, tcbsRecommend: 'N/A' }

    setAnalysisState({ status: 'loading', step: 3 })
    const newsRes = await fetch(`/api/news?symbol=${upper}`)
    const newsData = newsRes.ok ? await newsRes.json() : { items: [] }
    const news: NewsItem[] = Array.isArray(newsData) ? newsData : (newsData.items ?? [])

    setAnalysisState({ status: 'loading', step: 4 })
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('stockai_jwt') : null
    const analyzeRes = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(storedToken ? { 'Authorization': `Bearer ${storedToken}` } : {}),
      },
      body: JSON.stringify({
        symbol: upper, quote, indicators: history.indicators,
        highs: history.candles.map((c: { high: number }) => c.high),
        lows: history.candles.map((c: { low: number }) => c.low),
        closes: history.candles.map((c: { close: number }) => c.close),
        volumes: history.candles.map((c: { volume: number }) => c.volume),
        fundamental, news: news.slice(0, 5),
        currentHolding: holdingsForSymbol || null, forceRefresh,
      }),
    })
    if (!analyzeRes.ok) {
      const err = await analyzeRes.json()
      throw new Error(err.error || 'Phân tích thất bại')
    }
    const result: AnalysisResultType = await analyzeRes.json()
    setCachedAnalysis(upper, result, quote)
    return { result, quote }
  }, [])

  const handleAnalyze = useCallback(async (symbol: string, forceRefresh = false) => {
    const upper = symbol.toUpperCase()

    if (!user) {
      setShowLogin(true)
      return
    }

    setPendingSymbol(null)
    handleSectionChange('analysis')

    if (!forceRefresh) {
      // If already showing result for this symbol, keep it — don't re-run AI
      if (analysisState.status === 'done' && analysisState.symbol === upper) {
        return
      }
      const cached = getCachedAnalysis(upper)
      if (cached) {
        const h = holdings.find(hh => hh.symbol === upper)
        setChartSymbol(upper)
        setAnalysisState({
          status: 'done', result: cached.result, quote: cached.quote, symbol: upper,
          fromCache: true, cachedAt: cached.cachedAt, expiresAt: cached.expiresAt,
          currentHolding: h ? { qty: h.qty, avgCost: h.avg_cost, totalCost: h.total_cost } : null,
        })
        return
      }
    }

    if (forceRefresh) clearCachedAnalysis(upper)
    setAnalysisState({ status: 'loading', step: 0 })
    try {
      const holding = holdings.find(h => h.symbol === upper)
      const holdingData = holding ? { qty: holding.qty, avgCost: holding.avg_cost, totalCost: holding.total_cost } : null
      const { result, quote } = await runFullAnalysis(upper, holdingData, forceRefresh)
      setChartSymbol(upper)
      setAnalysisState({ status: 'done', result, quote, symbol: upper, fromCache: false, currentHolding: holdingData })
    } catch (e) {
      setAnalysisState({ status: 'error', message: e instanceof Error ? e.message : 'Lỗi không xác định' })
    }
  }, [runFullAnalysis, holdings, handleSectionChange, user, analysisState])

  const handleViewChart = useCallback(() => {
    if (analysisState.status === 'done') setChartSymbol(analysisState.symbol)
    handleSectionChange('analysis')
    setTimeout(() => chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
  }, [analysisState, handleSectionChange])

  const handleSellClick = useCallback((symbol: string) => {
    setSellSymbol(symbol)
    handleSectionChange('portfolio')
  }, [handleSectionChange])

  const handleSelectHistory = useCallback(async (analysis: SavedAnalysis) => {
    const upper = analysis.symbol.toUpperCase()
    setPendingSymbol(null)
    handleSectionChange('analysis')  // Navigate to analysis to show result
    let quote: QuoteData
    try {
      const res = await fetch(`/api/quote?symbol=${upper}`)
      quote = res.ok ? await res.json() : { symbol: upper, name: upper, price: analysis.target_price, change: 0, changePct: 0, volume: 0, high52w: 0, low52w: 0, marketCap: 0, exchange: 'HSX', industry: '', timestamp: '' }
    } catch {
      quote = { symbol: upper, name: upper, price: analysis.target_price, change: 0, changePct: 0, volume: 0, high52w: 0, low52w: 0, marketCap: 0, exchange: 'HSX', industry: '', timestamp: '' }
    }
    setChartSymbol(upper)
    setAnalysisState({ status: 'done', result: analysis.full_result, quote, symbol: upper, fromCache: true, cachedAt: analysis.analyzed_at })
  }, [handleSectionChange])

  const TOOL_TABS = [
    { key: 'fee' as const, label: 'Tính phí GD' },
    { key: 'profit' as const, label: 'Tính lãi/lỗ' },
    { key: 'dca' as const, label: 'Mô phỏng DCA' },
    { key: 'pe' as const, label: 'Tính P/E' },
    { key: 'glossary' as const, label: 'Từ điển' },
  ]

  return (
    <>
    {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    {showChangePassword && user && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    <AppShell
      activeSection={activeSection}
      onSectionChange={handleSectionChange}
      contentRef={contentRef}
      userName={user?.username || null}
      isAdmin={isAdmin}
      isAuthEnabled={isAuthEnabled}
      onLoginClick={() => setShowLogin(true)}
      onLogout={signOut}
      onChangePassword={user ? () => setShowChangePassword(true) : undefined}
    >
      {/* ══════════════════════════════════════════════════
          THỊ TRƯỜNG
      ══════════════════════════════════════════════════ */}
      <div className={activeSection !== 'market' ? 'hidden' : ''}>
        <SectionWrap>
          {/* Hero compact */}
          <div className="text-center py-4">
            <h1 className="font-display text-3xl md:text-4xl font-bold italic mb-2">
              <span className="gradient-text">Đầu Tư Thông Minh</span>
              <span className="text-gray-300"> Cùng AI</span>
            </h1>
            <p className="text-muted text-sm">Phân tích realtime · Khuyến nghị MUA/BÁN · Dữ liệu VPS thật</p>
          </div>

          <MarketOverview />

          <div>
            <SectionTitle icon={Map} title="Tổng Quan Thị Trường" />
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-1"><FearGreedGauge /></div>
              <div className="lg:col-span-3">
                <MarketHeatmap
                  onAnalyze={sym => { setPendingSymbol(sym); handleAnalyze(sym) }}
                  onViewChart={sym => { setChartSymbol(sym); handleSectionChange('analysis'); setTimeout(() => chartRef.current?.scrollIntoView({ behavior: 'smooth' }), 150) }}
                />
              </div>
            </div>
          </div>

          <StockPredictions key={user?.id ?? 'anon'} />

          <div>
            <SectionTitle icon={TrendingUp} title="Bảng Giá Thị Trường" />
            <div className="mt-4">
              <WatchlistTable key={user?.id ?? 'anon'} onAnalyze={sym => { setPendingSymbol(sym); handleAnalyze(sym) }} />
            </div>
          </div>
        </SectionWrap>
      </div>

      {/* ══════════════════════════════════════════════════
          PHÂN TÍCH AI
      ══════════════════════════════════════════════════ */}
      <div className={activeSection !== 'analysis' ? 'hidden' : ''}>
        <SectionWrap>
          <SectionTitle icon={Bot} title="Phân Tích AI" />

          {!user && (
            <div className="card-glass border border-accent/30 bg-gradient-to-r from-accent/5 to-transparent p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0 ring-1 ring-accent/20">
                <Bot className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-100 mb-1">Đăng nhập để sử dụng AI phân tích</p>
                <p className="text-xs text-muted leading-relaxed mb-3">
                  AI phân tích chuyên sâu (kỹ thuật + cơ bản + tin tức) yêu cầu tài khoản để đảm bảo chất lượng dịch vụ và lưu lịch sử phân tích riêng của bạn.
                </p>
                <button
                  onClick={() => setShowLogin(true)}
                  className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-semibold hover:bg-accent/90 transition-colors shadow shadow-accent/20"
                >
                  {ALLOW_REGISTRATION ? 'Đăng nhập / Đăng ký miễn phí' : 'Đăng nhập'}
                </button>
              </div>
            </div>
          )}

          <AnalysisInput
            onAnalyze={(sym) => handleAnalyze(sym)}
            isLoading={analysisState.status === 'loading'}
            initialSymbol={pendingSymbol || undefined}
          />

          {analysisState.status === 'loading' && (
            <LoadingSteps currentStep={analysisState.step} />
          )}

          {analysisState.status === 'error' && (
            <div className="card-glass p-6 text-center">
              <p className="text-danger mb-2">{analysisState.message}</p>
              <button
                onClick={() => setAnalysisState({ status: 'idle' })}
                className="text-sm text-muted hover:text-gray-100 transition-colors"
              >
                Thử lại
              </button>
            </div>
          )}

          {analysisState.status === 'done' && (
            <div className="space-y-4">
              <AnalysisResult
                result={analysisState.result}
                quote={analysisState.quote}
                symbol={analysisState.symbol}
                fromCache={analysisState.fromCache}
                cachedAt={analysisState.cachedAt}
                expiresAt={analysisState.expiresAt}
                onReanalyze={() => handleAnalyze(analysisState.symbol, true)}
                onRefresh={() => handleAnalyze(analysisState.symbol, true)}
                onViewChart={handleViewChart}
                currentHolding={analysisState.currentHolding}
              />
              <CompanyProfile symbol={analysisState.symbol} />
              <CafefCompanyData symbol={analysisState.symbol} />
              <AnalystReports symbol={analysisState.symbol} />
              <IndustryComparison symbol={analysisState.symbol} />
            </div>
          )}

          <AnalysisHistory
            key={`${user?.id ?? 'anon'}-${analysisState.status === 'done' ? analysisState.symbol : ''}`}
            symbol={analysisState.status === 'done' ? analysisState.symbol : undefined}
            onSelect={handleSelectHistory}
          />

          {/* Chart */}
          <div ref={chartRef}>
            <SectionTitle icon={BarChart3} title="Biểu Đồ Kỹ Thuật" />
            <div className="mt-4">
              <CandlestickChart symbol={chartSymbol} isVisible={activeSection === 'analysis'} />
            </div>
          </div>
        </SectionWrap>
      </div>

      {/* ══════════════════════════════════════════════════
          LỊCH SỬ AI
      ══════════════════════════════════════════════════ */}
      <div className={activeSection !== 'history' ? 'hidden' : ''}>
        <SectionWrap>
          <SectionTitle icon={History} title="Lịch Sử Phân Tích AI" />
          <p className="text-sm text-muted">Các phân tích gần đây được lưu từ trang Phân Tích AI. Nhấn vào để xem lại kết quả.</p>
          <AnalysisHistory key={user?.id ?? 'anon'} onSelect={handleSelectHistory} />
        </SectionWrap>
      </div>

      {/* ══════════════════════════════════════════════════
          TIN TỨC
      ══════════════════════════════════════════════════ */}
      <div className={activeSection !== 'news' ? 'hidden' : ''}>
        <SectionWrap>
          <SectionTitle icon={Newspaper} title="Tin Tức & Phân Tích" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2"><NewsFeed /></div>
            <div><MarketDiary /></div>
          </div>
        </SectionWrap>
      </div>

      {/* ══════════════════════════════════════════════════
          DANH MỤC
      ══════════════════════════════════════════════════ */}
      <div className={activeSection !== 'portfolio' ? 'hidden' : ''}>
        <SectionWrap>
          <SectionTitle icon={Briefcase} title="Danh Mục Ảo" />

          <PortfolioDashboard holdings={holdings} balance={balance} prices={pricesMap} onUpdateCash={setCash} />

          <div id="trade-section" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <TradeForm
              onBuy={buy}
              onSell={sell}
              cash={balance.cash}
              initialSymbol={sellSymbol}
              initialType="SELL"
            />
            <div className="lg:col-span-2">
              <HoldingsTable
                holdings={holdings}
                prices={pricesMap}
                onSell={handleSellClick}
                onEdit={editHolding}
                onDelete={deleteHolding}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AllocationChart holdings={holdings} prices={pricesMap} />
            <div className="flex items-start">
              <OptimizeModal holdings={holdings} prices={pricesMap} cash={balance.cash} />
            </div>
          </div>
        </SectionWrap>
      </div>

      {/* ══════════════════════════════════════════════════
          CÔNG CỤ
      ══════════════════════════════════════════════════ */}
      <div className={activeSection !== 'tools' ? 'hidden' : ''}>
        <SectionWrap>
          <SectionTitle icon={Wrench} title="Công Cụ Đầu Tư" />
          <div className="card-glass overflow-hidden">
            <div className="flex border-b border-border overflow-x-auto">
              {TOOL_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveToolTab(tab.key)}
                  className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                    activeToolTab === tab.key
                      ? 'border-accent text-accent'
                      : 'border-transparent text-muted hover:text-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="p-6">
              {activeToolTab === 'fee'     && <FeeCalculator />}
              {activeToolTab === 'profit'  && <ProfitCalculator />}
              {activeToolTab === 'dca'     && <DCASimulator />}
              {activeToolTab === 'pe'      && <PECalculator />}
              {activeToolTab === 'glossary'&& <Glossary />}
            </div>
          </div>
        </SectionWrap>
      </div>

      {/* ══════════════════════════════════════════════════
          CẢNH BÁO
      ══════════════════════════════════════════════════ */}
      <div className={activeSection !== 'alerts' ? 'hidden' : ''}>
        <SectionWrap>
          <SectionTitle icon={Bell} title="Cảnh Báo & Tín Hiệu" color="text-gold" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AlertManager />
            <TechnicalAlerts onAnalyze={sym => { setPendingSymbol(sym); handleAnalyze(sym) }} />
          </div>
        </SectionWrap>
      </div>

      {/* ══════════════════════════════════════════════════
          QUẢN LÝ (Admin only)
      ══════════════════════════════════════════════════ */}
      {isAdmin && (
        <div className={activeSection !== 'admin' ? 'hidden' : ''}>
          <SectionWrap>
            <SectionTitle icon={Shield} title="Quản Lý Hệ Thống" color="text-accent" />
            <UserManagement />
          </SectionWrap>
        </div>
      )}
    </AppShell>
    </>
  )
}
