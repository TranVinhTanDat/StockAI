/**
 * Chart Pattern Detection — lib/patterns.ts
 * Detects: Double Top/Bottom, Head & Shoulders, Inv H&S,
 *           Ascending/Descending Triangle, Cup & Handle
 */

export interface PatternResult {
  nameVi: string               // Vietnamese name displayed in UI
  nameEn: string               // English name
  type: 'bullish' | 'bearish'
  strength: 'mạnh' | 'trung bình' | 'yếu'
  scoreImpact: number          // +pts (bullish) or -pts (bearish) for SmartScore
  description: string          // context with price levels
}

// ─── Local extrema detection ──────────────────────────────────────────────────
function findPeaks(data: number[], window = 5): number[] {
  const peaks: number[] = []
  for (let i = window; i < data.length - window; i++) {
    let ok = true
    for (let j = i - window; j <= i + window; j++) {
      if (j !== i && data[j] >= data[i]) { ok = false; break }
    }
    if (ok) peaks.push(i)
  }
  return peaks
}

function findTroughs(data: number[], window = 5): number[] {
  const troughs: number[] = []
  for (let i = window; i < data.length - window; i++) {
    let ok = true
    for (let j = i - window; j <= i + window; j++) {
      if (j !== i && data[j] <= data[i]) { ok = false; break }
    }
    if (ok) troughs.push(i)
  }
  return troughs
}

// ─── Linear regression slope ─────────────────────────────────────────────────
function slope(arr: number[]): number {
  const n = arr.length
  if (n < 2) return 0
  const xMean = (n - 1) / 2
  const yMean = arr.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (arr[i] - yMean)
    den += (i - xMean) ** 2
  }
  return den > 0 ? num / den : 0
}

function fmt(price: number): string {
  return (price / 1000).toFixed(1) + 'k'
}

// ─── Main detection function ──────────────────────────────────────────────────
export function detectPatterns(
  highs: number[],
  lows: number[],
  closes: number[],
  lookback = 80
): PatternResult[] {
  const n = closes.length
  if (n < 30) return []

  const start = Math.max(0, n - lookback)
  const h = highs.slice(start)
  const l = lows.slice(start)
  const c = closes.slice(start)
  const len = c.length
  const cur = c[len - 1]

  const peakIdxs  = findPeaks(h, 5)
  const troughIdxs = findTroughs(l, 5)
  const patterns: PatternResult[] = []

  // ── DOUBLE BOTTOM (W) ────────────────────────────────────────────────────
  if (troughIdxs.length >= 2) {
    const t1i = troughIdxs[troughIdxs.length - 2]
    const t2i = troughIdxs[troughIdxs.length - 1]
    if (t2i - t1i >= 8 && t2i >= len - 20) {
      const v1 = l[t1i], v2 = l[t2i]
      const sim = Math.abs(v1 - v2) / Math.max(v1, v2)
      if (sim < 0.04) {
        const neck = Math.max(...h.slice(t1i, t2i + 1))
        const depth = (neck - Math.min(v1, v2)) / neck
        if (depth > 0.05) {
          const confirmed = cur > neck * 0.97
          const strong = depth > 0.12 && sim < 0.02
          patterns.push({
            nameVi: 'Đáy Đôi (W)',
            nameEn: 'Double Bottom',
            type: 'bullish',
            strength: strong ? 'mạnh' : depth > 0.07 ? 'trung bình' : 'yếu',
            scoreImpact: strong ? 9 : depth > 0.07 ? 6 : 3,
            description: `Đáy đôi tại ~${fmt(Math.min(v1,v2))} — đảo chiều tăng${confirmed ? ' (đã xác nhận)' : ' (chờ breakout)'}. Neckline: ${fmt(neck)}`,
          })
        }
      }
    }
  }

  // ── DOUBLE TOP (M) ──────────────────────────────────────────────────────
  if (peakIdxs.length >= 2) {
    const p1i = peakIdxs[peakIdxs.length - 2]
    const p2i = peakIdxs[peakIdxs.length - 1]
    if (p2i - p1i >= 8 && p2i >= len - 20) {
      const v1 = h[p1i], v2 = h[p2i]
      const sim = Math.abs(v1 - v2) / Math.max(v1, v2)
      if (sim < 0.04) {
        const neck = Math.min(...l.slice(p1i, p2i + 1))
        const height = (Math.max(v1, v2) - neck) / Math.max(v1, v2)
        if (height > 0.05) {
          const broken = cur < neck * 1.02
          const strong = height > 0.12 && sim < 0.02
          patterns.push({
            nameVi: 'Đỉnh Đôi (M)',
            nameEn: 'Double Top',
            type: 'bearish',
            strength: strong ? 'mạnh' : height > 0.07 ? 'trung bình' : 'yếu',
            scoreImpact: strong ? -9 : height > 0.07 ? -6 : -3,
            description: `Đỉnh đôi tại ~${fmt(Math.max(v1,v2))} — rủi ro đảo chiều giảm${broken ? ' (neckline bị phá)' : ''}. Neckline: ${fmt(neck)}`,
          })
        }
      }
    }
  }

  // ── HEAD & SHOULDERS (Top — Bearish) ────────────────────────────────────
  if (peakIdxs.length >= 3) {
    const ri = peakIdxs[peakIdxs.length - 1]
    const hi = peakIdxs[peakIdxs.length - 2]
    const li = peakIdxs[peakIdxs.length - 3]
    if (ri - hi >= 7 && hi - li >= 7 && ri >= len - 25) {
      const lH = h[li], hH = h[hi], rH = h[ri]
      if (hH > lH && hH > rH) {
        const sSim = Math.abs(lH - rH) / Math.max(lH, rH)
        if (sSim < 0.07) {
          const lNeck = Math.min(...l.slice(li, hi + 1))
          const rNeck = Math.min(...l.slice(hi, ri + 1))
          const neck = (lNeck + rNeck) / 2
          const height = (hH - neck) / hH
          if (height > 0.06) {
            const broken = cur < neck * 1.02
            patterns.push({
              nameVi: 'Đầu & Vai (Giảm)',
              nameEn: 'Head & Shoulders',
              type: 'bearish',
              strength: height > 0.12 ? 'mạnh' : 'trung bình',
              scoreImpact: height > 0.12 ? -12 : -8,
              description: `H&S đỉnh: đầu tại ${fmt(hH)}, neckline ${fmt(neck)}${broken ? ' — phá neckline, rủi ro cao' : ' — theo dõi neckline'}`,
            })
          }
        }
      }
    }
  }

  // ── INVERSE HEAD & SHOULDERS (Bottom — Bullish) ─────────────────────────
  if (troughIdxs.length >= 3) {
    const ri = troughIdxs[troughIdxs.length - 1]
    const hi = troughIdxs[troughIdxs.length - 2]
    const li = troughIdxs[troughIdxs.length - 3]
    if (ri - hi >= 7 && hi - li >= 7 && ri >= len - 25) {
      const lL = l[li], hL = l[hi], rL = l[ri]
      if (hL < lL && hL < rL) {
        const sSim = Math.abs(lL - rL) / Math.max(lL, rL)
        if (sSim < 0.07) {
          const lNeck = Math.max(...h.slice(li, hi + 1))
          const rNeck = Math.max(...h.slice(hi, ri + 1))
          const neck = (lNeck + rNeck) / 2
          const height = (neck - hL) / neck
          if (height > 0.06) {
            const confirmed = cur > neck * 0.98
            patterns.push({
              nameVi: 'Đầu & Vai Ngược (Tăng)',
              nameEn: 'Inv. Head & Shoulders',
              type: 'bullish',
              strength: height > 0.12 ? 'mạnh' : 'trung bình',
              scoreImpact: height > 0.12 ? 12 : 8,
              description: `Inv H&S: đáy tại ${fmt(hL)}, neckline ${fmt(neck)}${confirmed ? ' — xác nhận tăng mạnh' : ' — chờ breakout'}`,
            })
          }
        }
      }
    }
  }

  // ── ASCENDING TRIANGLE ──────────────────────────────────────────────────
  if (len >= 20) {
    const rH = h.slice(-20)
    const rL = l.slice(-20)
    const hMean = rH.reduce((a, b) => a + b, 0) / 20
    const hVar  = rH.reduce((s, v) => s + (v - hMean) ** 2, 0) / 20
    const hCV   = Math.sqrt(hVar) / hMean

    if (hCV < 0.022) {           // flat resistance
      const lSlope = slope(rL)
      if (lSlope > 0 && lSlope / (rL.reduce((a, b) => a + b, 0) / 20) > 0.0008) {
        patterns.push({
          nameVi: 'Tam Giác Tăng',
          nameEn: 'Ascending Triangle',
          type: 'bullish',
          strength: 'trung bình',
          scoreImpact: 6,
          description: `Tam giác tăng — kháng cự phẳng ~${fmt(hMean)} + hỗ trợ đang tăng. Breakout tiềm năng lên.`,
        })
      }
    }

    // ── DESCENDING TRIANGLE ─────────────────────────────────────────────
    const lMean = rL.reduce((a, b) => a + b, 0) / 20
    const lVar  = rL.reduce((s, v) => s + (v - lMean) ** 2, 0) / 20
    const lCV   = Math.sqrt(lVar) / lMean

    if (lCV < 0.022) {           // flat support
      const hSlope = slope(rH)
      if (hSlope < 0 && Math.abs(hSlope) / (rH.reduce((a, b) => a + b, 0) / 20) > 0.0008) {
        patterns.push({
          nameVi: 'Tam Giác Giảm',
          nameEn: 'Descending Triangle',
          type: 'bearish',
          strength: 'trung bình',
          scoreImpact: -6,
          description: `Tam giác giảm — hỗ trợ phẳng ~${fmt(lMean)} + kháng cự đang giảm. Breakdown tiềm năng.`,
        })
      }
    }
  }

  // ── CUP & HANDLE ────────────────────────────────────────────────────────
  if (len >= 45) {
    const cupLen = 35
    const cH = h.slice(len - cupLen - 8, len - 8)
    const cL = l.slice(len - cupLen - 8, len - 8)
    const hndH = h.slice(-8)
    const hndL = l.slice(-8)

    const leftRim  = Math.max(...cH.slice(0, 5))
    const rightRim = Math.max(...cH.slice(-5))
    const bottom   = Math.min(...cL)
    const rimSim   = Math.abs(leftRim - rightRim) / Math.max(leftRim, rightRim)
    const depth    = (Math.min(leftRim, rightRim) - bottom) / Math.min(leftRim, rightRim)

    const hndHigh  = Math.max(...hndH)
    const hndLow   = Math.min(...hndL)
    const hndDepth = (hndHigh - hndLow) / hndHigh

    if (depth > 0.10 && depth < 0.50 && rimSim < 0.05 && hndDepth > 0.01 && hndDepth < 0.10) {
      const flatBars = cL.filter(v => v < bottom * 1.04).length
      if (flatBars >= 3) {
        patterns.push({
          nameVi: 'Chén & Tay Cầm',
          nameEn: 'Cup & Handle',
          type: 'bullish',
          strength: depth > 0.25 ? 'mạnh' : 'trung bình',
          scoreImpact: depth > 0.25 ? 10 : 7,
          description: `Cup & Handle — tích lũy hình chén (sâu ${(depth * 100).toFixed(0)}%), breakout trên ${fmt(Math.max(leftRim, rightRim))}`,
        })
      }
    }
  }

  // Deduplicate: keep strongest in each direction
  const bullish = patterns.filter(p => p.type === 'bullish').sort((a, b) => b.scoreImpact - a.scoreImpact)
  const bearish = patterns.filter(p => p.type === 'bearish').sort((a, b) => a.scoreImpact - b.scoreImpact)

  // Return top 2 bullish + top 2 bearish to avoid signal overload
  return [...bullish.slice(0, 2), ...bearish.slice(0, 2)]
}
