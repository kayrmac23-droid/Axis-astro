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
  if (h.includes('central tension')) return 'tension'
  if (h === 'integration' || h.includes('integration')) return 'closing'
  return null
}

type Block =
  | { type: 'heading'; content: string; descriptorKey: string | null }
  | { type: 'subheading'; content: string }
  | { type: 'paragraph'; content: string }
  | { type: 'sectionFailed'; planetSection: string }
  | { type: 'sectionLoading'; planetSection: string }

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

    const failedMatch = trimmed.match(/^\[AXIS_FAILED:([^\]]+)\]$/)
    if (failedMatch) {
      flush()
      blocks.push({ type: 'sectionFailed', planetSection: failedMatch[1] })
      continue
    }

    const loadingMatch = trimmed.match(/^\[AXIS_LOADING:([^\]]+)\]$/)
    if (loadingMatch) {
      flush()
      blocks.push({ type: 'sectionLoading', planetSection: loadingMatch[1] })
      continue
    }

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

type PlanetSectionState = 'pending' | 'loading' | 'done' | 'failed'
type TabStatus = 'pending' | 'loading' | 'done' | 'failed'
type SystemSection = 'tropical' | 'sidereal' | 'synthesis'

export default function ReadingPanel({ chartData, section }: ReadingPanelProps) {
  const [readings, setReadings] = useState<Record<string, string>>({})
  const [tabStatus, setTabStatus] = useState<Record<string, TabStatus>>({
    tropical: 'pending',
    sidereal: 'pending',
    synthesis: 'pending',
  })
  const [tabErrors, setTabErrors] = useState<Record<string, string | null>>({
    tropical: null,
    sidereal: null,
    synthesis: null,
  })
  // Maps `${sec}:${planetSec}` → error message for inline error blocks
  const [planetSectionErrors, setPlanetSectionErrors] = useState<Record<string, string>>({})
  const [sectionStates, setSectionStates] = useState<Record<string, PlanetSectionState>>({})
  const [activePlanetSection, setActivePlanetSection] = useState<string | null>(null)
  const [streamingTab, setStreamingTab] = useState<string | null>(null)
  const [liveStatus, setLiveStatus] = useState('')

  const abortRef = useRef<AbortController | null>(null)
  const readingsRef = useRef<Record<string, string>>({})
  useEffect(() => { readingsRef.current = readings }, [readings])

  const generateSingleReading = useCallback(async (
    sec: SystemSection,
    signal: AbortSignal
  ) => {
    setTabStatus(prev => ({ ...prev, [sec]: 'loading' }))
    setTabErrors(prev => ({ ...prev, [sec]: null }))
    setReadings(prev => ({ ...prev, [sec]: '' }))
    setStreamingTab(sec)

    const sectionsToFetch = PLANET_SECTIONS[sec]
    const initialStates: Record<string, PlanetSectionState> = {}
    for (const s of sectionsToFetch) initialStates[s] = 'pending'
    setSectionStates(initialStates)
    setActivePlanetSection(null)
    setLiveStatus(`Starting ${sec} reading`)
    capture('reading_start', { section: sec, section_count: sectionsToFetch.length })

    let accumulatedText = ''

    try {
      for (const planetSec of sectionsToFetch) {
        if (signal.aborted) break

        setSectionStates(prev => ({ ...prev, [planetSec]: 'loading' }))
        setActivePlanetSection(planetSec)
        setLiveStatus(`Loading ${SECTION_DISPLAY[planetSec] ?? planetSec}`)

        let sectionText = ''
        let sectionSuccess = false
        let lastError = ''

        for (let attempt = 0; attempt < 2; attempt++) {
          if (signal.aborted) break
          if (attempt === 1) capture('reading_section_regenerate', { section: sec, planet_section: planetSec })
          try {
            const timeoutSignal = AbortSignal.timeout(SECTION_TIMEOUT_MS)
            const combinedSignal = AbortSignal.any
              ? AbortSignal.any([signal, timeoutSignal])
              : signal

            const res = await fetch('/api/reading', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ birthData: chartData.birthData, section: sec, planetSection: planetSec }),
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
            chunkText += decoder.decode()
            setReadings(prev => ({ ...prev, [sec]: accumulatedText + chunkText }))

            if (chunkText.includes('[AXIS_STREAM_ERROR:')) {
              lastError = 'Generation failed. Please retry this reading.'
              sectionText = ''
              if (attempt === 0) continue
              break
            }

            if (chunkText.includes('[AXIS_TRUNCATED]')) {
              chunkText = chunkText.replace('[AXIS_TRUNCATED]', '').trimEnd()
              chunkText += '\n\n[This section reached its generation limit and may be incomplete.]'
              capture('reading_truncated', { section: sec, planet_section: planetSec })
            }

            capture('reading_section_complete', { section: sec, planet_section: planetSec, attempt })
            sectionText    = chunkText
            sectionSuccess = true
            break
          } catch (fetchErr: unknown) {
            if (fetchErr instanceof Error && fetchErr.name === 'AbortError' && signal.aborted) {
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
          setPlanetSectionErrors(prev => ({ ...prev, [`${sec}:${planetSec}`]: lastError }))
          accumulatedText += `\n\n[AXIS_FAILED:${planetSec}]\n\n`
          setReadings(prev => ({ ...prev, [sec]: accumulatedText }))
          continue
        }

        setSectionStates(prev => ({ ...prev, [planetSec]: 'done' }))
        accumulatedText += sectionText + '\n\n'
        setReadings(prev => ({ ...prev, [sec]: accumulatedText }))
      }

      setTabStatus(prev => ({ ...prev, [sec]: 'done' }))
      setLiveStatus(`${sec} reading complete`)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      const msg = err instanceof Error ? err.message : 'Reading generation failed. Please try again.'
      setTabErrors(prev => ({ ...prev, [sec]: msg }))
      setTabStatus(prev => ({ ...prev, [sec]: 'failed' }))
      setLiveStatus(`${sec} reading failed`)
    } finally {
      setStreamingTab(prev => prev === sec ? null : prev)
      setActivePlanetSection(null)
    }
  }, [chartData])

  // Sequential generation: tropical → sidereal → synthesis
  // Synchronous state resets happen in the effect body; async work is deferred
  // to setTimeout(0) so it runs outside the effect's synchronous frame.
  useEffect(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTabStatus({ tropical: 'pending', sidereal: 'pending', synthesis: 'pending' })
    setTabErrors({ tropical: null, sidereal: null, synthesis: null })
    setPlanetSectionErrors({})
    setReadings({})

    const id = setTimeout(async () => {
      const { signal } = controller
      try {
        await generateSingleReading('tropical', signal)
        if (!signal.aborted) await generateSingleReading('sidereal', signal)
        if (!signal.aborted) await generateSingleReading('synthesis', signal)
      } catch { /* per-section errors already handled */ }
    }, 0)

    return () => {
      clearTimeout(id)
      controller.abort()
    }
  }, [generateSingleReading])

  // Retry an entire tab section (does not restart the sequential chain)
  const retrySection = useCallback((sec: SystemSection) => {
    const signal = abortRef.current?.signal
    if (!signal || signal.aborted) return
    setTimeout(async () => {
      try { await generateSingleReading(sec, signal) } catch { /* handled */ }
    }, 0)
  }, [generateSingleReading])

  // Retry a single planet section inline
  const retryPlanetSection = useCallback(async (sec: string, planetSec: string) => {
    const signal = abortRef.current?.signal ?? new AbortController().signal

    // Clear the error entry and swap sentinel to loading
    setPlanetSectionErrors(prev => {
      const next = { ...prev }
      delete next[`${sec}:${planetSec}`]
      return next
    })
    setReadings(prev => {
      const text = prev[sec] || ''
      return {
        ...prev,
        [sec]: text.replace(`[AXIS_FAILED:${planetSec}]`, `[AXIS_LOADING:${planetSec}]`)
      }
    })

    let fetchedText = ''
    let success = false

    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal.aborted) break
      // Reset per attempt so a partial first-attempt stream can't corrupt the second.
      fetchedText = ''
      try {
        const timeoutSignal = AbortSignal.timeout(SECTION_TIMEOUT_MS)
        const combinedSignal = AbortSignal.any
          ? AbortSignal.any([signal, timeoutSignal])
          : signal

        const res = await fetch('/api/reading', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ birthData: chartData.birthData, section: sec, planetSection: planetSec }),
          signal: combinedSignal
        })

        if (!res.ok || !res.body) {
          if (attempt === 0) continue
          break
        }

        const reader  = res.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          fetchedText += decoder.decode(value, { stream: true })
        }
        fetchedText += decoder.decode()

        if (fetchedText.includes('[AXIS_STREAM_ERROR:')) {
          if (attempt === 0) continue
          break
        }

        success = true
        break
      } catch {
        if (attempt === 0) await new Promise(r => setTimeout(r, 1500))
      }
    }

    if (success && fetchedText) {
      setReadings(prev => {
        const text = prev[sec] || ''
        return {
          ...prev,
          [sec]: text.replace(`[AXIS_LOADING:${planetSec}]`, fetchedText)
        }
      })
    } else {
      const errMsg = 'Retry failed. Please try again.'
      setPlanetSectionErrors(prev => ({ ...prev, [`${sec}:${planetSec}`]: errMsg }))
      setReadings(prev => {
        const text = prev[sec] || ''
        return {
          ...prev,
          [sec]: text.replace(`[AXIS_LOADING:${planetSec}]`, `[AXIS_FAILED:${planetSec}]`)
        }
      })
    }
  }, [chartData])

  const currentStatus    = tabStatus[section]
  const currentError     = tabErrors[section]
  const currentText      = readings[section] || ''
  const isStreaming      = streamingTab === section
  const label            = SECTION_LABELS[section]
  const blocks           = currentText ? parseReading(currentText, section) : []
  const descriptors      = section === 'sidereal' ? SIDEREAL_DESCRIPTORS : TROPICAL_DESCRIPTORS
  const birthTimeUnknown = chartData.birthData.birthTimeUnknown === true

  const sunT  = chartData.tropical.planets.find(p => p.name === 'Sun')
  const moonT = chartData.tropical.planets.find(p => p.name === 'Moon')
  const sunS  = chartData.sidereal.planets.find(p => p.name === 'Sun')
  const moonS = chartData.sidereal.planets.find(p => p.name === 'Moon')

  const currentSections = PLANET_SECTIONS[section]

  return (
    <div className={styles.panel}>
      {/* Screen-reader live region */}
      <div role="status" aria-live="polite" aria-atomic="false" className={styles.srOnly}>
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

      {/* Planet-section progress bar — visible while this tab is actively streaming */}
      {isStreaming && currentStatus === 'loading' && (
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
                {state === 'done'   && <span className={styles.chipCheck} aria-hidden="true"> ✓</span>}
                {state === 'failed' && <span className={styles.chipFail}  aria-hidden="true"> ✕</span>}
              </span>
            )
          })}
        </div>
      )}

      <div className={styles.readingBody}>

        {/* Tab-level error */}
        {currentError && (
          <div className={styles.sectionErrorBlock}>
            <p className={styles.sectionErrorLabel}>Section Unavailable</p>
            <p className={styles.sectionErrorMsg}>
              This section could not be generated. Check your connection and retry.
            </p>
            <button className={styles.retrySectionBtn} onClick={() => retrySection(section)}>
              Retry
            </button>
          </div>
        )}

        {/* Pending — waiting for earlier sections to stream */}
        {!currentError && currentStatus === 'pending' && (
          <div className={styles.generating}>
            <div className={styles.generatingOrbit} />
            <p className={styles.generatingText}>
              {section === 'sidereal'
                ? 'Sidereal reading begins after Tropical'
                : section === 'synthesis'
                  ? 'Synthesis begins after Tropical & Sidereal'
                  : 'Preparing reading'}
            </p>
          </div>
        )}

        {/* Loading — this tab is actively streaming */}
        {!currentError && currentStatus === 'loading' && !currentText && (
          <div className={styles.generating}>
            <div className={styles.generatingOrbit} />
            <p className={styles.generatingText}>
              {activePlanetSection && isStreaming
                ? `Interpreting ${SECTION_DISPLAY[activePlanetSection] ?? activePlanetSection}`
                : 'Interpreting chart'}
            </p>
          </div>
        )}

        {/* Content blocks */}
        {blocks.length > 0 && (
          <div className={styles.readingText}>
            {blocks.map((block, i) => {
              if (block.type === 'sectionFailed') {
                const errMsg = planetSectionErrors[`${section}:${block.planetSection}`]
                  || 'This section could not be generated.'
                return (
                  <div key={i} className={styles.sectionErrorBlock}>
                    <p className={styles.sectionErrorLabel}>Section Unavailable</p>
                    <p className={styles.sectionErrorMsg}>
                      {errMsg} Check your connection and retry.
                    </p>
                    <button
                      className={styles.retrySectionBtn}
                      onClick={() => retryPlanetSection(section, block.planetSection)}
                    >
                      Retry
                    </button>
                  </div>
                )
              }

              if (block.type === 'sectionLoading') {
                return (
                  <div key={i} className={styles.sectionLoadingBlock}>
                    <div className={styles.generatingOrbit} />
                  </div>
                )
              }

              if (block.type === 'subheading') {
                return <h4 key={i} className={styles.planetSubheading}>{block.content}</h4>
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
            {isStreaming && currentStatus === 'loading' && <span className={styles.cursor} />}
          </div>
        )}
      </div>
    </div>
  )
}
