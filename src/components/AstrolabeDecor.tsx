'use client'

import React from 'react'
import styles from './AstrolabeDecor.module.css'

// ︎ (variation selector-15) forces flat text rendering. Without it,
// Android/Chrome render these zodiac characters as full-colour emoji, which
// looks cheap against the copper palette.
const VS = '︎'
const ZODIAC = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map(g => g + VS)

export default function AstrolabeDecor() {
  const renderRing = (radius: number, width: number, isSidereal: boolean) => {
    const innerRadius = radius - width
    const textRadius = radius - (width / 2)
    const strokeColor = isSidereal ? "var(--copper-dim)" : "var(--border-2)"
    const textColor = isSidereal ? "var(--copper-light)" : "var(--text-3)"
    
    return (
      <g>
        {/* Bounds */}
        <circle cx="250" cy="250" r={radius} fill="none" stroke={strokeColor} strokeWidth="1" opacity={0.6} />
        <circle cx="250" cy="250" r={innerRadius} fill="none" stroke={strokeColor} strokeWidth="1" opacity={0.3} />
        
        {/* Ring Background */}
        <circle cx="250" cy="250" r={radius - (width/2)} fill="transparent" stroke="var(--surface-2)" strokeWidth={width} opacity={isSidereal ? 0.3 : 0.1} />

        {/* 12 Zodiac Blocks */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = i * 30
          return (
            <g key={i} transform={`rotate(${angle} 250 250)`}>
              {/* Block divider */}
              <line 
                x1="250" y1={250 - radius} 
                x2="250" y2={250 - innerRadius} 
                stroke={strokeColor} 
                strokeWidth="1" 
                opacity={0.8}
              />
              
              {/* Degree Ticks (30 per sign) */}
              {Array.from({ length: 30 }).map((_, j) => {
                if (j === 0) return null // Divider line covers 0
                const isMajor = j % 10 === 0
                const isMedium = j % 5 === 0
                const tickLen = isMajor ? 8 : isMedium ? 5 : 3
                return (
                  <line 
                    key={j} 
                    x1="250" y1={250 - radius} 
                    x2="250" y2={250 - radius + tickLen} 
                    stroke={strokeColor} 
                    strokeWidth={isMajor ? 1 : 0.5} 
                    opacity={isMajor ? 0.8 : 0.4}
                    transform={`rotate(${j} 250 250)`} 
                  />
                )
              })}

              {/* Zodiac Symbol */}
              <g transform={`rotate(15 250 250)`}>
                {/* Rotate the text back to upright relative to the viewer for readability, or let it spin.
                    Given the celestial instrument feel, letting it spin is more authentic. */}
                <text 
                  x="250" y={250 - textRadius} 
                  fill={textColor} 
                  fontSize="16"
                  fontFamily="serif"
                  textAnchor="middle" 
                  dominantBaseline="middle"
                >
                  {ZODIAC[i]}
                </text>
              </g>
            </g>
          )
        })}
      </g>
    )
  }

  const renderCompass = () => (
    <g className={styles.compass}>
      {/* Compass Base */}
      <circle cx="250" cy="250" r="45" fill="var(--surface)" stroke="var(--border-2)" strokeWidth="1" />
      <circle cx="250" cy="250" r="38" fill="none" stroke="var(--copper-dim)" strokeWidth="1" strokeDasharray="2 4" />
      
      {/* 8-point subtle star background */}
      <path 
        d="M 250 205 L 253 247 L 295 250 L 253 253 L 250 295 L 247 253 L 205 250 L 247 247 Z" 
        fill="var(--surface-3)" 
        transform="rotate(45 250 250)"
      />

      {/* 4-point primary star */}
      <path 
        d="M 250 185 L 256 244 L 315 250 L 256 256 L 250 315 L 244 256 L 185 250 L 244 244 Z" 
        fill="url(#ad-matte-obsidian)" 
        stroke="var(--copper)" 
        strokeWidth="1.5" 
      />
      
      {/* Inner mechanics */}
      <circle cx="250" cy="250" r="12" fill="var(--surface-2)" stroke="var(--copper-dim)" strokeWidth="1" />
      <circle cx="250" cy="250" r="4" fill="var(--cyan)" className={styles.cyanGlow} />
      <circle cx="250" cy="250" r="1.5" fill="var(--void)" />
    </g>
  )

  return (
    <div className={styles.container}>
      <svg className={styles.astrolabe} viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ad-matte-obsidian" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--void)" />
            <stop offset="100%" stopColor="var(--surface-2)" />
          </linearGradient>

          <filter id="ad-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="15" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Deep Background */}
        <circle cx="250" cy="250" r="235" fill="var(--void)" />
        
        {/* Outer Tropical Ring (Fixed/Slow Spin) */}
        <g className={styles.outerRing}>
          {renderRing(235, 45, false)}
        </g>

        {/* Inner Sidereal Ring (Precesses) */}
        <g className={styles.innerRing}>
          <circle cx="250" cy="250" r="185" fill="url(#ad-matte-obsidian)" />
          {renderRing(185, 45, true)}
          
          {/* Inner measurement rings */}
          <circle cx="250" cy="250" r="130" fill="none" stroke="var(--border-2)" strokeWidth="1" strokeDasharray="4 8" opacity={0.3} />
          <circle cx="250" cy="250" r="100" fill="none" stroke="var(--border-2)" strokeWidth="1" opacity={0.1} />
        </g>

        {/* Center Compass */}
        {renderCompass()}

        {/* Fixed Horizon / Meridian Lines */}
        <g opacity="0.3">
          <line x1="10" y1="250" x2="490" y2="250" stroke="var(--cyan)" strokeWidth="0.5" strokeDasharray="2 4" />
          <line x1="250" y1="10" x2="250" y2="490" stroke="var(--cyan)" strokeWidth="0.5" strokeDasharray="2 4" />
        </g>

        {/* Lahiri Ayanamsa Reading Label */}
        <text 
          x="250" y="340" 
          className={styles.ayanamsaCounter} 
          textAnchor="middle"
        >
          LAHIRI OFFSET: −23.85°
        </text>
      </svg>
    </div>
  )
}
