'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { SynastryData } from '@/lib/synastry-calc'
import { SYNASTRY_DESCRIPTORS } from '@/lib/planet-descriptors'
import styles from './ReadingPanel.module.css'

interface Props {
  synastryData: SynastryData
}

const SYNASTRY_SECTIONS = ['luminaries', 'venus_mars', 'outer_planets', 'composite_chart', 'integration'] as const
type SynastrySection = typeof SYNASTRY_SECTIONS[number]

const SECTION_DISPLAY: Record<SynastrySection, string> = {
  luminaries:     'Luminaries',
  venus_mars:     'Venus & Mars',
  outer_planets:  'Mind & Structure',
  composite_chart:'Composite Chart',
  integration:    'Central Dynamic',
}

const SECTION_TIMEOUT_MS = 50_000

type SectionState = 'pending' | 'loading' | 'done' | 'failed'

function getSynastryKey(heading: string): keyof typeof SYNASTRY_DESCRIPTORS | null {
  const h = heading.toLowerCase()
  if (h.includes('luminaries')) return 'luminaries'
  if (h.includes('venus') && h.includes('mars')) return 'venus_mars'
  if (h.includes('mind') && h.includes('structure')) return 'outer_planets'
  if (h.includes('composite')) return 'composite_chart'
  if (h.includes('central dynamic')) return 'integration'
  return null
}

function parseReading(text: string): Array<{ type: 'heading' | 'subheading' | 'paragraph'; content: string }> {
  const lines = text.split('\n')
  const blocks: Array<{ type: 'heading' | 'subheading' | 'paragraph'; content: string }> = []
  let buf = ''

  const flush = () => {
    if (buf.trim()) { blocks.push({ type: 'paragraph', content: buf.trim() }); buf = '' }
  }

  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('### ')) { flush(); blocks.push({ type: 'subheading', content: t.slice(4).trim() }); continue }
    if (t.startsWith('## '))  { flush(); blocks.push({ type: 'heading',    content: t.slice(3).trim() }); continue }
    if (t.match(/^\*[^*]+\*$/) || t.match(/^_[^_]+_$/)) continue
    if (!t) { flush(); continue }
    buf = buf ? buf + ' ' + t : t
  }
  flush()
  return blocks
}

export default function SynastryReadingPanel({ synastryData }: Props) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sectionStates, setSectionStates] = useState<Record<string, SectionState>>({})
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [liveStatus, setLiveStatus] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const loadingRef = useRef(false)

  const generateReading = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    loadingRef.current = true
    setLoading(true)
    setError(null)
    setText('')

    const initial: Record<string, SectionState> = {}
    for (const s of SYNASTRY_SECTIONS) initial[s] = 'pending'
    setSectionStates(initial)
    setLiveStatus('Starting synastry reading')

    try {
      let accumulated = ''

      for (const sec of SYNASTRY_SECTIONS) {
        if (abortRef.current?.signal.aborted) break

        setSectionStates(prev => ({ ...prev, [sec]: 'loading' }))
        setActiveSection(sec)
        setLiveStatus(`Interpreting ${SECTION_DISPLAY[sec]}`)

        let sectionText = ''
        let sectionSuccess = false
        let lastError = ''

        for (let attempt = 0; attempt < 2; attempt++) {
          if (abortRef.current?.signal.aborted) break
          try {
            const timeoutSignal = AbortSignal.timeout(SECTION_TIMEOUT_MS)
            const combinedSignal = AbortSignal.any
              ? AbortSignal.any([abortRef.current!.signal, timeoutSignal])
              : abortRef.current!.signal

            const res = await fetch('/api/reading', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ synastryData, section: 'synastry', planetSection: sec }),
              signal: combinedSignal,
            })

            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              lastError = res.status === 429
                ? `Rate limit reached. Please wait before retrying.`
                : body.message || body.error || `Section failed (${res.status})`
              if (attempt === 0) continue
              break
            }
            if (!res.body) { lastError = 'No response body'; break }

            const reader  = res.body.getReader()
            const decoder = new TextDecoder()
            let chunk = ''
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              chunk += decoder.decode(value, { stream: true })
              setText(accumulated + chunk)
            }
            chunk += decoder.decode()

            if (chunk.includes('[AXIS_STREAM_ERROR:')) {
              lastError = 'Generation failed. Please retry.'; sectionText = ''
              if (attempt === 0) continue
              break
            }
            if (chunk.includes('[AXIS_TRUNCATED]')) {
              chunk = chunk.replace('[AXIS_TRUNCATED]', '').trimEnd()
              chunk += '\n\n[This section reached its generation limit and may be incomplete.]'
            }

            sectionText    = chunk
            sectionSuccess = true
            break
          } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError' && abortRef.current?.signal.aborted) throw err
            if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
              lastError = `${SECTION_DISPLAY[sec]} timed out. Please retry.`
            } else {
              lastError = err instanceof Error ? err.message : String(err)
            }
            if (attempt === 0) await new Promise(r => setTimeout(r, 1500))
          }
        }

        if (!sectionSuccess) {
          setSectionStates(prev => ({ ...prev, [sec]: 'failed' }))
          accumulated += `\n\n[Section "${SECTION_DISPLAY[sec]}" could not be generated — ${lastError}]\n\n`
          setText(accumulated)
          continue
        }

        setSectionStates(prev => ({ ...prev, [sec]: 'done' }))
        accumulated += sectionText + '\n\n'
        setText(accumulated)
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
        setActiveSection(null)
      }
    }
  }, [synastryData])

  useEffect(() => {
    if (!loadingRef.current) {
      generateReading()
    }
  }, [generateReading])

  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  const blocks = text ? parseReading(text) : []
  const hasAnyFailed = SYNASTRY_SECTIONS.some(s => sectionStates[s] === 'failed')

  return (
    <div className={styles.panel}>
      <div role="status" aria-live="polite" aria-atomic="false" className={styles.srOnly}>
        {liveStatus}
      </div>

      <div className={styles.readingHeader}>
        <div className={styles.readingMeta}>
          <h2 className={styles.readingTitle}>Synastry Reading</h2>
          <p className={styles.readingSubtitle}>Inter-chart aspects · Composite chart</p>
        </div>
      </div>

      {/* Section progress chips */}
      {loading && (
        <div className={styles.sectionProgress} aria-label="Section loading progress">
          {SYNASTRY_SECTIONS.map(s => {
            const state = sectionStates[s] ?? 'pending'
            return (
              <span
                key={s}
                className={`${styles.sectionChip} ${styles[`chip_${state}`]}`}
                aria-label={`${SECTION_DISPLAY[s]}: ${state}`}
              >
                {SECTION_DISPLAY[s]}
                {state === 'done'   && <span className={styles.chipCheck} aria-hidden="true"> ✓</span>}
                {state === 'failed' && <span className={styles.chipFail}  aria-hidden="true"> ✕</span>}
              </span>
            )
          })}
        </div>
      )}

      <div className={styles.readingBody}>
        {loading && !text && (
          <div className={styles.generating}>
            <div className={styles.generatingOrbit} />
            <p className={styles.generatingText}>
              {activeSection ? `Interpreting ${SECTION_DISPLAY[activeSection as SynastrySection] ?? activeSection}` : 'Interpreting synastry'}
            </p>
          </div>
        )}

        {error && (
          <div className={styles.errorState}>
            <p className={styles.errorText}>{error}</p>
            <button className={styles.retryBtn} onClick={generateReading}>Retry reading</button>
          </div>
        )}

        {!loading && !error && !text.trim() && (
          <div className={styles.errorState}>
            <p className={styles.errorText}>No reading generated. The API may be unavailable.</p>
            <button className={styles.retryBtn} onClick={generateReading}>Retry</button>
          </div>
        )}

        {!loading && hasAnyFailed && (
          <div className={styles.partialFailBanner}>
            <p className={styles.partialFailText}>One or more sections failed to generate.</p>
            <button className={styles.retryBtn} onClick={generateReading}>Regenerate full reading</button>
          </div>
        )}

        {blocks.length > 0 && (
          <div className={styles.readingText}>
            {blocks.map((block, i) => {
              if (block.type === 'subheading') return <h4 key={i} className={styles.planetSubheading}>{block.content}</h4>
              if (block.type === 'heading') {
                const descriptorKey = getSynastryKey(block.content)
                const descriptor = descriptorKey ? SYNASTRY_DESCRIPTORS[descriptorKey] : null
                return (
                  <div key={i} className={styles.sectionBlock}>
                    <h3 className={styles.planetHeading}>{block.content}</h3>
                    {descriptor && (
                      <div className={styles.infoBox}>
                        <p className={styles.infoKeywords}>{descriptor.keywords}</p>
                        <p className={styles.infoText}>{descriptor.description}</p>
                      </div>
                    )}
                  </div>
                )
              }
              return (
                <p key={i} className={styles.paragraph} style={{ animationDelay: `${Math.min(i * 0.02, 0.4)}s` }}>
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
