'use client'
import { useState, useRef } from 'react'
import BirthForm from '@/components/BirthForm'
import FrameShiftWheel from '@/components/FrameShiftWheel'
import SynastryAspectsPanel from '@/components/SynastryAspectsPanel'
import SynastryReadingPanel from '@/components/SynastryReadingPanel'
import ComputationInterstitial from '@/components/ComputationInterstitial'
import { SynastryData } from '@/lib/synastry-calc'
import styles from './synastry.module.css'

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function castLine(f: Record<string, string> | null): string {
  if (!f) return ''
  const mi = Math.min(11, Math.max(0, (parseInt(f.month, 10) || 1) - 1))
  const place = (f.location || '').toUpperCase()
  const unknown = f.birthTimeUnknown === 'true'
  let time = 'TIME UNKNOWN'
  if (!unknown) {
    const h24 = parseInt(f.hour, 10)
    if (!isNaN(h24)) {
      const isPM = h24 >= 12
      const h = h24 % 12 || 12
      time = `${String(h).padStart(2, '0')}:${String(f.minute || '00').padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`
    }
  }
  return [place, `${parseInt(f.day, 10) || 1} ${MON[mi]} ${f.year}`, time].filter(Boolean).join(' · ')
}

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

  const setCount = [personAData, personBData].filter(Boolean).length
  const bothSet = setCount === 2
  const statusText = bothSet
    ? '// BOTH CHARTS SET · READY'
    : `// ${setCount} OF 2 SET · AWAITING PERSON ${!personAData ? 'A' : 'B'}`
  const calcLabel = !personAData ? 'SET PERSON A FIRST' : !personBData ? 'SET PERSON B FIRST' : 'CALCULATE SYNASTRY'

  const reset = () => {
    setSynastryData(null); setPersonAData(null)
    setPersonBData(null); setSynastryError(null)
    setFrameA('tropical'); setFrameB('tropical')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  if (synastryLoading) {
    return (
      <ComputationInterstitial
        variant="synastry"
        ayanamsa="24°13′"
        line={`${(personAData?.location || '').toUpperCase()} × ${(personBData?.location || '').toUpperCase()} · TWO CHARTS · BOTH FRAMES`}
      />
    )
  }

  return (
    <main className={styles.main}>
      {!synastryData && (
        <>
          {/* Hero */}
          <section className={styles.hero}>
            <div>
              <div className={styles.kicker}>{'// SYNASTRY'}</div>
              <h1 className={styles.h1}>Two charts. One field.</h1>
            </div>
            <div>
              <p className={styles.heroBody}>Synastry maps the live field between two charts: the inter-chart aspects, the composite entity, and what each person activates in the other. Both charts are cast in both frames.</p>
              <div className={styles.heroDetail}>INTER-CHART ASPECTS · COMPOSITE CHART · RELATIONSHIP READING</div>
            </div>
          </section>

          {/* Person forms */}
          <section className={styles.forms}>
            {([
              { tag: 'A', title: 'PERSON A', data: personAData, set: setPersonAData },
              { tag: 'B', title: 'PERSON B', data: personBData, set: setPersonBData },
            ] as const).map(p => (
              <div key={p.tag} className={`${styles.personCol} ${p.data ? styles.personColSet : ''}`}>
                <div className={styles.personHead}>
                  <span className={styles.personTag}>{p.tag}</span>
                  <span className={styles.personTitle}>{p.title}</span>
                  <span className={`${styles.personStatus} ${p.data ? styles.personStatusSet : ''}`}>
                    {p.data ? '✓ SET' : 'READY TO SET'}
                  </span>
                </div>
                <BirthForm
                  onSubmit={data => p.set(data)}
                  loading={false}
                  submitLabel={p.data ? `Person ${p.tag} set` : `Set person ${p.tag}`}
                />
              </div>
            ))}
          </section>

          {/* Bottom status bar */}
          <section className={styles.statusBar}>
            <div className={styles.statusRow}>
              {synastryError && <p className={styles.calcErrorMsg}>{synastryError}</p>}
              <span className={`${styles.statusText} ${bothSet ? styles.statusTextLive : ''}`}>{statusText}</span>
              <button className={styles.calcBtn} disabled={!bothSet} onClick={handleCalculateSynastry}>
                {calcLabel}
              </button>
            </div>
          </section>
        </>
      )}

      {/* Results */}
      {synastryData && (
        <div ref={readingRef}>
          <div className={styles.results}>
            <div className={styles.resultsHead}>
              <div>
                <div className={styles.kicker}>{'// SYNASTRY DOSSIER'}</div>
                <h2 className={styles.resultsTitle}>Two natal charts, both frames</h2>
              </div>
              <div className={styles.resultsLines}>
                <span className={styles.abTag}>A</span>&nbsp; {castLine(personAData)}<br />
                <span className={styles.abTag}>B</span>&nbsp; {castLine(personBData)}
              </div>
            </div>

            <div className={styles.wheelGrid}>
              <div className={styles.wheelCol}>
                <p className={styles.wheelLabel}>PERSON A</p>
                <FrameShiftWheel data={synastryData.personA} frame={frameA} onFrameChange={setFrameA} />
              </div>
              <div className={styles.wheelCol}>
                <p className={styles.wheelLabel}>PERSON B</p>
                <FrameShiftWheel data={synastryData.personB} frame={frameB} onFrameChange={setFrameB} />
              </div>
            </div>

            <SynastryAspectsPanel data={synastryData} />
          </div>

          <SynastryReadingPanel synastryData={synastryData} />

          <div className={styles.actions}>
            <button className={styles.btnOutline} onClick={reset}>NEW SYNASTRY</button>
            <button className={styles.btnGhost} onClick={() => window.print()}>SAVE DOSSIER · PDF</button>
          </div>
        </div>
      )}
    </main>
  )
}
