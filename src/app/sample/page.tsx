import type { Metadata } from 'next'
import Link from 'next/link'
import SampleDossier from '@/components/SampleDossier'
import styles from '../page.module.css'

export const metadata: Metadata = {
  title: 'Sample Reading — AXIS',
  description: 'An excerpt of what AXIS surfaces: not traits, but the tension between two charts.',
}

export default function SamplePage() {
  return (
    <main className={styles.main}>
      <SampleDossier />
      <div className={styles.resetRow}>
        <Link href="/" className={styles.resetBtn}>Begin your own reading</Link>
      </div>
    </main>
  )
}
