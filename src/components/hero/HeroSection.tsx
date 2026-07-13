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
          <div className={styles.premise}>
            <p className={styles.premiseLine}>Tropical maps the psychological architecture of a self.</p>
            <p className={styles.premiseLine}>Sidereal maps the incarnational conditions it navigates.</p>
            <p className={styles.premiseLead}>
              The <span className={styles.premiseAccent}>divergence</span> is where this chart actually lives.
            </p>
          </div>
          <p className={styles.body}>
            One birth, charted against two zodiacs — the seasonal and the stellar — separated by 24°13′ of precession. AXIS computes both, holds them open, and reads what lives in the difference.
          </p>
          <div className={styles.actions}>
            <button className={styles.primaryBtn} onClick={onCreateClick}>
              Get Your Reading &nbsp;→
            </button>
            <button className={styles.secondaryBtn} onClick={onSampleClick}>
              See How It Works &nbsp;↓
            </button>
          </div>
          <p className={styles.subCta}>VSOP87 EPHEMERIS · LAHIRI AYANAMSA · NO HOROSCOPES</p>
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
