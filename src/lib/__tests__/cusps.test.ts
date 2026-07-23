import { describe, it, expect } from 'vitest'
import { getCuspForPlanet, CUSPS, CUSP_ORB_DEG } from '@/lib/cusps'

describe('getCuspForPlanet', () => {
  it('returns null for a placement in the body of a sign', () => {
    expect(getCuspForPlanet('Cancer', 15)).toBeNull()
    expect(getCuspForPlanet('Leo', 12.5)).toBeNull()
  })

  it('names the cusp when near the end of a sign (boundary with the next sign)', () => {
    const cusp = getCuspForPlanet('Cancer', 28.4)
    expect(cusp).not.toBeNull()
    expect(cusp!.name).toBe('Cusp of Oscillation')
    expect(cusp!.signs).toEqual(['Cancer', 'Leo'])
  })

  it('names the cusp when near the start of a sign (boundary with the previous sign)', () => {
    const cusp = getCuspForPlanet('Leo', 1.2)
    expect(cusp).not.toBeNull()
    expect(cusp!.name).toBe('Cusp of Oscillation')
    expect(cusp!.signs).toEqual(['Cancer', 'Leo'])
  })

  it('handles the Pisces→Aries zodiac wrap in both directions', () => {
    expect(getCuspForPlanet('Pisces', 29.5)?.name).toBe('Cusp of Rebirth')
    expect(getCuspForPlanet('Aries', 0.5)?.name).toBe('Cusp of Rebirth')
  })

  it('respects the orb boundary exactly', () => {
    // Just inside the orb near the end of the sign.
    expect(getCuspForPlanet('Aries', 30 - CUSP_ORB_DEG + 0.01)).not.toBeNull()
    // Exactly at the orb edge — not yet on the cusp (strict comparison).
    expect(getCuspForPlanet('Aries', 30 - CUSP_ORB_DEG)).toBeNull()
    expect(getCuspForPlanet('Aries', CUSP_ORB_DEG)).toBeNull()
    expect(getCuspForPlanet('Aries', CUSP_ORB_DEG - 0.01)).not.toBeNull()
  })

  it('returns null for an unknown sign name', () => {
    expect(getCuspForPlanet('NotASign', 1)).toBeNull()
  })

  it('every one of the 12 cusps is reachable from a placement near its boundary', () => {
    for (const cusp of CUSPS) {
      const [earlier] = cusp.signs
      // A placement near the end of the earlier sign should resolve to this cusp.
      const found = getCuspForPlanet(earlier, 29)
      expect(found?.name).toBe(cusp.name)
    }
    expect(CUSPS).toHaveLength(12)
  })
})
