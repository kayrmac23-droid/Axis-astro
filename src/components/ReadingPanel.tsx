'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { DualChartData } from '@/lib/astro-calc'
import { TROPICAL_DESCRIPTORS, SIDEREAL_DESCRIPTORS, SYNTHESIS_DESCRIPTORS } from '@/lib/planet-descriptors'
import styles from './ReadingPanel.module.css'

interface ReadingPanelProps {
  chartData: DualChartData
  section: 'tropical' | 'sidereal' | 'synthesis'
}

const SECTION_LABELS: Record<string, { title: string; subtitle: string }> = {
  tropical: { title: 'Tropical Reading', subtitle: 'Western · the self you know' },
  sidereal: { title: 'Sidereal Reading', subtitle: 'Vedic · the self beneath' },
  synthesis: { title: 'AXIS Synthesis', subtitle: 'Convergence & Divergence' }
}

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
    if (line.startsWith('### ')) {
      flush()
      blocks.push({ type: 'subheading', content: line.replace('### ', '').trim() })
      continue
    }
    if (line.startsWith('## ')) {
      flush()
      const content = line.replace('## ', '').trim()
      const descriptorKey = section === 'synthesis'
        ? getSynthesisKey(content)
        : getDescriptorKey(content, section)
      blocks.push({ type: 'heading', content, descriptorKey })
      continue
    }
    // Skip lines that are purely italic (e.g. `*Sun in Aries*`); Claude sometimes emits
    // these as inline section dividers — they carry no prose value
    if (line.match(/^\*[^*]+\*$/) || line.match(/^_[^_]+_$/)) continue
    if (!line.trim()) { flush(); continue }
    buf = buf ? buf + ' ' + line.trim() : line.trim()
  }
  flush()
  return blocks
}

const PLANET_SECTIONS = {
  tropical: ['sun', 'moon', 'ascendant', 'mercury', 'venus', 'mars', 'jupiter_saturn', 'key_aspects'],
  sidereal: ['lagna', 'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter_saturn', 'rahu_ketu'],
  synthesis: ['agree', 'diverge', 'tension', 'closing']
}

export default function ReadingPanel({ chartData, section }: ReadingPanelProps) {
  const [readings, setReadings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

    try {
      let accumulatedText = ''

      for (const planetSec of sectionsToFetch) {
        // Per-section retry: attempt up to 2 times before failing the section
        let sectionText = ''
        let sectionSuccess = false
        let lastError = ''

        for (let attempt = 0; attempt < 2; attempt++) {
          if (abortRef.current?.signal.aborted) break
          try {
            const res = await fetch('/api/reading', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chartData, section: sec, planetSection: planetSec }),
              signal: abortRef.current.signal
            })

            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              lastError = body.detail || body.error || `Section "${planetSec}" failed (${res.status})`
              if (attempt === 0) continue  // retry
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

            if (chunkText.includes('[AXIS_STREAM_ERROR:')) {
              const match = chunkText.match(/\[AXIS_STREAM_ERROR: ([^\]]+)\]/)
              lastError = match ? match[1] : 'Stream error'
              sectionText = ''
              if (attempt === 0) continue  // retry
              break
            }

            sectionText    = chunkText
            sectionSuccess = true
            break
          } catch (fetchErr: unknown) {
            if (fetchErr instanceof Error && fetchErr.name === 'AbortError') throw fetchErr
            lastError = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
            if (attempt === 0) await new Promise(r => setTimeout(r, 1500))  // brief pause before retry
          }
        }

        if (!sectionSuccess) {
          // Non-fatal: append a visible placeholder so the rest of the reading is still usable
          const fallback = `\n\n[Section "${planetSec}" could not be generated — ${lastError}. Tap Retry to regenerate the full reading.]\n\n`
          accumulatedText += fallback
          setReadings(prev => ({ ...prev, [sec]: accumulatedText }))
          continue
        }

        accumulatedText += sectionText + '\n\n'
        setReadings(prev => ({ ...prev, [sec]: accumulatedText }))
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message || 'Reading generation failed. Please try again.')
      }
    } finally {
      if (!abortRef.current?.signal.aborted) {
        loadingRef.current = false
        setLoading(false)
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

  return (
    <div className={styles.panel}>
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
                  ? '⚠ local fallback (~0.3°)'
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

      <div className={styles.readingBody}>
        {loading && !currentText && (
          <div className={styles.generating}>
            <div className={styles.generatingOrbit} />
            <p className={styles.generatingText}>Interpreting chart</p>
          </div>
        )}

        {error && (
          <div className={styles.errorState}>
            <p className={styles.errorText}>{error}</p>
            <button className={styles.retryBtn} onClick={() => generateReading(section)}>
              Retry
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
