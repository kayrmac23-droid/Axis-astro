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
      <div className={styles.logoBlock} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <h1 className={styles.logo}>AXIS</h1>
        <p className={styles.logoSub}>Dual-system astrology</p>
      </div>
      
      <nav className={styles.nav}>
        <button className={styles.navLink} onClick={onMethodClick}>Method</button>
        <button className={styles.navLink} onClick={onSampleClick}>Sample</button>
        <button className={styles.navLink} onClick={onCreateClick}>Create</button>
        <button className={styles.navLink} disabled>Save</button>
      </nav>
    </header>
  )
}
