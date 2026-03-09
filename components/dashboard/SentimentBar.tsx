'use client'

interface SentimentBarProps {
  score: number // 0-100
}

export default function SentimentBar({ score }: SentimentBarProps) {
  const label =
    score >= 70 ? 'Lạc quan' : score >= 40 ? 'Trung lập' : 'Bi quan'
  const emoji = score >= 70 ? '😊' : score >= 40 ? '😐' : '😟'

  return (
    <div className="card-glass p-4">
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="text-muted">Bi quan</span>
        <span className="font-medium">
          {emoji} {label} ({score}/100)
        </span>
        <span className="text-muted">Lạc quan</span>
      </div>
      <div className="relative h-3 bg-surface2 rounded-full overflow-hidden">
        <div
          className="absolute inset-0 bg-gradient-to-r from-danger via-gold to-accent rounded-full opacity-30"
        />
        <div
          className="absolute top-0 bottom-0 w-3 h-3 bg-white rounded-full shadow-lg transition-all duration-500"
          style={{ left: `calc(${score}% - 6px)` }}
        />
      </div>
    </div>
  )
}
