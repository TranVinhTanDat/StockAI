'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  getPortfolio,
  upsertHolding,
  removeHolding,
  getTrades,
  addTrade,
  getBalance,
  updateBalance,
} from '@/lib/storage'
import { getUserId } from '@/lib/utils'
import type { PortfolioHolding, Trade, Balance } from '@/types'

export function usePortfolio() {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [balance, setBalance] = useState<Balance>({
    user_id: '',
    cash: 500_000_000,
    updated_at: new Date().toISOString(),
  })
  const [isLoading, setIsLoading] = useState(true)

  const reload = useCallback(async () => {
    const [h, t, b] = await Promise.all([
      getPortfolio(),
      getTrades(),
      getBalance(),
    ])
    setHoldings(h)
    setTrades(t)
    setBalance(b)
  }, [])

  useEffect(() => {
    reload().then(() => setIsLoading(false))
  }, [reload])

  const buy = useCallback(
    async (symbol: string, qty: number, price: number) => {
      const fee = price * qty * 0.0015 // 0.15% phí mua
      const total = price * qty + fee

      if (total > balance.cash) {
        throw new Error('Không đủ tiền mặt')
      }

      const existing = holdings.find((h) => h.symbol === symbol)
      const newQty = (existing?.qty || 0) + qty
      const newTotalCost = (existing?.total_cost || 0) + price * qty
      const newAvgCost = newTotalCost / newQty

      await upsertHolding({
        symbol,
        qty: newQty,
        avg_cost: newAvgCost,
        total_cost: newTotalCost,
      })

      await updateBalance(balance.cash - total)

      await addTrade({
        user_id: getUserId(),
        symbol,
        type: 'BUY',
        qty,
        price,
        fee,
        tax: 0,
        total,
        traded_at: new Date().toISOString(),
      })

      await reload()
    },
    [balance.cash, holdings, reload]
  )

  const sell = useCallback(
    async (symbol: string, qty: number, price: number) => {
      const existing = holdings.find((h) => h.symbol === symbol)
      if (!existing || existing.qty < qty) {
        throw new Error('Không đủ cổ phiếu')
      }

      const fee = price * qty * 0.0025 // 0.25% phí bán
      const tax = price * qty * 0.001 // 0.1% thuế bán
      const total = price * qty - fee - tax

      const newQty = existing.qty - qty
      if (newQty <= 0) {
        await removeHolding(symbol)
      } else {
        await upsertHolding({
          symbol,
          qty: newQty,
          avg_cost: existing.avg_cost,
          total_cost: existing.avg_cost * newQty,
        })
      }

      await updateBalance(balance.cash + total)

      await addTrade({
        user_id: getUserId(),
        symbol,
        type: 'SELL',
        qty,
        price,
        fee,
        tax,
        total,
        traded_at: new Date().toISOString(),
      })

      await reload()
    },
    [balance.cash, holdings, reload]
  )

  const editHolding = useCallback(
    async (symbol: string, qty: number, avgCost: number) => {
      await upsertHolding({
        symbol,
        qty,
        avg_cost: avgCost,
        total_cost: avgCost * qty,
      })
      await reload()
    },
    [reload]
  )

  const deleteHolding = useCallback(
    async (symbol: string) => {
      await removeHolding(symbol)
      await reload()
    },
    [reload]
  )

  return { holdings, trades, balance, isLoading, buy, sell, editHolding, deleteHolding, reload }
}
