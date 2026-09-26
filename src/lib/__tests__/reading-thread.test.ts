// The reading thread: each natal section is written after the sections the reader
// has already read (Sidereal after all of Tropical, The Divergence after both).
// Redis env vars are absent under test, so the thread uses its in-memory fallback.
import { describe, it, expect, beforeEach } from 'vitest'
import type { BirthData } from '@/lib/astro-calc'
import { priorSectionsFor, NATAL_SECTION_ORDER } from '@/lib/reading-order'
import {
  parseThreadId, loadPriorSections, storeThreadSection, priorSectionBlocks,
  priorSectionsText, priorDigest, _resetThreadMemoryForTests, READING_SO_FAR_HEADER,
  type ThreadScope,
} from '@/lib/reading-thread'
import { makeCacheKey } from '@/lib/reading-cache'

const BIRTH: BirthData = {
  year: 1999, month: 7, day: 23, hour: 23, minute: 45,
  latitude: -37.65, longitude: 145.02, timezone: 10,
}
const THREAD = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d'
const scope: ThreadScope = { threadId: THREAD, birth: BIRTH }

describe('priorSectionsFor — reading order', () => {
  it('the opening section has nothing before it', () => {
    expect(priorSectionsFor('tropical', 'sun')).toEqual([])
  })

  it('a tropical section follows the earlier tropical sections', () => {
    expect(priorSectionsFor('tropical', 'ascendant')).toEqual([
      { section: 'tropical', planetSection: 'sun' },
      { section: 'tropical', planetSection: 'moon' },
    ])
  })

  it('the sidereal reading is written after the whole tropical reading', () => {
    const prior = priorSectionsFor('sidereal', 'sun')
    const tropical = prior.filter(p => p.section === 'tropical').map(p => p.planetSection)
    expect(tropical).toEqual([...NATAL_SECTION_ORDER.tropical])
    expect(prior.filter(p => p.section === 'sidereal').map(p => p.planetSection)).toEqual(['lagna'])
  })

  it('The Divergence is written after both readings and its own earlier movements', () => {
    const prior = priorSectionsFor('synthesis', 'tension')
    expect(prior).toHaveLength(
      NATAL_SECTION_ORDER.tropical.length + NATAL_SECTION_ORDER.sidereal.length + 2,
    )
    expect(prior.slice(-2).map(p => p.planetSection)).toEqual(['agree', 'diverge'])
  })

  it('synastry and unknown sections are not threaded', () => {
    expect(priorSectionsFor('synastry', 'navigation')).toEqual([])
    expect(priorSectionsFor('tropical', 'pluto')).toEqual([])
  })
})

describe('parseThreadId', () => {
  it('accepts a UUID and rejects anything else', () => {
    expect(parseThreadId(THREAD)).toBe(THREAD)
    expect(parseThreadId(THREAD.toUpperCase())).toBe(THREAD)
    expect(parseThreadId('x')).toBeNull()
    expect(parseThreadId(`${THREAD}:axis:reading`)).toBeNull()
    expect(parseThreadId(42)).toBeNull()
    expect(parseThreadId(undefined)).toBeNull()
  })
})

describe('thread storage (in-memory fallback)', () => {
  beforeEach(() => _resetThreadMemoryForTests())

  it('loads earlier sections in reading order, skipping ones never written', async () => {
    await storeThreadSection(scope, 'tropical', 'moon', '## The Moon\n\nMoon text.')
    await storeThreadSection(scope, 'tropical', 'sun', '## The Sun\n\nSun text.')
    const prior = await loadPriorSections(scope, 'tropical', 'mercury')
    // ascendant was never stored (e.g. it failed) — the reading continues without it
    expect(prior.map(p => p.planetSection)).toEqual(['sun', 'moon'])
    expect(prior[0].text).toContain('Sun text.')
  })

  it('never loads the section being written or anything after it', async () => {
    await storeThreadSection(scope, 'tropical', 'sun', 'Sun text.')
    await storeThreadSection(scope, 'tropical', 'moon', 'Moon text.')
    const prior = await loadPriorSections(scope, 'tropical', 'moon')
    expect(prior.map(p => p.planetSection)).toEqual(['sun'])
  })

  it('binds the thread to the chart: the same id with another birth reads an empty thread', async () => {
    await storeThreadSection(scope, 'tropical', 'sun', 'Sun text.')
    const other: ThreadScope = { threadId: THREAD, birth: { ...BIRTH, day: 24 } }
    expect(await loadPriorSections(other, 'tropical', 'moon')).toEqual([])
  })

  it('a different thread id for the same chart starts fresh', async () => {
    await storeThreadSection(scope, 'tropical', 'sun', 'Sun text.')
    const fresh: ThreadScope = { threadId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', birth: BIRTH }
    expect(await loadPriorSections(fresh, 'tropical', 'moon')).toEqual([])
  })

  it('a retried section replaces its earlier text', async () => {
    await storeThreadSection(scope, 'tropical', 'sun', 'First Sun.')
    await storeThreadSection(scope, 'tropical', 'sun', 'Second Sun.')
    const [sun] = await loadPriorSections(scope, 'tropical', 'moon')
    expect(sun.text).toBe('Second Sun.')
  })
})

describe('prompt rendering', () => {
  const prior = [
    { section: 'tropical' as const, planetSection: 'sun', text: 'Sun text.' },
    { section: 'tropical' as const, planetSection: 'moon', text: 'Moon text.' },
  ]

  it('renders one block per earlier section, header first, cache breakpoint on the last only', () => {
    const blocks = priorSectionBlocks(prior)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].text.startsWith(READING_SO_FAR_HEADER)).toBe(true)
    expect(blocks[0].text).toContain('ALREADY READ · Tropical reading · Sun')
    expect(blocks[1].text).toContain('Moon text.')
    expect(blocks[0].cache_control).toBeUndefined()
    expect(blocks[1].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('keeps each block byte-identical as the reading grows, so the prompt cache prefix holds', () => {
    const shorter = priorSectionBlocks(prior.slice(0, 1))
    const longer  = priorSectionBlocks(prior)
    expect(longer[0].text).toBe(shorter[0].text)
  })

  it('renders nothing for the opening section', () => {
    expect(priorSectionBlocks([])).toEqual([])
    expect(priorSectionsText([])).toBe('')
    expect(priorDigest([])).toBe('')
  })

  it('the digest moves with the earlier text, and so does the cache key', () => {
    const edited = [prior[0], { ...prior[1], text: 'Moon text, repaired.' }]
    expect(priorDigest(prior)).not.toBe(priorDigest(edited))
    const key = (d: string) => makeCacheKey({ birth: BIRTH, section: 'tropical', planetSection: 'ascendant', priorDigest: d })
    expect(key(priorDigest(prior))).not.toBe(key(priorDigest(edited)))
    // An unthreaded request and the opening section of a thread share a key.
    expect(makeCacheKey({ birth: BIRTH, section: 'tropical', planetSection: 'sun' }))
      .toBe(makeCacheKey({ birth: BIRTH, section: 'tropical', planetSection: 'sun', priorDigest: '' }))
  })
})
