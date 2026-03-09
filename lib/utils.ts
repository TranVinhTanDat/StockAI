import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatVND(n: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n)
}

export function formatPct(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

export function formatVolume(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function getChangeColor(n: number): string {
  if (n > 0) return 'text-accent'
  if (n < 0) return 'text-danger'
  return 'text-gold'
}

export function getChangeBg(n: number): string {
  if (n > 0) return 'bg-accent/10 text-accent'
  if (n < 0) return 'bg-danger/10 text-danger'
  return 'bg-gold/10 text-gold'
}

export function calcDaysBetween(d1: Date, d2: Date): number {
  const diff = Math.abs(d2.getTime() - d1.getTime())
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'vừa xong'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} phút trước`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} ngày trước`
  const months = Math.floor(days / 30)
  return `${months} tháng trước`
}

export function generateId(): string {
  return crypto.randomUUID()
}

export function getUserId(): string {
  if (typeof window === 'undefined') return ''
  let userId = localStorage.getItem('stockai_user_id')
  if (!userId) {
    userId = generateId()
    localStorage.setItem('stockai_user_id', userId)
  }
  return userId
}

export const INDUSTRY_MAP: Record<string, string> = {
  FPT: 'Công nghệ',
  CMG: 'Công nghệ',
  VNM: 'Tiêu dùng',
  MSN: 'Tiêu dùng',
  SAB: 'Tiêu dùng',
  MWG: 'Bán lẻ',
  VIC: 'Bất động sản',
  VHM: 'Bất động sản',
  NLG: 'Bất động sản',
  DXG: 'Bất động sản',
  KDH: 'Bất động sản',
  HPG: 'Thép',
  HSG: 'Thép',
  NKG: 'Thép',
  VCB: 'Ngân hàng',
  TCB: 'Ngân hàng',
  BID: 'Ngân hàng',
  CTG: 'Ngân hàng',
  MBB: 'Ngân hàng',
  ACB: 'Ngân hàng',
  VPB: 'Ngân hàng',
  STB: 'Ngân hàng',
  GAS: 'Năng lượng',
  PLX: 'Năng lượng',
  POW: 'Năng lượng',
  PVD: 'Dầu khí',
  PVS: 'Dầu khí',
  VNR: 'Bảo hiểm',
  BVH: 'Bảo hiểm',
  SSI: 'Chứng khoán',
  VCI: 'Chứng khoán',
  HCM: 'Chứng khoán',
  REE: 'Điện',
  PPC: 'Điện',
}

export const POPULAR_SYMBOLS = [
  'FPT', 'VNM', 'VIC', 'HPG', 'MWG', 'VHM', 'TCB', 'BID', 'VCB', 'GAS',
  'MBB', 'ACB', 'STB', 'SSI', 'MSN', 'SAB', 'PLX', 'CTG', 'VPB', 'NLG',
]

export function getRecommendationColor(rec: string): string {
  if (rec.includes('MUA')) return 'text-accent'
  if (rec.includes('BÁN')) return 'text-danger'
  return 'text-gold'
}

export function getRecommendationBg(rec: string): string {
  if (rec.includes('MUA')) return 'bg-accent/20 text-accent border-accent/30'
  if (rec.includes('BÁN')) return 'bg-danger/20 text-danger border-danger/30'
  return 'bg-gold/20 text-gold border-gold/30'
}
