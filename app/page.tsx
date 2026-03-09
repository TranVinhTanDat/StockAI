'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'

import Navbar from '@/components/layout/Navbar'
import MarketTicker from '@/components/layout/MarketTicker'
import MarketOverview from '@/components/dashboard/MarketOverview'
import WatchlistTable from '@/components/dashboard/WatchlistTable'
import AnalysisInput from '@/components/analysis/AnalysisInput'
import LoadingSteps from '@/components/analysis/LoadingSteps'
import AnalysisResult from '@/components/analysis/AnalysisResult'
import AnalysisHistory from '@/components/analysis/AnalysisHistory'
import NewsFeed from '@/components/news/NewsFeed'
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
import { usePortfolio } from '@/hooks/usePortfolio'
import { useMultiQuote } from '@/hooks/useQuote'
import { useAlerts } from '@/hooks/useAlerts'
import type { AnalysisResult as AnalysisResultType, QuoteData, HistoryData, FundamentalData, NewsItem } from '@/types'
import { TrendingUp, Bot, BarChart3, Newspaper, Briefcase, Wrench, Bell } from 'lucide-react'

const CandlestickChart = dynamic(
  () => import('@/components/chart/CandlestickChart'),
  { ssr: false, loading: () => (
    <div className="card-glass h-[500px] flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
    </div>
  )}
)

type AnalysisState =
  | { status: 'idle' }
  | { status: 'loading'; step: number }
  | { status: 'done'; result: AnalysisResultType; quote: QuoteData; symbol: string }
  | { status: 'error'; message: string }

export default function Home() {
  const [analysisState, setAnalysisState] = useState<AnalysisState>({ status: 'idle' })
  const [chartSymbol, setChartSymbol] = useState('FPT')
  const [pendingSymbol, setPendingSymbol] = useState<string | null>(null)
  const [activeToolTab, setActiveToolTab] = useState<'fee' | 'profit' | 'dca' | 'pe' | 'glossary'>('fee')
  const [sellSymbol, setSellSymbol] = useState<string | null>(null)

  const analysisRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  const { holdings, balance, buy, sell, reload: reloadPortfolio } = usePortfolio()
  const { checkAlerts } = useAlerts()

  // Get current prices for portfolio holdings
  const holdingSymbols = useMemo(() => holdings.map((h) => h.symbol), [holdings])
  const { quotes: portfolioPrices } = useMultiQuote(holdingSymbols)
  const pricesMap = useMemo(() => {
    const map: Record<string, number> = {}
    holdingSymbols.forEach((s) => {
      if (portfolioPrices[s]) map[s] = portfolioPrices[s].price
    })
    return map
  }, [holdingSymbols, portfolioPrices])

  // Check alerts every 60 seconds (use ref to avoid re-creating interval)
  const checkAlertsRef = useRef(checkAlerts)
  checkAlertsRef.current = checkAlerts
  const pricesMapRef = useRef(pricesMap)
  pricesMapRef.current = pricesMap

  useEffect(() => {
    const interval = setInterval(() => {
      if (Object.keys(pricesMapRef.current).length > 0) {
        checkAlertsRef.current(pricesMapRef.current)
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleAnalyze = useCallback(async (symbol: string) => {
    const upper = symbol.toUpperCase()
    setPendingSymbol(null)
    setAnalysisState({ status: 'loading', step: 0 })

    // Scroll to analysis section
    setTimeout(() => {
      analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)

    try {
      // Step 1: Quote
      setAnalysisState({ status: 'loading', step: 0 })
      const quoteRes = await fetch(`/api/quote?symbol=${upper}`)
      if (!quoteRes.ok) throw new Error('Không tìm thấy mã ' + upper)
      const quote: QuoteData = await quoteRes.json()

      // Step 2: History + indicators
      setAnalysisState({ status: 'loading', step: 1 })
      const historyRes = await fetch(`/api/history?symbol=${upper}&days=90`)
      const history: HistoryData = historyRes.ok ? await historyRes.json() : { candles: [], indicators: { sma20: [], sma50: [], rsi: [], macd: [], bb: [] } }

      // Step 3: Fundamental
      setAnalysisState({ status: 'loading', step: 2 })
      const fundRes = await fetch(`/api/fundamental?symbol=${upper}`)
      const fundamental: FundamentalData = fundRes.ok ? await fundRes.json() : { pe: 0, eps: 0, roe: 0, roa: 0, debtEquity: 0, revenueGrowth: 0, profitGrowth: 0, dividendYield: 0, bookValue: 0, tcbsRating: 0, tcbsRecommend: 'N/A' }

      // Step 4: News
      setAnalysisState({ status: 'loading', step: 3 })
      const newsRes = await fetch(`/api/news?symbol=${upper}`)
      const news: NewsItem[] = newsRes.ok ? await newsRes.json() : []

      // Step 5: AI analysis
      setAnalysisState({ status: 'loading', step: 4 })
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: upper,
          quote,
          indicators: history.indicators,
          fundamental,
          news: news.slice(0, 5),
        }),
      })

      if (!analyzeRes.ok) {
        const err = await analyzeRes.json()
        throw new Error(err.error || 'Phân tích thất bại')
      }

      const result: AnalysisResultType = await analyzeRes.json()

      setChartSymbol(upper)
      setAnalysisState({ status: 'done', result, quote, symbol: upper })
    } catch (e) {
      setAnalysisState({
        status: 'error',
        message: e instanceof Error ? e.message : 'Lỗi không xác định',
      })
    }
  }, [])

  const handleViewChart = useCallback(() => {
    if (analysisState.status === 'done') {
      setChartSymbol(analysisState.symbol)
    }
    chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [analysisState])

  const handleSellClick = useCallback((symbol: string) => {
    setSellSymbol(symbol)
    document.getElementById('trade-section')?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const TOOL_TABS = [
    { key: 'fee' as const, label: 'Tính phí GD' },
    { key: 'profit' as const, label: 'Tính lãi/lỗ' },
    { key: 'dca' as const, label: 'Mô phỏng DCA' },
    { key: 'pe' as const, label: 'Tính P/E' },
    { key: 'glossary' as const, label: 'Từ điển' },
  ]

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <MarketTicker />

      {/* ── Hero + Market Overview ── */}
      <section id="market" className="max-w-7xl mx-auto px-4 pt-12 pb-8">
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold italic mb-4">
            <span className="gradient-text">Đầu Tư Thông Minh</span>
            <br />
            <span className="text-gray-100">Cùng AI</span>
          </h1>
          <p className="text-muted text-lg max-w-2xl mx-auto">
            Phân tích realtime · Khuyến nghị MUA/BÁN · Dữ liệu TCBS thật
          </p>
        </div>
        <MarketOverview />
      </section>

      {/* ── Watchlist ── */}
      <section className="max-w-7xl mx-auto px-4 pb-12">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-accent" />
          Bảng Giá Thị Trường
        </h2>
        <WatchlistTable
          onAnalyze={(symbol) => {
            setPendingSymbol(symbol)
            handleAnalyze(symbol)
          }}
        />
      </section>

      {/* ── Phân Tích AI ── */}
      <section id="analysis" ref={analysisRef} className="max-w-7xl mx-auto px-4 pb-12">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          <Bot className="w-5 h-5 text-accent" />
          Phân Tích AI
        </h2>

        <div className="mb-6">
          <AnalysisInput
            onAnalyze={handleAnalyze}
            isLoading={analysisState.status === 'loading'}
            initialSymbol={pendingSymbol || undefined}
          />
        </div>

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
              onReanalyze={() => handleAnalyze(analysisState.symbol)}
              onViewChart={handleViewChart}
            />
          </div>
        )}

        <div className="mt-6">
          <AnalysisHistory />
        </div>
      </section>

      {/* ── Biểu Đồ ── */}
      <section id="chart" ref={chartRef} className="max-w-7xl mx-auto px-4 pb-12">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-accent" />
          Biểu Đồ Kỹ Thuật
        </h2>
        <CandlestickChart symbol={chartSymbol} />
      </section>

      {/* ── Tin Tức ── */}
      <section id="news" className="max-w-7xl mx-auto px-4 pb-12">
        <NewsFeed />
      </section>

      {/* ── Danh Mục ── */}
      <section id="portfolio" className="max-w-7xl mx-auto px-4 pb-12">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-accent" />
          Danh Mục Ảo
        </h2>

        <div className="mb-6">
          <PortfolioDashboard
            holdings={holdings}
            balance={balance}
            prices={pricesMap}
          />
        </div>

        <div id="trade-section" className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div>
            <TradeForm
              onBuy={buy}
              onSell={sell}
              cash={balance.cash}
              initialSymbol={sellSymbol}
              initialType="SELL"
            />
          </div>
          <div className="lg:col-span-2">
            <HoldingsTable
              holdings={holdings}
              prices={pricesMap}
              onSell={handleSellClick}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
          <AllocationChart holdings={holdings} prices={pricesMap} />
          <div className="flex items-start">
            <OptimizeModal holdings={holdings} prices={pricesMap} />
          </div>
        </div>
      </section>

      {/* ── Công Cụ ── */}
      <section id="tools" className="max-w-7xl mx-auto px-4 pb-12">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-accent" />
          Công Cụ Đầu Tư
        </h2>

        <div className="card-glass overflow-hidden">
          <div className="flex border-b border-border overflow-x-auto">
            {TOOL_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveToolTab(tab.key)}
                className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
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
            {activeToolTab === 'fee' && <FeeCalculator />}
            {activeToolTab === 'profit' && <ProfitCalculator />}
            {activeToolTab === 'dca' && <DCASimulator />}
            {activeToolTab === 'pe' && <PECalculator />}
            {activeToolTab === 'glossary' && <Glossary />}
          </div>
        </div>
      </section>

      {/* ── Cảnh Báo ── */}
      <section className="max-w-7xl mx-auto px-4 pb-16">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-gold" />
          Cảnh Báo Giá
        </h2>
        <AlertManager />
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-surface py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted">
          <div className="flex items-center gap-2 font-semibold text-gray-300">
            <TrendingUp className="w-4 h-4 text-accent" />
            StockAI VN
          </div>
          <p>Dữ liệu từ TCBS API · Phân tích bởi Claude AI · Chỉ để tham khảo</p>
          <p>© {new Date().getFullYear()} StockAI VN</p>
        </div>
      </footer>
    </div>
  )
}
