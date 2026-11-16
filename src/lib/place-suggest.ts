// lib/place-suggest.ts
// Type-ahead place suggestions come from Photon (photon.komoot.io), an
// OpenStreetMap geocoder built for search-as-you-type. Nominatim's public API
// forbids autocomplete, so it is used only for the explicit search (Enter or
// the SEARCH button), which stays as the fuller fallback when no suggestion
// fits. Pure and client-safe: the route does the fetching.

export interface PlaceResult { lat: string; lon: string; display_name: string }

export const SUGGEST_MIN_CHARS = 3
export const SUGGEST_DEBOUNCE_MS = 300

export function photonUrl(query: string): string {
  // Settlements only: a birth place is a town, not a street or a shop.
  const params = new URLSearchParams({ q: query, limit: '5', lang: 'en' })
  return `https://photon.komoot.io/api/?${params}&layer=city&layer=locality&layer=district`
}

interface PhotonFeature {
  properties?: { name?: unknown; county?: unknown; state?: unknown; country?: unknown }
  geometry?: { coordinates?: unknown }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

// Whitelists the fields the client needs and drops anything malformed: a
// feature with no name, or coordinates that are not a finite [lon, lat] pair
// in range, never reaches the form (its latitude feeds the chart).
export function photonToResults(body: unknown): PlaceResult[] {
  const features = (body as { features?: unknown })?.features
  if (!Array.isArray(features)) return []
  const out: PlaceResult[] = []
  const seen = new Set<string>()
  for (const f of features as PhotonFeature[]) {
    const name = str(f?.properties?.name)
    const coords = f?.geometry?.coordinates
    if (!name || !Array.isArray(coords) || coords.length < 2) continue
    const [lon, lat] = coords as unknown[]
    if (typeof lon !== 'number' || typeof lat !== 'number') continue
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue
    // State, else county, tells two same-named towns apart.
    const region = str(f.properties?.state) ?? str(f.properties?.county)
    const display_name = [name, region !== name ? region : null, str(f.properties?.country)]
      .filter(Boolean).join(', ')
    if (seen.has(display_name)) continue
    seen.add(display_name)
    out.push({ lat: String(lat), lon: String(lon), display_name })
  }
  return out
}
