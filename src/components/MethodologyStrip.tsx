'use client'

import React from 'react'
import styles from './MethodologyStrip.module.css'

export default function MethodologyStrip() {
  return (
    <div className={styles.strip}>
      <p className={styles.label}>Calculation Standard</p>
      
      <div className={styles.chipRow}>
        <span className={`${styles.chip} ${styles.chipCopper}`}>Dual-map comparison</span>
        <span className={styles.chip}>Whole Sign houses</span>
        <span className={styles.chip}>Lahiri ayanamsa</span>
        <span className={styles.chip}>VSOP87 / ELP2000</span>
        <span className={styles.chip}>
          <span className={styles.cyanDot} />
          JPL Horizons Pluto
        </span>
      </div>

      <p className={styles.subline}>
        Location and timezone resolved automatically from birth coordinates.
      </p>
    </div>
  )
}
