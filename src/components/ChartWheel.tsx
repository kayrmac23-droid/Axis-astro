'use client'
import { ChartData } from '@/lib/astro-calc'
import styles from './ChartWheel.module.css'

interface ChartWheelProps {
  chart: ChartData
}

const SIGN_SYMBOLS = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓']
const PLANET_SYMBOLS: Record<string, string> = {
  Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀', Mars: '♂',
  Jupiter: '♃', Saturn: '♄', Uranus: '♅', Neptune: '♆',
  Rahu: '☊', Ketu: '☋'
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
    let lon = sorted[i].longitude
    let angleDiff = prev ? ((lon - prev.longitude + 360) % 360) : threshold + 1
    
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

  const planetsWithOffset = spreadPlanets(chart.planets.slice(0, 10))

  return (
    <div className={styles.wheelWrap}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="innerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c9a96e" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#c9a96e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c9a96e" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#c9a96e" stopOpacity="0" />
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
              fill={i % 2 === 0 ? 'rgba(255,255,255,0.012)' : 'rgba(0,0,0,0.06)'}
              stroke="none"
            />
          )
        })}

        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="#2a2a2a" strokeWidth="0.5" />
        {/* Sign band inner border */}
        <circle cx={cx} cy={cy} r={signBandInner} fill="none" stroke="#222222" strokeWidth="0.5" />
        {/* Planet ring */}
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="#1e1e1e" strokeWidth="0.5" />
        {/* Dashed planet orbit guide */}
        <circle cx={cx} cy={cy} r={planetR} fill="none" stroke="#181818" strokeWidth="0.5" strokeDasharray="1.5 4" />

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
              stroke="#1e1e1e"
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
              stroke={isAngle ? '#3a3028' : '#1c1c1c'}
              strokeWidth={isAngle ? 1 : 0.5}
              opacity={isAngle ? 0.9 : 0.6}
            />
          )
        })}

        {/* ASC label */}
        {(() => {
          const ascPos = polarToCartesian(cx, cy, outerR + 9, 180)
          return (
            <text
              x={ascPos.x} y={ascPos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="7"
              fill="#c9a96e"
              opacity="0.9"
              fontFamily="Space Mono, monospace"
              letterSpacing="0.05em"
            >
              AC
            </text>
          )
        })()}

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
                fill={isRetro ? 'rgba(154,122,74,0.06)' : 'rgba(201,169,110,0.06)'}
              />
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="11"
                fill={isRetro ? '#9a7a4a' : '#c9a96e'}
                opacity={isRetro ? 0.6 : 0.95}
                fontFamily="serif"
              >
                {symbol}
              </text>
              {isRetro && (
                <text
                  x={pos.x + 8}
                  y={pos.y - 6}
                  fontSize="5"
                  fill="#9a7a4a"
                  opacity="0.65"
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
        <circle cx={cx} cy={cy} r={coreR} fill="none" stroke="#2a2a2a" strokeWidth="0.5" />
        <circle cx={cx} cy={cy} r="1.5" fill="#c9a96e" opacity="0.5" />
      </svg>
    </div>
  )
}
