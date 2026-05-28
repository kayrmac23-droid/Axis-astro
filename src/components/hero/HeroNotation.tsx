import styles from './HeroNotation.module.css'
import { SIDEREAL_OFFSET_DEG } from '@/lib/zodiac-constants'

// Small precision-instrument-style label, positioned absolutely near the
// astrolabe plate. Reads as a notation stamped onto a brass plate.

export default function HeroNotation() {
  return (
    <div className={styles.notation} aria-hidden="true">
      <span className={styles.degree}>{SIDEREAL_OFFSET_DEG}°</span>
      <span className={styles.label}>LAHIRI OFFSET</span>
    </div>
  )
}
