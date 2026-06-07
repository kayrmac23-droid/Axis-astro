'use client'

import React from 'react'
import styles from './DossierHeader.module.css'
import { DualChartData } from '@/lib/astro-calc'

interface DossierHeaderProps {
  chartData: DualChartData
}

export default function DossierHeader({ chartData }: DossierHeaderProps) {
  const { birthData } = chartData
  
  // Format the birth location from timezone (e.g. "Australia/Melbourne" -> "Melbourne")
  const location = birthData.tzName ? birthData.tzName.split('/').pop()?.replace(/_/g, ' ') : 'Unknown Location'
  
  // Format date
  const dateStr = new Date(birthData.year, birthData.month - 1, birthData.day).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })

  // Format time
  let timeStr = 'Unknown time'
  if (!birthData.birthTimeUnknown) {
    const isPM = birthData.hour >= 12
    const h = birthData.hour % 12 || 12
    const m = birthData.minute.toString().padStart(2, '0')
    timeStr = `${h}:${m} ${isPM ? 'PM' : 'AM'}`
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <h2 className={styles.title}>AXIS Dossier</h2>
        <p className={styles.metadata}>
          Born: {location} · {dateStr} · {timeStr}
        </p>
      </div>
      <div className={styles.right}>
        <button className={styles.btn} onClick={handlePrint}>Keep reading</button>
        <button className={styles.btn}>Share</button>
      </div>
    </header>
  )
}
