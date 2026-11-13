'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { SynastryData } from '@/lib/synastry-calc'
import { SYNASTRY_DESCRIPTORS } from '@/lib/planet-descriptors'
import styles from './ReadingPanel.module.css'
import { detectStreamError, ReadingUnavailableError, retryDelayForStatus, quotaFailure } from '@/lib/reading-stream'

interface Props {
  synastryData: SynastryData
}

const SYNASTRY_SECTIONS = ['luminaries', 'venus_mars', 'outer_planets', 'composite_chart', 'central_dynamic', 'navigation'] as const
type SynastrySection = typeof SYNASTRY_SECTIONS[number]

const SECTION_DISPLAY: Record<SynastrySection, string> = {
  luminaries:     'Luminaries',
  venus_mars:     'Venus & Mars',
  outer_planets:  'Mind & Structure',
  composite_chart:'Composite Chart',
  central_dynamic:'Central Dynamic',
  navigation:     'What Each Requires',
}

// Must exceed the server's maxDuration so the server — not the client — decides
// when a section has failed. /api/reading streams a single first-pass generation
// straight through to close (the eval/repair passes were taken off the request
// path); aborting earlier kills a section mid-generation before the server can
// cache it, and the retry then re-generates from scratch — so a client cap below
// the server ceiling turns one slow section into two billed calls and a failure.
// route.ts declares maxDuration = 120, so this sits just above it. Keep the two
// in step: this was left at 65s when maxDuration went 60 → 120.
const SECTION_TIMEOUT_MS = 125_000

type SectionState = 'pending' | 'loading' | 'done' | 'failed'
type SectionResult = { text: string } | { error: string }

function getSynastryKey(heading: string): keyof typeof SYNASTRY_DESCRIPTORS | null {
  const h = heading.toLowerCase()
  if (h.includes('luminaries')) return 'luminaries'
  if (h.includes('venus') && h.includes('mars')) return 'venus_mars'
  if (h.includes('mind') && h.includes('structure')) return 'outer_planets'
  if (h.includes('composite')) return 'composite_chart'
  if (h.includes('central dynamic')) return 'central_dynamic'
  if (h.includes('each chart')) return 'navigation'
  return null
}

type Block = { type: 'heading' | 'subheading' | 'paragraph' | 'note'; content: string }

function parseReading(text: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []
  let buf = ''

  const flush = () => {
    if (buf.trim()) { blocks.push({ type: 'paragraph', content: buf.trim() }); buf = '' }
  }

  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('[This section reached its generation limit')) {
      flush(); blocks.push({ type: 'note', content: 'Section reached its length limit · may be incomplete' }); continue
    }
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
  // One entry per section, so a failed section can be retried on its own
  // without regenerating the other five.
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sectionStates, setSectionStates] = useState<Record<string, SectionState>>({})
  const [liveStatus, setLiveStatus] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Fetch one section, with one automatic retry. Resolves to its text or to an
  // error message. Throws only for a user abort or a fatal service failure
  // (billing, auth, quota), which the caller must not retry.
  const fetchSection = useCallback(async (
    sec: SynastrySection,
    signal: AbortSignal,
    onChunk: (t: string) => void,
  ): Promise<SectionResult> => {
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal.aborted) break
      try {
        const timeoutSignal = AbortSignal.timeout(SECTION_TIMEOUT_MS)
        const combinedSignal = AbortSignal.any
          ? AbortSignal.any([signal, timeoutSignal])
          : signal

        const res = await fetch('/api/reading', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            birthA: synastryData.personA.birthData,
            birthB: synastryData.personB.birthData,
            plutoLongitudeA: synastryData.personA.plutoLongitude,
            plutoSourceA: synastryData.personA.plutoSource,
            plutoLongitudeB: synastryData.personB.plutoLongitude,
            plutoSourceB: synastryData.personB.plutoSource,
            section: 'synastry',
            planetSection: sec,
          }),
          signal: combinedSignal,
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          // A daily quota or the site-wide cap: no retry helps today, so
          // stop the run once instead of refusing every remaining section.
          const quota = quotaFailure(res.status, res.headers.get('X-Axis-Quota'), body.message)
          if (quota) throw new ReadingUnavailableError(quota)
          lastError = res.status === 429
            ? `Rate limit reached. Please wait before retrying.`
            : body.message || body.error || `Section failed (${res.status})`
          const wait = attempt === 0 ? retryDelayForStatus(res.status, res.headers.get('Retry-After')) : null
          if (wait == null) break
          await new Promise(r => setTimeout(r, wait))
          continue
        }
        if (!res.body) { lastError = 'No response body'; break }

        const reader  = res.body.getReader()
        const decoder = new TextDecoder()
        let chunk = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunk += decoder.decode(value, { stream: true })
          onChunk(chunk)
        }
        chunk += decoder.decode()

        const failure = detectStreamError(chunk)
        if (failure) {
          // Fatal (billing/auth) means every remaining section fails the same
          // way — unwind the run rather than retrying into a wall.
          if (failure.fatal) throw new ReadingUnavailableError(failure)
          lastError = failure.message
          onChunk('')
          if (attempt === 0) continue
          break
        }
        if (chunk.includes('[AXIS_TRUNCATED]')) {
          chunk = chunk.replace('[AXIS_TRUNCATED]', '').trimEnd()
          chunk += '\n\n[This section reached its generation limit and may be incomplete.]'
        }
        return { text: chunk }
      } catch (err: unknown) {
        if (err instanceof ReadingUnavailableError) throw err
        if (err instanceof Error && err.name === 'AbortError' && signal.aborted) throw err
        if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
          lastError = `${SECTION_DISPLAY[sec]} timed out.`
        } else {
          lastError = err instanceof Error ? err.message : String(err)
        }
        onChunk('')
        if (attempt === 0) await new Promise(r => setTimeout(r, 1500))
      }
    }
    return { error: lastError || 'This section could not be generated.' }
  }, [synastryData])

  const generateReading = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    // This run's own controller: every check below is against IT, never the ref,
    // which a newer run may already have replaced.
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    setTexts({})
    setSectionErrors({})

    const initial: Record<string, SectionState> = {}
    for (const s of SYNASTRY_SECTIONS) initial[s] = 'pending'
    setSectionStates(initial)
    setLiveStatus('Starting synastry reading')

    try {
      for (const sec of SYNASTRY_SECTIONS) {
        if (controller.signal.aborted) break

        setSectionStates(prev => ({ ...prev, [sec]: 'loading' }))
        setLiveStatus(`Interpreting ${SECTION_DISPLAY[sec]}`)

        const result = await fetchSection(sec, controller.signal, t => setTexts(prev => ({ ...prev, [sec]: t })))
        if (controller.signal.aborted) break

        if ('error' in result) {
          setTexts(prev => ({ ...prev, [sec]: '' }))
          setSectionErrors(prev => ({ ...prev, [sec]: result.error }))
          setSectionStates(prev => ({ ...prev, [sec]: 'failed' }))
          continue
        }
        setTexts(prev => ({ ...prev, [sec]: result.text }))
        setSectionStates(prev => ({ ...prev, [sec]: 'done' }))
      }

      setLiveStatus('Reading complete')
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message || 'Reading generation failed. Please try again.')
        setLiveStatus('Reading generation failed')
        // Nothing after a fatal failure will be written; do not leave a
        // section marked as in progress.
        setSectionStates(prev => Object.fromEntries(
          Object.entries(prev).map(([k, v]) => [k, v === 'loading' ? 'pending' : v])
        ))
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [fetchSection])

  // Retry one failed section in place. The other sections are untouched.
  const retrySection = useCallback(async (sec: SynastrySection) => {
    const signal = abortRef.current?.signal
    if (!signal || signal.aborted) return
    setSectionStates(prev => ({ ...prev, [sec]: 'loading' }))
    setSectionErrors(prev => { const next = { ...prev }; delete next[sec]; return next })
    setLiveStatus(`Retrying ${SECTION_DISPLAY[sec]}`)

    let result: SectionResult
    try {
      result = await fetchSection(sec, signal, t => setTexts(prev => ({ ...prev, [sec]: t })))
    } catch (err: unknown) {
      result = { error: err instanceof Error && err.name !== 'AbortError' ? err.message : 'Retry failed.' }
    }
    if (signal.aborted) return

    if ('error' in result) {
      const message = result.error
      setTexts(prev => ({ ...prev, [sec]: '' }))
      setSectionErrors(prev => ({ ...prev, [sec]: message }))
      setSectionStates(prev => ({ ...prev, [sec]: 'failed' }))
      setLiveStatus(`${SECTION_DISPLAY[sec]} failed to load`)
      return
    }
    const text = result.text
    setTexts(prev => ({ ...prev, [sec]: text }))
    setSectionStates(prev => ({ ...prev, [sec]: 'done' }))
    setLiveStatus(`${SECTION_DISPLAY[sec]} loaded`)
  }, [fetchSection])

  // One effect owns the run and its cancellation. It used to be two — a start
  // guarded by `loadingRef` and a separate unmount abort — and under React
  // StrictMode's dev double-invoke the abort cancelled the first run while the
  // guard (still true) skipped the second, leaving the reading stuck loading.
  // generateReading aborts any earlier run itself, so starting again is safe.
  // Started on a timer, as ReadingPanel does, so its synchronous state resets
  // run outside the effect body; StrictMode's first, discarded mount clears the
  // timer before it fires.
  useEffect(() => {
    const id = setTimeout(() => { generateReading() }, 0)
    return () => { clearTimeout(id); abortRef.current?.abort() }
  }, [generateReading])

  const stateOf = (s: SynastrySection): SectionState => sectionStates[s] ?? 'pending'
  const hasText = SYNASTRY_SECTIONS.some(s => texts[s])
  const anyFailed = SYNASTRY_SECTIONS.some(s => stateOf(s) === 'failed')
  const activeIdx = SYNASTRY_SECTIONS.findIndex(s => stateOf(s) === 'loading')
  const streaming = activeIdx >= 0
  const counter = streaming
    ? `SECTION ${activeIdx + 1} OF ${SYNASTRY_SECTIONS.length}`
    : `${SYNASTRY_SECTIONS.length} SECTIONS`

  const railClass = (s: SynastrySection) => {
    const st = stateOf(s)
    return st === 'loading' ? styles.railLive
      : st === 'done' ? styles.railDone
      : st === 'failed' ? styles.railFailed
      : styles.railPending
  }

  // Same frame as the natal reading: raised band, band head with the live
  // counter, prose at the reading measure, section rail on the right.
  return (
    <section className={styles.band} aria-label="Synastry reading">
      <div role="status" aria-live="polite" aria-atomic="false" className={styles.srOnly}>
        {liveStatus}
      </div>

      <div className={styles.bandInner}>
        <div className={styles.bandHead}>
          <span>{'// SYNASTRY READING · INTER-CHART ASPECTS · COMPOSITE CHART'}</span>
          <span className={styles.bandHeadRight}>
            <span>{counter}</span>
            {streaming && <span className={styles.streaming}>● STREAMING</span>}
          </span>
        </div>

        <div className={styles.bandGrid}>
          <div className={styles.bandProse}>
            <h2 className={styles.srOnly}>Synastry reading</h2>

            <div className={`${styles.readingBody} ${styles.flatBody}`}>
              {error && (
                <div className={styles.sectionErrorBlock}>
                  <p className={styles.sectionErrorLabel}>Reading unavailable</p>
                  <p className={styles.sectionErrorMsg}>{error}</p>
                  <button className={styles.retrySectionBtn} onClick={generateReading}>Retry reading</button>
                </div>
              )}

              {!loading && !error && !hasText && !anyFailed && (
                <div className={styles.sectionErrorBlock}>
                  <p className={styles.sectionErrorLabel}>Reading unavailable</p>
                  <p className={styles.sectionErrorMsg}>No reading was generated. The service may be unavailable.</p>
                  <button className={styles.retrySectionBtn} onClick={generateReading}>Retry reading</button>
                </div>
              )}

              {!error && streaming && !hasText && !anyFailed && (
                <div className={styles.generating}>
                  <div className={styles.generatingOrbit} />
                  <p className={styles.generatingText}>Interpreting {SECTION_DISPLAY[SYNASTRY_SECTIONS[activeIdx]]}</p>
                </div>
              )}

              {SYNASTRY_SECTIONS.map(sec => {
                const state = stateOf(sec)
                const body = texts[sec] || ''
                const id = `axis-syn-${sec}`

                if (state === 'failed') {
                  return (
                    <div key={sec} id={id} className={styles.synSection}>
                      <div className={styles.sectionErrorBlock}>
                        <p className={styles.sectionErrorLabel}>Section unavailable · {SECTION_DISPLAY[sec]}</p>
                        <p className={styles.sectionErrorMsg}>
                          {sectionErrors[sec] || 'This section could not be generated.'} The other sections are unaffected.
                        </p>
                        <button className={styles.retrySectionBtn} onClick={() => retrySection(sec)}>
                          Retry this section
                        </button>
                      </div>
                    </div>
                  )
                }

                if (!body) {
                  // Waiting on a section while earlier ones are already on the page.
                  if (state !== 'loading' || (!hasText && !anyFailed)) return null
                  return (
                    <div key={sec} id={id} className={styles.synSection}>
                      <div className={styles.sectionLoadingBlock}><div className={styles.generatingOrbit} /></div>
                    </div>
                  )
                }

                return (
                  <div key={sec} id={id} className={styles.synSection}>
                    <div className={styles.readingText}>
                      {parseReading(body).map((block, i) => {
                        if (block.type === 'note') return <p key={i} className={styles.sectionNote}>{block.content}</p>
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
                      {state === 'loading' && <span className={styles.cursor} />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <aside className={styles.rail} aria-label="Sections in the synastry reading">
            <div className={styles.railHead}>SECTIONS</div>
            <div className={styles.railList}>
              {SYNASTRY_SECTIONS.map((s, i) => {
                const st = stateOf(s)
                const inner = (
                  <>
                    <span>{st === 'loading' ? '● ' : ''}{SECTION_DISPLAY[s].toUpperCase()}</span>
                    <span className={styles.railNum}>{String(i + 1).padStart(2, '0')}</span>
                  </>
                )
                return st === 'done' || st === 'failed'
                  ? <a key={s} href={`#axis-syn-${s}`} className={`${styles.railRow} ${styles.railLink} ${railClass(s)}`}>{inner}</a>
                  : <span key={s} className={`${styles.railRow} ${railClass(s)}`}>{inner}</span>
              })}
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
