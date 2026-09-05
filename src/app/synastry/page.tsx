'use client'
import { useState, useRef } from 'react'
import BirthForm from '@/components/BirthForm'
import FrameShiftWheel from '@/components/FrameShiftWheel'
import FrameControl from '@/components/FrameControl'
import SynastryAspectsPanel from '@/components/SynastryAspectsPanel'
import SynastryReadingPanel from '@/components/SynastryReadingPanel'
import ComputationInterstitial from '@/components/ComputationInterstitial'
import { SynastryData } from '@/lib/synastry-calc'
import { buildReadoutRows, lonStr, dms } from '@/lib/readout'
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
  // One selected body per chart — the wheel highlights it and the card's
  // stat row names it.
  const [selA, setSelA] = useState<string | null>(null)
  const [selB, setSelB] = useState<string | null>(null)
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
        const el = readingRef.current
        if (!el) return
        // Explicit offset — the site header is sticky, so a plain
        // scrollIntoView would tuck the dossier kicker underneath it.
        const top = el.getBoundingClientRect().top + window.scrollY - 90
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
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
    setSelA(null); setSelB(null)
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
              {([
                { tag: 'A', title: 'PERSON A', data: synastryData.personA, frame: frameA, setFrame: setFrameA, sel: selA, setSel: setSelA },
                { tag: 'B', title: 'PERSON B', data: synastryData.personB, frame: frameB, setFrame: setFrameB, sel: selB, setSel: setSelB },
              ] as const).map(c => {
                const rows = buildReadoutRows(c.data)
                const row = (id: string) => rows.find(r => r.id === id)
                const lon = (id: string) => {
                  const r = row(id)
                  if (!r) return '—'
                  return lonStr(c.frame === 'sidereal' ? r.sLon : r.tLon)
                }
                const selRow = c.sel ? row(c.sel) : null
                return (
                  <div key={c.tag} className={styles.wheelCol}>
                    <div className={styles.wheelHead}>
                      <div className={styles.wheelHeadLeft}>
                        <span className={styles.abTag}>{c.tag}</span>
                        <span className={styles.wheelLabel}>{c.title}</span>
                      </div>
                      <FrameControl
                        compact
                        frame={c.frame}
                        onFrameChange={c.setFrame}
                        ayanamsa={dms(c.data.ayanamsa)}
                        delta={dms(c.frame === 'sidereal' ? c.data.ayanamsa : 0)}
                        label={`Frame — person ${c.tag}`}
                      />
                    </div>
                    <FrameShiftWheel
                      data={c.data}
                      frame={c.frame}
                      selected={c.sel}
                      onSelect={c.setSel}
                    />
                    <div className={styles.wheelStats}>
                      <span>FRAME</span><span>{c.frame.toUpperCase()}</span>
                      <span>SUN · MOON · ASC</span>
                      <span>{lon('sun')} · {lon('moon')} · {lon('asc')}</span>
                      <span>SELECTED</span>
                      <span>
                        {selRow
                          ? `${selRow.glyph ? selRow.glyph + ' ' : ''}${selRow.name} · ${lonStr(c.frame === 'sidereal' ? selRow.sLon : selRow.tLon)}`
                          : 'NONE'}
                      </span>
                    </div>
                  </div>
                )
              })}
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
