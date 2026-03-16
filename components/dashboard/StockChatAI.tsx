'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircle, Send, RotateCcw, User, Bot, Sparkles, ChevronDown } from 'lucide-react'
import type { InvestmentStyle } from '@/lib/claude'
import { getClientToken } from '@/lib/requireAuth'
import { POPULAR_SYMBOLS } from '@/lib/utils'
import { getChatHistory, saveChatHistory, clearChatHistory, getAllChatSessions } from '@/lib/storage'

// ── Markdown renderer ────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <strong key={i} className="font-semibold text-gray-100">{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
      return <em key={i} className="italic text-gray-200">{part.slice(1, -1)}</em>
    return <span key={i}>{part}</span>
  })
}

function MarkdownText({ content }: { content: string }) {
  const lines = content.split('\n')
  const result: React.ReactNode[] = []
  let bulletItems: string[] = []
  let bulletKey = 0

  const flushBullets = (key: number) => {
    if (bulletItems.length === 0) return
    result.push(
      <ul key={`ul-${key}`} className="my-1.5 space-y-1">
        {bulletItems.map((b, i) => (
          <li key={i} className="flex gap-2 leading-relaxed">
            <span className="text-accent/70 mt-0.5 flex-shrink-0 text-xs select-none">▸</span>
            <span className="text-gray-300">{renderInline(b)}</span>
          </li>
        ))}
      </ul>
    )
    bulletItems = []
  }

  lines.forEach((line, idx) => {
    const t = line.trim()
    if (t.startsWith('## ')) {
      flushBullets(bulletKey++); result.push(
        <div key={`h2-${idx}`} className="font-bold text-gray-100 text-sm mt-3 mb-1 pt-2 border-t border-border/40 first:border-0 first:pt-0 first:mt-0">{t.slice(3)}</div>
      )
    } else if (t.startsWith('### ')) {
      flushBullets(bulletKey++); result.push(
        <div key={`h3-${idx}`} className="font-semibold text-accent/90 text-xs mt-2 mb-0.5 uppercase tracking-wide">{t.slice(4)}</div>
      )
    } else if (t.startsWith('- ') || t.startsWith('• ')) {
      bulletItems.push(t.slice(2))
    } else if (/^\d+\.\s/.test(t)) {
      flushBullets(bulletKey++)
      const m = t.match(/^(\d+)\.\s(.*)$/)
      if (m) result.push(
        <div key={`ol-${idx}`} className="flex gap-2 my-0.5 leading-relaxed">
          <span className="text-accent font-bold text-xs mt-0.5 flex-shrink-0 w-4">{m[1]}.</span>
          <span className="text-gray-300">{renderInline(m[2])}</span>
        </div>
      )
    } else if (t === '') {
      flushBullets(bulletKey++)
      if (result.length > 0) result.push(<div key={`sp-${idx}`} className="h-1.5" />)
    } else {
      flushBullets(bulletKey++)
      result.push(
        <p key={`p-${idx}`} className="text-gray-300 leading-relaxed">{renderInline(t)}</p>
      )
    }
  })
  flushBullets(bulletKey++)
  return <div className="space-y-0.5">{result}</div>
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const STYLE_OPTIONS: { key: InvestmentStyle | ''; label: string }[] = [
  { key: '', label: 'Tất cả phong cách' },
  { key: 'longterm', label: 'Dài Hạn (3-5 năm)' },
  { key: 'dca', label: 'DCA (định kỳ)' },
  { key: 'swing', label: 'Lướt Sóng (1-4 tuần)' },
  { key: 'dividend', label: 'Cổ Tức (thu nhập thụ động)' },
  { key: 'etf', label: 'VN30 Style (blue-chip)' },
]

const QUICK_QUESTIONS = [
  'Có nên đầu tư dài hạn không?',
  'Phân tích kỹ thuật chi tiết',
  'Đánh giá cơ bản tổng thể',
  'Nên mua ở giá bao nhiêu?',
  'Cổ tức có đáng đầu tư không?',
  'Rủi ro chính cần lưu ý?',
  'Dòng tiền ngoại đang thế nào?',
  'Lướt sóng khả năng ra sao?',
  'Cắt lỗ hay giữ tiếp?',
  'So với trung bình ngành thế nào?',
]

export default function StockChatAI() {
  const [symbol, setSymbol] = useState('')
  const [style, setStyle] = useState<InvestmentStyle | ''>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [recentSymbols, setRecentSymbols] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  const filteredSymbols = POPULAR_SYMBOLS.filter(s =>
    symbol.length > 0 && s.startsWith(symbol.toUpperCase())
  ).slice(0, 8)

  // Load recent sessions on mount
  useEffect(() => {
    const sessions = getAllChatSessions()
    setRecentSymbols(sessions.map(s => s.symbol).slice(0, 6))
  }, [])

  // Load history when symbol changes
  useEffect(() => {
    const sym = symbol.trim().toUpperCase()
    if (!sym) { setMessages([]); return }
    const history = getChatHistory(sym)
    setMessages(history)
  }, [symbol])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const sendMessage = useCallback(async (userMessage: string) => {
    const sym = symbol.trim().toUpperCase()
    if (!userMessage.trim() || isLoading || !sym) return

    const prevMessages = messages
    const newMessages: Message[] = [...prevMessages, { role: 'user', content: userMessage }]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)

    try {
      const token = getClientToken()
      const res = await fetch('/api/chat-stock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          symbol: sym,
          style: style || null,
          question: userMessage,
          history: prevMessages,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      const finalMessages: Message[] = [...newMessages, { role: 'assistant', content: data.response }]
      setMessages(finalMessages)
      // Persist to localStorage
      saveChatHistory(sym, finalMessages)
      // Refresh recent symbols
      const sessions = getAllChatSessions()
      setRecentSymbols(sessions.map(s => s.symbol).slice(0, 6))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Xin lỗi, có lỗi xảy ra.'
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${msg}` }])
    } finally {
      setIsLoading(false)
      setTimeout(() => chatInputRef.current?.focus(), 100)
    }
  }, [messages, symbol, style, isLoading])

  const clearChat = () => {
    const sym = symbol.trim().toUpperCase()
    if (sym) clearChatHistory(sym)
    setMessages([])
    const sessions = getAllChatSessions()
    setRecentSymbols(sessions.map(s => s.symbol).slice(0, 6))
  }

  return (
    <div className="flex flex-col gap-3" style={{ height: '620px' }}>
      {/* Symbol + Style + Clear */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={symbol}
            onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setShowSuggestions(true) }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Nhập mã: FPT, VNM, HPG..."
            className="w-full input-dark py-2.5 text-sm"
            maxLength={10}
          />
          {showSuggestions && filteredSymbols.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-xl z-20 overflow-hidden">
              {filteredSymbols.map(s => (
                <button
                  key={s}
                  onMouseDown={() => { setSymbol(s); setShowSuggestions(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface2 text-gray-200 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as InvestmentStyle | '')}
            className="appearance-none bg-surface border border-border rounded-lg pl-3 pr-8 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-accent/50 transition-colors"
          >
            {STYLE_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
        </div>

        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 px-3 py-2.5 text-xs text-muted hover:text-danger border border-border hover:border-danger/30 rounded-lg transition-colors whitespace-nowrap"
            title="Xóa lịch sử chat"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{messages.length} tin</span>
          </button>
        )}
      </div>

      {/* Chat window */}
      <div className="flex-1 flex flex-col rounded-xl border border-border bg-surface/40 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            /* Empty state */
            <div className="h-full flex flex-col items-center justify-center gap-5 py-4 min-h-[300px]">
              <div className="text-center">
                <div className="w-14 h-14 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-accent/20">
                  <MessageCircle className="w-7 h-7 text-accent" />
                </div>
                <p className="text-gray-200 font-semibold mb-1.5">Chat AI Chứng Khoán</p>
                <p className="text-xs text-muted max-w-xs leading-relaxed">
                  {symbol
                    ? `Hỏi AI về mã ${symbol} — phân tích kỹ thuật, cơ bản, dòng tiền NN, tin tức...`
                    : 'Nhập mã cổ phiếu ở trên, rồi đặt câu hỏi để nhận phân tích chuyên sâu từ AI.'}
                </p>
              </div>
              {symbol ? (
                <div className="flex flex-wrap gap-2 justify-center max-w-md">
                  {QUICK_QUESTIONS.map(q => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      disabled={isLoading}
                      className="text-xs px-3 py-1.5 bg-surface2 hover:bg-accent/10 hover:text-accent border border-border hover:border-accent/30 rounded-full transition-all text-muted disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ) : recentSymbols.length > 0 ? (
                <div className="text-center">
                  <p className="text-xs text-muted mb-2">Tiếp tục cuộc trò chuyện:</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {recentSymbols.map(s => (
                      <button
                        key={s}
                        onClick={() => setSymbol(s)}
                        className="text-xs px-3 py-1.5 bg-surface2 hover:bg-accent/10 hover:text-accent border border-border hover:border-accent/30 rounded-lg transition-all text-gray-300 font-medium"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 justify-center max-w-xs opacity-50 pointer-events-none">
                  {QUICK_QUESTIONS.slice(0, 4).map(q => (
                    <span key={q} className="text-xs px-3 py-1.5 bg-surface2 border border-border rounded-full text-muted">{q}</span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                    msg.role === 'user' ? 'bg-accent/20 border border-accent/30' : 'bg-surface2 border border-border'
                  }`}>
                    {msg.role === 'user'
                      ? <User className="w-3.5 h-3.5 text-accent" />
                      : <Bot className="w-3.5 h-3.5 text-muted" />}
                  </div>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-accent/12 text-gray-100 border border-accent/20 rounded-tr-sm'
                      : 'bg-surface2 text-gray-200 border border-border/60 rounded-tl-sm'
                  }`}>
                    {msg.role === 'user'
                      ? <div className="whitespace-pre-wrap">{msg.content}</div>
                      : <MarkdownText content={msg.content} />
                    }
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isLoading && (
                <div className="flex gap-2.5">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-surface2 border border-border flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-accent animate-pulse" />
                  </div>
                  <div className="bg-surface2 border border-border/60 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1 items-center">
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 bg-accent/60 rounded-full animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Quick follow-up chips */}
              {!isLoading && messages.length > 0 && messages.length < 14 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {QUICK_QUESTIONS.slice(0, 5).map(q => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-xs px-2.5 py-1 bg-surface2/80 hover:bg-accent/10 hover:text-accent border border-border/50 hover:border-accent/30 rounded-full transition-all text-muted"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Input */}
      <div>
        {!symbol && (
          <p className="text-xs text-center text-amber-400/70 mb-2">
            ⚠ Nhập mã cổ phiếu ở trên để Chat AI có thể phân tích
          </p>
        )}
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input) }}
          className="flex gap-2"
        >
          <input
            ref={chatInputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={symbol ? `Hỏi AI về ${symbol}... (Enter để gửi)` : 'Nhập mã cổ phiếu ở trên trước...'}
            disabled={!symbol || isLoading}
            className="flex-1 input-dark py-2.5 text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!symbol || !input.trim() || isLoading}
            className="p-2.5 bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 rounded-lg transition-colors disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <p className="text-[11px] text-muted/50 text-center mt-1.5">
          Phân tích dựa trên: kỹ thuật 90 ngày · cơ bản (Simplize) · dòng tiền NN · tin tức · VN-Index
        </p>
      </div>
    </div>
  )
}
