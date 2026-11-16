// Type-ahead place suggestions (lib/place-suggest.ts) and the route mode that
// serves them. The mapping is the security boundary: a suggestion's latitude
// and longitude go straight into the chart, so nothing malformed may pass.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/geocode/route'
import { photonToResults, photonUrl } from '@/lib/place-suggest'

const feature = (name: unknown, coords: unknown, extra: Record<string, unknown> = {}) =>
  ({ properties: { name, ...extra }, geometry: { coordinates: coords } })

describe('photonToResults', () => {
  it('maps [lon, lat] to lat/lon strings and builds a readable name', () => {
    const out = photonToResults({ features: [
      feature('Melbourne', [144.9631732, -37.8142454], { state: 'Victoria', country: 'Australia' }),
    ] })
    expect(out).toEqual([{ lat: '-37.8142454', lon: '144.9631732', display_name: 'Melbourne, Victoria, Australia' }])
  })

  it('falls back to county, and does not repeat a region equal to the name', () => {
    const out = photonToResults({ features: [
      feature('Melbou', [5.36, 36.64], { county: 'Souk El-Tenine District', country: 'Algeria' }),
      feature('Singapore', [103.8, 1.35], { state: 'Singapore', country: 'Singapore' }),
    ] })
    expect(out.map(r => r.display_name)).toEqual(['Melbou, Souk El-Tenine District, Algeria', 'Singapore, Singapore'])
  })

  it('drops nameless, malformed and out-of-range features, and duplicates', () => {
    const out = photonToResults({ features: [
      feature(null, [1, 1]),
      feature('NoCoords', undefined),
      feature('Strings', ['1', '2']),
      feature('TooFarNorth', [10, 91]),
      feature('NaN', [NaN, 10]),
      feature('Paris', [2.35, 48.85], { country: 'France' }),
      feature('Paris', [2.36, 48.86], { country: 'France' }),
    ] })
    expect(out.map(r => r.display_name)).toEqual(['Paris, France'])
  })

  it('returns [] for anything that is not a feature collection', () => {
    expect(photonToResults(null)).toEqual([])
    expect(photonToResults({ features: 'no' })).toEqual([])
    expect(photonToResults('<html>')).toEqual([])
  })

  it('asks Photon for settlements only and encodes the query', () => {
    const url = photonUrl('são paulo & co')
    expect(url).toContain('q=s%C3%A3o+paulo+%26+co')
    expect(url).toContain('layer=city')
    expect(url).not.toContain('layer=street')
  })
})

describe('/api/geocode?mode=suggest', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('answers a too-short query with [] and no outbound call', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const res = await GET(new NextRequest('https://x/api/geocode?mode=suggest&q=me'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('goes to Photon, never Nominatim, and returns whitelisted fields', async () => {
    const fetchSpy = vi.fn(async (_url: string) => new Response(JSON.stringify({ features: [
      { properties: { name: 'Melbourne', state: 'Victoria', country: 'Australia', osm_id: 1 }, geometry: { coordinates: [144.96, -37.81] } },
    ] })))
    vi.stubGlobal('fetch', fetchSpy)
    const res = await GET(new NextRequest('https://x/api/geocode?mode=suggest&q=melbou', { headers: { 'x-forwarded-for': '203.0.113.60' } }))
    expect(await res.json()).toEqual([{ lat: '-37.81', lon: '144.96', display_name: 'Melbourne, Victoria, Australia' }])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const url = String(fetchSpy.mock.calls[0][0])
    expect(url).toContain('photon.komoot.io')
    expect(url).not.toContain('nominatim')
  })

  it('an upstream failure is an empty list with a 502, not a crash', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    const res = await GET(new NextRequest('https://x/api/geocode?mode=suggest&q=lisbon', { headers: { 'x-forwarded-for': '203.0.113.61' } }))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual([])
  })
})
