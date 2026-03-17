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
const SIGN_COLORS = [
  '#c9a96e', '#9a7a4a', '#c9a96e', '#7a9a6e',
  '#c9a96e', '#7a9a6e', '#c9a96e', '#9a7a4a',
  '#c9a96e', '#7a9a6e', '#c9a96e', '#9a7a4a',
]

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad)
  }
}

export default function ChartWheel({ chart }: ChartWheelProps) {
  const size = 240
  const cx = size / 2
  const cy = size / 2
  const outerR = 108
  const signR = 95
  const signLabelR = 85
  const planetR = 68
  const innerR = 55

  // ASC is at left (9 o'clock = 180deg in standard, but we rotate to put ASC at left)
  const ascAngle = chart.ascendant

  function zodiacAngle(lon: number): number {
    // Rotate so ASC is at 9 o'clock (left, 180deg in SVG coords)
    return ((lon - ascAngle + 180) + 360) % 360
  }

  return (
    <div className={styles.wheelWrap}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="#1e1e1e" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="#1e1e1e" strokeWidth="0.5" />
        <circle cx={cx} cy={cy} r={planetR + 8} fill="none" stroke="#161616" strokeWidth="0.5" strokeDasharray="1 3" />

        {/* Sign divisions */}
        {Array.from({ length: 12 }).map((_, i) => {
          const startAngle = zodiacAngle(i * 30)
          const endAngle = zodiacAngle((i + 1) * 30)
          const p1 = polarToCartesian(cx, cy, innerR, startAngle)
          const p2 = polarToCartesian(cx, cy, outerR, startAngle)
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
              fontSize="9"
              fill={SIGN_COLORS[i]}
              opacity="0.7"
            >
              {SIGN_SYMBOLS[i]}
            </text>
          )
        })}

        {/* House lines from center */}
        {chart.houses.map((houseCusp, i) => {
          const angle = zodiacAngle(houseCusp)
          const p1 = polarToCartesian(cx, cy, 12, angle)
          const p2 = polarToCartesian(cx, cy, innerR - 2, angle)
          const isAngle = i === 0 || i === 3 || i === 6 || i === 9
          return (
            <line
              key={i}
              x1={p1.x} y1={p1.y}
              x2={p2.x} y2={p2.y}
              stroke={isAngle ? '#3a3028' : '#1a1a1a'}
              strokeWidth={isAngle ? 1 : 0.5}
            />
          )
        })}

        {/* ASC/DSC line highlight */}
        {(() => {
          const ascPos = polarToCartesian(cx, cy, outerR + 6, 180)
          return <text x={ascPos.x} y={ascPos.y} textAnchor="middle" dominantBaseline="central" fontSize="7" fill="#c9a96e" opacity="0.8" fontFamily="Space Mono">AC</text>
        })()}

        {/* Planets */}
        {chart.planets.slice(0, 9).map((planet) => {
          const angle = zodiacAngle(planet.longitude)
          const pos = polarToCartesian(cx, cy, planetR, angle)
          const symbol = PLANET_SYMBOLS[planet.name] || planet.name[0]
          return (
            <g key={planet.name}>
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="10"
                fill={planet.retrograde ? '#9a7a4a' : '#c9a96e'}
                opacity={planet.retrograde ? 0.6 : 0.9}
                fontFamily="serif"
              >
                {symbol}
              </text>
              {planet.retrograde && (
                <text
                  x={pos.x + 7}
                  y={pos.y - 5}
                  fontSize="5"
                  fill="#9a7a4a"
                  opacity="0.7"
                  fontFamily="Space Mono"
                >
                  R
                </text>
              )}
            </g>
          )
        })}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r="2" fill="#c9a96e" opacity="0.4" />
      </svg>
    </div>
  )
}
