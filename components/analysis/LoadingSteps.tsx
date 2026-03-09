'use client'

import { useEffect, useState } from 'react'

const STEPS = [
  { label: 'Lấy giá realtime...', icon: '⏳', pct: 20 },
  { label: 'Tải lịch sử & kỹ thuật...', icon: '📊', pct: 40 },
  { label: 'Phân tích tài chính...', icon: '💰', pct: 60 },
  { label: 'Đọc tin tức mới nhất...', icon: '📰', pct: 80 },
  { label: 'AI đang phân tích...', icon: '🤖', pct: 100 },
]

interface LoadingStepsProps {
  currentStep: number
}

export default function LoadingSteps({ currentStep }: LoadingStepsProps) {
  return (
    <div className="card-glass p-6 space-y-3">
      {STEPS.map((step, i) => {
        const active = i === currentStep
        const done = i < currentStep
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-lg w-8 text-center">
              {done ? '✅' : step.icon}
            </span>
            <span
              className={`text-sm flex-1 ${
                done
                  ? 'text-accent'
                  : active
                    ? 'text-gray-100 font-medium'
                    : 'text-muted'
              }`}
            >
              {step.label}
            </span>
            {active && (
              <div className="w-20 h-1.5 bg-surface2 rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            )}
            {done && <span className="text-accent text-xs">OK</span>}
          </div>
        )
      })}
      <div className="mt-4">
        <div className="h-2 bg-surface2 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent to-blue-400 rounded-full transition-all duration-500"
            style={{ width: `${STEPS[Math.min(currentStep, STEPS.length - 1)]?.pct || 0}%` }}
          />
        </div>
      </div>
    </div>
  )
}
