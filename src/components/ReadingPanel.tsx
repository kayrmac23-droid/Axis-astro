'use client'
import { useState, useEffect, useRef } from 'react'
import { DualChartData } from '@/lib/astro-calc'
import styles from './ReadingPanel.module.css'

interface ReadingPanelProps {
  chartData: DualChartData
  section: 'tropical' | 'sidereal' | 'synthesis'
}

const SECTION_LABELS: Record<string, { title: string; subtitle: string }> = {
  synthesis: {
    title: 'AXIS Synthesis',
    subtitle: 'Concordance · Dissonance · Integration'
  },
  tropical: {
    title: 'Tropical Reading',
    subtitle: 'Western — Inner Architecture'
  },
  sidereal: {
    title: 'Sidereal Reading',
    subtitle: 'Vedic — Outer Circumstances'
  }
}

export default function ReadingPanel({ chartData, section }: ReadingPanelProps) {
  const [readings, setReadings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!readings[section]) {
      generateReading(section)
    }
  }, [section, chartData])

  const generateReading = async (sec: string) => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartData, section: sec }),
        signal: abortRef.current.signal
      })

      if (!res.ok) throw new Error('Reading failed')
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk
        setReadings(prev => ({ ...prev, [sec]: accumulated }))
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError('Reading generation failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const currentText = readings[section] || ''
  const label = SECTION_LABELS[section]

  // Chart data summary for display
  const sunTropical = chartData.tropical.planets.find(p => p.name === 'Sun')
  const moonTropical = chartData.tropical.planets.find(p => p.name === 'Moon')
  const sunSidereal = chartData.sidereal.planets.find(p => p.name === 'Sun')
  const moonSidereal = chartData.sidereal.planets.find(p => p.name === 'Moon')

  return (
    <div className={styles.panel}>
      {/* Reading header */}
      <div className={styles.readingHeader}>
        <div className={styles.readingMeta}>
          <h2 className={styles.readingTitle}>{label.title}</h2>
          <p className={styles.readingSubtitle}>{label.subtitle}</p>
        </div>

        {/* Quick chart summary */}
        <div className={styles.chartSummary}>
          {section !== 'sidereal' ? (
            <div className={styles.summaryGroup}>
              <span className={styles.summarySystem}>Tropical</span>
              <span className={styles.summaryPlacements}>
                ☉ {sunTropical?.sign} · ☽ {moonTropical?.sign} · ↑ {chartData.tropical.ascendantSign}
              </span>
            </div>
          ) : null}
          {section !== 'tropical' ? (
            <div className={styles.summaryGroup}>
              <span className={styles.summarySystem}>Sidereal</span>
              <span className={styles.summaryPlacements}>
                ☉ {sunSidereal?.sign} · ☽ {moonSidereal?.sign} · ↑ {chartData.sidereal.ascendantSign}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Reading body */}
      <div className={styles.readingBody}>
        {loading && !currentText && (
          <div className={styles.generating}>
            <div className={styles.generatingDots}>
              <span /><span /><span />
            </div>
            <p className={styles.generatingText}>Generating reading</p>
          </div>
        )}

        {error && (
          <div className={styles.errorState}>
            <p className={styles.errorText}>{error}</p>
            <button
              className={styles.retryBtn}
              onClick={() => generateReading(section)}
            >
              Retry
            </button>
          </div>
        )}

        {currentText && (
          <div className={styles.readingText}>
            {currentText.split('\n\n').filter(Boolean).map((para, i) => (
              <p key={i} className={styles.paragraph}
                style={{ animationDelay: `${i * 0.05}s` }}>
                {para}
              </p>
            ))}
            {loading && <span className={styles.cursor} />}
          </div>
        )}
      </div>
    </div>
  )
}
