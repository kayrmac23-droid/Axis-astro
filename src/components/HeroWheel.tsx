'use client'
import styles from './HeroWheel.module.css'

const VS = '\uFE0E'
const SIGN_GLYPHS = [
  '\u2648', '\u2649', '\u264A', '\u264B', '\u264C', '\u264D',
  '\u264E', '\u264F', '\u2650', '\u2651', '\u2652', '\u2653',
].map(g => g + VS)

const LAHIRI = 23.85

function polar(r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) }
}

interface ZodiacRingProps {
  rInner: number
  rOuter: number
  rGlyph: number
  glyphSize: number
  rLabel: number
  labelText: string
  labelSize: number
  labelLetterSpacing: string
  pathId: string
  opacity?: number
}

function ZodiacRing({
  rInner, rOuter, rGlyph, glyphSize,
  rLabel, labelText, labelSize, labelLetterSpacing,
  pathId, opacity = 1,
}: ZodiacRingProps) {
  const dividers = Array.from({ length: 12 }, (_, i) => {
    const angle = i * 30
    const a = polar(rInner, angle)
    const b = polar(rOuter, angle)
    return (
      <line key={i}
        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke="var(--gold)" strokeOpacity="0.32" strokeWidth="0.8" />
    )
  })

  const glyphs = SIGN_GLYPHS.map((g, i) => {
    const angle = i * 30 + 15
    const p = polar(rGlyph, angle)
    return (
      <text key={i}
        x={p.x} y={p.y}
        textAnchor="middle" dominantBaseline="central"
        fontSize={glyphSize}
        fill="var(--gold)" fillOpacity={opacity}
        style={{ fontFamily: "'Cormorant Garamond', serif" }}>
        {g}
      </text>
    )
  })

  // Circular path for textPath — two 180° arcs starting at top (0, -rLabel)
  const labelPathD = `M 0 ${-rLabel} A ${rLabel} ${rLabel} 0 1 1 0 ${rLabel} A ${rLabel} ${rLabel} 0 1 1 0 ${-rLabel}`

  const labelInstances = [0, 33.33, 66.66].map((offset, i) => (
    <text key={i}
      fontSize={labelSize}
      fill="var(--gold)" fillOpacity="0.65"
      letterSpacing={labelLetterSpacing}
      style={{ fontFamily: "'Cinzel', serif", textTransform: 'uppercase' as const }}>
      <textPath href={`#${pathId}`} startOffset={`${offset}%`}>
        {labelText}
      </textPath>
    </text>
  ))

  return (
    <g>
      <defs>
        <path id={pathId} d={labelPathD} fill="none" />
      </defs>
      <circle cx="0" cy="0" r={rOuter} fill="none"
        stroke="var(--gold)" strokeOpacity="0.42" strokeWidth="1" />
      <circle cx="0" cy="0" r={rInner} fill="none"
        stroke="var(--gold)" strokeOpacity="0.42" strokeWidth="1" />
      {dividers}
      {glyphs}
      {labelInstances}
    </g>
  )
}

export default function HeroWheel() {
  const VB = 700
  const half = VB / 2

  return (
    <div className={styles.wrap}>
      <svg
        viewBox={`-${half} -${half} ${VB} ${VB}`}
        className={styles.svg}
        aria-label="AXIS dual-zodiac chart wheel — Tropical outer ring, Sidereal inner ring">
        <defs>
          <radialGradient id="hw-core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Soft centre glow */}
        <circle cx="0" cy="0" r="160" fill="url(#hw-core-glow)" />

        {/* Outer ring — Tropical, rotates slowly */}
        <g className={styles.ringTropical}>
          <ZodiacRing
            rInner={250} rOuter={310} rGlyph={280} glyphSize={26}
            rLabel={298} labelText="Tropical Zodiac · "
            labelSize={11} labelLetterSpacing="0.30em"
            pathId="hw-path-tropical" />
        </g>

        {/* Fixed reference band between the two rings */}
        <circle cx="0" cy="0" r="245" fill="none"
          stroke="var(--gold)" strokeOpacity="0.15" strokeWidth="0.6" />
        <circle cx="0" cy="0" r="215" fill="none"
          stroke="var(--gold)" strokeOpacity="0.15" strokeWidth="0.6" />

        {/* Inner ring — Sidereal, starts at Lahiri offset, rotates slower */}
        <g className={styles.ringSidereal}
          style={{ transform: `rotate(${LAHIRI}deg)` }}>
          <ZodiacRing
            rInner={150} rOuter={210} rGlyph={180} glyphSize={20}
            rLabel={198} labelText="Sidereal Zodiac · "
            labelSize={9} labelLetterSpacing="0.26em"
            pathId="hw-path-sidereal" opacity={0.85} />
        </g>

        {/* Central ornament — static */}
        <circle cx="0" cy="0" r="62" fill="none"
          stroke="var(--gold)" strokeOpacity="0.32" strokeWidth="0.8" />
        <circle cx="0" cy="0" r="42" fill="none"
          stroke="var(--gold)" strokeOpacity="0.18" strokeWidth="0.5" />
        <line x1="-57" y1="0" x2="-16" y2="0"
          stroke="var(--gold)" strokeOpacity="0.52" strokeWidth="1" />
        <line x1="16" y1="0" x2="57" y2="0"
          stroke="var(--gold)" strokeOpacity="0.52" strokeWidth="1" />
        <line x1="0" y1="-57" x2="0" y2="-16"
          stroke="var(--gold)" strokeOpacity="0.52" strokeWidth="1" />
        <line x1="0" y1="16" x2="0" y2="57"
          stroke="var(--gold)" strokeOpacity="0.52" strokeWidth="1" />
        <circle cx="0" cy="0" r="3" fill="var(--gold)" />
      </svg>

      {/* Static annotations — do not rotate */}
      <div className={styles.annotations} aria-hidden="true">
        <div className={styles.offsetBox}>
          <span className={styles.offsetValue}>23°.85</span>
          <span className={styles.offsetLabel}>Lahiri offset</span>
        </div>
      </div>
    </div>
  )
}
