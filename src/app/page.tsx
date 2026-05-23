'use client'
import { useState, useRef, useEffect } from 'react'
import BirthForm from '@/components/BirthForm'
import ChartWheel from '@/components/ChartWheel'
import ChartFactsPanel from '@/components/ChartFactsPanel'
import ReadingPanel from '@/components/ReadingPanel'
import AstrolabePlate from '@/components/hero/AstrolabePlate'
import Starfield from '@/components/hero/Starfield'
import ConstellationDecor from '@/components/hero/ConstellationDecor'
import HeroNotation from '@/components/hero/HeroNotation'
import { DualChartData } from '@/lib/astro-calc'
import styles from './page.module.css'
import { capture } from '@/lib/analytics'

type ActiveSection = 'tropical' | 'sidereal' | 'synthesis'

export default function Home() {
  const [chartData, setChartData] = useState<DualChartData | null>(null)
  const [readingReady, setReadingReady] = useState(false)
  const [activeSection, setActiveSection] = useState<ActiveSection>('tropical')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFormData, setLastFormData] = useState<Record<string, string> | null>(null)
  const readingRef = useRef<HTMLDivElement>(null)

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

      {/* Masthead */}
      <header className={styles.header}>
        <div className={styles.logoBlock}>
          <h1 className={styles.logo}>AXIS</h1>
          <p className={styles.logoSub}>Dual-system astrology</p>
        </div>
        <div className={styles.headerMid}>
          <p className={styles.tagline}>Tropical · Sidereal · Synthesis</p>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.headerStat}>Tropical</span>
          <span className={styles.headerStat}>Sidereal</span>
        </div>
        <hr className={styles.headerRule} />
      </header>

      {/* Hero */}
      {!chartData && (
        <section className={styles.hero}>
          <Starfield />
          <ConstellationDecor />

          <div className={styles.heroGrid}>
            <div className={styles.heroLeft}>
              <p className={styles.heroEyebrow}>Natal chart reading</p>
              <h2 className={styles.heroHeadline}>
                Two systems.<br />
                <span className={styles.heroAccent}>One truth.</span>
              </h2>
            </div>

            <div className={styles.heroCenter}>
              <HeroNotation />
              <AstrolabePlate />
            </div>

            <div className={styles.heroRight}>
              <p className={styles.heroBody}>
                Tropical maps the psychological architecture of a self.
                Sidereal maps the incarnational conditions it navigates.
                The synthesis is where both truths meet.
              </p>
              <p className={styles.heroBody}>
                Written for readers who take astrology seriously — students of
                the technical literature, therapy-adjacent readers, the
                contemplative traditions.
              </p>
              <p className={styles.heroDetail}>
                Western Tropical · Vedic Sidereal · Synthesis Reading
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Birth Form */}
      {!chartData && (
        <section className={styles.formSection}>
          <div className={styles.formIntro}>
            <p className={styles.formIntroLabel}>Your birth data</p>
            <h3 className={styles.formIntroTitle}>
              Enter your details to cast the chart.
            </h3>
            <p className={styles.formIntroDesc}>
              Date, time, and place of birth determine the positions
              of every planet at the moment you arrived on Earth.
              Precision matters — especially for the Ascendant.
            </p>
          </div>
          <div className={styles.formRight}>
            <BirthForm onSubmit={handleSubmit} loading={loading} />
            {error && (
              <div className={styles.calcError}>
                <p className={styles.calcErrorMsg}>{error}</p>
                <button
                  className={styles.calcRetryBtn}
                  onClick={handleRetry}
                  disabled={loading}
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Loading */}
      {loading && (
        <div className={styles.loadingState}>
          <div className={styles.loadingOrb} />
          <p className={styles.loadingText}>Calculating positions</p>
        </div>
      )}

      {/* Chart + Reading */}
      {chartData && (
        <div className={styles.readingLayout} ref={readingRef}>

          {/* Chart Wheels */}
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
                    <line x1="0.5" y1="0" x2="0.5" y2="240"
                      stroke="rgba(26,20,32,0.18)" strokeWidth="1" />
                  </svg>
                </div>
                <div className={styles.wheelItem}>
                  <p className={styles.wheelLabel}>Sidereal</p>
                  <ChartWheel chart={chartData.sidereal} />
                </div>
              </div>
            )}
          </section>

          {/* Chart Facts */}
          <ChartFactsPanel data={chartData} />

          {/* Section Tabs */}
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
              <span className={styles.tabSub}>concordance · dissonance · integration</span>
            </button>
          </div>

          {/* Reading — mounted after chart paints so the wheel and facts
              are visible before streaming requests fire */}
          {readingReady && (
            <ReadingPanel
              chartData={chartData}
              section={activeSection}
            />
          )}

          {/* Actions */}
          <div className={styles.resetRow}>
            <button className={styles.pdfBtn} onClick={() => { capture('print_pdf'); window.print() }}>
              Download PDF
            </button>
            <button
              className={styles.resetBtn}
              onClick={() => { capture('new_chart'); setChartData(null); setError(null) }}
            >
              New chart
            </button>
          </div>
        </div>
      )}

      <footer className={styles.footer}>
        <p>Axis — Precision dual-system astrology</p>
      </footer>
    </main>
  )
}
