import Link from 'next/link'
import styles from './guides/guides.module.css'

export default function NotFound() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.kicker}>{'// 404'}</div>
        <h1 className={styles.h1}>Nothing at this address</h1>
        <p className={styles.lede}>The page you followed does not exist, or has moved.</p>
        <div className={styles.ctas}>
          <Link href="/" className={`${styles.btn} ${styles.btnSolid}`}>CAST YOUR DUAL CHART</Link>
          <Link href="/method" className={`${styles.btn} ${styles.btnOutline}`}>THE METHOD</Link>
        </div>
      </section>
    </main>
  )
}
