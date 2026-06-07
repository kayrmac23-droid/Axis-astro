'use client'

import React from 'react'
import styles from './HeroSection.module.css'
import AstrolabeDecor from '../AstrolabeDecor'

interface HeroSectionProps {
  onCreateClick: () => void
  onSampleClick: () => void
}

export default function HeroSection({ onCreateClick, onSampleClick }: HeroSectionProps) {
  return (
    <section className={styles.hero}>
      <div className={styles.heroLeft}>
        <p className={styles.eyebrow}>Dual-system astrology</p>
        <h2 className={styles.headline}>
          Two maps.<br />
          <span className={styles.headlineAccent}>One true axis.</span>
        </h2>
        <p className={styles.body}>
          AXIS compares the self you recognise with the deeper pattern underneath it — then reads the tension between them.
        </p>
        <p className={styles.microline}>
          Tropical psyche · Sidereal terrain · AXIS synthesis
        </p>
        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={onCreateClick}>
            Begin the AXIS reading
          </button>
          <button className={styles.secondaryBtn} onClick={onSampleClick}>
            <span className={styles.cyanDot} />
            See a sample
          </button>
        </div>
      </div>

      <div className={styles.heroRight}>
        <AstrolabeDecor />
      </div>

      <div className={styles.instrumentStatus}>
        <span className={styles.cyanDot} />
        System Active // Dual Map
      </div>
    </section>
  )
}
