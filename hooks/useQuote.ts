'use client'

import useSWR from 'swr'
import type { QuoteData } from '@/types'

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

export function useQuote(symbol: string | null) {
  const { data, error, isLoading, mutate } = useSWR<QuoteData>(
    symbol ? `/api/quote?symbol=${symbol}` : null,
    fetcher,
    {
      refreshInterval: 60000,
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  )

  return {
    quote: data,
    isLoading,
    isError: !!error,
    error,
    refresh: mutate,
  }
}

export function useMultiQuote(symbols: string[]) {
  const { data, error, isLoading, mutate } = useSWR<Record<string, QuoteData>>(
    symbols.length > 0 ? `/api/quotes?symbols=${symbols.join(',')}` : null,
    async (url: string) => {
      const symbolList = new URL(url, window.location.origin).searchParams
        .get('symbols')
        ?.split(',') || []

      const results: Record<string, QuoteData> = {}
      const responses = await Promise.allSettled(
        symbolList.map((s) =>
          fetch(`/api/quote?symbol=${s}`).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            return r.json()
          })
        )
      )

      responses.forEach((res, i) => {
        if (res.status === 'fulfilled' && !res.value.error) {
          results[symbolList[i]] = res.value
        }
      })

      return results
    },
    {
      refreshInterval: 60000,
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  )

  return {
    quotes: data || {},
    isLoading,
    isError: !!error,
    refresh: mutate,
  }
}
