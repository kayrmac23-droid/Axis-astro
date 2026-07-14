'use client'
/* ============================================================
   FrameShiftWheel — the AXIS reading wheel.

   Ported from public/wheel.html (ratified frame-shift prototype),
   wired to the real engine output (DualChartData). One sky; the
   zodiac band rotates by the live Lahiri ayanamsa between the
   Tropical and Sidereal frames — the rotation IS the divergence.

   • Frame is CONTROLLED by the parent (`frame` + `onFrameChange`)
     so the same toggle drives the reading panel.
   • The aspect web is drawn once from the (frame-invariant) real
     positions and does not rotate.
   • The Δ offset callout arc + the two 0°♈︎ fiducials are always
     drawn, so the offset stays legible even in the static state
     (and under prefers-reduced-motion, where the swap is instant).
   • The readout table renders BOTH frames for every body in every
     toggle state (co-visibility); only prose follows the frame.
   • Treatments (graticule / plate / stellar) live behind a prop,
     default "stellar"; the prototype's picker is removed.

   Every astrological glyph carries VS-15 (U+FE0E); no emoji.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react'
import { DualChartData } from '@/lib/astro-calc'
import styles from './FrameShiftWheel.module.css'

const VS = '︎'
const SG = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map(g => g + VS)
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const NAKS = ['ASHWINI', 'BHARANI', 'KRITTIKA', 'ROHINI', 'MRIGASHIRA', 'ARDRA', 'PUNARVASU', 'PUSHYA', 'ASHLESHA', 'MAGHA', 'P.PHALGUNI', 'U.PHALGUNI', 'HASTA', 'CHITRA', 'SWATI', 'VISHAKHA', 'ANURADHA', 'JYESHTHA', 'MULA', 'P.ASHADHA', 'U.ASHADHA', 'SHRAVANA', 'DHANISHTA', 'SHATABHISHA', 'P.BHADRAPADA', 'U.BHADRAPADA', 'REVATI']
const SIGN_NAMES = ['ARIES', 'TAURUS', 'GEMINI', 'CANCER', 'LEO', 'VIRGO', 'LIBRA', 'SCORPIO', 'SAGITTARIUS', 'CAPRICORN', 'AQUARIUS', 'PISCES']

const PLANET_GLYPH: Record<string, string> = {
  Sun: '☉' + VS, Moon: '☽' + VS, Mercury: '☿' + VS, Venus: '♀' + VS, Mars: '♂' + VS,
  Jupiter: '♃' + VS, Saturn: '♄' + VS, Uranus: '♅' + VS, Neptune: '♆' + VS,
  Pluto: '♇' + VS, Rahu: '☊' + VS, Ketu: '☋' + VS,
}
const PLANET_ORDER = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Rahu', 'Ketu']

const DIGNITIES: Record<string, { domicile: string[]; exaltation: string; detriment: string[]; fall: string }> = {
  Sun: { domicile: ['Leo'], exaltation: 'Aries', detriment: ['Aquarius'], fall: 'Libra' },
  Moon: { domicile: ['Cancer'], exaltation: 'Taurus', detriment: ['Capricorn'], fall: 'Scorpio' },
  Mercury: { domicile: ['Gemini', 'Virgo'], exaltation: 'Virgo', detriment: ['Sagittarius', 'Pisces'], fall: 'Pisces' },
  Venus: { domicile: ['Taurus', 'Libra'], exaltation: 'Pisces', detriment: ['Aries', 'Scorpio'], fall: 'Virgo' },
  Mars: { domicile: ['Aries', 'Scorpio'], exaltation: 'Capricorn', detriment: ['Taurus', 'Libra'], fall: 'Cancer' },
  Jupiter: { domicile: ['Sagittarius', 'Pisces'], exaltation: 'Cancer', detriment: ['Gemini', 'Virgo'], fall: 'Capricorn' },
  Saturn: { domicile: ['Capricorn', 'Aquarius'], exaltation: 'Libra', detriment: ['Cancer', 'Leo'], fall: 'Aries' },
}
function dignityOf(planet: string, sign: string): string {
  const d = DIGNITIES[planet]
  if (!d) return ''
  if (d.domicile.includes(sign)) return 'domicile'
  if (d.exaltation === sign) return 'exaltation'
  if (d.detriment.includes(sign)) return 'detriment'
  if (d.fall === sign) return 'fall'
  return ''
}

const norm = (x: number) => ((x % 360) + 360) % 360
function dms(v: number): string {
  v = Math.max(0, v)
  let d = Math.floor(v)
  let m = Math.round((v - d) * 60)
  if (m === 60) { d++; m = 0 }
  return d + '°' + String(m).padStart(2, '0') + '′'
}
function lonStr(lon: number): string {
  const L = norm(lon), s = Math.floor(L / 30)
  return dms(L % 30) + ' ' + SG[s]
}

// Major aspects, frame-invariant (both systems shift by the same ayanamsa).
const ASPECT_DEFS: [number, number, 'hard' | 'soft'][] = [
  [180, 7, 'hard'], [120, 6, 'soft'], [90, 6, 'hard'], [60, 4, 'soft'],
]
function computeAspects(lonOf: Record<string, number>): [string, string, 'hard' | 'soft'][] {
  const ids = Object.keys(lonOf)
  const out: [string, string, 'hard' | 'soft'][] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      let d = Math.abs(norm(lonOf[ids[i]] - lonOf[ids[j]]))
      if (d > 180) d = 360 - d
      for (const [ang, orb, kind] of ASPECT_DEFS) {
        if (Math.abs(d - ang) <= orb) { out.push([ids[i], ids[j], kind]); break }
      }
    }
  }
  return out
}

const TREATMENT_LETTER: Record<string, 'A' | 'B' | 'C'> = { graticule: 'A', plate: 'B', stellar: 'C' }

interface FrameShiftWheelProps {
  data: DualChartData
  frame: 'tropical' | 'sidereal'
  onFrameChange: (frame: 'tropical' | 'sidereal') => void
  displayLocation?: string
  treatment?: 'graticule' | 'plate' | 'stellar'
}

interface ReadoutRow {
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

export default function FrameShiftWheel({
  data, frame, onFrameChange, displayLocation, treatment = 'stellar',
}: FrameShiftWheelProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const deltaRef = useRef<HTMLDivElement>(null)
  const btnTRef = useRef<HTMLButtonElement>(null)
  const btnSRef = useRef<HTMLButtonElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)
  const builtRef = useRef(false)
  const aRef = useRef(0)
  const apiRef = useRef<{ setA: (a: number) => void; AY: number } | null>(null)
  const aspectElsRef = useRef<Record<string, SVGElement[]>>({})
  const onSelectRef = useRef<(id: string) => void>(() => {})

  const [selected, setSelected] = useState<string | null>(null)

  const { tropical, sidereal, ayanamsa } = data

  // ── casting header line (real) ──────────────────────────────
  const castingLine = useMemo(() => {
    const b = data.birthData
    const loc = displayLocation || (b.tzName ? b.tzName.split('/').pop()?.replace(/_/g, ' ') : 'Unknown location')
    const dateStr = new Date(b.year, b.month - 1, b.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()
    let timeStr = 'TIME UNKNOWN'
    if (!b.birthTimeUnknown) {
      const isPM = b.hour >= 12
      const h = b.hour % 12 || 12
      timeStr = `${h}:${String(b.minute).padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`
    }
    return `${loc} · ${dateStr} · ${timeStr}`
  }, [data.birthData, displayLocation])

  // ── readout rows (both frames, always) ──────────────────────
  const rows = useMemo<ReadoutRow[]>(() => {
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
  }, [tropical, sidereal])

  // ── build the wheel once (imperative, mirrors the prototype) ──
  useEffect(() => {
    if (builtRef.current || !svgRef.current) return
    builtRef.current = true

    const SVGNS = 'http://www.w3.org/2000/svg'
    const CX = 450, CY = 450, D2R = Math.PI / 180
    const LREF = tropical.ascendant
    const AY = ayanamsa
    const variant = TREATMENT_LETTER[treatment] ?? 'C'

    const alpha = (lon: number) => norm(180 - (lon - LREF))
    const pt = (lon: number, r: number): [number, number] => {
      const a = alpha(lon) * D2R
      return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
    }
    const mk = (tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement => {
      const el = document.createElementNS(SVGNS, tag) as SVGElement
      for (const k in attrs) el.setAttribute(k, String(attrs[k]))
      if (parent) parent.appendChild(el)
      return el
    }
    const arcPath = (l0: number, l1: number, r: number) => {
      const [x0, y0] = pt(l0, r), [x1, y1] = pt(l1, r)
      const span = norm(l1 - l0)
      return 'M ' + x0 + ' ' + y0 + ' A ' + r + ' ' + r + ' 0 ' + (span > 180 ? 1 : 0) + ' 0 ' + x1 + ' ' + y1
    }
    const annulusSeg = (l0: number, l1: number, r0: number, r1: number) => {
      const [ax, ay] = pt(l0, r1), [bx, by] = pt(l1, r1), [cx2, cy2] = pt(l1, r0), [dx, dy] = pt(l0, r0)
      const span = norm(l1 - l0), la = span > 180 ? 1 : 0
      return 'M ' + ax + ' ' + ay + ' A ' + r1 + ' ' + r1 + ' 0 ' + la + ' 0 ' + bx + ' ' + by + ' L ' + cx2 + ' ' + cy2 + ' A ' + r0 + ' ' + r0 + ' 0 ' + la + ' 1 ' + dx + ' ' + dy + ' Z'
    }
    const straightLabel = (parent: Element, L: number, r: number, txt: string, fs: string, ls: string, fill: string, op: string) => {
      const eff = ((alpha(L) + 90) % 360 + 360) % 360
      const [x, y] = pt(L, r)
      let rot = alpha(L) + 90
      if (eff > 90 && eff < 270) rot += 180
      const t = mk('text', {
        x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': fs, 'letter-spacing': ls, fill, opacity: op,
        transform: 'rotate(' + rot + ' ' + x + ' ' + y + ')',
      }, parent)
      t.textContent = txt
    }

    // ── data arrays from the engine ──
    const tMap = Object.fromEntries(tropical.planets.map(p => [p.name, p]))
    interface Body { id: string; n: string; g: string; lon: number; r: number }
    const bodyList: Body[] = PLANET_ORDER
      .filter(name => tMap[name])
      .map(name => ({ id: name.toLowerCase(), n: name.toUpperCase(), g: PLANET_GLYPH[name] ?? '', lon: tMap[name].longitude, r: 262 }))
    // radial spread so clustered bodies stay legible
    {
      const sorted = [...bodyList].sort((a, b) => a.lon - b.lon)
      let lastLon = -99, tier = 0
      for (const b of sorted) {
        if (norm(b.lon - lastLon) < 9) { tier = (tier + 1) % 3 } else { tier = 0 }
        b.r = 262 - tier * 13
        lastLon = b.lon
      }
    }
    const ANGLES = [
      { id: 'asc', n: 'ASC', lon: tropical.ascendant },
      { id: 'mc', n: 'MC', lon: tropical.midheaven },
      { id: 'dsc', n: 'DSC', lon: norm(tropical.ascendant + 180) },
      { id: 'ic', n: 'IC', lon: norm(tropical.midheaven + 180) },
    ]
    const lonOf: Record<string, number> = {}
    bodyList.forEach(b => { lonOf[b.id] = b.lon })
    lonOf['asc'] = tropical.ascendant
    lonOf['mc'] = tropical.midheaven
    const ASPECTS = computeAspects(lonOf)
    const TROP_ASC_SIGN = Math.floor(norm(tropical.ascendant) / 30)
    const SID_ASC_SIGN = Math.floor(norm(sidereal.ascendant) / 30)

    // ── scaffold ──
    const svg = svgRef.current
    const gRoot = mk('g', {}, svg)
    const gStatic = mk('g', {}, gRoot)
    const gBand = mk('g', {}, gRoot)
    const gNak = mk('g', {}, gRoot)
    const gGhost = mk('g', {}, gRoot)
    const gNums = mk('g', {}, gRoot)
    const gSky = mk('g', {}, gRoot)
    const gFid = mk('g', {}, gRoot)
    const gFx = mk('g', {}, gRoot)

    // static rings
    ;([[408, .20], [396, .20], [336, .18], [218, .12]] as [number, number][]).forEach(([r, o]) =>
      mk('circle', { cx: CX, cy: CY, r, fill: 'none', stroke: 'rgba(234,232,248,' + o + ')', 'stroke-width': 1 }, gStatic))
    const gRims = mk('g', {}, gStatic)
    ;([[414, .10], [302, .08]] as [number, number][]).forEach(([r, o]) =>
      mk('circle', { cx: CX, cy: CY, r, fill: 'none', stroke: 'rgba(234,232,248,' + o + ')', 'stroke-width': 1 }, gRims))
    const gStarsIn = mk('g', {}, gStatic)
    { // seeded inner starfield (stellar)
      let s = 1994
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
      for (let i = 0; i < 44; i++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 200
        mk('circle', { cx: (CX + rr * Math.cos(a)).toFixed(2), cy: (CY + rr * Math.sin(a)).toFixed(2), r: (.5 + rnd() * 1.1).toFixed(2), fill: 'rgba(234,232,248,' + (0.12 + rnd() * 0.20).toFixed(3) + ')' }, gStarsIn)
      }
    }

    // moving band
    const glyphEls: { el: SVGElement; x: number; y: number }[] = []
    for (let i = 0; i < 12; i++) {
      if (i % 2 === 0) mk('path', { d: annulusSeg(i * 30, (i + 1) * 30, 336, 396), fill: 'rgba(110,140,255,.045)' }, gBand)
    }
    for (let d = 0; d < 360; d++) {
      if (d % 30 === 0) continue
      const len = d % 10 === 0 ? 12 : (d % 5 === 0 ? 8.5 : 5), op = d % 10 === 0 ? .60 : (d % 5 === 0 ? .42 : .24)
      const [x0, y0] = pt(d, 396), [x1, y1] = pt(d, 396 + len)
      mk('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: 'rgba(234,232,248,' + op + ')', 'stroke-width': 1 }, gBand)
    }
    for (let i = 0; i < 12; i++) {
      const [x0, y0] = pt(i * 30, 336), [x1, y1] = pt(i * 30, 408)
      mk('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: 'rgba(234,232,248,.55)', 'stroke-width': 1 }, gBand)
      const [gx, gy] = pt(i * 30 + 15, 367)
      const t = mk('text', { x: gx, y: gy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 19, fill: '#F0B978' }, gBand)
      t.textContent = SG[i]
      glyphEls.push({ el: t, x: gx, y: gy })
    }
    const gNames = mk('g', {}, gBand)
    ;(gNames as SVGElement).style.transition = 'opacity .28s'
    const rebuildNames = () => {
      while (gNames.firstChild) gNames.removeChild(gNames.firstChild)
      for (let i = 0; i < 12; i++) straightLabel(gNames, i * 30 + 15, 347, SIGN_NAMES[i], '10', '2.2', '#F0B978', '.72')
    }

    // fixed star (nakshatra) ring — stellar
    for (let n = 0; n < 27; n++) {
      const L = n * (360 / 27) + AY
      const [x0, y0] = pt(L, 313), [x1, y1] = pt(L, 335)
      mk('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: 'rgba(234,232,248,.24)', 'stroke-width': 1 }, gNak)
    }
    mk('circle', { cx: CX, cy: CY, r: 312, fill: 'none', stroke: 'rgba(234,232,248,.10)', 'stroke-width': 1 }, gNak)
    for (let n = 0; n < 27; n++) {
      const Lc = n * (360 / 27) + 360 / 27 / 2 + AY
      straightLabel(gNak, Lc, 321, NAKS[n], '7.4', '.7', 'rgba(234,232,248,.55)', '1')
    }

    // ghost anchors — both rulers (plate)
    for (let i = 0; i < 12; i++) {
      ;[0, AY].forEach(off => {
        const [x0, y0] = pt(i * 30 + off, 397), [x1, y1] = pt(i * 30 + off, 407)
        mk('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: 'rgba(234,232,248,.12)', 'stroke-width': 1, 'stroke-dasharray': '2 3' }, gGhost)
      })
    }

    // whole-sign house numerals (crossfade, plate)
    const NUMOP = .38
    const gNumT = mk('g', { opacity: NUMOP }, gNums), gNumS = mk('g', { opacity: 0 }, gNums)
    for (let h = 0; h < 12; h++) {
      const sT = (TROP_ASC_SIGN + h) % 12, sS = (SID_ASC_SIGN + h) % 12
      const [tx, ty] = pt(sT * 30 + 15, 296)
      const tT = mk('text', { x: tx, y: ty, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 10, fill: '#EAE8F8' }, gNumT); tT.textContent = ROMAN[h]
      const [sx, sy] = pt(sS * 30 + 15 + AY, 296)
      const tS = mk('text', { x: sx, y: sy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 10, fill: '#EAE8F8' }, gNumS); tS.textContent = ROMAN[h]
    }

    // axes
    ANGLES.slice(0, 2).forEach(ax => {
      const [x0, y0] = pt(ax.lon, 410), [x1, y1] = pt(ax.lon + 180, 410)
      mk('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: 'rgba(234,232,248,.20)', 'stroke-width': 1 }, gSky)
    })
    ;([[-1.4, 0], [0, 1.4]] as [number, number][]).forEach(p => {
      const [x0, y0] = pt(tropical.ascendant + p[0], 402), [x1, y1] = pt(tropical.ascendant + p[1], 416)
      mk('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: 'rgba(234,232,248,.5)', 'stroke-width': 1 }, gSky)
    })

    // aspect web (drawn once — frame-invariant)
    const aspectEls: Record<string, SVGElement[]> = {}
    ASPECTS.forEach(([a, b, kind]) => {
      const [x0, y0] = pt(lonOf[a], 218), [x1, y1] = pt(lonOf[b], 218)
      const l = mk('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: 'rgba(234,232,248,' + (kind === 'hard' ? .40 : .26) + ')', 'stroke-width': 1, 'stroke-dasharray': kind === 'hard' ? 'none' : '3 4' }, gSky)
      ;(aspectEls[a] = aspectEls[a] || []).push(l)
      ;(aspectEls[b] = aspectEls[b] || []).push(l)
    })
    aspectElsRef.current = aspectEls
    Object.keys(lonOf).forEach(id => {
      const [x, y] = pt(lonOf[id], 218)
      mk('circle', { cx: x, cy: y, r: 2, fill: 'rgba(234,232,248,.65)' }, gSky)
    })
    mk('line', { x1: CX - 7, y1: CY, x2: CX + 7, y2: CY, stroke: 'rgba(234,232,248,.35)', 'stroke-width': 1 }, gSky)
    mk('line', { x1: CX, y1: CY - 7, x2: CX, y2: CY + 7, stroke: 'rgba(234,232,248,.35)', 'stroke-width': 1 }, gSky)

    // planets
    interface Sweep { id: string; lon: number; px: number; py: number; glyphEl: SVGElement | null; degEl: SVGElement; lastS: number }
    const SWEEP: Sweep[] = []
    bodyList.forEach(b => {
      const [px, py] = pt(b.lon, b.r)
      const [hx0, hy0] = pt(b.lon, 336), [hx1, hy1] = pt(b.lon, b.r + 18)
      mk('line', { x1: hx0, y1: hy0, x2: hx1, y2: hy1, stroke: 'rgba(234,232,248,.32)', 'stroke-width': 1 }, gSky)
      const glyph = mk('text', { x: px, y: py, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 21, fill: '#EAE8F8', cursor: 'pointer' }, gSky)
      glyph.textContent = b.g
      const [dx, dy] = pt(b.lon, b.r - 24)
      const deg = mk('text', { x: dx, y: dy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 8.8, 'letter-spacing': .5, fill: 'rgba(234,232,248,.72)' }, gSky)
      const hit = mk('circle', { cx: px, cy: py, r: 22, fill: 'transparent', cursor: 'pointer' }, gSky)
      const onClick = (e: Event) => { e.stopPropagation(); onSelectRef.current(b.id) }
      hit.addEventListener('click', onClick)
      glyph.addEventListener('click', onClick)
      SWEEP.push({ id: b.id, lon: b.lon, px, py, glyphEl: glyph, degEl: deg, lastS: Math.floor(b.lon / 30) })
    })

    // angle labels
    const ANGLE_LBL: Record<string, { x: number; y: number; anchor: string }> = {
      asc: { x: 14, y: 442, anchor: 'start' }, dsc: { x: 886, y: 442, anchor: 'end' },
      mc: { x: 398, y: 26, anchor: 'middle' }, ic: { x: 502, y: 882, anchor: 'middle' },
    }
    ANGLES.forEach(ax => {
      const cfg = ANGLE_LBL[ax.id]
      const t = mk('text', { x: cfg.x, y: cfg.y, 'text-anchor': cfg.anchor, 'font-size': 10, 'letter-spacing': 2, fill: 'rgba(234,232,248,.85)' }, gSky)
      t.textContent = ax.n
      const d = mk('text', { x: cfg.x, y: cfg.y + 14, 'text-anchor': cfg.anchor, 'font-size': 8.6, 'letter-spacing': .5, fill: 'rgba(234,232,248,.5)' }, gSky)
      SWEEP.push({ id: ax.id, lon: ax.lon, px: cfg.x, py: cfg.y, glyphEl: null, degEl: d, lastS: Math.floor(ax.lon / 30) })
    })

    // fiducials + offset arc (always drawn)
    {
      const [t0x, t0y] = pt(0, 408), [t1x, t1y] = pt(0, 436)
      mk('line', { x1: t0x, y1: t0y, x2: t1x, y2: t1y, stroke: '#F0B978', 'stroke-width': 1, opacity: .9 }, gFid)
      const [s0x, s0y] = pt(AY, 408), [s1x, s1y] = pt(AY, 436)
      mk('line', { x1: s0x, y1: s0y, x2: s1x, y2: s1y, stroke: '#F0B978', 'stroke-width': 1, opacity: .9, 'stroke-dasharray': '3 3' }, gFid)
      mk('path', { d: arcPath(0, AY, 426), fill: 'none', stroke: '#F0B978', 'stroke-width': 1.2, opacity: .85 }, gFid)
      const [mx, my] = pt(AY / 2, 449)
      const lbl = mk('text', { x: mx, y: my, 'text-anchor': 'middle', 'font-size': 11.5, 'letter-spacing': 1.5, fill: '#F0B978' }, gFid)
      lbl.textContent = 'Δ ' + dms(AY)
      const [ax0, ay0] = pt(0, 452)
      const l1 = mk('text', { x: ax0, y: ay0, 'text-anchor': 'middle', 'font-size': 7.6, 'letter-spacing': 1, fill: '#F0B978', opacity: .85 }, gFid)
      l1.textContent = '0°' + SG[0] + ' TROPICAL'
      const [bx, by] = pt(AY, 452)
      const l2 = mk('text', { x: bx, y: by - 14, 'text-anchor': 'end', 'font-size': 7.6, 'letter-spacing': 1, fill: '#F0B978', opacity: .85 }, gFid)
      l2.textContent = '0°' + SG[0] + ' SIDEREAL'
    }

    // pulse fx on sign-cross during rotation
    let suppressFx = true
    const pulse = (sw: Sweep) => {
      if (suppressFx) return
      const c = mk('circle', { cx: sw.px, cy: sw.py, r: 5, fill: 'none', stroke: '#F0B978', 'stroke-width': 1.4, opacity: .9 }, gFx)
      const t0 = performance.now()
      const anim = (now: number) => {
        const p = Math.min(1, (now - t0) / 560)
        c.setAttribute('r', String(5 + p * 27)); c.setAttribute('opacity', String((1 - p) * .9))
        if (p < 1) requestAnimationFrame(anim); else gFx.removeChild(c)
      }
      requestAnimationFrame(anim)
      if (sw.glyphEl) { sw.glyphEl.setAttribute('fill', '#F0B978'); setTimeout(() => sw.glyphEl?.setAttribute('fill', '#EAE8F8'), 620) }
    }

    // the core: rotate the band by −a; planets stay; degrees recount
    const setA = (a: number) => {
      aRef.current = a
      gBand.setAttribute('transform', 'rotate(' + (-a) + ' ' + CX + ' ' + CY + ')')
      glyphEls.forEach(o => o.el.setAttribute('transform', 'rotate(' + a + ' ' + o.x + ' ' + o.y + ')'))
      const q = AY > 0 ? a / AY : 0
      gNumT.setAttribute('opacity', ((1 - q) * NUMOP).toFixed(3))
      gNumS.setAttribute('opacity', (q * NUMOP).toFixed(3))
      if (deltaRef.current) deltaRef.current.textContent = 'Δ ' + dms(a)
      SWEEP.forEach(sw => {
        const dl = norm(sw.lon - a), s = Math.floor(dl / 30)
        sw.degEl.textContent = dms(dl % 30) + ' ' + SG[s]
        if (s !== sw.lastS) { pulse(sw); sw.lastS = s }
      })
    }

    // treatment visibility
    ;(gNames as SVGElement).style.display = variant === 'B' ? '' : 'none'
    ;(gNums as SVGElement).style.display = variant === 'B' ? '' : 'none'
    ;(gGhost as SVGElement).style.display = variant === 'B' ? '' : 'none'
    ;(gRims as SVGElement).style.display = variant === 'B' ? '' : 'none'
    ;(gNak as SVGElement).style.display = variant === 'C' ? '' : 'none'
    ;(gStarsIn as SVGElement).style.display = variant === 'C' ? '' : 'none'
    if (variant === 'B') rebuildNames()

    apiRef.current = { setA, AY }
    setA(frame === 'sidereal' ? AY : 0)
    suppressFx = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── animate on frame change (the shift) ──
  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const target = frame === 'sidereal' ? api.AY : 0
    const from = aRef.current
    if (Math.abs(from - target) < 1e-4) { api.setA(target); return }
    if (reduced) { api.setA(target); return }
    const DUR = 2600
    const ease = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    let raf = 0
    const t0 = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / DUR)
      api.setA(from + (target - from) * ease(p))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [frame])

  // ── keep the toggle underline under the active button ──
  useEffect(() => {
    const place = () => {
      const btn = frame === 'sidereal' ? btnSRef.current : btnTRef.current
      const slider = sliderRef.current
      if (!btn || !slider) return
      slider.style.left = btn.offsetLeft + 'px'
      slider.style.width = btn.offsetWidth + 'px'
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [frame])

  // ── selection dims the rest of the aspect web ──
  useEffect(() => {
    onSelectRef.current = (id: string) => setSelected(s => (s === id ? null : id))
  })
  useEffect(() => {
    const map = aspectElsRef.current
    const all = new Set<SVGElement>()
    Object.values(map).forEach(a => a.forEach(l => all.add(l)))
    all.forEach(l => l.setAttribute('opacity', '1'))
    if (selected) {
      const mine = new Set(map[selected] || [])
      all.forEach(l => { if (!mine.has(l)) l.setAttribute('opacity', '.28') })
    }
  }, [selected])

  const selRow = selected ? rows.find(r => r.id === selected) ?? null : null

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.ax}>AXIS</span>
          <span className={styles.sub}>FRAME-SHIFT WHEEL</span>
        </div>
        <div className={styles.meta}>
          {castingLine} · WHOLE SIGN · {'☊' + VS} TRUE NODE · LAHIRI {dms(ayanamsa)}
        </div>
      </header>

      <div className={styles.main}>
        <section className={styles.stage}>
          <svg
            ref={svgRef}
            className={styles.wheel}
            viewBox="0 0 900 900"
            role="img"
            aria-label="Frame-shift chart wheel: one sky, the zodiac ring rotates between tropical and sidereal alignment"
            onClick={() => setSelected(null)}
          />
          <div className={styles.caption}>ONE SKY · TWO RULERS</div>
          <div className={styles.frameToggle}>
            <button
              ref={btnTRef}
              type="button"
              className={`${styles.tbtn} ${frame === 'tropical' ? styles.tbtnOn : ''}`}
              aria-pressed={frame === 'tropical'}
              onClick={() => onFrameChange('tropical')}
            >TROPICAL</button>
            <div className={styles.delta}>
              <div ref={deltaRef} className={styles.deltaVal}>Δ {dms(frame === 'sidereal' ? ayanamsa : 0)}</div>
              <div className={styles.dsub}>LAHIRI OFFSET {dms(ayanamsa)}</div>
            </div>
            <button
              ref={btnSRef}
              type="button"
              className={`${styles.tbtn} ${frame === 'sidereal' ? styles.tbtnOn : ''}`}
              aria-pressed={frame === 'sidereal'}
              onClick={() => onFrameChange('sidereal')}
            >SIDEREAL</button>
            <div ref={sliderRef} className={styles.slider} />
          </div>
          <div className={styles.status} role="status" aria-live="polite">
            {`// FRAME: ${frame === 'sidereal' ? 'SIDEREAL' : 'TROPICAL'}`}
          </div>

          {selRow && (
            <div className={styles.callout}>
              <button className={styles.calloutClose} aria-label="Close" onClick={() => setSelected(null)}>×</button>
              <span className={styles.cname}>{selRow.glyph ? selRow.glyph + ' ' : ''}{selRow.name}</span><br />
              TROPICAL&nbsp; {lonStr(selRow.tLon)}<br />
              SIDEREAL&nbsp; {lonStr(selRow.sLon)}<br />
              <span className={styles.cverdict}>
                {selRow.flip
                  ? `SHIFTS · ${SG[selRow.tSign]} → ${SG[selRow.sSign]}`
                  : `HOLDS ${SG[selRow.tSign]} · MARGIN ${dms(Math.abs((norm(selRow.tLon) % 30) - ayanamsa))}`}
              </span>
            </div>
          )}
        </section>

        <aside className={styles.rail}>
          <h2 className={styles.railH2}>READOUT — BOTH FRAMES, ALWAYS CO-VISIBLE</h2>
          <div className={styles.tableScroll}>
            <table className={styles.table} data-frame={frame}>
              <thead>
                <tr>
                  <th>BODY</th>
                  <th className={styles.thCt}>TROPICAL</th>
                  <th className={styles.thCs}>SIDEREAL</th>
                  <th>Δ SIGN</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr
                    key={r.id}
                    className={`${styles.rowClickable} ${selected === r.id ? styles.rowSel : ''}`}
                    onClick={() => setSelected(s => (s === r.id ? null : r.id))}
                  >
                    <td className={styles.bname}>
                      {r.glyph && <span className={styles.bglyph}>{r.glyph} </span>}{r.name}
                      {r.retro && <span className={styles.retro}>℞</span>}
                    </td>
                    <td className={styles.ct}>
                      {lonStr(r.tLon)}
                      {r.tHouse != null && <span className={styles.house}>H{r.tHouse}</span>}
                      {r.tDignity && <span className={styles.dignity}>{r.tDignity}</span>}
                    </td>
                    <td className={styles.cs}>
                      {lonStr(r.sLon)}
                      {r.sHouse != null && <span className={styles.house}>H{r.sHouse}</span>}
                      {r.sDignity && <span className={styles.dignity}>{r.sDignity}</span>}
                      {r.nakshatra && (
                        <span className={styles.nak}>{r.nakshatra}{r.nakPada != null ? ` · pada ${r.nakPada}` : ''}</span>
                      )}
                    </td>
                    <td className={`${styles.dsig} ${r.flip ? styles.flip : styles.hold}`}>
                      {r.flip ? `${SG[r.tSign]} → ${SG[r.sSign]}` : `${SG[r.tSign]} · ${SG[r.sSign]}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.legend}>
            SOLID HAIRLINE — SQUARE · OPPOSITION&nbsp;&nbsp;·&nbsp;&nbsp;DASHED — TRINE · SEXTILE<br />
            THE WEB IS DRAWN ONCE. IT DOES NOT ROTATE.<br />
            {'☊' + VS} {'☋' + VS} TRUE (OSCULATING) NODE&nbsp;&nbsp;·&nbsp;&nbsp;HOUSES: WHOLE SIGN<br />
            <span className={styles.g}>◆</span> SIGN SHIFTS BETWEEN FRAMES&nbsp;&nbsp;·&nbsp;&nbsp;TAP A BODY FOR BOTH READINGS
          </div>
          <p className={styles.footnote}>
            The planets do not move. Between the tropical and sidereal castings every body keeps its place in the sky and every aspect keeps its angle; what turns is the ring of signs beneath them — {dms(ayanamsa)} of offset between the seasonal calendar and the stars.
          </p>
        </aside>
      </div>

      <footer className={styles.footer}>TWO SYSTEMS. ONE DIVERGENCE. · Δ {dms(ayanamsa)} LAHIRI</footer>
    </div>
  )
}
