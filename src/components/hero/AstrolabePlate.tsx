'use client'

import styles from './AstrolabePlate.module.css'
import { ZODIAC_SIGNS, SIDEREAL_OFFSET_DEG } from '@/lib/zodiac-constants'

// Geometry:
// - Outer band (tropical): r 120 to 160
// - Annular gap (degree ticks + copper glow): r 110 to 120
// - Inner band (sidereal, rotated -23.85°): r 75 to 110
// - Central armature: r 0 to 65
// - Inner amber glow: r 0 to 40
//
// The viewBox is centered at 0,0 so rotation math is straightforward.
// CSS module animates outer-band clockwise and inner-band counter-clockwise
// at different rates; the Lahiri offset is encoded into the inner-band
// @keyframes start/end values (CSS overrides SVG transform attribute, so the
// offset has to live in the animation, not on the element).

export default function AstrolabePlate() {
  return (
    <svg
      viewBox="-200 -200 400 400"
      className={styles.plate}
      role="img"
      aria-label="Dual-system astrolabe plate showing the Lahiri offset between the Western Tropical and Vedic Sidereal zodiacs"
    >
      <defs>
        <radialGradient id="plateCenterGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--copper-light)" stopOpacity="0.45" />
          <stop offset="40%" stopColor="var(--copper)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="plateAnnularGlow" cx="50%" cy="50%" r="50%">
          <stop offset="62%" stopColor="transparent" />
          <stop offset="76%" stopColor="var(--copper)" stopOpacity="0.20" />
          <stop offset="86%" stopColor="transparent" />
        </radialGradient>
      </defs>

      {/* Partial arc fragments — static, outside the plate, suggesting larger map */}
      <g className={styles.partialArcs} aria-hidden="true">
        <circle cx="0" cy="0" r="195" fill="none"
                stroke="var(--copper-border)" strokeWidth="0.5"
                strokeDasharray="60 280" />
        <circle cx="0" cy="0" r="180" fill="none"
                stroke="var(--copper-border)" strokeWidth="0.3"
                strokeDasharray="40 320 20 200" />
      </g>

      {/* Annular glow in the gap between bands */}
      <circle cx="0" cy="0" r="150" fill="url(#plateAnnularGlow)" aria-hidden="true" />

      {/* Outer band: TROPICAL ZODIAC */}
      <g className={styles.outerBand} aria-hidden="true">
        <circle cx="0" cy="0" r="160" fill="none" stroke="var(--copper)" strokeWidth="1" />
        <circle cx="0" cy="0" r="120" fill="none" stroke="var(--copper)" strokeWidth="1" />
        {ZODIAC_SIGNS.map((_, i) => {
          const rad = (i * 30 - 90) * Math.PI / 180
          return (
            <line key={`outer-div-${i}`}
                  x1={Math.cos(rad) * 120} y1={Math.sin(rad) * 120}
                  x2={Math.cos(rad) * 160} y2={Math.sin(rad) * 160}
                  stroke="var(--copper)" strokeWidth="0.5" />
          )
        })}
        {ZODIAC_SIGNS.map((sign, i) => {
          // Glyphs sit mid-sector. Outer-band glyphs counter-rotate slightly so
          // they remain upright as the band rotates, BUT that requires per-glyph
          // animation. For now they rotate with the band — over a 240s revolution
          // it reads as instrument behaviour, not nausea.
          const rad = ((i * 30) + 15 - 90) * Math.PI / 180
          return (
            <text key={`outer-glyph-${i}`}
                  x={Math.cos(rad) * 140} y={Math.sin(rad) * 140}
                  textAnchor="middle" dominantBaseline="central"
                  fill="var(--copper-light)"
                  fontFamily="var(--font-display, Cinzel, serif)" fontSize="14">
              {sign.glyph}
            </text>
          )
        })}
      </g>

      {/* Annular degree ticks (60 ticks = every 6°) */}
      <g className={styles.degreeTicks} aria-hidden="true">
        {Array.from({ length: 60 }).map((_, i) => {
          const rad = (i * 6 - 90) * Math.PI / 180
          return (
            <line key={`tick-${i}`}
                  x1={Math.cos(rad) * 115} y1={Math.sin(rad) * 115}
                  x2={Math.cos(rad) * 119} y2={Math.sin(rad) * 119}
                  stroke="var(--copper-dim)" strokeWidth="0.5" opacity="0.7" />
          )
        })}
      </g>

      {/* Inner band: SIDEREAL ZODIAC. Lahiri offset (-23.85°) lives in @keyframes,
          not in a transform attribute here. */}
      <g className={styles.innerBand} aria-hidden="true">
        <circle cx="0" cy="0" r="110" fill="none" stroke="var(--copper)" strokeWidth="1" />
        <circle cx="0" cy="0" r="75" fill="none" stroke="var(--copper)" strokeWidth="1" />
        {ZODIAC_SIGNS.map((_, i) => {
          const rad = (i * 30 - 90) * Math.PI / 180
          return (
            <line key={`inner-div-${i}`}
                  x1={Math.cos(rad) * 75} y1={Math.sin(rad) * 75}
                  x2={Math.cos(rad) * 110} y2={Math.sin(rad) * 110}
                  stroke="var(--copper)" strokeWidth="0.4" />
          )
        })}
        {ZODIAC_SIGNS.map((sign, i) => {
          const rad = ((i * 30) + 15 - 90) * Math.PI / 180
          return (
            <text key={`inner-glyph-${i}`}
                  x={Math.cos(rad) * 92} y={Math.sin(rad) * 92}
                  textAnchor="middle" dominantBaseline="central"
                  fill="var(--copper-light)"
                  fontFamily="var(--font-display, Cinzel, serif)" fontSize="10"
                  opacity="0.9">
              {sign.glyph}
            </text>
          )
        })}
      </g>

      {/* Central armature: cross axes + diamond compass star */}
      <g className={styles.armature} aria-hidden="true">
        <line x1="-65" y1="0" x2="65" y2="0" stroke="var(--copper)" strokeWidth="0.5" />
        <line x1="0" y1="-65" x2="0" y2="65" stroke="var(--copper)" strokeWidth="0.5" />
        <polygon points="0,-30 8,0 0,30 -8,0" fill="none"
                 stroke="var(--copper-light)" strokeWidth="0.9" />
        <polygon points="0,-15 4,0 0,15 -4,0" fill="var(--copper)" opacity="0.55" />
      </g>

      {/* Inner amber glow behind armature */}
      <circle cx="0" cy="0" r="40" fill="url(#plateCenterGlow)" aria-hidden="true" />

      {/* Tiny center point */}
      <circle cx="0" cy="0" r="1.5" fill="var(--copper-light)" aria-hidden="true" />

      {/* SR-only data label for accessibility */}
      <title>{`Tropical and Sidereal zodiacs, offset by ${SIDEREAL_OFFSET_DEG}° (Lahiri ayanamsa)`}</title>
    </svg>
  )
}
