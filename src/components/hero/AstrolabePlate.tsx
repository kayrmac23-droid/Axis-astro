'use client'

import styles from './AstrolabePlate.module.css'
import { ZODIAC_SIGNS } from '@/lib/zodiac-constants'

export default function AstrolabePlate() {
  return (
    <svg
      viewBox="-200 -200 400 400"
      className={styles.plate}
      role="img"
      aria-label="Dual-system astrolabe plate showing the Lahiri offset between Western Tropical and Vedic Sidereal zodiacs"
    >
      <defs>
        <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--axis-copper-light)" stopOpacity="0.5" />
          <stop offset="40%" stopColor="var(--axis-copper)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="annularGlow" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="transparent" />
          <stop offset="75%" stopColor="var(--axis-copper)" stopOpacity="0.18" />
          <stop offset="85%" stopColor="transparent" />
        </radialGradient>
        {/* Guide arcs for band labels — invisible, only used by textPath */}
        <path id="plateOuterArc" d="M -140,0 A 140,140 0 0,0 140,0" />
        <path id="plateInnerArc" d="M -92,0 A 92,92 0 0,0 92,0" />
      </defs>

      {/* Partial arc fragments — static, outside the plate, suggesting larger map */}
      <g className={styles.partialArcs} aria-hidden="true">
        <circle cx="0" cy="0" r="195" fill="none"
                stroke="var(--axis-copper-faint)" strokeWidth="0.5"
                strokeDasharray="60 280" />
        <circle cx="0" cy="0" r="180" fill="none"
                stroke="var(--axis-copper-faint)" strokeWidth="0.3"
                strokeDasharray="40 320 20 200" />
      </g>

      {/* Annular glow in the gap between bands */}
      <circle cx="0" cy="0" r="150" fill="url(#annularGlow)" aria-hidden="true" />

      {/* Outer band: TROPICAL ZODIAC */}
      <g className={styles.outerBand} aria-hidden="true">
        <circle cx="0" cy="0" r="160" fill="none" stroke="var(--axis-copper)" strokeWidth="1" />
        <circle cx="0" cy="0" r="120" fill="none" stroke="var(--axis-copper)" strokeWidth="1" />
        {ZODIAC_SIGNS.map((sign, i) => {
          const rad = (i * 30 - 90) * Math.PI / 180
          return (
            <line key={i}
                  x1={Math.cos(rad) * 120} y1={Math.sin(rad) * 120}
                  x2={Math.cos(rad) * 160} y2={Math.sin(rad) * 160}
                  stroke="var(--axis-copper)" strokeWidth="0.5" />
          )
        })}
        {ZODIAC_SIGNS.map((sign, i) => {
          const rad = ((i * 30) + 15 - 90) * Math.PI / 180
          return (
            <text key={i}
                  x={Math.cos(rad) * 140} y={Math.sin(rad) * 140}
                  textAnchor="middle" dominantBaseline="central"
                  fill="var(--axis-copper-light)"
                  fontFamily="Cinzel, serif" fontSize="14">
              {sign.glyph}
            </text>
          )
        })}
        {/* Arc label curving along the top of the outer band */}
        <text fontSize="6" fill="var(--axis-copper-dim)" fontFamily="Cinzel, serif" letterSpacing="3">
          <textPath href="#plateOuterArc" startOffset="50%" textAnchor="middle">
            · TROPICAL ZODIAC ·
          </textPath>
        </text>
      </g>

      {/* Annular degree ticks */}
      <g className={styles.degreeTicks} aria-hidden="true">
        {Array.from({ length: 60 }).map((_, i) => {
          const rad = (i * 6 - 90) * Math.PI / 180
          return (
            <line key={i}
                  x1={Math.cos(rad) * 115} y1={Math.sin(rad) * 115}
                  x2={Math.cos(rad) * 119} y2={Math.sin(rad) * 119}
                  stroke="var(--axis-copper-dim)" strokeWidth="0.4" />
          )
        })}
      </g>

      {/* Inner band: SIDEREAL ZODIAC — Lahiri offset encoded in the keyframe, NOT here */}
      <g className={styles.innerBand} aria-hidden="true">
        <circle cx="0" cy="0" r="110" fill="none" stroke="var(--axis-copper)" strokeWidth="1" />
        <circle cx="0" cy="0" r="75" fill="none" stroke="var(--axis-copper)" strokeWidth="1" />
        {ZODIAC_SIGNS.map((sign, i) => {
          const rad = (i * 30 - 90) * Math.PI / 180
          return (
            <line key={i}
                  x1={Math.cos(rad) * 75} y1={Math.sin(rad) * 75}
                  x2={Math.cos(rad) * 110} y2={Math.sin(rad) * 110}
                  stroke="var(--axis-copper)" strokeWidth="0.4" />
          )
        })}
        {ZODIAC_SIGNS.map((sign, i) => {
          const rad = ((i * 30) + 15 - 90) * Math.PI / 180
          return (
            <text key={i}
                  x={Math.cos(rad) * 92} y={Math.sin(rad) * 92}
                  textAnchor="middle" dominantBaseline="central"
                  fill="var(--axis-copper-light)"
                  fontFamily="Cinzel, serif" fontSize="10">
              {sign.glyph}
            </text>
          )
        })}
        {/* Arc label curving along the top of the inner band */}
        <text fontSize="5" fill="var(--axis-copper-dim)" fontFamily="Cinzel, serif" letterSpacing="2">
          <textPath href="#plateInnerArc" startOffset="50%" textAnchor="middle">
            · SIDEREAL ZODIAC ·
          </textPath>
        </text>
      </g>

      {/* Central armature: cross axes + diamond compass star */}
      <g className={styles.armature} aria-hidden="true">
        <line x1="-65" y1="0" x2="65" y2="0" stroke="var(--axis-copper)" strokeWidth="0.5" />
        <line x1="0" y1="-65" x2="0" y2="65" stroke="var(--axis-copper)" strokeWidth="0.5" />
        <polygon points="0,-30 8,0 0,30 -8,0" fill="none"
                 stroke="var(--axis-copper-light)" strokeWidth="0.8" />
        <polygon points="0,-15 4,0 0,15 -4,0" fill="var(--axis-copper)" opacity="0.6" />
      </g>

      {/* Inner amber glow behind armature */}
      <circle cx="0" cy="0" r="40" fill="url(#centerGlow)" aria-hidden="true" />

      {/* Tiny center point */}
      <circle cx="0" cy="0" r="1.5" fill="var(--axis-copper-light)" aria-hidden="true" />
    </svg>
  )
}
