'use client'

import React from 'react'
import styles from './DossierHeader.module.css'
import { DualChartData } from '@/lib/astro-calc'

interface DossierHeaderProps {
  chartData: DualChartData
  displayLocation?: string
}

export default function DossierHeader({ chartData, displayLocation }: DossierHeaderProps) {
  const { birthData } = chartData

  // Prefer the geocoded display name supplied by the form over the timezone city.
  // Timezone-derived location (e.g. "America/New_York" → "New York") is a coarse
  // fallback that misattributes users in cities that share a timezone.
  const location = displayLocation
    || (birthData.tzName ? birthData.tzName.split('/').pop()?.replace(/_/g, ' ') : 'Unknown location')

  // Format date
  const dateStr = new Date(birthData.year, birthData.month - 1, birthData.day).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })

  // Format time
  let timeStr = 'Time unknown'
  if (!birthData.birthTimeUnknown) {
    const isPM = birthData.hour >= 12
    const h = birthData.hour % 12 || 12
    const m = birthData.minute.toString().padStart(2, '0')
    timeStr = `${h}:${m} ${isPM ? 'PM' : 'AM'}`
  }

  return (
    <header className={styles.header}>
      <p className={styles.label}>Your reading</p>
      <p className={styles.coordinates}>
        <span className={styles.place}>{location}</span>
        <span className={styles.divider} aria-hidden="true">·</span>
        <span>{dateStr}</span>
        <span className={styles.divider} aria-hidden="true">·</span>
        <span>{timeStr}</span>
      </p>
    </header>
  )
}
