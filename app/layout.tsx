import type { Metadata } from 'next'
import { Be_Vietnam_Pro, Playfair_Display } from 'next/font/google'
import './globals.css'

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-vietnam',
  display: 'swap',
})

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'StockAI VN — Phân Tích Chứng Khoán Việt Nam',
  description:
    'Ứng dụng phân tích chứng khoán Việt Nam với AI. Khuyến nghị MUA/BÁN cụ thể, dữ liệu thật từ TCBS.',
  keywords: 'chứng khoán, phân tích kỹ thuật, AI, VN-Index, cổ phiếu',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} ${playfairDisplay.variable} dark`}
    >
      <body className="font-sans antialiased min-h-screen bg-bg text-gray-100">
        {children}
      </body>
    </html>
  )
}
