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
          {/* Crescent moon — static, behind text */}
          <svg className={styles.heroMoon} width="380" height="380" viewBox="0 0 380 380" fill="none" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M 190 50 A 140 140 0 1 0 190 330 A 161 161 0 1 1 190 50 Z"
              fill="rgba(201,150,46,0.07)"
              stroke="rgba(201,150,46,0.13)"
              strokeWidth="0.6"
            />
          </svg>
          <div className={styles.heroDecorWrap} aria-hidden="true">
            <svg className={styles.heroDecor} width="520" height="520" viewBox="0 0 520 520" fill="none">
              {/* Outer ring with dashes */}
              <circle cx="260" cy="260" r="240" stroke="rgba(201,150,46,0.12)" strokeWidth="0.8" strokeDasharray="3 12"/>
              {/* Mid ring */}
              <circle cx="260" cy="260" r="186" stroke="rgba(201,150,46,0.09)" strokeWidth="0.6"/>
              {/* Inner ring */}
              <circle cx="260" cy="260" r="120" stroke="rgba(201,150,46,0.08)" strokeWidth="0.6" strokeDasharray="2 8"/>
              {/* Cross hairs */}
              <line x1="260" y1="20" x2="260" y2="500" stroke="rgba(201,150,46,0.07)" strokeWidth="0.5"/>
              <line x1="20" y1="260" x2="500" y2="260" stroke="rgba(201,150,46,0.07)" strokeWidth="0.5"/>
              {/* 12 tick marks on outer ring */}
              {[...Array(12)].map((_, i) => {
                const rad = (i * 30 - 90) * Math.PI / 180
                const cos = Math.cos(rad)
                const sin = Math.sin(rad)
                const isMajor = i % 3 === 0
                return (
                  <g key={i}>
                    <line
                      x1={260 + 240 * cos} y1={260 + 240 * sin}
                      x2={260 + (isMajor ? 218 : 226) * cos} y2={260 + (isMajor ? 218 : 226) * sin}
                      stroke={isMajor ? 'rgba(201,150,46,0.22)' : 'rgba(201,150,46,0.12)'}
                      strokeWidth={isMajor ? '1' : '0.6'}
                    />
                    <line
                      x1={260 + 186 * cos} y1={260 + 186 * sin}
                      x2={260 + 174 * cos} y2={260 + 174 * sin}
                      stroke="rgba(201,150,46,0.1)" strokeWidth="0.5"
                    />
                  </g>
                )
              })}
              {/* Centre */}
              <circle cx="260" cy="260" r="6" stroke="rgba(201,150,46,0.25)" strokeWidth="0.8" fill="none"/>
              <circle cx="260" cy="260" r="2" fill="rgba(201,150,46,0.35)"/>
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
