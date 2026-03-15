import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Bảng Giá Realtime | StockAI VN',
  description: 'Bảng giá chứng khoán realtime VN30, HNX30, UPCOM',
}

export default function PriceboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg text-gray-100 overflow-hidden">
      {children}
    </div>
  )
}
