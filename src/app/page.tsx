'use client'
import { useState, useRef, useEffect } from 'react'
import BirthForm from '@/components/BirthForm'
import ChartWheel from '@/components/ChartWheel'
import ReadingPanel from '@/components/ReadingPanel'
import { DualChartData } from '@/lib/astro-calc'
import styles from './page.module.css'

type ActiveSection = 'tropical' | 'sidereal' | 'synthesis'

export default function Home() {
  const [chartData, setChartData] = useState<DualChartData | null>(null)
  const [activeSection, setActiveSection] = useState<ActiveSection>('tropical')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const readingRef = useRef<HTMLDivElement>(null)

  const handleSubmit = async (formData: Record<string, string>) => {
    setLoading(true)
    setError(null)
    setChartData(null)

    try {
      const res = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!res.ok) throw new Error('Calculation failed')
      const data: DualChartData = await res.json()
      setChartData(data)
      setActiveSection('tropical')

      setTimeout(() => {
        readingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    } catch {
      setError('Chart calculation failed. Please check your birth data.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={styles.main}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logoMark}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="13" stroke="#c9962e" strokeWidth="0.5" />
              <circle cx="14" cy="14" r="7" stroke="#c9962e" strokeWidth="0.5" opacity="0.5" />
              <line x1="14" y1="1" x2="14" y2="27" stroke="#c9962e" strokeWidth="0.5" opacity="0.4" />
              <line x1="1" y1="14" x2="27" y2="14" stroke="#c9962e" strokeWidth="0.5" opacity="0.4" />
              <circle cx="14" cy="14" r="1.5" fill="#c9962e" />
            </svg>
          </div>
          <h1 className={styles.logo}>AXIS</h1>
          <p className={styles.tagline}>Two systems. One self.</p>
        </div>
      </header>

      {/* Hero */}
      {!chartData && (
        <section className={styles.hero}>
          <div className={styles.heroDecorWrap} aria-hidden="true">
            <svg className={styles.heroDecor} width="500" height="500" viewBox="0 0 500 500" fill="none">
              <circle cx="250" cy="250" r="230" stroke="rgba(201,150,46,0.045)" strokeWidth="0.5" strokeDasharray="2 10"/>
              <circle cx="250" cy="250" r="178" stroke="rgba(201,150,46,0.035)" strokeWidth="0.5"/>
              <circle cx="250" cy="250" r="114" stroke="rgba(201,150,46,0.03)" strokeWidth="0.5" strokeDasharray="1.5 7"/>
              <line x1="250" y1="20" x2="250" y2="480" stroke="rgba(201,150,46,0.04)" strokeWidth="0.5"/>
              <line x1="20" y1="250" x2="480" y2="250" stroke="rgba(201,150,46,0.04)" strokeWidth="0.5"/>
              {[...Array(12)].map((_, i) => {
                const rad = (i * 30 - 90) * Math.PI / 180
                const cos = Math.cos(rad)
                const sin = Math.sin(rad)
                return (
                  <g key={i}>
                    <line x1={250 + 230 * cos} y1={250 + 230 * sin} x2={250 + 214 * cos} y2={250 + 214 * sin} stroke="rgba(201,150,46,0.09)" strokeWidth="0.5"/>
                    <line x1={250 + 178 * cos} y1={250 + 178 * sin} x2={250 + 166 * cos} y2={250 + 166 * sin} stroke="rgba(201,150,46,0.055)" strokeWidth="0.5"/>
                  </g>
                )
              })}
              <circle cx="250" cy="250" r="5" stroke="rgba(201,150,46,0.14)" strokeWidth="0.5" fill="none"/>
              <circle cx="250" cy="250" r="1.5" fill="rgba(201,150,46,0.2)"/>
            </svg>
          </div>
          <div className={styles.heroContent}>
            <p className={styles.heroText}>
              Tropical astrology reveals the self you know.
              Sidereal astrology reveals the self beneath conditioning, karma, and time.
              <span className={styles.heroEmphasis}>AXIS exists where both truths meet.</span>
            </p>
          </div>
        </section>
      )}

      {/* Birth Form */}
      {!chartData && (
        <section className={styles.formSection}>
          <BirthForm onSubmit={handleSubmit} loading={loading} />
          {error && <p className={styles.error}>{error}</p>}
        </section>
      )}

      {/* Loading */}
      {loading && (
        <div className={styles.loadingState}>
          <div className={styles.loadingOrb} />
          <p className={styles.loadingText}>Calculating positions...</p>
        </div>
      )}

      {/* Chart + Reading */}
      {chartData && (
        <div className={styles.readingLayout} ref={readingRef}>

          {/* Chart Wheels */}
          <section className={styles.wheelSection}>
            <div className={styles.wheelPair}>
              <div className={styles.wheelItem}>
                <p className={styles.wheelLabel}>Tropical</p>
                <ChartWheel chart={chartData.tropical} />
              </div>
              <div className={styles.wheelDivider}>
                <svg width="1" height="200" viewBox="0 0 1 200">
                  <line x1="0.5" y1="0" x2="0.5" y2="200" stroke="#2a2a2a" strokeWidth="1" />
                </svg>
              </div>
              <div className={styles.wheelItem}>
                <p className={styles.wheelLabel}>Sidereal</p>
                <ChartWheel chart={chartData.sidereal} />
              </div>
            </div>
          </section>

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

          {/* Reading */}
          <ReadingPanel
            chartData={chartData}
            section={activeSection}
          />

          {/* Actions */}
          <div className={styles.resetRow}>
            <button
              className={styles.pdfBtn}
              onClick={() => window.print()}
            >
              Download PDF
            </button>
            <button
              className={styles.resetBtn}
              onClick={() => { setChartData(null); setError(null) }}
            >
              New chart
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className={styles.footer}>
        <p>AXIS — Precision dual-system astrology</p>
      </footer>
    </main>
  )
}
