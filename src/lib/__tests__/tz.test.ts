import { describe, it, expect } from 'vitest'
import { isValidCalendarDate, birthToUtcMs, tzNameToOffset } from '../tz'

describe('isValidCalendarDate', () => {
  it('accepts ordinary modern dates', () => {
    expect(isValidCalendarDate(1990, 6, 15)).toBe(true)
    expect(isValidCalendarDate(2024, 2, 29)).toBe(true) // leap year
  })

  it('rejects impossible dates', () => {
    expect(isValidCalendarDate(1990, 2, 31)).toBe(false)
    expect(isValidCalendarDate(1990, 4, 31)).toBe(false)
    expect(isValidCalendarDate(2023, 2, 29)).toBe(false) // non-leap
  })

  // Regression: the Date constructor / Date.UTC remap years 0–99 to 1900–1999,
  // which made the old validation reject every valid birth in years 1–99.
  it('accepts valid years in the 1–99 range (no two-digit-year remap)', () => {
    expect(isValidCalendarDate(50, 6, 15)).toBe(true)
    expect(isValidCalendarDate(1, 1, 1)).toBe(true)
    expect(isValidCalendarDate(99, 12, 31)).toBe(true)
  })

  it('still rejects impossible dates in the 1–99 range', () => {
    expect(isValidCalendarDate(50, 2, 31)).toBe(false)
    expect(isValidCalendarDate(50, 2, 29)).toBe(false) // 50 CE is not a leap year
    expect(isValidCalendarDate(4, 2, 29)).toBe(true)   // 4 CE is a leap year
  })
})

describe('birthToUtcMs', () => {
  it('converts a local wall-clock moment to the correct UTC instant', () => {
    // 2000-01-01 12:00 at UTC+0 → 2000-01-01T12:00:00Z
    const ms = birthToUtcMs(2000, 1, 1, 12, 0, 0)
    expect(new Date(ms).toISOString()).toBe('2000-01-01T12:00:00.000Z')
  })

  it('applies a positive timezone offset (local ahead of UTC)', () => {
    // 09:00 local at UTC+5.5 → 03:30 UTC
    const ms = birthToUtcMs(2000, 1, 1, 9, 0, 5.5)
    expect(new Date(ms).toISOString()).toBe('2000-01-01T03:30:00.000Z')
  })

  it('applies a negative timezone offset (local behind UTC)', () => {
    // 20:00 local at UTC-5 → next day 01:00 UTC
    const ms = birthToUtcMs(2000, 1, 1, 20, 0, -5)
    expect(new Date(ms).toISOString()).toBe('2000-01-02T01:00:00.000Z')
  })

  // Regression: Date.UTC(50, ...) would return the 1950 instant, silently
  // fetching Pluto for the wrong year.
  it('honours the true year for years 1–99', () => {
    const ms = birthToUtcMs(50, 6, 15, 0, 0, 0)
    expect(new Date(ms).getUTCFullYear()).toBe(50)
  })
})

describe('tzNameToOffset', () => {
  it('resolves DST-aware offsets for a northern-hemisphere zone', () => {
    // America/New_York: EDT (-4) in July, EST (-5) in January.
    expect(tzNameToOffset('America/New_York', 2000, 7, 15, 12, 0)).toBe(-4)
    expect(tzNameToOffset('America/New_York', 2000, 1, 15, 12, 0)).toBe(-5)
  })

  it('handles half-hour offsets', () => {
    expect(tzNameToOffset('Asia/Kolkata', 2000, 1, 1, 12, 0)).toBe(5.5)
  })

  it('returns 0 for UTC', () => {
    expect(tzNameToOffset('UTC', 2000, 1, 1, 0, 0)).toBe(0)
  })

  it('returns null for an unrecognised timezone identifier', () => {
    expect(tzNameToOffset('Not/AZone', 2000, 1, 1, 0, 0)).toBeNull()
  })

  // Regression: an unpadded year (e.g. '50-06-15…') is not valid ISO 8601, parses
  // to Invalid Date, and made this function throw → silently return null for every
  // year before 1000 CE. Padding restores the IANA historical (LMT) offset.
  it('resolves an offset for early-CE years instead of failing', () => {
    const off = tzNameToOffset('Asia/Kolkata', 800, 1, 1, 12, 0)
    expect(off).not.toBeNull()
    expect(off).toBeGreaterThan(5)
    expect(off).toBeLessThan(6)
  })

  // Regression: the wall clock is LOCAL time, not UTC. The old implementation read
  // it as UTC and queried the zone at that instant, so a birth in the hours just
  // after a DST spring-forward got the PRE-transition offset (off by an hour),
  // shifting the Ascendant ~15°. The offset must be resolved at the true instant.
  describe('DST-transition edge (America/New_York, 2023-03-12 02:00→03:00)', () => {
    it('returns EST (-5) just before the spring-forward', () => {
      expect(tzNameToOffset('America/New_York', 2023, 3, 12, 1, 30)).toBe(-5)
    })

    it('returns EDT (-4) just after the spring-forward', () => {
      // 03:30 and 05:30 local are both EDT; the old code returned -5 for both.
      expect(tzNameToOffset('America/New_York', 2023, 3, 12, 3, 30)).toBe(-4)
      expect(tzNameToOffset('America/New_York', 2023, 3, 12, 5, 30)).toBe(-4)
    })

    it('returns EST (-5) just before the autumn fall-back', () => {
      // 2023-11-05 02:00 EDT → 01:00 EST. 00:30 local is still EDT (-4).
      expect(tzNameToOffset('America/New_York', 2023, 11, 5, 0, 30)).toBe(-4)
    })
  })
})
