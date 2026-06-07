'use client'

import React from 'react'
import styles from './SiteHeader.module.css'

interface SiteHeaderProps {
  onMethodClick?: () => void
  onSampleClick?: () => void
  onCreateClick?: () => void
}

export default function SiteHeader({ onMethodClick, onSampleClick, onCreateClick }: SiteHeaderProps) {
  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.logoBlock}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Scroll to top"
      >
        <h1 className={styles.logo}>AXIS</h1>
        <p className={styles.logoSub}>Dual-system astrology</p>
      </button>

      <nav className={styles.nav}>
        <button className={styles.navLink} onClick={onMethodClick}>Method</button>
        <button className={styles.navLink} onClick={onSampleClick}>Sample</button>
        <button className={styles.navLink} onClick={onCreateClick}>Create</button>
        <button className={styles.navLink} disabled title="Save — coming soon">Save</button>
      </nav>
    </header>
  )
}
