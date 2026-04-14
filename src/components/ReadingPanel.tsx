'use client'
import { useState, useEffect, useRef } from 'react'
import { DualChartData } from '@/lib/astro-calc'
import { TROPICAL_DESCRIPTORS, SIDEREAL_DESCRIPTORS, SYNTHESIS_DESCRIPTORS } from '@/lib/planet-descriptors'
import styles from './ReadingPanel.module.css'

interface ReadingPanelProps {
  chartData: DualChartData
  section: 'tropical' | 'sidereal' | 'synthesis'
}

const SECTION_LABELS: Record<string, { title: string; subtitle: string }> = {
  tropical: { title: 'Tropical Reading', subtitle: 'Western — The Constructed Self' },
  sidereal: { title: 'Sidereal Reading', subtitle: 'Vedic — The Essential Self' },
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
    if (line.match(/^\*[^*]+\*$/) || line.match(/^_[^_]+_$/)) continue
    if (!line.trim()) { flush(); continue }
    buf = buf ? buf + ' ' + line.trim() : line.trim()
  }
  flush()
  return blocks
}

export default function ReadingPanel({ chartData, section }: ReadingPanelProps) {
  const [readings, setReadings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!readings[section]) generateReading(section)
  }, [section, chartData])

  const generateReading = async (sec: string) => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartData, section: sec }),
        signal: abortRef.current.signal
      })
      if (!res.ok || !res.body) throw new Error('Reading failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setReadings(prev => ({ ...prev, [sec]: accumulated }))
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError('Reading generation failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const currentText = readings[section] || ''
  const label = SECTION_LABELS[section]
  const blocks = currentText ? parseReading(currentText, section) : []
  const descriptors = section === 'sidereal' ? SIDEREAL_DESCRIPTORS : TROPICAL_DESCRIPTORS

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
        </div>
      </div>

      <div className={styles.readingBody}>
        {loading && !currentText && (
          <div className={styles.generating}>
            <div className={styles.generatingDots}><span /><span /><span /></div>
            <p className={styles.generatingText}>Generating reading</p>
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

        {blocks.length > 0 && (
          <div className={styles.readingText}>
            {blocks.map((block, i) => {
              if (block.type === 'subheading') {
                return (
                  <h4 key={i} className={styles.subHeading}>{block.content}</h4>
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
