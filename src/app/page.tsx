'use client'
import { useState, useRef, useEffect } from 'react'
import BirthForm from '@/components/BirthForm'
import ChartWheel from '@/components/ChartWheel'
import ChartFactsPanel from '@/components/ChartFactsPanel'
import ReadingPanel from '@/components/ReadingPanel'
import SynastryAspectsPanel from '@/components/SynastryAspectsPanel'
import SynastryReadingPanel from '@/components/SynastryReadingPanel'
import AstrolabeDecor from '@/components/AstrolabeDecor'
import SiteHeader from '@/components/SiteHeader'
import HeroSection from '@/components/hero/HeroSection'
import MethodPremise from '@/components/MethodPremise'
import SampleDossier from '@/components/SampleDossier'
import MethodologyStrip from '@/components/MethodologyStrip'
import DossierHeader from '@/components/DossierHeader'
import AxisTensionSummary from '@/components/AxisTensionSummary'
import { DualChartData } from '@/lib/astro-calc'
import { SynastryData } from '@/lib/synastry-calc'
import styles from './page.module.css'
import { capture } from '@/lib/analytics'

type ActiveSection = 'tropical' | 'sidereal' | 'synthesis'
type AppMode = 'natal' | 'synastry'

export default function Home() {
  const [appMode, setAppMode] = useState<AppMode>('natal')
  const [chartData, setChartData] = useState<DualChartData | null>(null)
  const [readingReady, setReadingReady] = useState(false)
  const [activeSection, setActiveSection] = useState<ActiveSection>('tropical')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFormData, setLastFormData] = useState<Record<string, string> | null>(null)
  // Synastry state
  const [synastryData, setSynastryData] = useState<SynastryData | null>(null)
  const [personAData, setPersonAData] = useState<Record<string, string> | null>(null)
  const [personBData, setPersonBData] = useState<Record<string, string> | null>(null)
  const [synastryLoading, setSynastryLoading] = useState(false)
  const [synastryError, setSynastryError] = useState<string | null>(null)
  const readingRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const sampleRef = useRef<HTMLElement>(null)
  const methodRef = useRef<HTMLElement>(null)

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

  const handleCalculateSynastry = async () => {
    if (!personAData || !personBData) return
    setSynastryLoading(true)
    setSynastryError(null)
    setSynastryData(null)
    try {
      const res = await fetch('/api/synastry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personA: personAData, personB: personBData }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || "Synastry calculation failed. Please check both sets of birth data.")
      }
      const data: SynastryData = await res.json()
      setSynastryData(data)
      setTimeout(() => {
        readingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    } catch (err) {
      setSynastryError(err instanceof Error ? err.message : "Synastry calculation failed. Please try again.")
    } finally {
      setSynastryLoading(false)
    }
  }

  const switchMode = (mode: AppMode) => {
    setAppMode(mode)
    setChartData(null); setReadingReady(false); setError(null)
    setSynastryData(null); setPersonAData(null); setPersonBData(null); setSynastryError(null)
  }

  return (
    <main className={styles.main}>

      {/* Modular Header */}
      <SiteHeader 
        onMethodClick={() => methodRef.current?.scrollIntoView({ behavior: 'smooth' })}
        onSampleClick={() => sampleRef.current?.scrollIntoView({ behavior: 'smooth' })}
        onCreateClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })}
      />

      {/* Mode toggle */}
      {!chartData && !synastryData && (
        <div className={styles.modeToggle}>
          <button
            className={`${styles.modeBtn} ${appMode === 'natal' ? styles.modeBtnActive : ''}`}
            onClick={() => switchMode('natal')}
          >
            Natal Chart
          </button>
          <button
            className={`${styles.modeBtn} ${appMode === 'synastry' ? styles.modeBtnActive : ''}`}
            onClick={() => switchMode('synastry')}
          >
            Synastry
          </button>
        </div>
      )}

      {/* ── NATAL MODE ── */}
      {appMode === 'natal' && (
        <>
          {/* Pre-chart Flow */}
          {!chartData && (
            <>
              <HeroSection 
                onCreateClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })}
                onSampleClick={() => sampleRef.current?.scrollIntoView({ behavior: 'smooth' })}
              />
              <MethodPremise ref={methodRef} />
              <SampleDossier ref={sampleRef} />
              <MethodologyStrip />
            </>
          )}

          {/* Birth Form */}
          {!chartData && (
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
          )}

          {/* Loading */}
          {loading && (
            <div className={styles.loadingState}>
              <div className={styles.loadingOrb} />
              <p className={styles.loadingText}>Aligning dual map</p>
              <p className={styles.loadingSubText}>Resolving coordinates · calculating houses · preparing synthesis</p>
            </div>
          )}

          {/* Chart + Reading */}
          {chartData && (
            <div className={styles.readingLayout} ref={readingRef}>
              <DossierHeader chartData={chartData} />
              <AxisTensionSummary chartData={chartData} />
              
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
                  <span className={styles.tabSub}>concordance · dissonance · integration</span>
                </button>
              </div>

              {readingReady && (
                <ReadingPanel chartData={chartData} section={activeSection} />
              )}

              <div className={styles.resetRow}>
                <button
                  className={styles.resetBtn}
                  onClick={() => { capture('new_chart'); setChartData(null); setError(null) }}
                >
                  Cast another chart
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── SYNASTRY MODE ── */}
      {appMode === 'synastry' && (
        <>
          {/* Synastry hero */}
          {!synastryData && (
            <section className={styles.hero}>
              <div className={styles.heroLeft}>
                <p className={styles.heroEyebrow}>Synastry reading</p>
                <h2 className={styles.heroHeadline}>
                  Two charts.<br />
                  <span className={styles.heroAccent}>One field.</span>
                </h2>
              </div>
              <div className={styles.heroCenter}>
                <AstrolabeDecor />
              </div>
              <div className={styles.heroRight}>
                <p className={styles.heroBody}>
                  Synastry maps the live field between two charts —
                  the aspects, the composite entity, and what each person
                  activates in the other.
                </p>
                <p className={styles.heroDetail}>
                  Inter-chart aspects · Composite chart · Relationship reading
                </p>
              </div>
            </section>
          )}

          {/* Dual birth forms */}
          {!synastryData && (
            <section className={styles.synastryForms}>
              <div className={styles.synastryFormSlot}>
                <div className={styles.synastryPersonLabel}>
                  <span className={styles.synastryPersonTag}>A</span>
                  <span className={styles.synastryPersonTitle}>Person A</span>
                  {personAData && <span className={styles.synastryPersonSet}>✓ Set</span>}
                </div>
                <BirthForm
                  onSubmit={data => setPersonAData(data)}
                  loading={false}
                  submitLabel="Set Person A"
                />
              </div>
              <div className={styles.synastryFormSlot}>
                <div className={styles.synastryPersonLabel}>
                  <span className={styles.synastryPersonTag}>B</span>
                  <span className={styles.synastryPersonTitle}>Person B</span>
                  {personBData && <span className={styles.synastryPersonSet}>✓ Set</span>}
                </div>
                <BirthForm
                  onSubmit={data => setPersonBData(data)}
                  loading={false}
                  submitLabel="Set Person B"
                />
              </div>
            </section>
          )}

          {/* Calculate synastry button */}
          {!synastryData && (personAData || personBData) && (
            <div className={styles.synastryCalcRow}>
              {synastryError && (
                <p className={styles.calcErrorMsg}>{synastryError}</p>
              )}
              <button
                className={styles.submitBtn}
                disabled={!personAData || !personBData || synastryLoading}
                onClick={handleCalculateSynastry}
              >
                {synastryLoading ? (
                  <span className={styles.btnLoading}>
                    <span className={styles.btnSpinner} />
                    Calculating
                  </span>
                ) : (
                  !personAData ? 'Set Person A first'
                  : !personBData ? 'Set Person B first'
                  : 'Calculate Synastry'
                )}
              </button>
            </div>
          )}

          {/* Synastry loading */}
          {synastryLoading && (
            <div className={styles.loadingState}>
              <div className={styles.loadingOrb} />
              <p className={styles.loadingText}>Calculating synastry</p>
            </div>
          )}

          {/* Synastry results */}
          {synastryData && (
            <div className={styles.readingLayout} ref={readingRef}>
              {/* Side-by-side wheels */}
              <section className={styles.wheelSection}>
                <p className={styles.wheelSectionLabel}>Natal charts</p>
                <div className={styles.wheelPair}>
                  <div className={styles.wheelItem}>
                    <p className={styles.wheelLabel}>Person A — Tropical</p>
                    <ChartWheel chart={synastryData.personA.tropical} />
                  </div>
                  <div className={styles.wheelDivider}>
                    <svg width="1" height="240" viewBox="0 0 1 240">
                      <line x1="0.5" y1="0" x2="0.5" y2="240" stroke="rgba(26,20,32,0.18)" strokeWidth="1" />
                    </svg>
                  </div>
                  <div className={styles.wheelItem}>
                    <p className={styles.wheelLabel}>Person B — Tropical</p>
                    <ChartWheel chart={synastryData.personB.tropical} />
                  </div>
                </div>
              </section>

              <SynastryAspectsPanel data={synastryData} />
              <SynastryReadingPanel synastryData={synastryData} />

              <div className={styles.resetRow}>
                <button className={styles.pdfBtn} onClick={() => window.print()}>
                  Download PDF
                </button>
                <button
                  className={styles.resetBtn}
                  onClick={() => {
                    setSynastryData(null); setPersonAData(null)
                    setPersonBData(null); setSynastryError(null)
                  }}
                >
                  New synastry
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <footer className={styles.footer}>
        <p>AXIS — Precision dual-system astrology</p>
      </footer>
    </main>
  )
}
