'use client'
/* ============================================================
   FrameControl — the dossier's TROPICAL / SIDEREAL switch, the
   live Δ pill, and the frame status line. It drives the wheel
   AND the reading prose; positional data never follows it
   (DOCTRINE.md: CO-VISIBILITY).

   The Δ value counts with the wheel's rotation: FrameShiftWheel
   writes the animating value into `deltaRef` each frame.

   Design: AXIS_Standalone, dossier view.
   ============================================================ */
import type { RefObject } from 'react'
import styles from './FrameControl.module.css'

interface FrameControlProps {
  frame: 'tropical' | 'sidereal'
  onFrameChange: (frame: 'tropical' | 'sidereal') => void
  /** Lahiri offset, already formatted (e.g. "24°13′"). */
  ayanamsa: string
  /** Receives the live Δ value written by the wheel during the shift. */
  deltaRef?: RefObject<HTMLSpanElement>
  /** Static Δ text for the first paint / no-JS-animation case. */
  delta: string
  /** Drop the Δ pill and status line (synastry's per-chart cards). */
  compact?: boolean
  /** Accessible name for the button group. */
  label?: string
}

export default function FrameControl({
  frame, onFrameChange, ayanamsa, deltaRef, delta, compact = false, label = 'Frame',
}: FrameControlProps) {
  return (
    <div className={`${styles.row} ${compact ? styles.rowCompact : ''}`}>
      <div className={styles.left}>
        <div className={styles.group} role="group" aria-label={label}>
          <button
            type="button"
            className={`${styles.btn} ${frame === 'tropical' ? styles.btnOn : ''}`}
            aria-pressed={frame === 'tropical'}
            onClick={() => onFrameChange('tropical')}
          >TROPICAL</button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnLast} ${frame === 'sidereal' ? styles.btnOn : ''}`}
            aria-pressed={frame === 'sidereal'}
            onClick={() => onFrameChange('sidereal')}
          >SIDEREAL</button>
        </div>
        {!compact && (
          <span className={styles.pill}>
            Δ <span ref={deltaRef}>{delta}</span> · LAHIRI OFFSET
          </span>
        )}
      </div>
      {!compact && (
        <div className={styles.status} role="status" aria-live="polite">
          {'// FRAME: '}
          <span className={styles.live}>{frame === 'sidereal' ? 'SIDEREAL' : 'TROPICAL'}</span>
          {frame === 'sidereal'
            ? ` · BAND ROTATED −${ayanamsa} · PLANETS FIXED`
            : ' · BAND AT 0° · PLANETS FIXED'}
        </div>
      )}
    </div>
  )
}
