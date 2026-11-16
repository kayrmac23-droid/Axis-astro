// Glyph placement on the wheel (lib/wheel-layout.ts). A stellium used to print
// its glyphs and degree labels on top of each other.
import { describe, it, expect } from 'vitest'
import { spreadLongitudes } from '@/lib/wheel-layout'

const gap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d) }
const minGap = (xs: number[]) => {
  let m = 360
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) m = Math.min(m, gap(xs[i], xs[j]))
  return m
}

describe('spreadLongitudes', () => {
  it('leaves well-separated bodies exactly where they are', () => {
    expect(spreadLongitudes([10, 100, 200, 300], 11)).toEqual([10, 100, 200, 300])
  })

  it('fans a five-body stellium out to the minimum separation', () => {
    // Capricorn, March 1990: Venus, Mars, Saturn, Uranus, Neptune.
    const out = spreadLongitudes([300.45, 294.63, 292.43, 278.9, 284.07], 11)
    expect(minGap(out)).toBeGreaterThanOrEqual(11 - 1e-3)
  })

  it('keeps the order of bodies around the circle', () => {
    const lons = [300.45, 294.63, 292.43, 278.9, 284.07]
    const out = spreadLongitudes(lons, 11)
    const rank = (xs: number[]) => xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b])
    expect(rank(out)).toEqual(rank(lons))
  })

  it('handles a cluster that straddles 0° Aries', () => {
    const out = spreadLongitudes([358, 359, 1, 2], 11)
    expect(minGap(out)).toBeGreaterThanOrEqual(11 - 1e-3)
    // Still centred on the boundary, not flung across the chart.
    for (const x of out) expect(gap(x, 0)).toBeLessThan(20)
  })

  it('moves a displaced body no further than it has to', () => {
    const out = spreadLongitudes([100, 102], 11)
    expect(gap(out[0], 100)).toBeCloseTo(4.5, 3)
    expect(gap(out[1], 102)).toBeCloseTo(4.5, 3)
  })

  it('falls back to an even spread when the ring is over-full', () => {
    const lons = Array.from({ length: 40 }, () => 50)
    expect(minGap(spreadLongitudes(lons, 11))).toBeGreaterThanOrEqual(9 - 1e-3)
  })

  it('handles zero and one body', () => {
    expect(spreadLongitudes([], 11)).toEqual([])
    expect(spreadLongitudes([-10], 11)).toEqual([350])
  })
})
