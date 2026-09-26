// The order a natal reading is written and read in. Client-safe (no Node APIs):
// ReadingPanel walks it to stream the sections, and the reading route walks it to
// decide which earlier sections a given section is written after.
//
// The order is load-bearing. Each section is generated knowing every section the
// reader has already read (see reading-thread.ts), so what comes first frames
// everything after it. The Sidereal reading comes after the whole Tropical one and
// sees all of it; The Divergence comes after both.

export const NATAL_SECTION_ORDER = {
  tropical:  ['sun', 'moon', 'ascendant', 'mercury', 'venus', 'mars', 'jupiter_saturn', 'rahu_ketu', 'key_aspects'],
  sidereal:  ['lagna', 'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter_saturn', 'rahu_ketu'],
  synthesis: ['agree', 'diverge', 'tension', 'closing'],
} as const

export type NatalSection = keyof typeof NATAL_SECTION_ORDER

const NATAL_SECTIONS: NatalSection[] = ['tropical', 'sidereal', 'synthesis']

export interface SectionRef {
  section:       NatalSection
  planetSection: string
}

// Every section the reader has read before this one, in reading order: all of
// each earlier frame, then the earlier sections of this frame. Returns [] for the
// opening section, for synastry, and for anything not in the order.
export function priorSectionsFor(section: string, planetSection: string): SectionRef[] {
  const frameIdx = NATAL_SECTIONS.indexOf(section as NatalSection)
  if (frameIdx === -1) return []
  const own = NATAL_SECTION_ORDER[section as NatalSection] as readonly string[]
  const idx = own.indexOf(planetSection)
  if (idx === -1) return []

  const prior: SectionRef[] = []
  for (const earlier of NATAL_SECTIONS.slice(0, frameIdx)) {
    for (const p of NATAL_SECTION_ORDER[earlier]) prior.push({ section: earlier, planetSection: p })
  }
  for (const p of own.slice(0, idx)) prior.push({ section: section as NatalSection, planetSection: p })
  return prior
}
