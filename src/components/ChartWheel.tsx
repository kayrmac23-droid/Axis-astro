'use client'
import { useState } from 'react'
import { ChartData, PlanetPosition } from '@/lib/astro-calc'
import styles from './ChartWheel.module.css'

interface ChartWheelProps {
  chart: ChartData
}

// ︎ = Variation Selector-15: forces text presentation instead of emoji on Windows/Chrome
const VS = '︎'
const SIGN_SYMBOLS = [`♈${VS}`,`♉${VS}`,`♊${VS}`,`♋${VS}`,`♌${VS}`,`♍${VS}`,`♎${VS}`,`♏${VS}`,`♐${VS}`,`♑${VS}`,`♒${VS}`,`♓${VS}`]
const PLANET_SYMBOLS: Record<string, string> = {
  Sun: `☉${VS}`, Moon: `☽${VS}`, Mercury: `☿${VS}`, Venus: `♀${VS}`, Mars: `♂${VS}`,
  Jupiter: `♃${VS}`, Saturn: `♄${VS}`, Uranus: `♅${VS}`, Neptune: `♆${VS}`,
  Pluto: `♇${VS}`, Rahu: `☊${VS}`, Ketu: `☋${VS}`
}

// Segment fill colors by element (Fire, Earth, Air, Water)
const SIGN_COLORS = [
  '#7A4A28', '#24242E', '#22303E', '#223A55',
  '#7A4A28', '#24242E', '#22303E', '#223A55',
  '#7A4A28', '#24242E', '#22303E', '#223A55',
]

// Glyph colors contrast-matched to each segment background
const GLYPH_COLORS = [
  '#D9B06A', '#D8CCB8', '#C8D3E0', '#D9DFE8',
  '#D9B06A', '#D8CCB8', '#C8D3E0', '#D9DFE8',
  '#D9B06A', '#D8CCB8', '#C8D3E0', '#D9DFE8',
]

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// Improved collision avoidance: spread planets within threshold degrees
// by alternating inward/outward shifts and small angular nudges
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
      // Alternate: even clusters go inward, odd clusters go outward
      const clusterDepth = prev?.radialOffset === 0 ? 1 : 0
      radialOffset = clusterDepth === 0 ? -12 : 12
      angularNudge = diff < 4 ? (i % 2 === 0 ? 2 : -2) : 0
    }

    result.push({ ...sorted[i], radialOffset, angularNudge })
  }
  return result
}

// Compute essential dignity label for tooltip
function getDignityLabel(planetName: string, sign: string): string {
  const DIGNITIES: Record<string, { domicile: string[]; exaltation: string; detriment: string[]; fall: string }> = {
    Sun:     { domicile: ['Leo'],              exaltation: 'Aries',       detriment: ['Aquarius'],              fall: 'Libra'      },
    Moon:    { domicile: ['Cancer'],           exaltation: 'Taurus',      detriment: ['Capricorn'],             fall: 'Scorpio'    },
    Mercury: { domicile: ['Gemini', 'Virgo'],  exaltation: 'Virgo',       detriment: ['Sagittarius', 'Pisces'], fall: 'Pisces'     },
    Venus:   { domicile: ['Taurus', 'Libra'],  exaltation: 'Pisces',      detriment: ['Aries', 'Scorpio'],      fall: 'Virgo'      },
    Mars:    { domicile: ['Aries', 'Scorpio'], exaltation: 'Capricorn',   detriment: ['Taurus', 'Libra'],       fall: 'Cancer'     },
    Jupiter: { domicile: ['Sagittarius', 'Pisces'], exaltation: 'Cancer', detriment: ['Gemini', 'Virgo'],       fall: 'Capricorn'  },
    Saturn:  { domicile: ['Capricorn', 'Aquarius'], exaltation: 'Libra',  detriment: ['Cancer', 'Leo'],         fall: 'Aries'      },
  }
  const d = DIGNITIES[planetName]
  if (!d) return ''
  if (d.domicile.includes(sign) && d.exaltation === sign) return 'Domicile + Exalt.'
  if (d.domicile.includes(sign))   return 'Domicile'
  if (d.exaltation === sign)        return 'Exaltation'
  if (d.detriment.includes(sign))   return 'Detriment'
  if (d.fall === sign)              return 'Fall'
  return ''
}

function fmtDeg(deg: number): string {
  const d = Math.floor(deg)
  const m = Math.round((deg - d) * 60)
  return `${d}°${String(m).padStart(2, '0')}'`
}

export default function ChartWheel({ chart }: ChartWheelProps) {
  const [selectedPlanet, setSelectedPlanet] = useState<PlanetPosition | null>(null)

  const size    = 320
  const cx      = size / 2
  const cy      = size / 2
  const outerR  = 146
  const signBandOuter = 146
  const signBandInner = 120
  const signLabelR    = 133
  const planetR       = 100
  const innerR        = 74
  const coreR         = 12

  const ascAngle = chart.ascendant

  function zodiacAngle(lon: number): number {
    return ((lon - ascAngle + 180) + 360) % 360
  }

  const planetsWithOffset = spreadPlanets(chart.planets)

  // ASC label: at actual ASC position on the outer ring
  const ascLabelPos = polarToCartesian(cx, cy, outerR + 9, 180)

  // MC label: show the actual MC degree on the wheel
  const mcAngle    = zodiacAngle(chart.midheaven)
  const mcLabelPos = polarToCartesian(cx, cy, outerR + 9, mcAngle)
  // MC tick mark
  const mcTickInner = polarToCartesian(cx, cy, signBandInner - 1, mcAngle)
  const mcTickOuter = polarToCartesian(cx, cy, signBandOuter,     mcAngle)

  const systemLabel = chart.system === 'sidereal' ? 'Sidereal' : 'Tropical'
  const svgTitle = `${systemLabel} natal chart wheel — ${chart.ascendantSign} rising`
  const svgDesc  = `Circular chart wheel showing planet positions in the ${systemLabel.toLowerCase()} zodiac. ` +
    chart.planets.map(p => `${p.name} in ${p.sign} H${p.house}${p.retrograde ? ' retrograde' : ''}`).join(', ')

  return (
    <div className={styles.wheelWrap} onClick={() => setSelectedPlanet(null)}>
      <svg
        width="100%"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-labelledby={`wheel-title-${chart.system}`}
        aria-describedby={`wheel-desc-${chart.system}`}
      >
        <title id={`wheel-title-${chart.system}`}>{svgTitle}</title>
        <desc id={`wheel-desc-${chart.system}`}>{svgDesc}</desc>
        <defs>
          <radialGradient id="innerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c9962e" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#c9962e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c9962e" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#c9962e" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Background fill */}
        <circle cx={cx} cy={cy} r={innerR} fill="url(#innerGlow)" />

        {/* Sign band segments */}
        {Array.from({ length: 12 }).map((_, i) => {
          const startAngle = zodiacAngle(i * 30)
          const endAngle   = zodiacAngle((i + 1) * 30)
          const p1outer = polarToCartesian(cx, cy, signBandOuter, startAngle)
          const p2outer = polarToCartesian(cx, cy, signBandOuter, endAngle)
          const p1inner = polarToCartesian(cx, cy, signBandInner, startAngle)
          const p2inner = polarToCartesian(cx, cy, signBandInner, endAngle)
          const d = [
            `M ${p1inner.x} ${p1inner.y}`,
            `L ${p1outer.x} ${p1outer.y}`,
            `A ${signBandOuter} ${signBandOuter} 0 0 1 ${p2outer.x} ${p2outer.y}`,
            `L ${p2inner.x} ${p2inner.y}`,
            `A ${signBandInner} ${signBandInner} 0 0 0 ${p1inner.x} ${p1inner.y}`,
          ].join(' ')
          return <path key={i} d={d} fill={SIGN_COLORS[i]} fillOpacity={0.32} stroke="none" />
        })}

        {/* Rings */}
        <circle cx={cx} cy={cy} r={outerR}       fill="none" stroke="#D4AF37" strokeWidth="0.7" strokeOpacity="0.6" />
        <circle cx={cx} cy={cy} r={signBandInner} fill="none" stroke="#B88A3B" strokeWidth="0.5" strokeOpacity="0.5" />
        <circle cx={cx} cy={cy} r={innerR}        fill="none" stroke="#B88A3B" strokeWidth="0.5" strokeOpacity="0.45" />
        <circle cx={cx} cy={cy} r={planetR}       fill="none" stroke="#B88A3B" strokeWidth="0.5" strokeOpacity="0.30" strokeDasharray="1.5 4" />

        {/* Sign division lines */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = zodiacAngle(i * 30)
          const p1 = polarToCartesian(cx, cy, signBandInner, angle)
          const p2 = polarToCartesian(cx, cy, signBandOuter, angle)
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#B88A3B" strokeWidth="0.5" strokeOpacity="0.55" />
        })}

        {/* Sign symbols */}
        {Array.from({ length: 12 }).map((_, i) => {
          const midAngle = zodiacAngle(i * 30 + 15)
          const pos = polarToCartesian(cx, cy, signLabelR, midAngle)
          return (
            <text key={i} x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central"
              fontSize="10" fill={GLYPH_COLORS[i]} opacity="0.95" fontFamily="serif">
              {SIGN_SYMBOLS[i]}
            </text>
          )
        })}

        {/* House lines — Whole Sign cusps (consistent with planet house assignments) */}
        {chart.houses.map((houseCusp, i) => {
          const angle   = zodiacAngle(houseCusp)
          const isAngle = i === 0 || i === 3 || i === 6 || i === 9
          const p1 = polarToCartesian(cx, cy, coreR + 2,         angle)
          const p2 = polarToCartesian(cx, cy, signBandInner - 1, angle)
          return (
            <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={isAngle ? '#D4AF37' : '#B88A3B'}
              strokeWidth={isAngle ? 1 : 0.5}
              strokeOpacity={isAngle ? 0.85 : 0.38} />
          )
        })}

        {/* MC tick — dashed, separate from house lines since MC ≠ 10th house cusp */}
        <line x1={mcTickInner.x} y1={mcTickInner.y} x2={mcTickOuter.x} y2={mcTickOuter.y}
          stroke="#B88A3B" strokeWidth="0.7" strokeOpacity="0.55" strokeDasharray="2 2" />

        {/* ASC label */}
        <text x={ascLabelPos.x} y={ascLabelPos.y} textAnchor="middle" dominantBaseline="central"
          fontSize="8" fill="#c9962e" opacity="0.95" fontFamily="Space Mono, monospace" letterSpacing="0.05em">
          AC
        </text>

        {/* MC label */}
        <text x={mcLabelPos.x} y={mcLabelPos.y} textAnchor="middle" dominantBaseline="central"
          fontSize="7" fill="rgba(201,150,46,0.82)" fontFamily="Space Mono, monospace" letterSpacing="0.05em">
          MC
        </text>

        {/* Planets */}
        {planetsWithOffset.map((planet) => {
          const angle   = zodiacAngle(planet.longitude + planet.angularNudge)
          const r       = planetR + planet.radialOffset
          const pos     = polarToCartesian(cx, cy, r, angle)
          const symbol  = PLANET_SYMBOLS[planet.name] || planet.name[0]
          const isRetro = planet.retrograde
          const isSelected = selectedPlanet?.name === planet.name

          const planetLabel = `${planet.name} in ${planet.sign} ${fmtDeg(planet.degree)}, house ${planet.house}${planet.retrograde ? ', retrograde' : ''}`

          return (
            <g
              key={planet.name}
              style={{ cursor: 'pointer' }}
              role="button"
              tabIndex={0}
              aria-label={planetLabel}
              aria-pressed={isSelected}
              onClick={(e) => { e.stopPropagation(); setSelectedPlanet(planet) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  setSelectedPlanet(isSelected ? null : planet)
                }
                if (e.key === 'Escape') { e.stopPropagation(); setSelectedPlanet(null) }
              }}
            >
              {/* Click target — invisible larger area */}
              <circle cx={pos.x} cy={pos.y} r="9" fill="transparent" />
              {/* Selection ring */}
              {isSelected && (
                <circle cx={pos.x} cy={pos.y} r="9"
                  fill="none" stroke="rgba(201,150,46,0.75)" strokeWidth="1.2" />
              )}
              {/* Glow */}
              <circle cx={pos.x} cy={pos.y} r="7"
                fill={isRetro ? 'rgba(160,138,224,0.12)' : 'rgba(201,169,110,0.06)'} />
              {/* Symbol */}
              <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central"
                fontSize="12" fill={isRetro ? '#A08AE0' : '#c9962e'}
                opacity={isRetro ? 1.0 : 0.95} fontFamily="serif">
                {symbol}
              </text>
              {isRetro && (
                <text x={pos.x + 8} y={pos.y - 6} fontSize="5" fill="#A08AE0" opacity="1.0"
                  fontFamily="Space Mono, monospace">
                  R
                </text>
              )}
            </g>
          )
        })}

        {/* Core */}
        <circle cx={cx} cy={cy} r={coreR} fill="url(#coreGlow)" />
        <circle cx={cx} cy={cy} r={coreR} fill="none" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.65" />
        <circle cx={cx} cy={cy} r="1.5" fill="#c9962e" opacity="1.0" />
      </svg>

      {/* Planet placement tooltip */}
      {selectedPlanet && (
        <div className={styles.tooltip} onClick={(e) => e.stopPropagation()}>
          <div className={styles.tooltipPlanet}>
            <span className={styles.tooltipSymbol}>
              {PLANET_SYMBOLS[selectedPlanet.name] || selectedPlanet.name[0]}
            </span>
            <span className={styles.tooltipName}>{selectedPlanet.name}</span>
          </div>
          <div className={styles.tooltipRow}>
            {selectedPlanet.sign} {fmtDeg(selectedPlanet.degree)}
          </div>
          <div className={styles.tooltipRow}>House {selectedPlanet.house}</div>
          {getDignityLabel(selectedPlanet.name, selectedPlanet.sign) && (
            <div className={styles.tooltipDignity}>
              {getDignityLabel(selectedPlanet.name, selectedPlanet.sign)}
            </div>
          )}
          <div className={styles.tooltipRow}>
            {selectedPlanet.retrograde ? 'Retrograde ℞' : 'Direct'}
          </div>
          {selectedPlanet.nakshatra && (
            <div className={styles.tooltipRow}>
              {selectedPlanet.nakshatra} Pada {selectedPlanet.nakshatraPada}
            </div>
          )}
          <button
            className={styles.tooltipClose}
            aria-label="Close planet details"
            onClick={() => setSelectedPlanet(null)}
          >×</button>
        </div>
      )}
    </div>
  )
}
