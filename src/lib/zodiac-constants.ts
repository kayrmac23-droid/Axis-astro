// Centralised zodiac sign constants — used by the hero astrolabe plate and
// (eventually) the chart wheel + interpretation engine. Lifted up so the
// source of truth lives in one file rather than scattered SIGNS arrays.

export const ZODIAC_SIGNS = [
  { glyph: '♈', name: 'Aries',       degree: 0 },
  { glyph: '♉', name: 'Taurus',      degree: 30 },
  { glyph: '♊', name: 'Gemini',      degree: 60 },
  { glyph: '♋', name: 'Cancer',      degree: 90 },
  { glyph: '♌', name: 'Leo',         degree: 120 },
  { glyph: '♍', name: 'Virgo',       degree: 150 },
  { glyph: '♎', name: 'Libra',       degree: 180 },
  { glyph: '♏', name: 'Scorpio',     degree: 210 },
  { glyph: '♐', name: 'Sagittarius', degree: 240 },
  { glyph: '♑', name: 'Capricorn',   degree: 270 },
  { glyph: '♒', name: 'Aquarius',    degree: 300 },
  { glyph: '♓', name: 'Pisces',      degree: 330 },
] as const

// Lahiri ayanamsa at J2000 — the angular offset between tropical and sidereal
// reference frames. The same value the calculation engine uses.
export const SIDEREAL_OFFSET_DEG = 23.85
