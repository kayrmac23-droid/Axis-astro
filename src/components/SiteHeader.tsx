'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './SiteHeader.module.css'

const NAV = [
  { href: '/method', label: 'Method' },
  { href: '/sample', label: 'Sample' },
  { href: '/synastry', label: 'Synastry' },
  { href: '/guides', label: 'Guides' },
]

// Chrome-display ayanamsa. The live value comes from the chart; this is the
// current-epoch label shown in the header pill (matches the design system).
const HEADER_DELTA = '24°13′'

export default function SiteHeader() {
  const pathname = usePathname()

  return (
    <header className={styles.header}>
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
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className={styles.navActions}>
          <span className={styles.deltaPill}>Δ {HEADER_DELTA} · LAHIRI</span>
          <Link href="/#get-reading" className={styles.ctaBtn}>Cast a Chart</Link>
        </div>
      </div>
    </header>
  )
}
