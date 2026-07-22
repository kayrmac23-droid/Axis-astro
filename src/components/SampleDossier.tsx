'use client'

import React, { forwardRef } from 'react'
import styles from './SampleDossier.module.css'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const SampleDossier = forwardRef<HTMLElement, {}>((_, ref) => {
  return (
    <section className={styles.section} ref={ref}>
      <div className={styles.intro}>
        <p className={styles.label}>Sample dossier excerpt</p>
        <h3 className={styles.headline}>This is what AXIS looks for: not traits, but tension.</h3>
      </div>

      <div className={styles.dossierCard}>
        <p className={styles.dossierTitle}>AXIS Tension</p>
        <p className={styles.dossierThesis}>
          Your Tropical chart performs coherence. Your Sidereal chart keeps interrupting it with hunger for rupture, depth, and private truth.
        </p>
        
        <div className={styles.pillList}>
          <div className={styles.pillRow}>
            <span className={styles.pillLabel}>Concordance</span>
            <span className={styles.pillText}>Both maps intensify fixed emotional patterning.</span>
          </div>
          <div className={styles.pillRow}>
            <span className={styles.pillLabel}>Divergence</span>
            <span className={styles.pillText}>Public identity and private instinct operate at different temperatures.</span>
          </div>
        </div>
      </div>
    </section>
  )
})

SampleDossier.displayName = 'SampleDossier'

export default SampleDossier
