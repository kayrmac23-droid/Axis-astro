'use client'

import React from 'react'
import styles from './AxisTensionSummary.module.css'
import { DualChartData } from '@/lib/astro-calc'

interface AxisTensionSummaryProps {
  chartData: DualChartData
}

export default function AxisTensionSummary({ chartData: _chartData }: AxisTensionSummaryProps) {
  return (
    <div className={styles.summary}>
      <p className={styles.label}>AXIS Tension</p>
      
      {/* Placeholder for now until reading stream is lifted up */}
      <p className={styles.thesis}>
        Your Tropical chart performs coherence. Your Sidereal chart keeps interrupting it with hunger for rupture, depth, and private truth.
      </p>

      <div className={styles.pillRow}>
        <span className={`${styles.pill} ${styles.pillConcordance}`}>Concordance</span>
        <span className={`${styles.pill} ${styles.pillDivergence}`}>Divergence</span>
        <span className={`${styles.pill} ${styles.pillIntegration}`}>Integration</span>
      </div>
    </div>
  )
}
