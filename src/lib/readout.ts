// Shared readout data source. The per-body positional data shown in the wheel's
// READOUT table (FrameShiftWheel) and beside each reading section (ReadingPanel)
// is derived here, once, from DualChartData — so both surfaces render identical
// numbers with no drift. Formatting helpers and the dignity table live here too.
//
// DOCTRINE.md — THE LAW: this module only *derives and formats* both frames as
// distinct data. It never reconciles Tropical and Sidereal into one value.
import { DualChartData } from './astro-calc'

export const VS = '︎'
// Zodiac sign glyphs, VS-15 flat (index 0 = Aries).
export const ZODIAC_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map(g => g + VS)

export const PLANET_GLYPH: Record<string, string> = {
  Sun: '☉' + VS, Moon: '☽' + VS, Mercury: '☿' + VS, Venus: '♀' + VS, Mars: '♂' + VS,
  Jupiter: '♃' + VS, Saturn: '♄' + VS, Uranus: '♅' + VS, Neptune: '♆' + VS,
  Pluto: '♇' + VS, Rahu: '☊' + VS, Ketu: '☋' + VS,
}
export const PLANET_ORDER = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Rahu', 'Ketu']

const DIGNITIES: Record<string, { domicile: string[]; exaltation: string; detriment: string[]; fall: string }> = {
  Sun: { domicile: ['Leo'], exaltation: 'Aries', detriment: ['Aquarius'], fall: 'Libra' },
  Moon: { domicile: ['Cancer'], exaltation: 'Taurus', detriment: ['Capricorn'], fall: 'Scorpio' },
  Mercury: { domicile: ['Gemini', 'Virgo'], exaltation: 'Virgo', detriment: ['Sagittarius', 'Pisces'], fall: 'Pisces' },
  Venus: { domicile: ['Taurus', 'Libra'], exaltation: 'Pisces', detriment: ['Aries', 'Scorpio'], fall: 'Virgo' },
  Mars: { domicile: ['Aries', 'Scorpio'], exaltation: 'Capricorn', detriment: ['Taurus', 'Libra'], fall: 'Cancer' },
  Jupiter: { domicile: ['Sagittarius', 'Pisces'], exaltation: 'Cancer', detriment: ['Gemini', 'Virgo'], fall: 'Capricorn' },
  Saturn: { domicile: ['Capricorn', 'Aquarius'], exaltation: 'Libra', detriment: ['Cancer', 'Leo'], fall: 'Aries' },
}

export function dignityOf(planet: string, sign: string): string {
  const d = DIGNITIES[planet]
  if (!d) return ''
  if (d.domicile.includes(sign)) return 'domicile'
  if (d.exaltation === sign) return 'exaltation'
  if (d.detriment.includes(sign)) return 'detriment'
  if (d.fall === sign) return 'fall'
  return ''
}

export const norm = (x: number) => ((x % 360) + 360) % 360

export function dms(v: number): string {
  v = Math.max(0, v)
  let d = Math.floor(v)
  let m = Math.round((v - d) * 60)
  if (m === 60) { d++; m = 0 }
  return d + '°' + String(m).padStart(2, '0') + '′'
}

export function lonStr(lon: number): string {
  const L = norm(lon), s = Math.floor(L / 30)
  return dms(L % 30) + ' ' + ZODIAC_GLYPHS[s]
}

export interface ReadoutRow {
  id: string
  glyph: string
  name: string
  tLon: number
  sLon: number
  tSign: number
  sSign: number
  flip: boolean
  tHouse: number | null
  sHouse: number | null
  retro: boolean
  tDignity: string
  sDignity: string
  nakshatra: string
  nakPada: number | null
  isAngle: boolean
}

// Builds the readout rows (both frames, always) from a dual chart. ASC and MC
// come first, then the bodies in PLANET_ORDER. Any body missing from a frame
// falls back to the other frame's longitude for display (never reconciled — the
// fallback only prevents a blank cell when an ephemeris omits a body).
export function buildReadoutRows(data: DualChartData): ReadoutRow[] {
  const { tropical, sidereal } = data
  const tMap = Object.fromEntries(tropical.planets.map(p => [p.name, p]))
  const sMap = Object.fromEntries(sidereal.planets.map(p => [p.name, p]))
  const out: ReadoutRow[] = [
    {
      id: 'asc', glyph: '', name: 'ASC', tLon: tropical.ascendant, sLon: sidereal.ascendant,
      tSign: Math.floor(norm(tropical.ascendant) / 30), sSign: Math.floor(norm(sidereal.ascendant) / 30),
      flip: false, tHouse: null, sHouse: null, retro: false, tDignity: '', sDignity: '', nakshatra: '', nakPada: null, isAngle: true,
    },
    {
      id: 'mc', glyph: '', name: 'MC', tLon: tropical.midheaven, sLon: sidereal.midheaven,
      tSign: Math.floor(norm(tropical.midheaven) / 30), sSign: Math.floor(norm(sidereal.midheaven) / 30),
      flip: false, tHouse: null, sHouse: null, retro: false, tDignity: '', sDignity: '', nakshatra: '', nakPada: null, isAngle: true,
    },
  ]
  out.forEach(r => { r.flip = r.tSign !== r.sSign })
  for (const name of PLANET_ORDER) {
    const t = tMap[name], s = sMap[name]
    if (!t && !s) continue
    const tp = t ?? s!   // tropical-or-fallback (guard guarantees one exists)
    const sp = s ?? t!   // sidereal-or-fallback
    const tSign = Math.floor(norm(tp.longitude) / 30)
    const sSign = Math.floor(norm(sp.longitude) / 30)
    out.push({
      id: name.toLowerCase(), glyph: PLANET_GLYPH[name] ?? '', name: name.toUpperCase(),
      tLon: tp.longitude, sLon: sp.longitude,
      tSign, sSign, flip: tSign !== sSign,
      tHouse: t ? t.house : null, sHouse: s ? s.house : null,
      retro: tp.retrograde,
      tDignity: t ? dignityOf(name, t.sign) : '', sDignity: s ? dignityOf(name, s.sign) : '',
      nakshatra: s?.nakshatra ?? '', nakPada: s?.nakshatraPada ?? null,
      isAngle: false,
    })
  }
  return out
}
