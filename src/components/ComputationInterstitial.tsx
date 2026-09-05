'use client'
import { useEffect, useState } from 'react'
import styles from './ComputationInterstitial.module.css'

const STAGES = ['RESOLVING COORDINATES', 'CALCULATING HOUSES', 'ALIGNING DUAL MAP', 'PREPARING BOTH FRAMES', 'OPENING DOSSIER']
const STAGES_SYN = ['RESOLVING TWO PLACES', 'CASTING BOTH CHARTS', 'INTER-CHART ASPECTS', 'COMPOSITE MIDPOINTS', 'OPENING READING']

interface Props {
  /** header line under `// COMPUTATION ·` — usually the cast line. */
  line: string
  /** ayanamsa string, e.g. "24°13′", shown as stage-3 sub-label. */
  ayanamsa?: string
  variant?: 'chart' | 'synastry'
  /** advance one real stage past whatever the timed cadence has reached
   *  (kept ≥ this so the orb reflects true progress, never regresses). */
  minStage?: number
}

/**
 * Computation interstitial — a spinning copper/cyan orb beside five stage
 * cells that light in sequence (650 ms cadence). Cyan marks the running stage;
 * copper marks a finished one. Ported from the redesign prototype.
 */
export default function ComputationInterstitial({ line, ayanamsa, variant = 'chart', minStage = 0 }: Props) {
  const labels = variant === 'synastry' ? STAGES_SYN : STAGES
  const [stage, setStage] = useState(0)

  // Cadence stops one before the last cell; the final "OPENING…" stage lights
  // only when the real work completes (the parent unmounts this on data ready).
  useEffect(() => {
    if (stage >= labels.length - 1) return
    const id = setTimeout(() => setStage(s => s + 1), 650)
    return () => clearTimeout(id)
  }, [stage, labels.length])

  const active = Math.max(stage, minStage)

  return (
    <main className={styles.wrap}>
      <div className={styles.grid}>
        <div className={styles.orb} aria-hidden="true">
          <div className={styles.ring} />
          <div className={styles.dashed} />
          <div className={styles.hand} />
          <div className={styles.core} />
        </div>
        <div>
          <div className={styles.kicker}>{`// COMPUTATION · ${line}`}</div>
          <div className={styles.stages} role="status" aria-live="polite">
            {labels.map((label, i) => {
              const done = i < active
              const live = i === active
              const state = done ? styles.done : live ? styles.live : styles.pending
              return (
                <div key={label} className={`${styles.stage} ${state}`}>
                  <div className={styles.n}>{String(i + 1).padStart(2, '0')}</div>
                  <div className={styles.label}>{label}</div>
                  <div className={styles.sub}>
                    {done ? 'DONE' : live ? (i === 2 && ayanamsa ? `Δ ${ayanamsa} · LAHIRI` : 'RUNNING') : ''}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  )
}
