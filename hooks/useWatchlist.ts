'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
} from '@/lib/storage'

export function useWatchlist(userId?: string) {
  const [symbols, setSymbols] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    getWatchlist().then((list) => {
      setSymbols(list)
      setIsLoading(false)
    })
  }, [userId])

  const add = useCallback(async (symbol: string) => {
    const upper = symbol.toUpperCase()
    await addToWatchlist(upper)
    setSymbols((prev) =>
      prev.includes(upper) ? prev : [...prev, upper]
    )
  }, [])

  const remove = useCallback(async (symbol: string) => {
    await removeFromWatchlist(symbol)
    setSymbols((prev) => prev.filter((s) => s !== symbol))
  }, [])

  const has = useCallback(
    (symbol: string) => symbols.includes(symbol.toUpperCase()),
    [symbols]
  )

  return { symbols, isLoading, add, remove, has }
}
