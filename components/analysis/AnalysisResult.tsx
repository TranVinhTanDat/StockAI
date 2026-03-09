'use client'

import { useState } from 'react'
import type { AnalysisResult as AnalysisResultType, QuoteData } from '@/types'
import {
  formatVND,
  formatPct,
  getRecommendationColor,
  getRecommendationBg,
  getChangeColor,
} from '@/lib/utils'
import { saveAnalysis } from '@/lib/storage'
import {
  Target,
  ShieldAlert,
  ArrowDownToLine,
  Clock,
  Save,
  RefreshCw,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react'

interface AnalysisResultProps {
  result: AnalysisResultType
  quote: QuoteData
  symbol: string
  onReanalyze: () => void
  onViewChart: () => void
}

export default function AnalysisResult({
  result,
  quote,
  symbol,
  onReanalyze,
  onViewChart,
}: AnalysisResultProps) {
  const [activeTab, setActiveTab] = useState<'technical' | 'fundamental' | 'sentiment'>('technical')
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    await saveAnalysis(symbol, result)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const tabs = [
    { key: 'technical' as const, label: 'Kỹ Thuật', score: result.technicalScore },
    { key: 'fundamental' as const, label: 'Cơ Bản', score: result.fundamentalScore },
    { key: 'sentiment' as const, label: 'Tâm Lý', score: result.sentimentScore },
  ]

  return (
    <div className="card-glass overflow-hidden">
      <div className="p-6 border-b border-border">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-accent" />
              {symbol} — Phân tích lúc{' '}
              {new Date().toLocaleTimeString('vi-VN')}
            </h3>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-6">
          <div
            className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 min-w-[140px] ${getRecommendationBg(result.recommendation)}`}
          >
            <span className="text-3xl font-bold">{result.recommendation}</span>
            <div className="mt-2 text-sm">Tin cậy</div>
            <div className="w-full mt-1 h-2 bg-black/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-current rounded-full"
                style={{ width: `${result.confidence}%` }}
              />
            </div>
            <span className="text-sm mt-1">{result.confidence}%</span>
          </div>

          <div className="flex-1 grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <span className={`text-lg font-medium ${getChangeColor(quote.changePct)}`}>
                {formatVND(quote.price)}
              </span>
              <span className={`text-sm ${getChangeColor(quote.changePct)}`}>
                {formatPct(quote.changePct)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Target className="w-4 h-4 text-accent" />
              <span className="text-muted">Mục tiêu:</span>
              <span className="font-medium">{formatVND(result.targetPrice)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ShieldAlert className="w-4 h-4 text-danger" />
              <span className="text-muted">Cắt lỗ:</span>
              <span className="font-medium text-danger">{formatVND(result.stopLoss)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ArrowDownToLine className="w-4 h-4 text-blue-400" />
              <span className="text-muted">Vào lệnh:</span>
              <span className="font-medium">
                {formatVND(result.entryZone.low)} - {formatVND(result.entryZone.high)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm col-span-2">
              <Clock className="w-4 h-4 text-gold" />
              <span className="text-muted">Nắm giữ:</span>
              <span className="font-medium">{result.holdingPeriod}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-border">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-gray-300'
              }`}
            >
              {tab.label} ★{tab.score}/10
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        <p className="text-sm text-gray-300 leading-relaxed mb-4">
          {activeTab === 'technical' && result.technical}
          {activeTab === 'fundamental' && result.fundamental}
          {activeTab === 'sentiment' && result.sentiment}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <h4 className="text-sm font-medium text-accent mb-2 flex items-center gap-1">
              <CheckCircle className="w-4 h-4" /> Điểm tích cực
            </h4>
            {result.pros.map((pro, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-gray-300 mb-1">
                <span className="text-accent mt-0.5">✓</span>
                {pro}
              </div>
            ))}
          </div>
          <div>
            <h4 className="text-sm font-medium text-danger mb-2 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> Rủi ro
            </h4>
            {result.risks.map((risk, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-gray-300 mb-1">
                <span className="text-danger mt-0.5">⚠</span>
                {risk}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface2 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb className="w-4 h-4 text-gold" />
            <span className="text-sm font-medium text-gold">Hành động</span>
          </div>
          <p className="text-sm text-gray-300">{result.action}</p>
          <p className="text-xs text-muted mt-2">Xem lại: {result.nextReview}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSave}
            disabled={saved}
            className="btn-primary py-2 px-4 text-sm flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            {saved ? 'Đã lưu!' : 'Lưu'}
          </button>
          <button
            onClick={onReanalyze}
            className="bg-surface2 hover:bg-border text-gray-100 py-2 px-4 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Phân tích lại
          </button>
          <button
            onClick={onViewChart}
            className="bg-surface2 hover:bg-border text-gray-100 py-2 px-4 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            Xem Chart
          </button>
        </div>
      </div>
    </div>
  )
}
