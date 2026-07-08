'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BirthForm from '@/components/BirthForm'
import DualChartWheel from '@/components/DualChartWheel'
import ChartFactsPanel from '@/components/ChartFactsPanel'
import ReadingPanel from '@/components/ReadingPanel'
import HeroSection from '@/components/hero/HeroSection'
import DossierHeader from '@/components/DossierHeader'
import LandingPage from '@/components/LandingPage'
import { DualChartData } from '@/lib/astro-calc'
import styles from './page.module.css'
import { capture } from '@/lib/analytics'

export default function Home() {
  const router = useRouter()
  const [chartData, setChartData] = useState<DualChartData | null>(null)
  const [readingReady, setReadingReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFormData, setLastFormData] = useState<Record<string, string> | null>(null)
  const [displayLocation, setDisplayLocation] = useState<string>('')
  const readingRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

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
      {/* Pre-chart flow */}
      {!chartData && (
        <>
          {/* ── Hero ── */}
          <HeroSection
            onCreateClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })}
            onSampleClick={() => router.push('/sample')}
          />

          {/* ── Birth form ── */}
          <section className={styles.formSection} id="get-reading" ref={formRef}>
            <div className={styles.formIntro}>
              <p className={styles.formIntroLabel}>Birth coordinates</p>
              <h3 className={styles.formIntroTitle}>Enter birth coordinates.</h3>
              <p className={styles.formIntroDesc}>
                Date, time, and place anchor the map. Precision matters most for the Ascendant and house structure.
              </p>
            </div>
            <div className={styles.formRight}>
              <BirthForm onSubmit={handleSubmit} loading={loading} submitLabel="Begin the AXIS reading" />
              {error && (
                <div className={styles.calcError}>
                  <p className={styles.calcErrorMsg}>{error}</p>
                  <button className={styles.calcRetryBtn} onClick={handleRetry} disabled={loading}>
                    Try again
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* ── Marketing sections ── */}
          <LandingPage />
        </>
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
            {/* One wheel, both systems co-visible (DOCTRINE.md: CO-VISIBILITY).
                Outer ring: Tropical. Inner ring: Sidereal. Both plot in one
                shared frame, so a planet's two positions sit the true ayanamsa
                apart — tap a planet and the arc renders that distance. */}
            <div className={styles.wheelSingle}>
              <DualChartWheel data={chartData} size={420} />
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
