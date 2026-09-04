'use client'
import { useState, useRef, useEffect } from 'react'
import ReadingPanel from '@/components/ReadingPanel'
import PreviewLanding from '@/components/landing/PreviewLanding'
import FrameShiftWheel from '@/components/FrameShiftWheel'
import ComputationInterstitial from '@/components/ComputationInterstitial'
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

  // Cast line for the computation interstitial: PLACE · D MON YYYY · time · tz.
  const castLine = (() => {
    const f = lastFormData
    if (!f) return 'CASTING'
    const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    const mi = Math.min(11, Math.max(0, (parseInt(f.month, 10) || 1) - 1))
    const place = (displayLocation || f.location || '').toUpperCase()
    const unknown = f.birthTimeUnknown === 'true'
    let time = 'TIME UNKNOWN · NOON ASSUMED'
    if (!unknown) {
      const h24 = parseInt(f.hour, 10)
      if (!isNaN(h24)) {
        const isPM = h24 >= 12
        const h = h24 % 12 || 12
        time = `${String(h).padStart(2, '0')}:${String(f.minute || '00').padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`
      }
    }
    return [place, `${parseInt(f.day, 10) || 1} ${MON[mi]} ${f.year}`, time, f.tzName]
      .filter(Boolean).join(' · ')
  })()

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

      {/* Computation interstitial — orb + five staged cells (redesign) */}
      {loading && (
        <ComputationInterstitial line={castLine} ayanamsa="24°13′" />
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
