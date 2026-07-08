'use client'
import { useState } from 'react'
import { DualChartData, ChartData, PlanetPosition } from '@/lib/astro-calc'

/**
 * DualChartWheel — a bi-wheel comparing the Tropical and Sidereal charts on one
 * shared zodiac. Both charts are plotted in the SAME fixed frame (oriented to
 * the chosen chart's ascendant), so the ~24° ayanamsa shift between a planet's
 * tropical and sidereal longitude is visible as the radial pairing between the
 * outer ring (Tropical) and inner ring (Sidereal).
 *
 * Self-contained: no CSS module required. Plotting math, symbols, and collision
 * spreading mirror ChartWheel.tsx so the two components read identically.
 */

interface DualChartWheelProps {
  data: DualChartData
  /** Pixel size of the square SVG. Default 360. */
  size?: number
  /** Which chart's ascendant fixes the wheel's orientation. Default 'tropical'. */
  orient?: 'tropical' | 'sidereal'
}

// ︎ = Variation Selector-15: forces text (not emoji) presentation on Windows/Chrome
const VS = '︎'
const SIGN_SYMBOLS = [`♈${VS}`,`♉${VS}`,`♊${VS}`,`♋${VS}`,`♌${VS}`,`♍${VS}`,`♎${VS}`,`♏${VS}`,`♐${VS}`,`♑${VS}`,`♒${VS}`,`♓${VS}`]
const PLANET_SYMBOLS: Record<string, string> = {
  Sun: `☉${VS}`, Moon: `☽${VS}`, Mercury: `☿${VS}`, Venus: `♀${VS}`, Mars: `♂${VS}`,
  Jupiter: `♃${VS}`, Saturn: `♄${VS}`, Uranus: `♅${VS}`, Neptune: `♆${VS}`,
  Pluto: `♇${VS}`, Rahu: `☊${VS}`, Ketu: `☋${VS}`,
}

// Element-tinted sign-band fills (Fire, Earth, Air, Water repeating)
const SIGN_COLORS = [
  '#7A4A28', '#24242E', '#22303E', '#223A55',
  '#7A4A28', '#24242E', '#22303E', '#223A55',
  '#7A4A28', '#24242E', '#22303E', '#223A55',
]
const GLYPH_COLORS = [
  '#D9B06A', '#D8CCB8', '#C8D3E0', '#D9DFE8',
  '#D9B06A', '#D8CCB8', '#C8D3E0', '#D9DFE8',
  '#D9B06A', '#D8CCB8', '#C8D3E0', '#D9DFE8',
]

// Per-system accent colours. Tropical = gold (app primary); Sidereal = cyan so
// the two rings stay legible at a glance. Retrograde is shown with an ℞ tag
// rather than colour, to avoid clashing with the system palette.
const SYSTEM_COLOR: Record<'tropical' | 'sidereal', string> = {
  tropical: '#FFC030',
  sidereal: '#6FC6D6',
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// Spread planets that fall within `threshold` degrees of each other by nudging
// them radially (and slightly angularly) so glyphs don't overlap.
function spreadPlanets(planets: PlanetPosition[], threshold = 10) {
  const sorted = [...planets].sort((a, b) => a.longitude - b.longitude)
  const result: Array<PlanetPosition & { radialOffset: number; angularNudge: number }> = []

  for (let i = 0; i < sorted.length; i++) {
    const prev = result[i - 1]
    const lon  = sorted[i].longitude
    const diff = prev ? ((lon - prev.longitude + 360) % 360) : threshold + 1

    let radialOffset = 0
    let angularNudge = 0
    if (diff < threshold) {
      const clusterDepth = prev?.radialOffset === 0 ? 1 : 0
      radialOffset = clusterDepth === 0 ? -10 : 10
      angularNudge = diff < 4 ? (i % 2 === 0 ? 2 : -2) : 0
    }
    result.push({ ...sorted[i], radialOffset, angularNudge })
  }
  return result
}

function getDignityLabel(planetName: string, sign: string): string {
  const DIGNITIES: Record<string, { domicile: string[]; exaltation: string; detriment: string[]; fall: string }> = {
    Sun:     { domicile: ['Leo'],                   exaltation: 'Aries',     detriment: ['Aquarius'],              fall: 'Libra'     },
    Moon:    { domicile: ['Cancer'],                exaltation: 'Taurus',    detriment: ['Capricorn'],             fall: 'Scorpio'   },
    Mercury: { domicile: ['Gemini', 'Virgo'],       exaltation: 'Virgo',     detriment: ['Sagittarius', 'Pisces'], fall: 'Pisces'    },
    Venus:   { domicile: ['Taurus', 'Libra'],       exaltation: 'Pisces',    detriment: ['Aries', 'Scorpio'],      fall: 'Virgo'     },
    Mars:    { domicile: ['Aries', 'Scorpio'],      exaltation: 'Capricorn', detriment: ['Taurus', 'Libra'],       fall: 'Cancer'    },
    Jupiter: { domicile: ['Sagittarius', 'Pisces'], exaltation: 'Cancer',    detriment: ['Gemini', 'Virgo'],       fall: 'Capricorn' },
    Saturn:  { domicile: ['Capricorn', 'Aquarius'], exaltation: 'Libra',     detriment: ['Cancer', 'Leo'],         fall: 'Aries'     },
  }
  const d = DIGNITIES[planetName]
  if (!d) return ''
  if (d.domicile.includes(sign) && d.exaltation === sign) return 'Domicile + Exalt.'
  if (d.detriment.includes(sign) && d.fall === sign)      return 'Detriment + Fall'
  if (d.domicile.includes(sign))  return 'Domicile'
  if (d.exaltation === sign)       return 'Exaltation'
  if (d.detriment.includes(sign))  return 'Detriment'
  if (d.fall === sign)             return 'Fall'
  return ''
}

function fmtDeg(deg: number): string {
  let d = Math.floor(deg)
  let m = Math.round((deg - d) * 60)
  if (m === 60) { d += 1; m = 0 }
  return `${d}°${String(m).padStart(2, '0')}'`
}

export default function DualChartWheel({ data, size = 360, orient = 'tropical' }: DualChartWheelProps) {
  // Selection is by planet NAME — one tap lights the planet in BOTH systems.
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const cx = size / 2
  const cy = size / 2

  // Radii scaled to the requested size (base ratios tuned at 360px).
  const k = size / 360
  const signBandOuter = 168 * k
  const signBandInner = 140 * k
  const signLabelR    = 154 * k
  const outerPlanetR  = 122 * k   // Tropical ring
  const ringDivider   = 106 * k
  const innerPlanetR  =  86 * k   // Sidereal ring
  const innerR        =  64 * k
  const coreR         =  12 * k

  // The wheel is fixed to one chart's ascendant; both charts plot in this frame.
  const orientChart: ChartData = orient === 'sidereal' ? data.sidereal : data.tropical
  const ascAngle = orientChart.ascendant
  const zodiacAngle = (lon: number) => ((lon - ascAngle + 180) + 360) % 360

  const tropPlanets = spreadPlanets(data.tropical.planets)
  const sidPlanets  = spreadPlanets(data.sidereal.planets)

  // Angle ticks for both systems (they differ by the ayanamsa). The MC is its
  // own angle — never collapsed into the Whole Sign 10th-house cusp.
  const acTrop = zodiacAngle(data.tropical.ascendant)
  const acSid  = zodiacAngle(data.sidereal.ascendant)
  const mcTrop = zodiacAngle(data.tropical.midheaven)
  const mcSid  = zodiacAngle(data.sidereal.midheaven)

  // The selected planet, resolved in BOTH systems — the pair is the point.
  const selT = selectedName ? tropPlanets.find(p => p.name === selectedName) ?? null : null
  const selS = selectedName ? sidPlanets.find(p => p.name === selectedName) ?? null : null
  // Tropical minus sidereal longitude: the ayanamsa, rendered per planet.
  const gapDelta = selT && selS ? ((selT.longitude - selS.longitude) + 360) % 360 : 0
  const signShifted = !!(selT && selS && selT.sign !== selS.sign)
  const tropDignity = selT ? getDignityLabel(selT.name, selT.sign) : ''
  const sidDignity  = selS ? getDignityLabel(selS.name, selS.sign) : ''

  function renderPlanetRing(
    planets: Array<PlanetPosition & { radialOffset: number; angularNudge: number }>,
    baseR: number,
    system: 'tropical' | 'sidereal',
  ) {
    const color = SYSTEM_COLOR[system]
    return planets.map((planet) => {
      const angle  = zodiacAngle(planet.longitude + planet.angularNudge)
      const r      = baseR + planet.radialOffset
      const pos    = polarToCartesian(cx, cy, r, angle)
      const symbol = PLANET_SYMBOLS[planet.name] || planet.name[0]
      const isSel  = selectedName === planet.name
      const label  = `${system} ${planet.name} in ${planet.sign} ${fmtDeg(planet.degree)}, house ${planet.house}${planet.retrograde ? ', retrograde' : ''}. Selecting highlights this planet in both systems.`

      return (
        <g
          key={`${system}-${planet.name}`}
          opacity={selectedName && !isSel ? 0.4 : 1}
          style={{ cursor: 'pointer', transition: 'opacity 160ms ease' }}
          role="button"
          tabIndex={0}
          aria-label={label}
          aria-pressed={isSel}
          onClick={(e) => { e.stopPropagation(); setSelectedName(isSel ? null : planet.name) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault(); e.stopPropagation()
              setSelectedName(isSel ? null : planet.name)
            }
            if (e.key === 'Escape') { e.stopPropagation(); setSelectedName(null) }
          }}
        >
          <circle cx={pos.x} cy={pos.y} r={9 * k} fill="transparent" />
          {isSel && <circle cx={pos.x} cy={pos.y} r={9 * k} fill="none" stroke={color} strokeOpacity={0.6} strokeWidth={0.9} />}
          <circle cx={pos.x} cy={pos.y} r={7 * k} fill={color} fillOpacity={0.09} />
          <text
            x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central"
            fontSize={11 * k} fill={color} opacity={0.98} fontFamily="serif"
          >
            {symbol}
          </text>
          {planet.retrograde && (
            <text x={pos.x + 8 * k} y={pos.y - 6 * k} fontSize={5 * k} fill={color} fontFamily="Space Mono, monospace">
              ℞
            </text>
          )}
        </g>
      )
    })
  }

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: size }} onClick={() => setSelectedName(null)}>
      <svg
        width="100%"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-labelledby="dualwheel-title"
        aria-describedby="dualwheel-desc"
      >
        <title id="dualwheel-title">Dual-system natal bi-wheel — Tropical and Sidereal</title>
        <desc id="dualwheel-desc">
          {`Outer ring (Tropical): ${data.tropical.planets.map(p => `${p.name} ${p.sign}`).join(', ')}. ` +
           `Inner ring (Sidereal): ${data.sidereal.planets.map(p => `${p.name} ${p.sign}`).join(', ')}. ` +
           'Selecting a planet highlights both of its positions; the connecting arc spans the ayanamsa gap between them.'}
        </desc>

        <defs>
          <radialGradient id="dual-innerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFC030" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#FFC030" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="dual-coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFC030" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#FFC030" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={cx} cy={cy} r={innerR} fill="url(#dual-innerGlow)" />

        {/* Sign band segments */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a1 = zodiacAngle(i * 30)
          const a2 = zodiacAngle((i + 1) * 30)
          const p1o = polarToCartesian(cx, cy, signBandOuter, a1)
          const p2o = polarToCartesian(cx, cy, signBandOuter, a2)
          const p1i = polarToCartesian(cx, cy, signBandInner, a1)
          const p2i = polarToCartesian(cx, cy, signBandInner, a2)
          const d = [
            `M ${p1i.x} ${p1i.y}`,
            `L ${p1o.x} ${p1o.y}`,
            `A ${signBandOuter} ${signBandOuter} 0 0 1 ${p2o.x} ${p2o.y}`,
            `L ${p2i.x} ${p2i.y}`,
            `A ${signBandInner} ${signBandInner} 0 0 0 ${p1i.x} ${p1i.y}`,
          ].join(' ')
          return <path key={i} d={d} fill={SIGN_COLORS[i]} fillOpacity={0.34} stroke="none" />
        })}

        {/* Rings */}
        <circle cx={cx} cy={cy} r={signBandOuter} fill="none" stroke="#FFC030" strokeWidth={0.7} strokeOpacity={0.58} />
        <circle cx={cx} cy={cy} r={signBandInner} fill="none" stroke="#3E3C80" strokeWidth={0.5} strokeOpacity={0.65} />
        <circle cx={cx} cy={cy} r={ringDivider}   fill="none" stroke="#3E3C80" strokeWidth={0.5} strokeOpacity={0.4} strokeDasharray="1.5 4" />
        <circle cx={cx} cy={cy} r={innerR}         fill="none" stroke="#3E3C80" strokeWidth={0.5} strokeOpacity={0.52} />

        {/* Sign division lines */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = zodiacAngle(i * 30)
          const p1 = polarToCartesian(cx, cy, signBandInner, angle)
          const p2 = polarToCartesian(cx, cy, signBandOuter, angle)
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#3E3C80" strokeWidth={0.5} strokeOpacity={0.6} />
        })}

        {/* Sign symbols */}
        {Array.from({ length: 12 }).map((_, i) => {
          const mid = zodiacAngle(i * 30 + 15)
          const pos = polarToCartesian(cx, cy, signLabelR, mid)
          return (
            <text key={i} x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central"
              fontSize={10 * k} fill={GLYPH_COLORS[i]} opacity={0.96} fontFamily="serif">
              {SIGN_SYMBOLS[i]}
            </text>
          )
        })}

        {/* House cusps of the orienting chart (Whole Sign) */}
        {orientChart.houses.map((cusp, i) => {
          const angle   = zodiacAngle(cusp)
          const isAngle = i === 0 || i === 3 || i === 6 || i === 9
          const p1 = polarToCartesian(cx, cy, coreR + 2, angle)
          const p2 = polarToCartesian(cx, cy, signBandInner - 1, angle)
          return (
            <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={isAngle ? '#FFC030' : '#3E3C80'}
              strokeWidth={isAngle ? 1 : 0.5}
              strokeOpacity={isAngle ? 0.82 : 0.45} />
          )
        })}

        {/* Angle ticks — Ascendant and Midheaven for both systems, on the sign band */}
        {[
          { angle: acTrop, color: SYSTEM_COLOR.tropical, label: 'AC' },
          { angle: acSid,  color: SYSTEM_COLOR.sidereal, label: 'ac' },
          { angle: mcTrop, color: SYSTEM_COLOR.tropical, label: 'MC' },
          { angle: mcSid,  color: SYSTEM_COLOR.sidereal, label: 'mc' },
        ].map((ac, i) => {
          const tIn  = polarToCartesian(cx, cy, signBandInner - 1, ac.angle)
          const tOut = polarToCartesian(cx, cy, signBandOuter, ac.angle)
          const lbl  = polarToCartesian(cx, cy, signBandOuter + 9 * k, ac.angle)
          return (
            <g key={i}>
              <line x1={tIn.x} y1={tIn.y} x2={tOut.x} y2={tOut.y} stroke={ac.color} strokeWidth={1} strokeOpacity={0.8} />
              <text x={lbl.x} y={lbl.y} textAnchor="middle" dominantBaseline="central"
                fontSize={7 * k} fill={ac.color} opacity={0.92} fontFamily="Space Mono, monospace" letterSpacing="0.05em">
                {ac.label}
              </text>
            </g>
          )
        })}

        {/* Planet rings: Tropical (outer) + Sidereal (inner) */}
        {renderPlanetRing(tropPlanets, outerPlanetR, 'tropical')}
        {renderPlanetRing(sidPlanets, innerPlanetR, 'sidereal')}

        {/* The selected planet, bridged across both systems — the arc IS the gap. */}
        {selT && selS && (() => {
          const aT = zodiacAngle(selT.longitude + selT.angularNudge)
          const aS = zodiacAngle(selS.longitude + selS.angularNudge)
          const d  = ((aS - aT + 540) % 360) - 180
          const aM = aT + d / 2
          const pT = polarToCartesian(cx, cy, ringDivider, aT)
          const pS = polarToCartesian(cx, cy, ringDivider, aS)
          const gT = polarToCartesian(cx, cy, outerPlanetR + selT.radialOffset - 8 * k, aT)
          const gS = polarToCartesian(cx, cy, innerPlanetR + selS.radialOffset + 8 * k, aS)
          const lbl = polarToCartesian(cx, cy, ringDivider - 11 * k, aM)
          const arc = `M ${pT.x} ${pT.y} A ${ringDivider} ${ringDivider} 0 0 ${d > 0 ? 1 : 0} ${pS.x} ${pS.y}`
          return (
            <g pointerEvents="none">
              <line x1={gT.x} y1={gT.y} x2={pT.x} y2={pT.y} stroke={SYSTEM_COLOR.tropical} strokeWidth={0.7} strokeOpacity={0.65} />
              <line x1={gS.x} y1={gS.y} x2={pS.x} y2={pS.y} stroke={SYSTEM_COLOR.sidereal} strokeWidth={0.7} strokeOpacity={0.65} />
              <path d={arc} fill="none" stroke="#FFC030" strokeWidth={3 * k} strokeOpacity={0.16} strokeLinecap="round" />
              <path d={arc} fill="none" stroke="#FFC030" strokeWidth={1.1 * k} strokeOpacity={0.92} strokeLinecap="round" />
              <circle cx={pT.x} cy={pT.y} r={1.7 * k} fill={SYSTEM_COLOR.tropical} />
              <circle cx={pS.x} cy={pS.y} r={1.7 * k} fill={SYSTEM_COLOR.sidereal} />
              <text x={lbl.x} y={lbl.y} textAnchor="middle" dominantBaseline="central"
                fontSize={6.5 * k} fill="#FFC030" opacity={0.95} fontFamily="Space Mono, monospace" letterSpacing="0.06em">
                {`Δ ${fmtDeg(gapDelta)}`}
              </text>
            </g>
          )
        })()}

        {/* Core */}
        <circle cx={cx} cy={cy} r={coreR} fill="url(#dual-coreGlow)" />
        <circle cx={cx} cy={cy} r={coreR} fill="none" stroke="#FFC030" strokeWidth={0.5} strokeOpacity={0.68} />
        <circle cx={cx} cy={cy} r={1.5 * k} fill="#FFC030" />
      </svg>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8,
        fontFamily: 'Space Mono, monospace', fontSize: 11, letterSpacing: '0.04em',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: SYSTEM_COLOR.tropical }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: SYSTEM_COLOR.tropical, opacity: 0.9 }} />
          Tropical · outer
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: SYSTEM_COLOR.sidereal }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: SYSTEM_COLOR.sidereal, opacity: 0.9 }} />
          Sidereal · inner
        </span>
      </div>
      <p style={{
        textAlign: 'center', margin: '6px 0 0', fontFamily: 'Space Mono, monospace',
        fontSize: 10, letterSpacing: '0.08em', color: 'rgba(231,227,240,0.45)',
      }}>
        tap a planet — the arc is the gap
      </p>

      {/* Placement card — both positions, then the distance between them */}
      {selT && selS && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 8, right: 8, minWidth: 190, maxWidth: 232,
            padding: '10px 12px', borderRadius: 10,
            background: 'rgba(12,12,22,0.94)',
            border: '1px solid rgba(255,192,48,0.38)',
            color: '#E7E3F0', fontFamily: 'Space Mono, monospace', fontSize: 12, lineHeight: 1.55,
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 16, fontFamily: 'serif', color: '#FFC030' }}>
              {PLANET_SYMBOLS[selT.name] || selT.name[0]}
            </span>
            <strong>{selT.name}</strong>
            {selT.retrograde && <span style={{ fontSize: 10, opacity: 0.75 }}>℞ retrograde</span>}
          </div>
          <div style={{ color: SYSTEM_COLOR.tropical }}>
            <span style={{ fontSize: 9, opacity: 0.8, letterSpacing: '0.08em' }}>TROPICAL&nbsp;&nbsp;</span>
            {selT.sign} {fmtDeg(selT.degree)} · H{selT.house}
          </div>
          {tropDignity && (
            <div style={{ fontSize: 10, color: SYSTEM_COLOR.tropical, opacity: 0.75 }}>{tropDignity}</div>
          )}
          <div style={{ color: SYSTEM_COLOR.sidereal }}>
            <span style={{ fontSize: 9, opacity: 0.8, letterSpacing: '0.08em' }}>SIDEREAL&nbsp;&nbsp;</span>
            {selS.sign} {fmtDeg(selS.degree)} · H{selS.house}
          </div>
          {sidDignity && (
            <div style={{ fontSize: 10, color: SYSTEM_COLOR.sidereal, opacity: 0.75 }}>{sidDignity}</div>
          )}
          {selS.nakshatra && (
            <div style={{ fontSize: 10, color: SYSTEM_COLOR.sidereal, opacity: 0.75 }}>
              {selS.nakshatra} · Pada {selS.nakshatraPada}
            </div>
          )}
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,192,48,0.25)', color: '#FFC030' }}>
            <span style={{ fontSize: 9, opacity: 0.8, letterSpacing: '0.08em' }}>THE GAP&nbsp;&nbsp;</span>
            Δ {fmtDeg(gapDelta)}
            <div style={{ fontSize: 10, opacity: 0.85 }}>
              {signShifted ? `${selT.sign} → ${selS.sign}` : `holds ${selT.sign}`}
            </div>
          </div>
          <button
            aria-label="Close planet details"
            onClick={() => setSelectedName(null)}
            style={{
              position: 'absolute', top: 4, right: 6, background: 'none', border: 'none',
              color: '#E7E3F0', opacity: 0.6, cursor: 'pointer', fontSize: 14, lineHeight: 1,
            }}
          >×</button>
        </div>
      )}
    </div>
  )
}
