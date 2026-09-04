import Link from 'next/link'
import styles from './SiteFooter.module.css'

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.col}>
          Δ 24°13′ · LAHIRI<br />
          WIDENING 50.2564″ / YR<br />
          ZERO POINT · c. 285 CE
        </div>
        <nav className={styles.links} aria-label="Footer navigation">
          <Link href="/method" className={styles.link}>METHOD</Link>
          <Link href="/sample" className={styles.link}>SAMPLE</Link>
          <Link href="/synastry" className={styles.link}>SYNASTRY</Link>
          <Link href="/guides" className={styles.link}>GUIDES</Link>
        </nav>
        <div className={styles.col}>
          <span className={styles.brand}>AXIS — DUAL-SYSTEM ASTROLOGY</span><br />
          NO HOROSCOPES · NO PREDICTIONS · NO AFFIRMATIONS<br />
          VSOP87 · ELP2000 · JPL DE440 · TRUE NODE
        </div>
      </div>
    </footer>
  )
}
