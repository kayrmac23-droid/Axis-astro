'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './SiteHeader.module.css'

const NAV = [
  { href: '/method', label: 'How It Works' },
  { href: '/sample', label: 'Sample Reading' },
]

export default function SiteHeader() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const isLanding = pathname === '/'
  // On the landing route the hero owns the wordmark; keep the header
  // suppressed until the hero has fully left the viewport, then reveal it.
  const [revealed, setRevealed] = useState(!isLanding)

  useEffect(() => {
    // Non-landing routes always show the header (the render gates the hidden
    // class on isLanding, so no state change is needed here).
    if (!isLanding) return
    const hero = document.getElementById('axis-hero')
    if (hero && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        ([entry]) => setRevealed(!entry.isIntersecting),
        { threshold: 0 }
      )
      io.observe(hero)
      return () => io.disconnect()
    }
    // Fallback: reveal once scrolled roughly one viewport past the hero.
    const onScroll = () => setRevealed(window.scrollY > window.innerHeight * 0.85)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isLanding])

  return (
    <header className={`${styles.header} ${isLanding && !revealed ? styles.hidden : ''}`}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logoBlock} aria-label="AXIS — home">
          <span className={styles.logo}>AXIS</span>
          <span className={styles.logoSub}>Dual-System Astrology</span>
        </Link>

        <nav className={styles.nav} aria-label="Main navigation">
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
        </nav>

        <div className={styles.navActions}>
          <Link href="/#get-reading" className={styles.ctaBtn}>Get Your Reading</Link>
        </div>

        <button
          className={styles.hamburger}
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span className={`${styles.bar} ${menuOpen ? styles.barOpen1 : ''}`} />
          <span className={`${styles.bar} ${menuOpen ? styles.barOpen2 : ''}`} />
          <span className={`${styles.bar} ${menuOpen ? styles.barOpen3 : ''}`} />
        </button>
      </div>

      {menuOpen && (
        <div className={styles.mobileMenu}>
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.mobileNavLink}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <div className={styles.mobileActions}>
            <Link href="/#get-reading" className={styles.ctaBtn} onClick={() => setMenuOpen(false)}>Get Your Reading</Link>
          </div>
        </div>
      )}
    </header>
  )
}
