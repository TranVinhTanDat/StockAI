export interface QuoteData {
  symbol: string
  name: string
  price: number
  change: number
  changePct: number
  volume: number
  high52w: number
  low52w: number
  marketCap: number
  exchange: string
  industry: string
  timestamp: string
  // Foreign investor flows (from VPS)
  foreignBuyVol?: number
  foreignSellVol?: number
  foreignRoom?: number   // remaining foreign ownership room (%)
  // 365-day OHLCV candles (populated by fetchQuote for reuse in predict route)
  candles?: CandleData[]
}

export interface CandleData {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface MACDPoint {
  macd: number
  signal: number
  histogram: number
}

export interface BBPoint {
  upper: number
  middle: number
  lower: number
}

export interface IndicatorData {
  sma20: number[]
  sma50: number[]
  rsi: number[]
  macd: MACDPoint[]
  bb: BBPoint[]
}

export interface HistoryData {
  candles: CandleData[]
  indicators: IndicatorData
}

export interface FundamentalData {
  pe: number
  eps: number
  roe: number
  roa: number
  debtEquity: number
  revenueGrowth: number
  profitGrowth: number
  dividendYield: number
  bookValue: number
  tcbsRating: number
  tcbsRecommend: string
}

export interface NewsItem {
  id: string
  title: string
  summary: string
  source: string
  url: string
  publishedAt: string
  sentiment: number
  relatedSymbol: string | null
}

export interface EntryZone {
  low: number
  high: number
}

export interface AnalysisResult {
  recommendation: 'MUA MẠNH' | 'MUA' | 'GIỮ' | 'BÁN' | 'BÁN MẠNH'
  confidence: number
  targetPrice: number
  stopLoss: number
  entryZone: EntryZone
  holdingPeriod: string
  technicalScore: number
  fundamentalScore: number
  sentimentScore: number
  technical: string
  fundamental: string
  sentiment: string
  pros: string[]
  risks: string[]
  action: string
  nextReview: string
}

export interface SavedAnalysis {
  id: string
  user_id: string
  symbol: string
  recommendation: string
  confidence: number
  target_price: number
  stop_loss: number
  full_result: AnalysisResult
  analyzed_at: string
}

export interface PortfolioHolding {
  id: string
  user_id: string
  symbol: string
  qty: number
  avg_cost: number
  total_cost: number
  created_at: string
  updated_at: string
  currentPrice?: number
  currentValue?: number
  pnl?: number
  pnlPct?: number
}

export interface Trade {
  id: string
  user_id: string
  symbol: string
  type: 'BUY' | 'SELL'
  qty: number
  price: number
  fee: number
  tax: number
  total: number
  traded_at: string
}

export interface Alert {
  id: string
  user_id: string
  symbol: string
  condition: 'ABOVE' | 'BELOW'
  target_price: number
  is_active: boolean
  triggered_at: string | null
  created_at: string
}

export interface Balance {
  user_id: string
  cash: number
  updated_at: string
}

export interface ExchangeRate {
  usdVnd: number
  eurVnd: number
  updatedAt: string
}

export interface OptimizeStockRec {
  symbol: string
  action: string
  reason: string
  riskLevel?: string
  catalyst?: string
}

export interface OptimizeResult {
  analysis: string
  marketContext?: string
  stockRecommendations?: OptimizeStockRec[]
  suggestions: string[]
  rebalancePlan: string
  riskWarnings?: string[]
}

export interface SavedOptimizeResult {
  id: string
  user_id: string
  result: OptimizeResult
  analyzed_at: string
}

export interface IndustryMap {
  [symbol: string]: string
}

export interface PredictionItem {
  rank: number
  symbol: string
  score: number
  recommendation: string
  targetPrice: number
  currentPrice: number
  upsidePct: number
  reason: string
  catalyst?: string              // key driver/catalyst for price move (1-2 sentences)
  keyMetrics: { pe: number; roe: number; growth: number }
  riskLevel: string
  entryZone: { low: number; high: number }
  stopLoss?: number              // stop-loss price level
}

export interface CompanyYearly {
  year: number
  revenue: number
  netIncome: number
  eps: number
  roe: number
  roa: number
  debtEquity: number
  pe: number
  pb: number
  dividendYield: number
  revenueGrowth: number
  profitGrowth: number
}

export interface CompanyData {
  symbol: string
  companyName: string
  industry: string
  exchange: string
  overview: {
    marketCap: number
    sharesOutstanding: number
    high52w: number
    low52w: number
  }
  yearly: CompanyYearly[]
  currentRatios: {
    pe: number
    pb: number
    roe: number
    roa: number
    debtEquity: number
  }
  tcbsRating: number
  tcbsRecommend: string
}

export interface MarketIndexData {
  vnindex: { value: number; change: number; changePct: number; volume: number }
  hnxindex: { value: number; change: number; changePct: number; volume: number }
  breadth: { advancing: number; declining: number; unchanged: number }
  updatedAt: string
}

export interface SavedPrediction {
  id: string
  user_id: string
  style: string
  predictions: PredictionItem[]
  predicted_at: string
}
