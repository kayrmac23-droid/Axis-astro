'use client'
// Route-level error boundary. Without it a render error anywhere in a page
// replaced the whole site with Next's bare default error screen. The reading
// panel has its own, tighter boundary (ReadingErrorBoundary) so a fault in the
// prose never takes the wheel and dossier with it; this one catches the rest.
// Inside the root layout, so the site chrome and global styles still apply.
import { useEffect } from 'react'
import Link from 'next/link'
import styles from './guides/guides.module.css'

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error('[AXIS_CLIENT_ERROR]', error)
  }, [error])

  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.kicker}>{'// SOMETHING BROKE'}</div>
        <h1 className={styles.h1}>This page hit an error</h1>
        <p className={styles.lede}>
          Nothing you entered is lost on our side, and your chart is not the problem. Try the
          page again; if it keeps failing, start from the beginning.
        </p>
        <div className={styles.ctas}>
          <button type="button" onClick={() => retry()} className={`${styles.btn} ${styles.btnSolid}`}>TRY AGAIN</button>
          <Link href="/" className={`${styles.btn} ${styles.btnOutline}`}>BACK TO THE START</Link>
        </div>
      </section>
    </main>
  )
}
