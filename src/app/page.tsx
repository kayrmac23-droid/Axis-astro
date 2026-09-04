'use client'
import { useState, useRef, useEffect } from 'react'
import ReadingPanel from '@/components/ReadingPanel'
import PreviewLanding from '@/components/landing/PreviewLanding'
import FrameShiftWheel from '@/components/FrameShiftWheel'
import { DualChartData } from '@/lib/astro-calc'
import styles from './page.module.css'
import { capture } from '@/lib/analytics'

// The calibration ritual stages (DESIGN.md: Loading state). The real calculation
// is a single request, so the stages advance on a timer to read as telemetry;
// the final stage stays live until the dossier is ready.
const LOAD_STAGES: { label: string; done: string; live: string }[] = [
  { label: 'Resolving coordinates', done: 'DONE', live: 'GEOCODE · IANA TZ' },
  { label: 'Calculating houses', done: 'DONE', live: 'WHOLE SIGN' },
  { label: 'Aligning dual map', done: 'DONE', live: 'Δ LAHIRI' },
  { label: 'Preparing both frames', done: 'DONE', live: 'TROPICAL · SIDEREAL' },
  { label: 'Opening dossier', done: 'DONE', live: 'STREAMING' },
]

export default function Home() {
  const [chartData, setChartData] = useState<DualChartData | null>(null)
  const [readingReady, setReadingReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFormData, setLastFormData] = useState<Record<string, string> | null>(null)
  const [displayLocation, setDisplayLocation] = useState<string>('')
  // Frame toggle: one wheel, one reading panel. The shift rotates the zodiac
  // by the Lahiri ayanamsa and swaps the reading prose; the Divergence and the
  // readout table stay frame-independent. (DOCTRINE.md amendment July 2026.)
  const [frame, setFrame] = useState<'tropical' | 'sidereal'>('tropical')
  const [loadStage, setLoadStage] = useState(0)
  const readingRef = useRef<HTMLDivElement>(null)

  // Advance the calibration ritual while the chart is computing. Holds on the
  // last stage until loading resolves; the stage is reset to 0 in handleSubmit
  // when a new calculation starts (kept out of the effect body so the effect
  // only owns the timer).
  useEffect(() => {
    if (!loading) return
    const id = setInterval(() => {
      setLoadStage(s => (s < LOAD_STAGES.length - 1 ? s + 1 : s))
    }, 620)
    return () => clearInterval(id)
  }, [loading])

  useEffect(() => {
    if (!chartData) return
    const id = setTimeout(() => setReadingReady(true), 0)
    return () => clearTimeout(id)
  }, [chartData])

  const handleSubmit = async (formData: Record<string, string>) => {
    setLastFormData(formData)
    setDisplayLocation(formData.location || '')
    setLoadStage(0)
    setLoading(true)
    setError(null)
    setChartData(null)
    setReadingReady(false)
    setFrame('tropical')
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
      {/* Pre-chart flow — ported AXIS landing (home view of preview.html),
          with the real BirthForm wired into the live cast flow. */}
      {!chartData && (
        <PreviewLanding
          onSubmit={handleSubmit}
          loading={loading}
          error={error}
          onRetry={handleRetry}
        />
      )}

      {/* Loading — the calibration ritual (DESIGN.md: staged, not a spinner) */}
      {loading && (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <div className={styles.ritual}>
            <div className={styles.ritualLabel}>{'// CALIBRATION'}</div>
            <div className={styles.ritualOrb} aria-hidden="true">
              <span className={styles.ritualHand} />
              <span className={styles.ritualCore} />
            </div>
            <div className={styles.ritualList}>
              {LOAD_STAGES.map((stage, i) => {
                const state = i < loadStage ? 'done' : i === loadStage ? 'live' : 'pending'
                const cls = state === 'done' ? styles.stageDone : state === 'live' ? styles.stageLive : ''
                return (
                  <div key={stage.label} className={`${styles.stageRow} ${cls}`}>
                    <span className={styles.stageNum}>{String(i + 1).padStart(2, '0')}</span>
                    <span className={styles.stageLabel}>{stage.label}</span>
                    <span className={styles.stageState}>
                      {state === 'done' ? stage.done : state === 'live' ? stage.live : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Chart + reading — one frame-shift wheel + one reading panel, both
          driven by the Tropical/Sidereal toggle. The wheel's readout table and
          Δ chip carry co-visibility; The Divergence stays frame-independent.
          (DOCTRINE.md amendment July 2026.) */}
      {chartData && (
        <div className={styles.readingLayout} ref={readingRef}>
          <section className={styles.wheelBreakout}>
            <FrameShiftWheel
              data={chartData}
              frame={frame}
              onFrameChange={setFrame}
              displayLocation={displayLocation}
            />
          </section>
          {readingReady && (
            <ReadingPanel chartData={chartData} frame={frame} />
          )}
          <div className={styles.resetRow}>
            <button
              className={styles.resetBtn}
              onClick={() => { capture('new_chart'); setChartData(null); setDisplayLocation(''); setError(null); setFrame('tropical') }}
            >
              Cast another chart
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
