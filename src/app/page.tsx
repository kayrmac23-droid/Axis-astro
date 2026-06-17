'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BirthForm from '@/components/BirthForm'
import ChartWheel from '@/components/ChartWheel'
import ChartFactsPanel from '@/components/ChartFactsPanel'
import ReadingPanel from '@/components/ReadingPanel'
import HeroSection from '@/components/hero/HeroSection'
import DossierHeader from '@/components/DossierHeader'
import { DualChartData } from '@/lib/astro-calc'
import styles from './page.module.css'
import { capture } from '@/lib/analytics'

type ActiveSection = 'tropical' | 'sidereal' | 'synthesis'

export default function Home() {
  const router = useRouter()
  const [chartData, setChartData] = useState<DualChartData | null>(null)
  const [readingReady, setReadingReady] = useState(false)
  const [activeSection, setActiveSection] = useState<ActiveSection>('tropical')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFormData, setLastFormData] = useState<Record<string, string> | null>(null)
  const [displayLocation, setDisplayLocation] = useState<string>('')
  const readingRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  // Let the chart wheel and facts panel paint before mounting ReadingPanel.
  // setTimeout(0) defers to the next macrotask — at least one render+paint
  // cycle completes, so the user sees the chart before streaming requests fire.
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
      setActiveSection('tropical')

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
          <HeroSection
            onCreateClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })}
            onSampleClick={() => router.push('/sample')}
          />

          <section className={styles.formSection} ref={formRef}>
            <div className={styles.formIntro}>
              <p className={styles.formIntroLabel}>Birth coordinates</p>
              <h3 className={styles.formIntroTitle}>
                Enter birth coordinates.
              </h3>
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
        </>
      )}

      {/* Loading */}
      {loading && (
        <div className={styles.loadingState}>
          <div className={styles.loadingOrb} />
          <p className={styles.loadingText}>Aligning dual map</p>
          <p className={styles.loadingSubText}>Resolving coordinates · calculating houses · preparing synthesis</p>
        </div>
      )}

      {/* Chart + reading */}
      {chartData && (
        <div className={styles.readingLayout} ref={readingRef}>
          <DossierHeader chartData={chartData} displayLocation={displayLocation} />

          <section className={styles.wheelSection}>
            <p className={styles.wheelSectionLabel}>Natal chart</p>
            {activeSection === 'tropical' && (
              <div className={styles.wheelSingle}>
                <p className={styles.wheelLabel}>Tropical</p>
                <ChartWheel chart={chartData.tropical} />
              </div>
            )}
            {activeSection === 'sidereal' && (
              <div className={styles.wheelSingle}>
                <p className={styles.wheelLabel}>Sidereal</p>
                <ChartWheel chart={chartData.sidereal} />
              </div>
            )}
            {activeSection === 'synthesis' && (
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
            )}
          </section>

          <ChartFactsPanel data={chartData} activeSection={activeSection} />

          <div className={styles.tabBar}>
            <button
              className={`${styles.tab} ${activeSection === 'tropical' ? styles.tabActive : ''}`}
              onClick={() => setActiveSection('tropical')}
            >
              <span className={styles.tabLabel}>Tropical</span>
              <span className={styles.tabSub}>the self you know</span>
            </button>
            <button
              className={`${styles.tab} ${activeSection === 'sidereal' ? styles.tabActive : ''}`}
              onClick={() => setActiveSection('sidereal')}
            >
              <span className={styles.tabLabel}>Sidereal</span>
              <span className={styles.tabSub}>the self beneath</span>
            </button>
            <button
              className={`${styles.tab} ${activeSection === 'synthesis' ? styles.tabActive : ''}`}
              onClick={() => setActiveSection('synthesis')}
            >
              <span className={styles.tabLabel}>Synthesis</span>
              <span className={styles.tabSub}>concordance · dissonance · the gap</span>
            </button>
          </div>

          {readingReady && (
            <ReadingPanel chartData={chartData} section={activeSection} />
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

      <footer className={styles.footer}>
        <p>AXIS — Precision dual-system astrology</p>
      </footer>
    </main>
  )
}
