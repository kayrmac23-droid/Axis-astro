// lib/paywall.ts
// Where the free reading ends. Client-safe (no Node APIs): the reading route
// enforces it and ReadingPanel renders the wall from the same table.
//
// The free tier is a PREFIX of the reading order, never a sample from the
// middle: every section is written knowing the sections before it, and the
// cache key digests which sections preceded it (reading-order.ts), so a free
// section taken out of order would be a different, uncached piece of writing.
//
// OFF by default. `AXIS_PAYWALL_ENABLED=true` locks every natal section after
// the prefix. There is no purchase path yet, so nothing unlocks them: turning
// it on measures how many readers reach the wall and ask for more
// (`paywall_reached` / `paywall_unlock_clicked`), and nothing else.
// DOCTRINE.md — IDENTITY & STORAGE TIERS: when the one-off tier is built, the
// entitlement check is the purchase -> reading binding and it belongs in
// `sectionLocked`, ahead of the cache check, never in the anonymous cache.
import { NATAL_SECTION_ORDER, type NatalSection, type SectionRef } from './reading-order'

// v10.57: the opening section joins the prefix, so the free tier keeps the Sun,
// Moon and Ascendant it had and reads them after the shape of the chart.
export const FREE_SECTIONS: readonly SectionRef[] = [
  { section: 'tropical', planetSection: 'overview' },
  { section: 'tropical', planetSection: 'sun' },
  { section: 'tropical', planetSection: 'moon' },
  { section: 'tropical', planetSection: 'ascendant' },
]

const NATAL_SECTIONS = Object.keys(NATAL_SECTION_ORDER) as NatalSection[]

/** The whole natal reading, flattened, in the order it is written and read. */
export function natalReadingOrder(): SectionRef[] {
  return NATAL_SECTIONS.flatMap(section =>
    NATAL_SECTION_ORDER[section].map(planetSection => ({ section, planetSection })))
}

export function isFreeSection(section: string, planetSection: string): boolean {
  return FREE_SECTIONS.some(f => f.section === section && f.planetSection === planetSection)
}

export function paywallEnabled(): boolean {
  return process.env.AXIS_PAYWALL_ENABLED === 'true'
}

/**
 * True when this section must not be served. Synastry is a separate product
 * with no tier ruling yet and is never locked here.
 */
export function sectionLocked(section: string, planetSection: string): boolean {
  if (!paywallEnabled()) return false
  if (!(section in NATAL_SECTION_ORDER)) return false
  return !isFreeSection(section, planetSection)
}

/** How many sections of each part sit behind the wall. */
export function lockedCounts(): Record<NatalSection, number> {
  const counts = { tropical: 0, sidereal: 0, synthesis: 0 }
  for (const ref of natalReadingOrder()) {
    if (!isFreeSection(ref.section, ref.planetSection)) counts[ref.section]++
  }
  return counts
}

// ── Wire format ──────────────────────────────────────────────────────────────
// 402 + this header. The header, not the status, is what the client reads: it
// tells the panel the run has reached the wall, which is an ending and not an
// error — nothing is retried and no later section is requested.
export const PAYWALL_HEADER = 'X-Axis-Paywall'
export const PAYWALL_STATUS = 402

export class ReadingLockedError extends Error {
  constructor() {
    super('This section is part of the full dossier.')
    this.name = 'ReadingLockedError'
  }
}

export function isPaywallResponse(res: { status: number; headers: { get(name: string): string | null } }): boolean {
  return res.status === PAYWALL_STATUS && res.headers.get(PAYWALL_HEADER) === 'locked'
}
