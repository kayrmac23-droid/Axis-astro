'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './SiteHeader.module.css'

const NAV = [
  { href: '/method', label: 'Method' },
  { href: '/sample', label: 'Sample' },
  { href: '/guides', label: 'Guides' },
  { href: '/synastry', label: 'Synastry' },
]

export default function SiteHeader() {
  const pathname = usePathname()

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logoBlock} aria-label="AXIS — home">
        <h1 className={styles.logo}>AXIS</h1>
        <p className={styles.logoSub}>Dual-system astrology</p>
      </Link>

      <nav className={styles.nav}>
        {NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
            >
              {item.label}
            </Link>
          )
        })}
        <button className={styles.navLink} disabled title="Save — coming soon">Save</button>
      </nav>
    </header>
  )
}
