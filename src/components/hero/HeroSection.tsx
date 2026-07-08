'use client'
import React from 'react'
import styles from './HeroSection.module.css'
import AstrolabePlate from './AstrolabePlate'

interface HeroSectionProps {
  onCreateClick: () => void
  onSampleClick: () => void
}

export default function HeroSection({ onCreateClick, onSampleClick }: HeroSectionProps) {
  return (
    <section className={styles.hero}>
      {/* Star field background */}
      <div className={styles.starField} aria-hidden="true" />

      <div className={styles.heroContent}>
        {/* Left: copy */}
        <div className={styles.heroLeft}>
          <h2 className={styles.headline}>
            TWO SYSTEMS.<br />
            <span className={styles.headlineAccent}>ONE GAP.</span>
          </h2>
          <p className={styles.body}>
            AXIS reads Tropical and Sidereal astrology side by side—your psyche, your karma—and holds open the distance between them. The gap is where the reading lives.
          </p>
          <div className={styles.actions}>
            <button className={styles.primaryBtn} onClick={onCreateClick}>
              Get Your Reading &nbsp;→
            </button>
            <button className={styles.secondaryBtn} onClick={onSampleClick}>
              See How It Works &nbsp;↓
            </button>
          </div>
        </div>

        {/* Right: chart wheel */}
        <div className={styles.heroRight}>
          <div className={styles.wheelWrap}>
            <AstrolabePlate />
            <div className={styles.wheelLabelTropical} aria-hidden="true">TROPICAL</div>
            <div className={styles.wheelLabelSidereal} aria-hidden="true">SIDEREAL</div>
          </div>
        </div>
      </div>

      <div className={styles.scrollHint} aria-hidden="true">
        <span className={styles.scrollLabel}>SCROLL TO EXPLORE</span>
        <div className={styles.scrollIcon}>
          <div className={styles.scrollDot} />
        </div>
      </div>
    </section>
  )
}
