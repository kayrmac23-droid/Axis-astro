'use client'
import { SynastryData, SynastryAspect, AspectType, ASPECT_SYMBOLS } from '@/lib/synastry-calc'
import styles from './SynastryAspectsPanel.module.css'

interface Props {
  data: SynastryData
}

const PLANET_SYMBOLS: Record<string, string> = {
  Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀', Mars: '♂',
  Jupiter: '♃', Saturn: '♄', Uranus: '♅', Neptune: '♆', Pluto: '♇',
}

const ASPECT_LABELS: Record<AspectType, string> = {
  conjunction: 'Conjunction',
  sextile:     'Sextile',
  square:      'Square',
  trine:       'Trine',
  opposition:  'Opposition',
}

const ASPECT_HARMONY: Record<AspectType, 'harmonious' | 'tense' | 'neutral'> = {
  conjunction: 'neutral',
  sextile:     'harmonious',
  trine:       'harmonious',
  square:      'tense',
  opposition:  'tense',
}

// Group and sort: conjunctions first (by orb), then trines, sextiles, squares, oppositions
const ASPECT_ORDER: AspectType[] = ['conjunction', 'trine', 'sextile', 'square', 'opposition']

function groupAspects(aspects: SynastryAspect[]): Array<{ type: AspectType; aspects: SynastryAspect[] }> {
  const groups: Partial<Record<AspectType, SynastryAspect[]>> = {}
  for (const a of aspects) {
    if (!groups[a.aspect]) groups[a.aspect] = []
    groups[a.aspect]!.push(a)
  }
  return ASPECT_ORDER
    .filter(t => groups[t]?.length)
    .map(t => ({ type: t, aspects: groups[t]!.sort((a, b) => a.orb - b.orb) }))
}

function fmtOrb(orb: number): string {
  return `${orb.toFixed(1)}°`
}

export default function SynastryAspectsPanel({ data }: Props) {
  const { interAspects } = data
  const groups = groupAspects(interAspects)

  const compSun = data.composite.planets.find(p => p.name === 'Sun')
  const compMoon = data.composite.planets.find(p => p.name === 'Moon')

  return (
    <section className={styles.panel}>
      <p className={styles.panelLabel}>Synastry aspects</p>

      <div className={styles.compositeBar}>
        <span className={styles.compositeLabel}>Composite</span>
        <span className={styles.compositePlacements}>
          ☉ {compSun?.sign ?? '—'} · ☽ {compMoon?.sign ?? '—'} · ↑ {data.composite.ascendantSign}
        </span>
        <span className={styles.compositeCount}>
          {interAspects.length} inter-aspect{interAspects.length !== 1 ? 's' : ''}
        </span>
      </div>

      {groups.length === 0 && (
        <p className={styles.noAspects}>No major aspects within orb.</p>
      )}

      {groups.map(({ type, aspects }) => (
        <div key={type} className={styles.group}>
          <div className={styles.groupHeader}>
            <span className={`${styles.aspectSymbol} ${styles[`sym_${ASPECT_HARMONY[type]}`]}`}>
              {ASPECT_SYMBOLS[type]}
            </span>
            <span className={styles.groupLabel}>{ASPECT_LABELS[type]}</span>
          </div>
          <div className={styles.aspectList}>
            {aspects.map((a, i) => (
              <div key={i} className={`${styles.aspectRow} ${styles[`row_${ASPECT_HARMONY[type]}`]}`}>
                <span className={styles.planetA}>
                  {PLANET_SYMBOLS[a.planetA] ?? ''} {a.planetA}
                </span>
                <span className={`${styles.aspectGlyph} ${styles[`glyph_${ASPECT_HARMONY[type]}`]}`}>
                  {ASPECT_SYMBOLS[a.aspect]}
                </span>
                <span className={styles.planetB}>
                  {PLANET_SYMBOLS[a.planetB] ?? ''} {a.planetB}
                </span>
                <span className={styles.orb}>{fmtOrb(a.orb)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
