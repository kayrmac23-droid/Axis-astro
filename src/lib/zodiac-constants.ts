export const ZODIAC_SIGNS = [
  { glyph: '♈', name: 'ARIES',       degree: 0 },
  { glyph: '♉', name: 'TAURUS',      degree: 30 },
  { glyph: '♊', name: 'GEMINI',      degree: 60 },
  { glyph: '♋', name: 'CANCER',      degree: 90 },
  { glyph: '♌', name: 'LEO',         degree: 120 },
  { glyph: '♍', name: 'VIRGO',       degree: 150 },
  { glyph: '♎', name: 'LIBRA',       degree: 180 },
  { glyph: '♏', name: 'SCORPIO',     degree: 210 },
  { glyph: '♐', name: 'SAGITTARIUS', degree: 240 },
  { glyph: '♑', name: 'CAPRICORN',   degree: 270 },
  { glyph: '♒', name: 'AQUARIUS',    degree: 300 },
  { glyph: '♓', name: 'PISCES',      degree: 330 },
] as const

export const SIDEREAL_OFFSET = 23.85  // Lahiri ayanamsa at J2000
