'use client'
import { useState, useRef } from 'react'
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
            <svg className={styles.heroDecor} width="520" height="520" viewBox="0 0 520 520" fill="none">
              {/* Outer ring */}
              <circle cx="260" cy="260" r="240" stroke="rgba(201,150,46,0.1)" strokeWidth="0.7"/>
              {/* 12 spokes radiating from centre */}
              {[...Array(12)].map((_, i) => {
                const rad = (i * 30 - 90) * Math.PI / 180
                const isMajor = i % 3 === 0
                return (
                  <line
                    key={`spoke-${i}`}
                    x1={260} y1={260}
                    x2={260 + 240 * Math.cos(rad)} y2={260 + 240 * Math.sin(rad)}
                    stroke={isMajor ? 'rgba(201,150,46,0.13)' : 'rgba(201,150,46,0.06)'}
                    strokeWidth={isMajor ? '0.7' : '0.4'}
                  />
                )
              })}
              {/* Zodiac glyphs centred in each section */}
              {['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'].map((glyph, i) => {
                const rad = (i * 30 - 75) * Math.PI / 180
                return (
                  <text
                    key={`zodiac-${i}`}
                    x={260 + 210 * Math.cos(rad)}
                    y={260 + 210 * Math.sin(rad)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="15"
                    fill="rgba(201,150,46,0.18)"
                    fontFamily="serif"
                  >{glyph}</text>
                )
              })}
              {/* Centre point */}
              <circle cx="260" cy="260" r="2.5" fill="rgba(201,150,46,0.3)"/>
            </svg>
          </div>
          <div className={styles.heroContent}>
            <p className={styles.heroText}>
              Tropical astrology reveals the self you know.
              Sidereal astrology reveals the self beneath conditioning, karma, and time.
              <span className={styles.heroEmphasis}>AXIS exists where both truths meet.</span>
            </p>
            <svg className={styles.emphasisRule} width="220" height="14" viewBox="0 0 220 14" fill="none" aria-hidden="true">
              <line x1="0" y1="7" x2="96" y2="7" stroke="rgba(201,150,46,0.35)" strokeWidth="0.6"/>
              <circle cx="110" cy="7" r="2" fill="rgba(201,150,46,0.45)"/>
              <line x1="124" y1="7" x2="220" y2="7" stroke="rgba(201,150,46,0.35)" strokeWidth="0.6"/>
            </svg>
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
