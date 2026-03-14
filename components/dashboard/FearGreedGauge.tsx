'use client'

import { useEffect, useState } from 'react'
import type { MarketIndexData } from '@/types'

interface FearGreedData {
  score: number        // 0-100
  label: string
  color: string
  textColor: string
  factors: { name: string; score: number; weight: number }[]
}

function computeFearGreed(market: MarketIndexData): FearGreedData {
  const { vnindex, hnxindex, breadth } = market

  // Factor 1: Market breadth ratio (30%)
  const total = breadth.advancing + breadth.declining + breadth.unchanged
  const breadthRatio = total > 0 ? breadth.advancing / total : 0.5
  const breadthScore = Math.round(breadthRatio * 100)

  // Factor 2: VN-Index momentum (25%) — map -3% to +3% → 0-100
  const momentum = vnindex.changePct
  const momentumScore = Math.min(100, Math.max(0, Math.round((momentum + 3) / 6 * 100)))

  // Factor 3: Market volume strength (20%) — volume vs neutral baseline
  const volScore = vnindex.volume > 500_000_000 ? 65 : vnindex.volume > 300_000_000 ? 50 : 40

  // Factor 4: HNX correlation (25%) — both up = very bullish
  const hnxMomentum = hnxindex.changePct
  const hnxScore = Math.min(100, Math.max(0, Math.round((hnxMomentum + 3) / 6 * 100)))

  const score = Math.round(
    breadthScore * 0.30 +
    momentumScore * 0.25 +
    volScore * 0.20 +
    hnxScore * 0.25
  )

  const clampedScore = Math.min(100, Math.max(0, score))

  let label: string
  let color: string
  let textColor: string

  if (clampedScore >= 75) {
    label = 'Tham lam cực độ'
    color = '#10b981'
    textColor = 'text-emerald-400'
  } else if (clampedScore >= 60) {
    label = 'Tham lam'
    color = '#84cc16'
    textColor = 'text-lime-400'
  } else if (clampedScore >= 45) {
    label = 'Trung lập'
    color = '#f5a623'
    textColor = 'text-gold'
  } else if (clampedScore >= 30) {
    label = 'Sợ hãi'
    color = '#f97316'
    textColor = 'text-orange-400'
  } else {
    label = 'Sợ hãi cực độ'
    color = '#f43f5e'
    textColor = 'text-danger'
  }

  return {
    score: clampedScore,
    label,
    color,
    textColor,
    factors: [
      { name: 'Độ rộng thị trường', score: breadthScore, weight: 30 },
      { name: 'Đà VN-Index', score: momentumScore, weight: 25 },
      { name: 'Khối lượng giao dịch', score: volScore, weight: 20 },
      { name: 'Đà HNX-Index', score: hnxScore, weight: 25 },
    ],
  }
}

export default function FearGreedGauge() {
  const [data, setData] = useState<FearGreedData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/market-index')
        if (!res.ok) return
        const market: MarketIndexData = await res.json()
        setData(computeFearGreed(market))
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="card-glass p-5 flex flex-col items-center justify-center min-h-[200px] animate-pulse">
        <div className="w-32 h-16 bg-surface2 rounded-full mb-4" />
        <div className="h-4 w-24 bg-surface2 rounded" />
      </div>
    )
  }

  if (!data) return null

  // SVG half-circle gauge
  const radius = 70
  const cx = 100
  const cy = 100
  const strokeWidth = 16
  // Full half-circle arc length
  const circumference = Math.PI * radius  // ~220
  // Score 0→leftmost (180°), Score 100→rightmost (0°)
  const dashOffset = circumference * (1 - data.score / 100)

  // Needle: score 0 = left (π), score 100 = right (0), score 50 = up (π/2)
  const needleAngleRad = Math.PI * (1 - data.score / 100)
  const needleLen = radius - 8
  const nx = cx + needleLen * Math.cos(needleAngleRad)
  const ny = cy - needleLen * Math.sin(needleAngleRad)

  return (
    <div className="card-glass p-5">
      <h3 className="text-sm font-semibold text-muted mb-3 text-center">
        Chỉ Số Sợ Hãi &amp; Tham Lam
      </h3>

      {/* SVG Gauge */}
      <div className="flex flex-col items-center">
        <svg width="200" height="115" viewBox="0 0 200 115" className="overflow-visible">
          {/* Background arc */}
          <path
            d="M 30 100 A 70 70 0 0 1 170 100"
            fill="none"
            stroke="#1e2d45"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Gradient arc — colored portion */}
          <defs>
            <linearGradient id="fearGreedGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="40%" stopColor="#f97316" />
              <stop offset="60%" stopColor="#f5a623" />
              <stop offset="80%" stopColor="#84cc16" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>
          <path
            d="M 30 100 A 70 70 0 0 1 170 100"
            fill="none"
            stroke="url(#fearGreedGrad)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={`${dashOffset}`}
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
          {/* Needle */}
          <line
            x1={cx}
            y1={cy}
            x2={nx}
            y2={ny}
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ transition: 'all 0.8s ease' }}
          />
          <circle cx={cx} cy={cy} r="5" fill="white" />
          {/* Labels */}
          <text x="26" y="116" fill="#f43f5e" fontSize="9" textAnchor="middle">Sợ</text>
          <text x="174" y="116" fill="#10b981" fontSize="9" textAnchor="middle">Tham</text>
        </svg>

        {/* Score + Label */}
        <div className="text-center -mt-2">
          <div className={`text-4xl font-black ${data.textColor}`}>{data.score}</div>
          <div className={`text-sm font-semibold mt-0.5 ${data.textColor}`}>{data.label}</div>
        </div>
      </div>

      {/* Factor breakdown */}
      <div className="mt-4 space-y-1.5">
        {data.factors.map((f) => (
          <div key={f.name} className="flex items-center gap-2 text-xs">
            <span className="text-muted w-36 shrink-0 truncate">{f.name}</span>
            <div className="flex-1 h-1.5 bg-surface2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${f.score}%`,
                  backgroundColor: f.score >= 60 ? '#10b981' : f.score >= 40 ? '#f5a623' : '#f43f5e',
                }}
              />
            </div>
            <span className="text-muted w-6 text-right">{f.score}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
