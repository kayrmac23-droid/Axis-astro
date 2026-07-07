'use client'

import React, { forwardRef } from 'react'
import styles from './MethodPremise.module.css'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const MethodPremise = forwardRef<HTMLElement, {}>((_, ref) => {
  return (
    <section className={styles.section} ref={ref}>
      <div className={styles.intro}>
        <p className={styles.label}>Two maps. One pressure point.</p>
        <h3 className={styles.headline}>The Method</h3>
        <p className={styles.body}>
          Most astrology tools flatten you into one system. AXIS does not. It compares two maps: the psychological architecture of the self and the deeper sidereal terrain underneath it.
        </p>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={`${styles.rule} ${styles.ruleTropical}`} />
          <p className={`${styles.systemTitle} ${styles.titleTropical}`}>Tropical</p>
          <p className={styles.role}>The self you recognise.</p>
          <p className={styles.desc}>
            Personality, patterning, immediate identity, and the symbolic architecture most Western astrology users know.
          </p>
        </div>

        <div className={styles.card}>
          <div className={`${styles.rule} ${styles.ruleSidereal}`} />
          <p className={`${styles.systemTitle} ${styles.titleSidereal}`}>Sidereal</p>
          <p className={styles.role}>The self beneath.</p>
          <p className={styles.desc}>
            A recalibrated sky, older terrain, and a second symbolic lens that often shifts the centre of gravity.
          </p>
        </div>

        <div className={styles.card}>
          <div className={`${styles.rule} ${styles.ruleSynthesis}`} />
          <p className={`${styles.systemTitle} ${styles.titleSynthesis}`}>
            <span className={styles.cyanDot} /> The Gap
          </p>
          <p className={styles.role}>The reading that doesn&apos;t close.</p>
          <p className={styles.desc}>
            AXIS reads where the two systems agree, where they contradict, and how you live inside the distance between them.
          </p>
        </div>
      </div>
    </section>
  )
})

MethodPremise.displayName = 'MethodPremise'

export default MethodPremise
