import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  if (!process.env.CLAUDE_API_KEY) {
    return NextResponse.json(
      { error: 'Claude API key not configured' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()
    const { news } = body as {
      news: Array<{ title: string; summary: string; source: string; sentiment: number }>
    }

    if (!news || news.length === 0) {
      return NextResponse.json({ error: 'No news provided' }, { status: 400 })
    }

    const newsText = news
      .slice(0, 5)
      .map(
        (n, i) =>
          `${i + 1}. [${n.source}] ${n.title}\n   Tóm tắt: ${n.summary || 'N/A'}\n   Sentiment: ${n.sentiment > 60 ? 'Tích cực' : n.sentiment < 40 ? 'Tiêu cực' : 'Trung lập'}`
      )
      .join('\n\n')

    const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 600,
      system:
        'Bạn là chuyên gia phân tích thị trường chứng khoán Việt Nam. Tóm tắt tin tức và đánh giá tác động đến thị trường một cách ngắn gọn, chuyên nghiệp.',
      messages: [
        {
          role: 'user',
          content: `Phân tích ${news.length} tin tức thị trường chứng khoán VN hôm nay:

${newsText}

Trả về JSON:
{
  "headline": "1 câu tóm tắt tâm lý thị trường hôm nay (20-30 từ)",
  "summary": "Phân tích tổng hợp 80-100 từ về xu hướng và tác động",
  "impact": "TÍCH CỰC|TRUNG LẬP|TIÊU CỰC",
  "keyPoints": ["điểm quan trọng 1", "điểm quan trọng 2", "điểm quan trọng 3"],
  "watchSymbols": ["mã CP được nhắc nhiều 1", "mã 2"]
}`,
        },
      ],
    })

    const firstBlock = response.content?.[0]
    const text = firstBlock && firstBlock.type === 'text' ? firstBlock.text : ''
    if (!text) throw new Error('Empty response')

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Invalid JSON')

    return NextResponse.json(JSON.parse(jsonMatch[0]))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Summary failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
