'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import ReadingPanel from '@/components/ReadingPanel'
import PreviewLanding from '@/components/landing/PreviewLanding'
import FrameShiftWheel from '@/components/FrameShiftWheel'
import DossierHeader from '@/components/DossierHeader'
import FrameControl from '@/components/FrameControl'
import ReadoutRail from '@/components/ReadoutRail'
import ComputationInterstitial from '@/components/ComputationInterstitial'
import { DualChartData } from '@/lib/astro-calc'
import { buildReadoutRows, dms } from '@/lib/readout'
import styles from './page.module.css'
import { capture } from '@/lib/analytics'

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

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
  // One selection across the wheel and the readout table.
  const [selected, setSelected] = useState<string | null>(null)
  const readingRef = useRef<HTMLDivElement>(null)
  // The wheel writes the animating Δ into the frame control's pill.
  const deltaRef = useRef<HTMLSpanElement>(null)

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
    setSelected(null)
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
      // The dossier opens with the Sun isolated (design: post-cast state is
      // "frame reset to tropical, Sun selected") so the wheel, readout card and
      // reading section agree on first paint.
      setSelected('sun')
      setTimeout(() => {
        const el = readingRef.current
        if (!el) return
        // Explicit offset rather than scrollIntoView: the header is sticky, and
        // scroll-margin is not honoured reliably inside the page's scroll
        // container — this keeps the dossier kicker clear of the header.
        const top = el.getBoundingClientRect().top + window.scrollY - 90
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
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

  // Cast line for the computation interstitial and the dossier header:
  // PLACE · D MON YYYY · time · tz.
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
    return [place, `${parseInt(f.day, 10) || 1} ${MON[mi]} ${f.year}`, time, f.tzName?.toUpperCase()]
      .filter(Boolean).join(' · ')
  })()

  // Readout rows — the single source the wheel selection and the rail share.
  const rows = useMemo(() => (chartData ? buildReadoutRows(chartData) : []), [chartData])

  const b = chartData?.birthData
  const dossierTitle = b ? `Chart of ${b.day} ${MONTHS_LONG[Math.min(11, Math.max(0, b.month - 1))]} ${b.year}` : ''
  const ayStr = chartData ? dms(chartData.ayanamsa) : ''

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

      {/* The dossier — header + provenance, the frame control, the instrument
          beside the READOUT rail, then the reading and The Divergence. The
          frame drives the wheel and the prose only; positional data is always
          shown in both frames (DOCTRINE.md: CO-VISIBILITY). */}
      {chartData && b && (
        <div className={styles.dossier} ref={readingRef}>
          <div className={styles.dossierHead}>
            <DossierHeader
              title={dossierTitle}
              castLine={castLine}
              ayanamsa={ayStr}
              year={b.year}
              birthTimeUnknown={b.birthTimeUnknown === true}
              plutoSource={chartData.plutoSource}
            />

            <FrameControl
              frame={frame}
              onFrameChange={setFrame}
              ayanamsa={ayStr}
              delta={dms(frame === 'sidereal' ? chartData.ayanamsa : 0)}
              deltaRef={deltaRef}
            />

            <div className={styles.instrument}>
              <FrameShiftWheel
                data={chartData}
                frame={frame}
                selected={selected}
                onSelect={setSelected}
                deltaRef={deltaRef}
              />
              <ReadoutRail
                rows={rows}
                frame={frame}
                ayanamsa={chartData.ayanamsa}
                selected={selected}
                onSelect={setSelected}
              />
            </div>
          </div>

          {readingReady && (
            <ReadingPanel chartData={chartData} frame={frame} />
          )}

          <div className={styles.actions}>
            <button
              className={styles.btnOutline}
              onClick={() => {
                capture('new_chart')
                setChartData(null); setDisplayLocation(''); setError(null)
                setFrame('tropical'); setSelected(null)
              }}
            >
              CAST ANOTHER CHART
            </button>
            <button className={styles.btnGhost} onClick={() => window.print()}>
              SAVE DOSSIER · PDF
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
