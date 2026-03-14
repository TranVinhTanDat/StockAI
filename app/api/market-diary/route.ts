import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

export async function GET() {
  try {
    // Fetch market data in parallel
    const [marketRes, newsRes] = await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/market-index`, {
        next: { revalidate: 300 },
      }).catch(() => null),
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/news`, {
        next: { revalidate: 300 },
      }).catch(() => null),
    ])

    const market = marketRes?.ok ? await marketRes.json() : null
    const newsItems: Array<{ title: string; sentiment: number }> = newsRes?.ok
      ? (await newsRes.json()).slice(0, 8)
      : []

    const today = new Date().toLocaleDateString('vi-VN', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    })

    const marketContext = market
      ? `VN-Index: ${market.vnindex.value.toFixed(2)} (${market.vnindex.changePct >= 0 ? '+' : ''}${market.vnindex.changePct.toFixed(2)}%)
HNX-Index: ${market.hnxindex.value.toFixed(2)} (${market.hnxindex.changePct >= 0 ? '+' : ''}${market.hnxindex.changePct.toFixed(2)}%)
Tăng: ${market.breadth.advancing} | Không đổi: ${market.breadth.unchanged} | Giảm: ${market.breadth.declining}
Tổng khối lượng VN-Index: ${(market.vnindex.volume / 1e9).toFixed(2)} tỷ`
      : 'Chưa có dữ liệu thị trường'

    const headlinesContext = newsItems.length > 0
      ? newsItems.map((n, i) => `${i + 1}. ${n.title}`).join('\n')
      : 'Chưa có tin tức'

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `Bạn là chuyên gia phân tích thị trường chứng khoán Việt Nam với 20 năm kinh nghiệm.
Hãy viết nhật ký thị trường ngắn gọn, súc tích bằng tiếng Việt (150-200 từ).
Phong cách: chuyên nghiệp, tự tin, dễ hiểu với nhà đầu tư cá nhân.
Format: đoạn văn liền mạch, không dùng bullet points, không tiêu đề con.`,
      messages: [
        {
          role: 'user',
          content: `Hôm nay ${today}. Hãy tóm tắt thị trường và đưa ra nhận định ngắn.

DỮ LIỆU:
${marketContext}

TIN TỨC NỔI BẬT:
${headlinesContext}

Viết nhật ký thị trường phân tích diễn biến hôm nay, tâm lý nhà đầu tư và gợi ý chiến lược ngắn hạn.`,
        },
      ],
    })

    const content = message.content[0]
    const diary = content.type === 'text' ? content.text : 'Không thể tạo nhật ký thị trường.'

    return NextResponse.json({
      diary,
      generatedAt: new Date().toISOString(),
      marketSnapshot: market
        ? {
            vnindex: market.vnindex.value,
            vnindexChangePct: market.vnindex.changePct,
            advancing: market.breadth.advancing,
            declining: market.breadth.declining,
          }
        : null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate diary'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
