'use client'
import { ChartData } from '@/lib/astro-calc'
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

// Element colours for signs (fire/earth/air/water × 3)
const SIGN_COLORS = [
  '#d4804a', // Aries — fire
  '#8a7a5a', // Taurus — earth
  '#7aadba', // Gemini — air
  '#6a90b0', // Cancer — water
  '#d4804a', // Leo — fire
  '#8a7a5a', // Virgo — earth
  '#7aadba', // Libra — air
  '#6a90b0', // Scorpio — water
  '#d4804a', // Sagittarius — fire
  '#8a7a5a', // Capricorn — earth
  '#7aadba', // Aquarius — air
  '#6a90b0', // Pisces — water
]

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad)
  }
}

// Simple collision-avoidance: spread planets that are within threshold degrees
function spreadPlanets(planets: { name: string; longitude: number; retrograde: boolean }[], threshold = 10) {
  const sorted = [...planets].sort((a, b) => a.longitude - b.longitude)
  const result: { name: string; longitude: number; retrograde: boolean; offset: number }[] = []
  
  for (let i = 0; i < sorted.length; i++) {
    const prev = result[i - 1]
    const lon = sorted[i].longitude
    const angleDiff = prev ? ((lon - prev.longitude + 360) % 360) : threshold + 1
    
    result.push({
      ...sorted[i],
      offset: angleDiff < threshold ? -10 : 0 // shift inward on radius
    })
  }
  return result
}

export default function ChartWheel({ chart }: ChartWheelProps) {
  const size = 320
  const cx = size / 2
  const cy = size / 2
  const outerR = 146
  const signBandOuter = 146
  const signBandInner = 120
  const signLabelR = 133
  const planetR = 100
  const innerR = 74
  const coreR = 12

  const ascAngle = chart.ascendant

  function zodiacAngle(lon: number): number {
    return ((lon - ascAngle + 180) + 360) % 360
  }

  const planetsWithOffset = spreadPlanets(chart.planets)
  const ascLabelPos = polarToCartesian(cx, cy, outerR + 9, 180)

  return (
    <div className={styles.wheelWrap}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
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

        {/* Background fill for inner wheel */}
        <circle cx={cx} cy={cy} r={innerR} fill="url(#innerGlow)" />

        {/* Sign band background — alternating very subtle fills */}
        {Array.from({ length: 12 }).map((_, i) => {
          const startAngle = zodiacAngle(i * 30)
          const endAngle = zodiacAngle((i + 1) * 30)
          // Draw arc segment
          const p1outer = polarToCartesian(cx, cy, signBandOuter, startAngle)
          const p2outer = polarToCartesian(cx, cy, signBandOuter, endAngle)
          const p1inner = polarToCartesian(cx, cy, signBandInner, startAngle)
          const p2inner = polarToCartesian(cx, cy, signBandInner, endAngle)
          const largeArc = 0 // 30° is never > 180°
          const d = [
            `M ${p1inner.x} ${p1inner.y}`,
            `L ${p1outer.x} ${p1outer.y}`,
            `A ${signBandOuter} ${signBandOuter} 0 ${largeArc} 1 ${p2outer.x} ${p2outer.y}`,
            `L ${p2inner.x} ${p2inner.y}`,
            `A ${signBandInner} ${signBandInner} 0 ${largeArc} 0 ${p1inner.x} ${p1inner.y}`,
          ].join(' ')
          return (
            <path
              key={i}
              d={d}
              fill={SIGN_COLORS[i]}
              fillOpacity={0.26}
              stroke="none"
            />
          )
        })}

        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="rgba(212,168,69,0.55)" strokeWidth="0.5" />
        {/* Sign band inner border */}
        <circle cx={cx} cy={cy} r={signBandInner} fill="none" stroke="rgba(212,168,69,0.45)" strokeWidth="0.5" />
        {/* Planet ring */}
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="rgba(212,168,69,0.40)" strokeWidth="0.5" />
        {/* Dashed planet orbit guide */}
        <circle cx={cx} cy={cy} r={planetR} fill="none" stroke="rgba(212,168,69,0.28)" strokeWidth="0.5" strokeDasharray="1.5 4" />

        {/* Sign division lines */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = zodiacAngle(i * 30)
          const p1 = polarToCartesian(cx, cy, signBandInner, angle)
          const p2 = polarToCartesian(cx, cy, signBandOuter, angle)
          return (
            <line
              key={i}
              x1={p1.x} y1={p1.y}
              x2={p2.x} y2={p2.y}
              stroke="rgba(212,168,69,0.55)"
              strokeWidth="0.5"
            />
          )
        })}

        {/* Sign symbols */}
        {Array.from({ length: 12 }).map((_, i) => {
          const midAngle = zodiacAngle(i * 30 + 15)
          const pos = polarToCartesian(cx, cy, signLabelR, midAngle)
          return (
            <text
              key={i}
              x={pos.x} y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="10"
              fill={SIGN_COLORS[i]}
              opacity="0.75"
              fontFamily="serif"
            >
              {SIGN_SYMBOLS[i]}
            </text>
          )
        })}

        {/* House lines */}
        {chart.houses.map((houseCusp, i) => {
          const angle = zodiacAngle(houseCusp)
          const isAngle = i === 0 || i === 3 || i === 6 || i === 9
          const p1 = polarToCartesian(cx, cy, coreR + 2, angle)
          const p2 = polarToCartesian(cx, cy, signBandInner - 1, angle)
          return (
            <line
              key={i}
              x1={p1.x} y1={p1.y}
              x2={p2.x} y2={p2.y}
              stroke={isAngle ? 'rgba(212,168,69,0.85)' : 'rgba(212,168,69,0.35)'}
              strokeWidth={isAngle ? 1 : 0.5}
            />
          )
        })}

        {/* ASC label */}
        <text
          x={ascLabelPos.x}
          y={ascLabelPos.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="7"
          fill="#c9962e"
          opacity="0.9"
          fontFamily="Space Mono, monospace"
          letterSpacing="0.05em"
        >
          AC
        </text>

        {/* Planets */}
        {planetsWithOffset.map((planet) => {
          const angle = zodiacAngle(planet.longitude)
          const r = planetR + planet.offset
          const pos = polarToCartesian(cx, cy, r, angle)
          const symbol = PLANET_SYMBOLS[planet.name] || planet.name[0]
          const isRetro = planet.retrograde
          return (
            <g key={planet.name}>
              {/* Subtle glow behind planet */}
              <circle
                cx={pos.x} cy={pos.y} r="7"
                fill={isRetro ? 'rgba(160,138,224,0.12)' : 'rgba(201,169,110,0.06)'}
              />
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="11"
                fill={isRetro ? '#A08AE0' : '#c9962e'}
                opacity={isRetro ? 1.0 : 0.95}
                fontFamily="serif"
              >
                {symbol}
              </text>
              {isRetro && (
                <text
                  x={pos.x + 8}
                  y={pos.y - 6}
                  fontSize="5"
                  fill="#A08AE0"
                  opacity="1.0"
                  fontFamily="Space Mono, monospace"
                >
                  R
                </text>
              )}
            </g>
          )
        })}

        {/* Core */}
        <circle cx={cx} cy={cy} r={coreR} fill="url(#coreGlow)" />
        <circle cx={cx} cy={cy} r={coreR} fill="none" stroke="rgba(212,168,69,0.65)" strokeWidth="0.5" />
        <circle cx={cx} cy={cy} r="1.5" fill="#c9962e" opacity="1.0" />
      </svg>
    </div>
  )
}
