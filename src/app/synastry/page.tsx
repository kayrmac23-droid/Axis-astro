'use client'
import { useState, useRef } from 'react'
import BirthForm from '@/components/BirthForm'
import FrameShiftWheel from '@/components/FrameShiftWheel'
import AstrolabeDecor from '@/components/AstrolabeDecor'
import SynastryAspectsPanel from '@/components/SynastryAspectsPanel'
import SynastryReadingPanel from '@/components/SynastryReadingPanel'
import { SynastryData } from '@/lib/synastry-calc'
import styles from '../page.module.css'

export default function SynastryPage() {
  const [synastryData, setSynastryData] = useState<SynastryData | null>(null)
  const [personAData, setPersonAData] = useState<Record<string, string> | null>(null)
  const [personBData, setPersonBData] = useState<Record<string, string> | null>(null)
  const [synastryLoading, setSynastryLoading] = useState(false)
  const [synastryError, setSynastryError] = useState<string | null>(null)
  // Same tropical/sidereal frame mechanism the main app uses (see page.tsx);
  // one frame per person so each chart can be shifted independently.
  const [frameA, setFrameA] = useState<'tropical' | 'sidereal'>('tropical')
  const [frameB, setFrameB] = useState<'tropical' | 'sidereal'>('tropical')
  const readingRef = useRef<HTMLDivElement>(null)

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
        throw new Error(body.message || 'Synastry calculation failed. Please check both sets of birth data.')
      }
      const data: SynastryData = await res.json()
      setSynastryData(data)
      setTimeout(() => {
        readingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    } catch (err) {
      setSynastryError(err instanceof Error ? err.message : 'Synastry calculation failed. Please try again.')
    } finally {
      setSynastryLoading(false)
    }
  }

  return (
    <main className={styles.main}>
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
          <section className={styles.wheelSection}>
            <p className={styles.wheelSectionLabel}>Natal charts — both frames</p>
            <div className={styles.synastryWheelBreakout}>
              <div className={styles.synastryWheelStack}>
                <div className={styles.wheelItem}>
                  <p className={styles.wheelLabel}>Person A</p>
                  <FrameShiftWheel
                    data={synastryData.personA}
                    frame={frameA}
                    onFrameChange={setFrameA}
                  />
                </div>
                <div className={styles.wheelItem}>
                  <p className={styles.wheelLabel}>Person B</p>
                  <FrameShiftWheel
                    data={synastryData.personB}
                    frame={frameB}
                    onFrameChange={setFrameB}
                  />
                </div>
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
                setFrameA('tropical'); setFrameB('tropical')
              }}
            >
              New synastry
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
