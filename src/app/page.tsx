'use client'
import { useState, useRef, useEffect } from 'react'
import ChartWheel from '@/components/ChartWheel'
import ChartFactsPanel from '@/components/ChartFactsPanel'
import ReadingPanel from '@/components/ReadingPanel'
import PreviewLanding from '@/components/landing/PreviewLanding'
import DossierHeader from '@/components/DossierHeader'
import { DualChartData } from '@/lib/astro-calc'
import styles from './page.module.css'
import { capture } from '@/lib/analytics'

export default function Home() {
  const [chartData, setChartData] = useState<DualChartData | null>(null)
  const [readingReady, setReadingReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFormData, setLastFormData] = useState<Record<string, string> | null>(null)
  const [displayLocation, setDisplayLocation] = useState<string>('')
  const readingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartData) return
    const id = setTimeout(() => setReadingReady(true), 0)
    return () => clearTimeout(id)
  }, [chartData])

  const handleSubmit = async (formData: Record<string, string>) => {
    setLastFormData(formData)
    setDisplayLocation(formData.location || '')
    setLoading(true)
    setError(null)
    setChartData(null)
    setReadingReady(false)
    capture('chart_submit')
    try {
      const res = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          body.message ||
          "We couldn't calculate your chart. This usually means the birth data, location lookup, or ephemeris service failed. Please check the details and try again."
        )
      }
      const data: DualChartData = await res.json()
      capture('calculate_success', { pluto_source: data.plutoSource })
      setChartData(data)
      setTimeout(() => {
        readingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      capture('calculate_failed', { error: msg })
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't calculate your chart. Please check the details and try again."
      )
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = () => {
    if (lastFormData) handleSubmit(lastFormData)
  }

  return (
    <main className={styles.main}>
      {/* Pre-chart flow — ported AXIS landing (home view of preview.html),
          with the real BirthForm wired into the live cast flow. */}
      {!chartData && (
        <PreviewLanding
          onSubmit={handleSubmit}
          loading={loading}
          error={error}
          onRetry={handleRetry}
        />
      )}

      {/* Loading */}
      {loading && (
        <div className={styles.loadingState}>
          <div className={styles.loadingOrb} />
          <p className={styles.loadingText}>Aligning dual map</p>
          <p className={styles.loadingSubText}>Resolving coordinates · calculating houses · preparing both charts</p>
        </div>
      )}

      {/* Chart + reading */}
      {chartData && (
        <div className={styles.readingLayout} ref={readingRef}>
          <DossierHeader chartData={chartData} displayLocation={displayLocation} />
          <section className={styles.wheelSection}>
            <p className={styles.wheelSectionLabel}>Natal chart</p>
            {/* Both wheels always visible (DOCTRINE.md: CO-VISIBILITY).
                A single concentric dual-ring wheel (outer Tropical, inner Sidereal,
                offset by the true ayanamsa) replaces this in a later pass. */}
            <div className={styles.wheelPair}>
              <div className={styles.wheelItem}>
                <p className={styles.wheelLabel}>Tropical</p>
                <ChartWheel chart={chartData.tropical} />
              </div>
              <div className={styles.wheelDivider}>
                <svg width="1" height="240" viewBox="0 0 1 240">
                  <line x1="0.5" y1="0" x2="0.5" y2="240" stroke="rgba(26,20,32,0.18)" strokeWidth="1" />
                </svg>
              </div>
              <div className={styles.wheelItem}>
                <p className={styles.wheelLabel}>Sidereal</p>
                <ChartWheel chart={chartData.sidereal} />
              </div>
            </div>
          </section>
          {/* 'synthesis' here is the component's dual-display mode identifier,
              not a rendered label — it shows both systems' columns at once */}
          <ChartFactsPanel data={chartData} activeSection="synthesis" />
          {readingReady && (
            <ReadingPanel chartData={chartData} />
          )}
          <div className={styles.resetRow}>
            <button
              className={styles.resetBtn}
              onClick={() => { capture('new_chart'); setChartData(null); setDisplayLocation(''); setError(null) }}
            >
              Cast another chart
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
