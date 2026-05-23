'use client'

import styles from './Starfield.module.css'

// Deterministic PRNG (mulberry32) — same output every render, avoids SSR hydration mismatch
function createRng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const VIEWBOX_W = 1440
const VIEWBOX_H = 900

const rng1 = createRng(0x42)
const DISTANT_STARS = Array.from({ length: 200 }, () => ({
  x: rng1() * VIEWBOX_W,
  y: rng1() * VIEWBOX_H,
  r: 0.3 + rng1() * 0.5,
  opacity: 0.08 + rng1() * 0.18,
}))

const rng2 = createRng(0x77)
const FOREGROUND_STARS = Array.from({ length: 10 }, () => ({
  x: rng2() * VIEWBOX_W,
  y: rng2() * VIEWBOX_H,
  twinkleDelay: rng2() * 8,
}))

export default function Starfield() {
  return (
    <div className={styles.starfield} aria-hidden="true">
      <svg viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`} preserveAspectRatio="xMidYMid slice">
        {/* Distant stars — static, no twinkle */}
        <g>
          {DISTANT_STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r}
                    fill="var(--axis-cream)" opacity={s.opacity} />
          ))}
        </g>

        {/* Foreground stars with diffraction spikes */}
        <g>
          {FOREGROUND_STARS.map((s, i) => (
            <g key={i} transform={`translate(${s.x} ${s.y})`}
               className={styles.foregroundStar}
               style={{ animationDelay: `${s.twinkleDelay}s` }}>
              <circle r="1.2" fill="var(--axis-cream)" />
              <line x1="-7" y1="0" x2="7" y2="0"
                    stroke="var(--axis-cream)" strokeWidth="0.3" opacity="0.7" />
              <line x1="0" y1="-7" x2="0" y2="7"
                    stroke="var(--axis-cream)" strokeWidth="0.3" opacity="0.7" />
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
