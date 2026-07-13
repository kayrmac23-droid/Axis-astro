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

// Per-system accent colours. Tropical = copper (app primary, ratified July 2026);
// Sidereal = cyan so the two rings stay legible at a glance. Retrograde is shown
// with an ℞ tag rather than colour, to avoid clashing with the system palette.
const SYSTEM_COLOR: Record<'tropical' | 'sidereal', string> = {
  tropical: '#D89455',
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

type Selection = { planet: PlanetPosition; system: 'tropical' | 'sidereal' } | null

export default function DualChartWheel({ data, size = 360, orient = 'tropical' }: DualChartWheelProps) {
  const [selected, setSelected] = useState<Selection>(null)

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

  // Ascendant ticks for both systems (they differ by the ayanamsa).
  const acTrop = zodiacAngle(data.tropical.ascendant)
  const acSid  = zodiacAngle(data.sidereal.ascendant)

  const selectedDignity = selected ? getDignityLabel(selected.planet.name, selected.planet.sign) : ''

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
      const isSel  = selected?.planet.name === planet.name && selected?.system === system
      const label  = `${system} ${planet.name} in ${planet.sign} ${fmtDeg(planet.degree)}, house ${planet.house}${planet.retrograde ? ', retrograde' : ''}`

      return (
        <g
          key={`${system}-${planet.name}`}
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          aria-label={label}
          aria-pressed={isSel}
          onClick={(e) => { e.stopPropagation(); setSelected({ planet, system }) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault(); e.stopPropagation()
              setSelected(isSel ? null : { planet, system })
            }
            if (e.key === 'Escape') { e.stopPropagation(); setSelected(null) }
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
    <div style={{ position: 'relative', width: '100%', maxWidth: size }} onClick={() => setSelected(null)}>
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
           `Inner ring (Sidereal): ${data.sidereal.planets.map(p => `${p.name} ${p.sign}`).join(', ')}.`}
        </desc>

        <defs>
          <radialGradient id="dual-innerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#B87333" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#B87333" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="dual-coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#B87333" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#B87333" stopOpacity="0" />
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
        <circle cx={cx} cy={cy} r={signBandOuter} fill="none" stroke="#D89455" strokeWidth={0.7} strokeOpacity={0.58} />
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
              stroke={isAngle ? '#D89455' : '#3E3C80'}
              strokeWidth={isAngle ? 1 : 0.5}
              strokeOpacity={isAngle ? 0.82 : 0.45} />
          )
        })}

        {/* Ascendant ticks — both systems, on the sign band */}
        {[
          { angle: acTrop, color: SYSTEM_COLOR.tropical, label: 'AC' },
          { angle: acSid,  color: SYSTEM_COLOR.sidereal, label: 'ac' },
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

        {/* Core */}
        <circle cx={cx} cy={cy} r={coreR} fill="url(#dual-coreGlow)" />
        <circle cx={cx} cy={cy} r={coreR} fill="none" stroke="#D89455" strokeWidth={0.5} strokeOpacity={0.68} />
        <circle cx={cx} cy={cy} r={1.5 * k} fill="#D89455" />
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

      {/* Placement tooltip */}
      {selected && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 8, right: 8, minWidth: 150,
            padding: '10px 12px', borderRadius: 10,
            background: 'rgba(12,12,22,0.94)',
            border: `1px solid ${SYSTEM_COLOR[selected.system]}55`,
            color: '#E7E3F0', fontFamily: 'Space Mono, monospace', fontSize: 12, lineHeight: 1.5,
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontFamily: 'serif', color: SYSTEM_COLOR[selected.system] }}>
              {PLANET_SYMBOLS[selected.planet.name] || selected.planet.name[0]}
            </span>
            <strong>{selected.planet.name}</strong>
            <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.7, textTransform: 'uppercase', color: SYSTEM_COLOR[selected.system] }}>
              {selected.system}
            </span>
          </div>
          <div>{selected.planet.sign} {fmtDeg(selected.planet.degree)}</div>
          <div>House {selected.planet.house}</div>
          {selectedDignity && <div style={{ color: SYSTEM_COLOR[selected.system] }}>{selectedDignity}</div>}
          <div>{selected.planet.retrograde ? 'Retrograde ℞' : 'Direct'}</div>
          {selected.planet.nakshatra && (
            <div>{selected.planet.nakshatra} Pada {selected.planet.nakshatraPada}</div>
          )}
          <button
            aria-label="Close planet details"
            onClick={() => setSelected(null)}
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
