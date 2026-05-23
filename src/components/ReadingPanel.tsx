'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { DualChartData } from '@/lib/astro-calc'
import { TROPICAL_DESCRIPTORS, SIDEREAL_DESCRIPTORS, SYNTHESIS_DESCRIPTORS } from '@/lib/planet-descriptors'
import styles from './ReadingPanel.module.css'
import { capture } from '@/lib/analytics'

interface ReadingPanelProps {
  chartData: DualChartData
  section: 'tropical' | 'sidereal' | 'synthesis'
}

const SECTION_LABELS: Record<string, { title: string; subtitle: string }> = {
  tropical: { title: 'Tropical Reading', subtitle: 'Western · the self you know' },
  sidereal: { title: 'Sidereal Reading', subtitle: 'Vedic · the self beneath' },
  synthesis: { title: 'AXIS Synthesis', subtitle: 'Convergence & Divergence' }
}

const SECTION_DISPLAY: Record<string, string> = {
  sun: 'Sun', moon: 'Moon', ascendant: 'Ascendant', mercury: 'Mercury',
  venus: 'Venus', mars: 'Mars', jupiter_saturn: 'Jupiter & Saturn', key_aspects: 'Aspects',
  lagna: 'Lagna', rahu_ketu: 'Rahu & Ketu',
  agree: 'Concordance', diverge: 'Divergence', tension: 'Tension', closing: 'Integration',
}

// Per-section timeout in ms. 50s leaves a 10s buffer below the 60s Vercel function limit.
// Keep-alive pings every 5s prevent the connection from being treated as idle before tokens arrive.
const SECTION_TIMEOUT_MS = 50_000

function getDescriptorKey(heading: string, section: string): string | null {
  const h = heading.toLowerCase()
  if (h.includes('sun')) return 'Sun'
  if (h.includes('moon')) return 'Moon'
  if (h.includes('mercury')) return 'Mercury'
  if (h.includes('venus')) return 'Venus'
  if (h.includes('mars')) return 'Mars'
  if (h.includes('jupiter')) return 'Jupiter'
  if (h.includes('saturn')) return 'Saturn'
  if (h.includes('ascendant') || h.includes('lagna')) return section === 'sidereal' ? 'Lagna' : 'Ascendant'
  if (h.includes('uranus')) return 'Uranus'
  if (h.includes('neptune')) return 'Neptune'
  if (h.includes('pluto')) return 'Pluto'
  return null
}

function getSynthesisKey(heading: string): string | null {
  const h = heading.toLowerCase()
  if (h.includes('agree')) return 'agree'
  if (h.includes('diverge')) return 'diverge'
  if (h.includes('central')) return 'tension'
  if (h.includes('closing')) return 'closing'
  return null
}

type Block =
  | { type: 'heading'; content: string; descriptorKey: string | null }
  | { type: 'subheading'; content: string }
  | { type: 'paragraph'; content: string }

function parseReading(text: string, section: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []
  let buf = ''

  const flush = () => {
    if (buf.trim()) {
      blocks.push({ type: 'paragraph', content: buf.trim() })
      buf = ''
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('### ')) {
      flush()
      blocks.push({ type: 'subheading', content: trimmed.replace('### ', '').trim() })
      continue
    }
    if (trimmed.startsWith('## ')) {
      flush()
      const content = trimmed.replace('## ', '').trim()
      const descriptorKey = section === 'synthesis'
        ? getSynthesisKey(content)
        : getDescriptorKey(content, section)
      blocks.push({ type: 'heading', content, descriptorKey })
      continue
    }
    // Skip lines that are purely italic (e.g. `*Sun in Aries*`); Claude sometimes emits
    // these as inline section dividers — they carry no prose value
    if (trimmed.match(/^\*[^*]+\*$/) || trimmed.match(/^_[^_]+_$/)) continue
    if (!trimmed) { flush(); continue }
    buf = buf ? buf + ' ' + trimmed : trimmed
  }
  flush()
  return blocks
}

const PLANET_SECTIONS = {
  tropical: ['sun', 'moon', 'ascendant', 'mercury', 'venus', 'mars', 'jupiter_saturn', 'key_aspects'],
  sidereal: ['lagna', 'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter_saturn', 'rahu_ketu'],
  synthesis: ['agree', 'diverge', 'tension', 'closing']
}

type SectionState = 'pending' | 'loading' | 'done' | 'failed'

export default function ReadingPanel({ chartData, section }: ReadingPanelProps) {
  const [readings, setReadings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activePlanetSection, setActivePlanetSection] = useState<string | null>(null)
  const [sectionStates, setSectionStates] = useState<Record<string, SectionState>>({})
  const [liveStatus, setLiveStatus] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const loadingRef = useRef(false)
  const readingsRef = useRef<Record<string, string>>({})
  useEffect(() => { readingsRef.current = readings }, [readings])

  const generateReading = useCallback(async (sec: 'tropical' | 'sidereal' | 'synthesis') => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    loadingRef.current = true
    setLoading(true)
    setError(null)
    setReadings(prev => ({ ...prev, [sec]: '' }))

    const sectionsToFetch = PLANET_SECTIONS[sec]
    const initialStates: Record<string, SectionState> = {}
    for (const s of sectionsToFetch) initialStates[s] = 'pending'
    setSectionStates(initialStates)
    setLiveStatus('Starting reading generation')
    capture('reading_start', { section: sec, section_count: sectionsToFetch.length })

    try {
      let accumulatedText = ''

      for (const planetSec of sectionsToFetch) {
        if (abortRef.current?.signal.aborted) break

        setSectionStates(prev => ({ ...prev, [planetSec]: 'loading' }))
        setActivePlanetSection(planetSec)
        setLiveStatus(`Loading ${SECTION_DISPLAY[planetSec] ?? planetSec}`)

        let sectionText = ''
        let sectionSuccess = false
        let lastError = ''

        for (let attempt = 0; attempt < 2; attempt++) {
          if (abortRef.current?.signal.aborted) break
          if (attempt === 1) capture('reading_section_regenerate', { section: sec, planet_section: planetSec })
          try {
            // Race each section fetch against a timeout
            const timeoutSignal = AbortSignal.timeout(SECTION_TIMEOUT_MS)
            const combinedSignal = AbortSignal.any
              ? AbortSignal.any([abortRef.current!.signal, timeoutSignal])
              : abortRef.current!.signal

            const res = await fetch('/api/reading', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chartData, section: sec, planetSection: planetSec }),
              signal: combinedSignal
            })

            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              if (res.status === 429) {
                const retryAfter = res.headers.get('Retry-After')
                lastError = `Rate limit reached. ${retryAfter ? `Wait ${retryAfter}s and try again.` : 'Please wait before retrying.'}`
              } else {
                lastError = body.message || body.error || `Section failed (${res.status})`
              }
              if (attempt === 0) continue
              break
            }
            if (!res.body) { lastError = 'No response body'; break }

            const reader  = res.body.getReader()
            const decoder = new TextDecoder()
            let chunkText = ''

            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              chunkText += decoder.decode(value, { stream: true })
              setReadings(prev => ({ ...prev, [sec]: accumulatedText + chunkText }))
            }
            // Flush any bytes the decoder buffered for incomplete multibyte sequences
            chunkText += decoder.decode()

            if (chunkText.includes('[AXIS_STREAM_ERROR:')) {
              lastError = 'Generation failed. Please retry this reading.'
              sectionText = ''
              if (attempt === 0) continue
              break
            }

            if (chunkText.includes('[AXIS_TRUNCATED]')) {
              // Keep the readable prose; strip the sentinel; append a visible notice.
              // Don't retry — retrying would hit the same limit. The server already
              // skipped caching, so bumping MAX_TOKENS_PER_SECTION will fix it on next load.
              chunkText = chunkText.replace('[AXIS_TRUNCATED]', '').trimEnd()
              chunkText += '\n\n[This section reached its generation limit and may be incomplete.]'
              capture('reading_truncated', { section: sec, planet_section: planetSec })
            }

            capture('reading_section_complete', { section: sec, planet_section: planetSec, attempt })
            sectionText    = chunkText
            sectionSuccess = true
            break
          } catch (fetchErr: unknown) {
            // Re-throw only when the user explicitly cancelled (abortRef fired).
            // Timeouts from AbortSignal.timeout() may surface as AbortError in Node.js
            // fetch — checking the user signal prevents silently swallowing timeouts.
            if (fetchErr instanceof Error && fetchErr.name === 'AbortError' && abortRef.current?.signal.aborted) {
              throw fetchErr
            }
            if (fetchErr instanceof Error && (fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError')) {
              lastError = `${SECTION_DISPLAY[planetSec] ?? planetSec} timed out. Please retry.`
            } else {
              lastError = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
            }
            if (attempt === 0) await new Promise(r => setTimeout(r, 1500))
          }
        }

        if (!sectionSuccess) {
          capture('reading_section_failed', { section: sec, planet_section: planetSec, error: lastError })
          setSectionStates(prev => ({ ...prev, [planetSec]: 'failed' }))
          setLiveStatus(`${SECTION_DISPLAY[planetSec] ?? planetSec} failed to load`)
          const fallback = `\n\n[Section "${planetSec}" could not be generated — ${lastError}]\n\n`
          accumulatedText += fallback
          setReadings(prev => ({ ...prev, [sec]: accumulatedText }))
          continue
        }

        setSectionStates(prev => ({ ...prev, [planetSec]: 'done' }))
        accumulatedText += sectionText + '\n\n'
        setReadings(prev => ({ ...prev, [sec]: accumulatedText }))
      }

      setLiveStatus('Reading complete')
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message || 'Reading generation failed. Please try again.')
        setLiveStatus('Reading generation failed')
      }
    } finally {
      if (!abortRef.current?.signal.aborted) {
        loadingRef.current = false
        setLoading(false)
        setActivePlanetSection(null)
      }
    }
  }, [chartData])

  useEffect(() => {
    if (!readingsRef.current[section] && !loadingRef.current) {
      generateReading(section)
    }
  }, [section, generateReading])

  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  const currentText = readings[section] || ''
  const label = SECTION_LABELS[section]
  const blocks = currentText ? parseReading(currentText, section) : []
  const descriptors = section === 'sidereal' ? SIDEREAL_DESCRIPTORS : TROPICAL_DESCRIPTORS
  const birthTimeUnknown = chartData.birthData.birthTimeUnknown === true

  const sunT = chartData.tropical.planets.find(p => p.name === 'Sun')
  const moonT = chartData.tropical.planets.find(p => p.name === 'Moon')
  const sunS = chartData.sidereal.planets.find(p => p.name === 'Sun')
  const moonS = chartData.sidereal.planets.find(p => p.name === 'Moon')

  const currentSections = PLANET_SECTIONS[section]
  const hasAnyFailed = currentSections.some(s => sectionStates[s] === 'failed')

  return (
    <div className={styles.panel}>
      {/* Screen-reader live region for generation status */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className={styles.srOnly}
      >
        {liveStatus}
      </div>

      <div className={styles.readingHeader}>
        <div className={styles.readingMeta}>
          <h2 className={styles.readingTitle}>{label.title}</h2>
          <p className={styles.readingSubtitle}>{label.subtitle}</p>
        </div>
        <div className={styles.chartSummary}>
          {section !== 'sidereal' && (
            <div className={styles.summaryGroup}>
              <span className={styles.summarySystem}>Tropical</span>
              <span className={styles.summaryPlacements}>
                ☉ {sunT?.sign} · ☽ {moonT?.sign} · ↑ {chartData.tropical.ascendantSign}
              </span>
            </div>
          )}
          {section !== 'tropical' && (
            <div className={styles.summaryGroup}>
              <span className={styles.summarySystem}>Sidereal</span>
              <span className={styles.summaryPlacements}>
                ☉ {sunS?.sign} · ☽ {moonS?.sign} · ↑ {chartData.sidereal.ascendantSign}
              </span>
            </div>
          )}
          {chartData.plutoSource && (
            <div className={styles.summaryGroup}>
              <span className={styles.summarySystem}>Pluto ephemeris</span>
              <span className={
                chartData.plutoSource === 'local-meeus'
                  ? styles.ephemerisFallback
                  : styles.ephemerisSource
              }>
                {chartData.plutoSource === 'local-meeus'
                  ? '⚠ local fallback (~15–60 arcmin)'
                  : `JPL Horizons ${chartData.plutoSource.replace('jpl-horizons-', '').toUpperCase()}`}
              </span>
            </div>
          )}
        </div>
      </div>

      {birthTimeUnknown && (
        <div className={styles.birthTimeWarning}>
          <span className={styles.birthTimeWarningIcon}>⚠</span>
          <p className={styles.birthTimeWarningText}>
            Birth time unknown — noon approximation used. Ascendant, house placements, MC, and Moon degree may be inaccurate. Planetary sign positions are reliable.
          </p>
        </div>
      )}

      {/* Section progress bar (visible while loading) */}
      {loading && (
        <div className={styles.sectionProgress} aria-label="Section loading progress">
          {currentSections.map(s => {
            const state = sectionStates[s] ?? 'pending'
            return (
              <span
                key={s}
                className={`${styles.sectionChip} ${styles[`chip_${state}`]}`}
                aria-label={`${SECTION_DISPLAY[s] ?? s}: ${state}`}
              >
                {SECTION_DISPLAY[s] ?? s}
                {state === 'done' && <span className={styles.chipCheck} aria-hidden="true"> ✓</span>}
                {state === 'failed' && <span className={styles.chipFail} aria-hidden="true"> ✕</span>}
              </span>
            )
          })}
        </div>
      )}

      <div className={styles.readingBody}>
        {loading && !currentText && (
          <div className={styles.generating}>
            <div className={styles.generatingOrbit} />
            <p className={styles.generatingText}>
              {activePlanetSection
                ? `Interpreting ${SECTION_DISPLAY[activePlanetSection] ?? activePlanetSection}`
                : 'Interpreting chart'}
            </p>
          </div>
        )}

        {error && (
          <div className={styles.errorState}>
            <p className={styles.errorText}>{error}</p>
            <button className={styles.retryBtn} onClick={() => generateReading(section)}>
              Retry reading
            </button>
          </div>
        )}

        {!loading && !error && !currentText.trim() && (
          <div className={styles.errorState}>
            <p className={styles.errorText}>No reading generated. The API may be unavailable or the key may not be configured.</p>
            <button className={styles.retryBtn} onClick={() => generateReading(section)}>
              Retry
            </button>
          </div>
        )}

        {/* Retry banner if any section failed after completion */}
        {!loading && hasAnyFailed && (
          <div className={styles.partialFailBanner}>
            <p className={styles.partialFailText}>
              One or more sections failed to generate. The rest of the reading is below.
            </p>
            <button className={styles.retryBtn} onClick={() => generateReading(section)}>
              Regenerate full reading
            </button>
          </div>
        )}

        {blocks.length > 0 && (
          <div className={styles.readingText}>
            {blocks.map((block, i) => {
              if (block.type === 'subheading') {
                return (
                  <h4 key={i} className={styles.planetSubheading}>{block.content}</h4>
                )
              }
              if (block.type === 'heading') {
                const descriptor = block.descriptorKey
                  ? section === 'synthesis'
                    ? SYNTHESIS_DESCRIPTORS[block.descriptorKey as keyof typeof SYNTHESIS_DESCRIPTORS]
                    : (descriptors as Record<string, { name: string; keywords: string; description: string }>)[block.descriptorKey]
                  : null

                return (
                  <div key={i} className={styles.sectionBlock}>
                    <h3 className={styles.planetHeading}>{block.content}</h3>
                    {descriptor && (
                      <div className={styles.infoBox}>
                        <p className={styles.infoKeywords}>
                          {'keywords' in descriptor ? descriptor.keywords : ''}
                        </p>
                        {'description' in descriptor && (
                          <p className={styles.infoText}>{descriptor.description}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              }
              return (
                <p
                  key={i}
                  className={styles.paragraph}
                  style={{ animationDelay: `${Math.min(i * 0.02, 0.4)}s` }}
                >
                  {block.content}
                </p>
              )
            })}
            {loading && <span className={styles.cursor} />}
          </div>
        )}
      </div>
    </div>
  )
}
