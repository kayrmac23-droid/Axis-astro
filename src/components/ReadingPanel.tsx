'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { DualChartData } from '@/lib/astro-calc'
import { TROPICAL_DESCRIPTORS, SIDEREAL_DESCRIPTORS, SYNTHESIS_DESCRIPTORS } from '@/lib/planet-descriptors'
import { buildReadoutRows, buildFlips, countBodies, lonStr, ZODIAC_GLYPHS, type ReadoutRow } from '@/lib/readout'
import styles from './ReadingPanel.module.css'
import { capture } from '@/lib/analytics'
import { detectStreamError, ReadingUnavailableError } from '@/lib/reading-stream'

interface ReadingPanelProps {
  chartData: DualChartData
  // The panel shows one system's reading, driven by the frame toggle
  // (DOCTRINE.md amendment July 2026). The Divergence renders below it in
  // every frame state; positional data never follows the frame.
  frame: 'tropical' | 'sidereal'
}

// 'synthesis' survives here as the internal reading-type identifier only
// (cache keys, API contract). Everything rendered says "The Divergence". DOCTRINE.md: NAMING.
const SECTION_LABELS: Record<string, { title: string; subtitle: string }> = {
  tropical: { title: 'Tropical Reading', subtitle: 'Western · the self you know' },
  sidereal: { title: 'Sidereal Reading', subtitle: 'Vedic · the self you were handed' },
  synthesis: { title: 'The Divergence', subtitle: 'concordance · dissonance · where the two systems part' }
}

const SECTION_DISPLAY: Record<string, string> = {
  sun: 'Sun', moon: 'Moon', ascendant: 'Ascendant', mercury: 'Mercury',
  venus: 'Venus', mars: 'Mars', jupiter_saturn: 'Jupiter & Saturn', key_aspects: 'Aspects',
  lagna: 'Lagna', rahu_ketu: 'Rahu & Ketu',
  agree: 'Concordance', diverge: 'Divergence', tension: 'Tension', closing: 'Living the Divergence',
}

// The band kicker beside the frame name — what this frame is a reading OF.
const FRAME_KICKER: Record<string, string> = {
  tropical: 'THE PSYCHOLOGICAL INTERIOR',
  sidereal: 'INCARNATIONAL PATTERNING',
}

// Rail labels. The Divergence's four movements are named as the design names
// them; the planet sections reuse SECTION_DISPLAY, uppercased.
const DIVERGENCE_MOVEMENTS: { key: string; label: string }[] = [
  { key: 'agree',   label: 'CONCORDANCE' },
  { key: 'diverge', label: 'WHERE THEY PART' },
  { key: 'tension', label: 'CENTRAL TENSION' },
  { key: 'closing', label: 'LIVING THE DIVERGENCE' },
]

// Must exceed the server's maxDuration so the server — not the client — decides
// when a section has failed. /api/reading streams a single first-pass generation
// straight through to close (the eval/repair passes were taken off the request
// path); aborting earlier kills a section mid-generation before the server can
// cache it, and the retry then re-generates from scratch — so a client cap below
// the server ceiling turns one slow section into two billed calls and a failure.
// route.ts declares maxDuration = 120, so this sits just above it. Keep the two
// in step: this was left at 65s when maxDuration went 60 → 120.
const SECTION_TIMEOUT_MS = 125_000

function getDescriptorKey(heading: string, section: string): string | null {
  const h = heading.toLowerCase()
  // Match nodes before individual planet names so "Rahu and Ketu" / "The Lunar Nodes"
  // doesn't get caught by a generic planet substring further down.
  if (h.includes('node') || h.includes('rahu') || h.includes('ketu')) {
    return section === 'tropical' ? 'Nodes' : null
  }
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
  if (h.includes('agree') || h.includes('negotiable')) return 'agree'
  if (h.includes('where they part') || h.includes('diverge')) return 'diverge'
  if (h.includes('central tension')) return 'tension'
  if (h.includes('living the') || h.includes('integration')) return 'closing'
  return null
}

// Which readout-row id(s) a placement heading describes, so the per-section data
// block beside the prose shows exactly the bodies that prose discusses. Returns
// row ids (from buildReadoutRows). Combined sections resolve to BOTH bodies
// (Jupiter & Saturn → [jupiter, saturn]; Rahu & Ketu / nodes → [rahu, ketu]).
// Aspects and the Divergence sub-sections resolve to none — they stay prose-only.
function bodiesForHeading(content: string): string[] {
  const h = content.toLowerCase()
  const ids: string[] = []
  if (h.includes('node') || h.includes('rahu') || h.includes('ketu')) { ids.push('rahu', 'ketu') }
  if (h.includes('sun')) ids.push('sun')
  if (h.includes('moon')) ids.push('moon')
  if (h.includes('mercury')) ids.push('mercury')
  if (h.includes('venus')) ids.push('venus')
  if (h.includes('mars')) ids.push('mars')
  if (h.includes('jupiter')) ids.push('jupiter')
  if (h.includes('saturn')) ids.push('saturn')
  if (h.includes('ascendant') || h.includes('lagna') || h.includes('rising')) ids.push('asc')
  if (h.includes('uranus')) ids.push('uranus')
  if (h.includes('neptune')) ids.push('neptune')
  if (h.includes('pluto')) ids.push('pluto')
  return Array.from(new Set(ids))
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
  tropical: ['sun', 'moon', 'ascendant', 'mercury', 'venus', 'mars', 'jupiter_saturn', 'rahu_ketu', 'key_aspects'],
  sidereal: ['lagna', 'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter_saturn', 'rahu_ketu'],
  synthesis: ['agree', 'diverge', 'tension', 'closing']
}

// A placement = one ## heading and the prose that follows it, until the next
// heading. Blocks before the first heading (rare) form a lead group with no body.
type PlacementGroup = { blocks: Block[]; bodyIds: string[] }

function groupPlacements(blocks: Block[]): PlacementGroup[] {
  const groups: PlacementGroup[] = []
  let cur: PlacementGroup | null = null
  for (const b of blocks) {
    if (b.type === 'heading') {
      cur = { blocks: [b], bodyIds: bodiesForHeading(b.content) }
      groups.push(cur)
    } else {
      if (!cur) { cur = { blocks: [], bodyIds: [] }; groups.push(cur) }
      cur.blocks.push(b)
    }
  }
  return groups
}

// The per-section data block: one body's Tropical and Sidereal positions shown as
// distinct data with a Δ-sign marker. DOCTRINE.md — THE LAW: both frames are
// presented side by side and the divergence is marked; nothing is reconciled.
// Chrome, not prose — mono type, dimmed, copper as the sole accent.
function ReadoutCard({ row }: { row: ReadoutRow }) {
  return (
    <div className={styles.readoutCard}>
      <p className={styles.readoutName}>
        {row.glyph && <span className={styles.readoutGlyph}>{row.glyph} </span>}{row.name}
        {row.retro && <span className={styles.readoutRetro}> ℞</span>}
      </p>
      <div className={styles.readoutFrame}>
        <span className={styles.readoutFrameLabel}>Tropical</span>
        <span className={styles.readoutVal}>
          {lonStr(row.tLon)}
          {row.tHouse != null && <span className={styles.readoutHouse}> · H{row.tHouse}</span>}
          {row.tDignity && <span className={styles.readoutDignity}> · {row.tDignity}</span>}
        </span>
      </div>
      <div className={styles.readoutFrame}>
        <span className={styles.readoutFrameLabel}>Sidereal</span>
        <span className={styles.readoutVal}>
          {lonStr(row.sLon)}
          {row.sHouse != null && <span className={styles.readoutHouse}> · H{row.sHouse}</span>}
          {row.sDignity && <span className={styles.readoutDignity}> · {row.sDignity}</span>}
        </span>
        {row.nakshatra && (
          <span className={styles.readoutNak}>{row.nakshatra}{row.nakPada != null ? ` · pada ${row.nakPada}` : ''}</span>
        )}
      </div>
      <p className={styles.readoutDelta}>
        <span className={styles.readoutDeltaLabel}>Δ SIGN</span>
        <span className={row.flip ? styles.readoutFlip : styles.readoutHold}>
          {row.flip
            ? `${ZODIAC_GLYPHS[row.tSign]} → ${ZODIAC_GLYPHS[row.sSign]}`
            : `${ZODIAC_GLYPHS[row.tSign]} · ${ZODIAC_GLYPHS[row.sSign]}`}
        </span>
      </p>
    </div>
  )
}

type PlanetSectionState = 'pending' | 'loading' | 'done' | 'failed'
type TabStatus = 'pending' | 'loading' | 'done' | 'failed'
type SystemSection = 'tropical' | 'sidereal' | 'synthesis'

export default function ReadingPanel({ chartData, frame }: ReadingPanelProps) {
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
    // Key section states by `${sec}:${planetSec}` — planetSection names collide
    // across tabs (sun/moon/… exist in both tropical and sidereal), so a bare key
    // would let one tab's progress overwrite another's. Merge (don't replace) so
    // an already-completed tab keeps its rail state as the chain advances.
    const initialStates: Record<string, PlanetSectionState> = {}
    for (const s of sectionsToFetch) initialStates[`${sec}:${s}`] = 'pending'
    setSectionStates(prev => ({ ...prev, ...initialStates }))
    setActivePlanetSection(null)
    setLiveStatus(`Starting ${sec} reading`)
    capture('reading_start', { section: sec, section_count: sectionsToFetch.length })

    let accumulatedText = ''

    try {
      for (const planetSec of sectionsToFetch) {
        if (signal.aborted) break

        setSectionStates(prev => ({ ...prev, [`${sec}:${planetSec}`]: 'loading' }))
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
              body: JSON.stringify({
                birthData: chartData.birthData,
                plutoLongitude: chartData.plutoLongitude,
                plutoSource: chartData.plutoSource,
                section: sec,
                planetSection: planetSec,
              }),
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

            const failure = detectStreamError(chunkText)
            if (failure) {
              // A fatal failure (billing, auth) is the account's problem, not this
              // section's — every remaining section would fail identically. Unwind
              // the whole run instead of retrying this one and then marching through
              // the rest, which turns one outage into ~42 doomed round trips.
              if (failure.fatal) {
                capture('reading_unavailable', { section: sec, planet_section: planetSec, code: failure.code })
                throw new ReadingUnavailableError(failure)
              }
              lastError = failure.message
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
            // Fatal-service unwind and user aborts both pass straight through:
            // neither is a section-level failure and neither may be retried.
            if (fetchErr instanceof ReadingUnavailableError) throw fetchErr
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
          setSectionStates(prev => ({ ...prev, [`${sec}:${planetSec}`]: 'failed' }))
          setLiveStatus(`${SECTION_DISPLAY[planetSec] ?? planetSec} failed to load`)
          setPlanetSectionErrors(prev => ({ ...prev, [`${sec}:${planetSec}`]: lastError }))
          accumulatedText += `\n\n[AXIS_FAILED:${planetSec}]\n\n`
          setReadings(prev => ({ ...prev, [sec]: accumulatedText }))
          continue
        }

        setSectionStates(prev => ({ ...prev, [`${sec}:${planetSec}`]: 'done' }))
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
    // Set when the service itself is unavailable (billing/auth), so the failure
    // copy tells the reader retrying is pointless rather than inviting another go.
    let fatalMessage = ''

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
          body: JSON.stringify({
            birthData: chartData.birthData,
            plutoLongitude: chartData.plutoLongitude,
            plutoSource: chartData.plutoSource,
            section: sec,
            planetSection: planetSec,
          }),
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

        const failure = detectStreamError(fetchedText)
        if (failure) {
          // A fatal failure cannot be retried away — burn no second attempt and
          // show the reader why, instead of the generic "Retry failed".
          if (failure.fatal) { fatalMessage = failure.message; break }
          if (attempt === 0) continue
          break
        }

        // Mirror the main streaming loop: convert the truncation sentinel into a
        // reader-facing note rather than splicing the raw [AXIS_TRUNCATED] marker
        // into the visible reading.
        if (fetchedText.includes('[AXIS_TRUNCATED]')) {
          fetchedText = fetchedText.replace('[AXIS_TRUNCATED]', '').trimEnd()
          fetchedText += '\n\n[This section reached its generation limit and may be incomplete.]'
          capture('reading_truncated', { section: sec, planet_section: planetSec })
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
          // Function replacer: fetchedText is model output and may contain `$`
          // sequences ($&, $1, $$…) that String.replace would otherwise interpret
          // as replacement patterns and corrupt the inserted prose.
          [sec]: text.replace(`[AXIS_LOADING:${planetSec}]`, () => fetchedText)
        }
      })
    } else {
      const errMsg = fatalMessage || 'Retry failed. Please try again.'
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

  // Per-section readout data, from the SAME source as the wheel table
  // (lib/readout). Indexed by row id so each placement can pin its body's data.
  const readoutRows = useMemo(() => buildReadoutRows(chartData), [chartData])
  const rowById = useMemo(
    () => Object.fromEntries(readoutRows.map(r => [r.id, r])) as Record<string, ReadoutRow>,
    [readoutRows]
  )

  // Renders one reading section's header, progress, states, and prose blocks.
  // Tropical and Sidereal render side by side; the divergence section renders below both.
  // withData=true (single-frame) pins each placement's readout data beside its prose.
  const renderSection = (section: SystemSection, withData = false) => {
    const currentStatus   = tabStatus[section]
    const currentError    = tabErrors[section]
    const currentText     = readings[section] || ''
    const isStreaming     = streamingTab === section
    const label           = SECTION_LABELS[section]
    const blocks          = currentText ? parseReading(currentText, section) : []
    const descriptors     = section === 'sidereal' ? SIDEREAL_DESCRIPTORS : TROPICAL_DESCRIPTORS

    // One parsed block → its element. Shared by the flat layout (side-by-side /
    // Divergence) and the grouped layout (single-frame, with data blocks).
    const renderBlock = (block: Block, key: string | number, animIndex: number) => {
      if (block.type === 'sectionFailed') {
        const errMsg = planetSectionErrors[`${section}:${block.planetSection}`]
          || 'This section could not be generated.'
        return (
          <div key={key} className={styles.sectionErrorBlock}>
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
          <div key={key} className={styles.sectionLoadingBlock}>
            <div className={styles.generatingOrbit} />
          </div>
        )
      }

      if (block.type === 'subheading') {
        return <h4 key={key} className={styles.planetSubheading}>{block.content}</h4>
      }

      if (block.type === 'heading') {
        const descriptor = block.descriptorKey
          ? section === 'synthesis'
            ? SYNTHESIS_DESCRIPTORS[block.descriptorKey as keyof typeof SYNTHESIS_DESCRIPTORS]
            : (descriptors as Record<string, { name: string; keywords: string; description: string }>)[block.descriptorKey]
          : null

        return (
          <div key={key} className={styles.sectionBlock}>
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
          key={key}
          className={styles.paragraph}
          style={{ animationDelay: `${Math.min(animIndex * 0.02, 0.4)}s` }}
        >
          {block.content}
        </p>
      )
    }

    return (
      <>
        {/* The band head and the section rail carry this heading visually
            (design: dossier reading band); it stays in the document for
            structure and for screen readers. */}
        <h2 className={styles.srOnly}>{label.title} — {label.subtitle}</h2>

        <div className={`${styles.readingBody} ${withData ? '' : styles.flatBody}`}>

          {/* Section-level error */}
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
                    ? 'The Divergence is read after and below both'
                    : 'Preparing reading'}
              </p>
            </div>
          )}

          {/* Loading — this section is actively streaming */}
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

          {/* Content blocks. Single-frame (withData): each placement's prose sits
              beside its body's readout data, aligned to the section it belongs to;
              on mobile the grid collapses and the data reflows below the prose.
              Side-by-side and the Divergence keep the flat prose flow. */}
          {blocks.length > 0 && (
            withData ? (
              <div className={styles.readingText}>
                {groupPlacements(blocks).map((group, gi) => {
                  const bodies = group.bodyIds
                    .map(id => rowById[id])
                    .filter((r): r is ReadoutRow => Boolean(r))
                  return (
                    <div
                      key={gi}
                      className={bodies.length > 0 ? styles.placement : styles.placementSolo}
                    >
                      <div className={styles.placementProse}>
                        {group.blocks.map((b, bi) => renderBlock(b, `${gi}-${bi}`, bi))}
                      </div>
                      {bodies.length > 0 && (
                        <aside className={styles.placementData} aria-label="Placement positions — both frames">
                          {bodies.map(row => <ReadoutCard key={row.id} row={row} />)}
                        </aside>
                      )}
                    </div>
                  )
                })}
                {isStreaming && currentStatus === 'loading' && <span className={styles.cursor} />}
              </div>
            ) : (
              <div className={styles.readingText}>
                {blocks.map((block, i) => renderBlock(block, i, i))}
                {isStreaming && currentStatus === 'loading' && <span className={styles.cursor} />}
              </div>
            )
          )}
        </div>
      </>
    )
  }

  // Band head counter: which planet section of this frame is streaming.
  const frameSections = PLANET_SECTIONS[frame]
  const frameStreaming = streamingTab === frame && tabStatus[frame] === 'loading'
  const activeIdx = activePlanetSection ? frameSections.indexOf(activePlanetSection) : -1
  const counter = frameStreaming && activeIdx >= 0
    ? `SECTION ${activeIdx + 1} OF ${frameSections.length}`
    : `${frameSections.length} SECTIONS`

  const railState = (key: string) => {
    const st = sectionStates[key] ?? 'pending'
    return st === 'loading' ? styles.railLive
      : st === 'done' ? styles.railDone
      : st === 'failed' ? styles.railFailed
      : styles.railPending
  }

  // Bodies that change sign between the frames — the Divergence's evidence
  // table. Derived from the same rows the READOUT rail renders.
  const flips = buildFlips(readoutRows)
  const bodyCount = countBodies(readoutRows)

  return (
    <div className={styles.panel}>
      {/* Screen-reader live region */}
      <div role="status" aria-live="polite" aria-atomic="false" className={styles.srOnly}>
        {liveStatus}
      </div>

      {/* ── The frame reading ───────────────────────────────
          Prose follows the frame; positional data never does — it is pinned
          beside each placement in both frames (DOCTRINE.md: CO-VISIBILITY).
          The long-form prose takes the raised reading surface
          (DOCTRINE.md: READING SURFACE EXCEPTION). */}
      <section className={styles.band} aria-label={`${frame === 'sidereal' ? 'Sidereal' : 'Tropical'} reading`}>
        <div className={styles.bandInner}>
          <div className={styles.bandHead}>
            <span>{`// ${frame.toUpperCase()} FRAME · ${FRAME_KICKER[frame]}`}</span>
            <span className={styles.bandHeadRight}>
              <span>{counter}</span>
              {frameStreaming && <span className={styles.streaming}>● STREAMING</span>}
            </span>
          </div>
          <div className={styles.bandGrid}>
            <div className={styles.bandProse}>
              {renderSection(frame, true)}
            </div>
            <aside className={styles.rail} aria-label="Sections in this reading">
              <div className={styles.railHead}>SECTIONS</div>
              <div className={styles.railList}>
                {frameSections.map(key => (
                  <span key={key} className={railState(`${frame}:${key}`)}>
                    {(sectionStates[`${frame}:${key}`] === 'loading' ? '● ' : '')}
                    {(SECTION_DISPLAY[key] ?? key).toUpperCase()}
                  </span>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ── The Divergence ──────────────────────────────────
          Frame-independent: it never toggles off, and it is read after both.
          The flip table is the evidence; the prose below it is the reading. */}
      <section className={styles.divergence} aria-label="The Divergence">
        <div className={styles.divRule} />
        <div className={styles.divTop}>
          <div>
            <div className={styles.divTitle}>THE DIVERGENCE</div>
            <div className={styles.divSub}>FRAME-INDEPENDENT · READ AFTER BOTH · NEVER TOGGLES OFF</div>
            <div className={styles.divCount}>
              {flips.length} OF {bodyCount} BODIES CHANGE SIGN BETWEEN FRAMES
            </div>
          </div>
          <div className={styles.flipTable}>
            <div className={styles.flipHead}>
              <span>WHERE THEY PART</span><span>TROPICAL</span><span>SIDEREAL</span>
              <span className={styles.flipRight}>SIGNAL</span>
            </div>
            {flips.map(f => (
              <div key={f.id} className={styles.flipRow}>
                <span><span className={styles.flipGlyph}>{f.glyph}</span>{f.name}</span>
                <span>{f.tCell}</span>
                <span>{f.sCell}</span>
                <span className={`${styles.flipRight} ${styles.flipSignal}`}>
                  <span className={styles.flipDot} />{f.signal}
                </span>
              </div>
            ))}
            {flips.length === 0 && (
              <div className={styles.flipEmpty}>
                NO BODY CHANGES SIGN BETWEEN FRAMES. THE DIVERGENCE IS IN DEGREE AND HOUSE, NOT SIGN.
              </div>
            )}
            <div className={styles.flipNote}>VIOLET MARKS UNRESOLVED TENSION. IT IS NOT AN ERROR TO FIX.</div>
          </div>
        </div>
      </section>

      <section className={styles.band} aria-label="The Divergence reading">
        <div className={styles.bandInner}>
          <div className={styles.bandGrid}>
            <div className={styles.bandProse}>
              {renderSection('synthesis')}
            </div>
            <aside className={styles.rail} aria-label="The four movements">
              <div className={styles.railHead}>MOVEMENTS</div>
              <div className={styles.railListSingle}>
                {DIVERGENCE_MOVEMENTS.map(m => (
                  <span key={m.key} className={railState(`synthesis:${m.key}`)}>
                    {(sectionStates[`synthesis:${m.key}`] === 'loading' ? '● ' : '')}{m.label}
                  </span>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  )
}
