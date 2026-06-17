import type { Metadata } from 'next'
import MethodPremise from '@/components/MethodPremise'
import MethodologyStrip from '@/components/MethodologyStrip'
import styles from '../page.module.css'

export const metadata: Metadata = {
  title: 'The Method — AXIS',
  description: 'How AXIS compares two charts — Tropical and Sidereal — and reads the tension between them.',
}

export default function MethodPage() {
  return (
    <main className={styles.main}>
      <MethodPremise />
      <MethodologyStrip />
    </main>
  )
}
