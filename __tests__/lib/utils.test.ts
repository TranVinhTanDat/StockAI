import { describe, it, expect } from 'vitest'
import {
  formatVND,
  formatNumber,
  formatPct,
  formatVolume,
  getChangeColor,
  getChangeBg,
  calcDaysBetween,
  timeAgo,
  getRecommendationColor,
  getRecommendationBg,
} from '@/lib/utils'

// ── formatVND ─────────────────────────────────────────────────
describe('formatVND', () => {
  it('formats positive integer', () => {
    expect(formatVND(100000)).toBe('100.000 ₫')
  })
  it('formats large number with dots', () => {
    expect(formatVND(1000000000)).toBe('1.000.000.000 ₫')
  })
  it('handles negative value', () => {
    expect(formatVND(-50000)).toBe('-50.000 ₫')
  })
  it('handles NaN/Infinity', () => {
    expect(formatVND(NaN)).toBe('0 ₫')
    expect(formatVND(Infinity)).toBe('0 ₫')
  })
  it('rounds decimals', () => {
    expect(formatVND(1234.6)).toBe('1.235 ₫')
  })
})

// ── formatNumber ──────────────────────────────────────────────
describe('formatNumber', () => {
  it('formats with dot separators', () => {
    expect(formatNumber(1234567)).toBe('1.234.567')
  })
  it('handles NaN', () => {
    expect(formatNumber(NaN)).toBe('0')
  })
})

// ── formatPct ─────────────────────────────────────────────────
describe('formatPct', () => {
  it('adds + for positive', () => {
    expect(formatPct(3.5)).toBe('+3.50%')
  })
  it('no + for negative', () => {
    expect(formatPct(-2.1)).toBe('-2.10%')
  })
  it('zero shows +', () => {
    expect(formatPct(0)).toBe('+0.00%')
  })
})

// ── formatVolume ──────────────────────────────────────────────
describe('formatVolume', () => {
  it('formats billions', () => {
    expect(formatVolume(2_500_000_000)).toBe('2.50B')
  })
  it('formats millions', () => {
    expect(formatVolume(3_200_000)).toBe('3.20M')
  })
  it('formats thousands', () => {
    expect(formatVolume(5_400)).toBe('5.4K')
  })
  it('returns raw for small number', () => {
    expect(formatVolume(500)).toBe('500')
  })
})

// ── getChangeColor ────────────────────────────────────────────
describe('getChangeColor', () => {
  it('returns accent for positive', () => {
    expect(getChangeColor(1)).toBe('text-accent')
  })
  it('returns danger for negative', () => {
    expect(getChangeColor(-1)).toBe('text-danger')
  })
  it('returns gold for zero', () => {
    expect(getChangeColor(0)).toBe('text-gold')
  })
})

// ── getChangeBg ───────────────────────────────────────────────
describe('getChangeBg', () => {
  it('positive returns green bg', () => {
    expect(getChangeBg(5)).toContain('accent')
  })
  it('negative returns red bg', () => {
    expect(getChangeBg(-5)).toContain('danger')
  })
})

// ── calcDaysBetween ───────────────────────────────────────────
describe('calcDaysBetween', () => {
  it('returns 1 for 1-day apart', () => {
    const d1 = new Date('2024-01-01')
    const d2 = new Date('2024-01-02')
    expect(calcDaysBetween(d1, d2)).toBe(1)
  })
  it('is symmetric', () => {
    const d1 = new Date('2024-01-01')
    const d2 = new Date('2024-01-10')
    expect(calcDaysBetween(d1, d2)).toBe(calcDaysBetween(d2, d1))
  })
  it('returns 0 for same day (rounds up)', () => {
    const d = new Date('2024-01-01')
    expect(calcDaysBetween(d, d)).toBe(0)
  })
})

// ── timeAgo ───────────────────────────────────────────────────
describe('timeAgo', () => {
  it('returns "vừa xong" for recent seconds', () => {
    const now = new Date().toISOString()
    expect(timeAgo(now)).toBe('vừa xong')
  })
  it('returns minutes for 5 min ago', () => {
    const d = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(timeAgo(d)).toBe('5 phút trước')
  })
  it('returns hours for 3 hours ago', () => {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    expect(timeAgo(d)).toBe('3 giờ trước')
  })
  it('returns days for 2 days ago', () => {
    const d = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    expect(timeAgo(d)).toBe('2 ngày trước')
  })
})

// ── getRecommendationColor ────────────────────────────────────
describe('getRecommendationColor', () => {
  it('MUA returns accent', () => {
    expect(getRecommendationColor('MUA')).toBe('text-accent')
    expect(getRecommendationColor('MUA MẠNH')).toBe('text-accent')
  })
  it('BÁN returns danger', () => {
    expect(getRecommendationColor('BÁN')).toBe('text-danger')
    expect(getRecommendationColor('BÁN MẠNH')).toBe('text-danger')
  })
  it('GIỮ returns gold', () => {
    expect(getRecommendationColor('GIỮ')).toBe('text-gold')
  })
})

// ── getRecommendationBg ───────────────────────────────────────
describe('getRecommendationBg', () => {
  it('MUA includes accent', () => {
    expect(getRecommendationBg('MUA')).toContain('accent')
  })
  it('BÁN includes danger', () => {
    expect(getRecommendationBg('BÁN')).toContain('danger')
  })
  it('GIỮ includes gold', () => {
    expect(getRecommendationBg('GIỮ')).toContain('gold')
  })
})
