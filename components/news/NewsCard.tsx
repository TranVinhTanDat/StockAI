'use client'

import type { NewsItem } from '@/types'
import { timeAgo } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'

interface NewsCardProps {
  news: NewsItem
  compact?: boolean
}

export default function NewsCard({ news, compact }: NewsCardProps) {
  const sentimentColor =
    news.sentiment >= 65 ? 'text-accent' : news.sentiment >= 40 ? 'text-gold' : 'text-danger'
  const sentimentDot =
    news.sentiment >= 65 ? 'bg-accent' : news.sentiment >= 40 ? 'bg-gold' : 'bg-danger'

  if (compact) {
    return (
      <div className="flex items-start gap-3 py-2.5 px-1 border-b border-border/40 last:border-0 hover:bg-surface2/30 transition-colors rounded-sm">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${sentimentDot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] text-muted whitespace-nowrap">{news.source}</span>
            <span className="text-[10px] text-muted/50">·</span>
            <span className="text-[10px] text-muted/60 whitespace-nowrap">{timeAgo(news.publishedAt)}</span>
          </div>
          <p className="text-xs text-gray-200 leading-snug line-clamp-2">{news.title}</p>
        </div>
        {news.url && (
          <a
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex-shrink-0 mt-1 ${sentimentColor} hover:opacity-70 transition-opacity`}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="card-glass p-4 hover:bg-surface2/30 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded font-medium">
          {news.source}
        </span>
        <span className="text-xs text-muted">{timeAgo(news.publishedAt)}</span>
        {news.relatedSymbol && (
          <span className="text-xs bg-surface2 text-gray-300 px-2 py-0.5 rounded">
            {news.relatedSymbol}
          </span>
        )}
      </div>

      <h4 className="text-sm font-medium text-gray-100 line-clamp-2 mb-1.5">
        {news.title}
      </h4>

      {news.summary && (
        <p className="text-xs text-muted line-clamp-2 mb-2">{news.summary}</p>
      )}

      <div className="flex items-center justify-between">
        <span className={`text-xs ${sentimentColor} font-medium flex items-center gap-1`}>
          <span className={`w-1.5 h-1.5 rounded-full ${sentimentDot}`} />
          {news.sentiment}/100
        </span>
        {news.url && (
          <a
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:text-accent/80 flex items-center gap-1 transition-colors"
          >
            Đọc thêm <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  )
}
