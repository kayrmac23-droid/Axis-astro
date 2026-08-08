'use client'
import { useState, useRef, useEffect } from 'react'
import ReadingPanel from '@/components/ReadingPanel'
import PreviewLanding from '@/components/landing/PreviewLanding'
import FrameShiftWheel from '@/components/FrameShiftWheel'
import { DualChartData } from '@/lib/astro-calc'
import styles from './page.module.css'
import { capture } from '@/lib/analytics'

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
  const readingRef = useRef<HTMLDivElement>(null)

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

      {/* Loading */}
      {loading && (
        <div className={styles.loadingState}>
          <div className={styles.loadingOrb} />
          <p className={styles.loadingText}>Aligning dual map</p>
          <p className={styles.loadingSubText}>Resolving coordinates · calculating houses · preparing both charts</p>
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
