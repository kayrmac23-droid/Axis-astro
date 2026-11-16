// lib/wheel-layout.ts
// Where each body's glyph is DRAWN on the wheel, as opposed to where the body
// is. Bodies within a few degrees of each other would print their glyphs and
// degree labels on top of one another, so close neighbours are fanned apart
// along the ring and a pointer line ties each glyph back to its true longitude.
// Pure and client-safe.

const wrap = (d: number) => ((d % 360) + 360) % 360

/**
 * Returns a display longitude for each input longitude, in the same order,
 * with every neighbouring pair at least `minSep` degrees apart around the
 * circle. Ordering around the circle is preserved, and a body with room on
 * both sides does not move.
 */
export function spreadLongitudes(lons: readonly number[], minSep: number): number[] {
  const n = lons.length
  if (n < 2) return lons.map(wrap)
  const sep = Math.min(minSep, 360 / n)
  const order = lons.map((_, i) => i).sort((a, b) => wrap(lons[a]) - wrap(lons[b]))
  const pos = order.map(i => wrap(lons[i]))   // ascending, unwrapped from here on
  // A ring with no slack has one answer: even spacing. (Relaxation would crawl
  // towards it.) A chart never gets here — twelve bodies need 132° at 11°.
  if (minSep * n >= 360) {
    const out = new Array<number>(n)
    order.forEach((i, k) => { out[i] = wrap(pos[0] + k * sep) })
    return out
  }
  for (let pass = 0; pass < 400; pass++) {
    let moved = false
    for (let k = 0; k < n; k++) {
      const next = (k + 1) % n
      const gap = pos[next] - pos[k] + (next === 0 ? 360 : 0)
      if (gap < sep - 1e-6) {
        const push = (sep - gap) / 2
        pos[k] -= push
        pos[next] += push
        moved = true
      }
    }
    if (!moved) break
  }
  const out = new Array<number>(n)
  order.forEach((i, k) => { out[i] = wrap(pos[k]) })
  return out
}
