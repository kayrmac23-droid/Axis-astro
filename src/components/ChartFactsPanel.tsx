'use client'
import { DualChartData } from '@/lib/astro-calc'
import styles from './ChartFactsPanel.module.css'

interface Props {
  data: DualChartData
}

const VS = '︎'
const PLANET_SYMBOLS: Record<string, string> = {
  Sun: `☉${VS}`, Moon: `☽${VS}`, Mercury: `☿${VS}`, Venus: `♀${VS}`, Mars: `♂${VS}`,
  Jupiter: `♃${VS}`, Saturn: `♄${VS}`, Uranus: `♅${VS}`, Neptune: `♆${VS}`,
  Pluto: `♇${VS}`, Rahu: `☊${VS}`, Ketu: `☋${VS}`,
}

const SIGN_ABBR: Record<string, string> = {
  Aries: 'Ari', Taurus: 'Tau', Gemini: 'Gem', Cancer: 'Can',
  Leo: 'Leo', Virgo: 'Vir', Libra: 'Lib', Scorpio: 'Sco',
  Sagittarius: 'Sag', Capricorn: 'Cap', Aquarius: 'Aqu', Pisces: 'Pis',
}

const DIGNITIES: Record<string, {
  domicile: string[]; exaltation: string; detriment: string[]; fall: string
}> = {
  Sun:     { domicile: ['Leo'],                   exaltation: 'Aries',     detriment: ['Aquarius'],              fall: 'Libra'     },
  Moon:    { domicile: ['Cancer'],                exaltation: 'Taurus',    detriment: ['Capricorn'],             fall: 'Scorpio'   },
  Mercury: { domicile: ['Gemini', 'Virgo'],       exaltation: 'Virgo',     detriment: ['Sagittarius', 'Pisces'], fall: 'Pisces'    },
  Venus:   { domicile: ['Taurus', 'Libra'],       exaltation: 'Pisces',    detriment: ['Aries', 'Scorpio'],      fall: 'Virgo'     },
  Mars:    { domicile: ['Aries', 'Scorpio'],      exaltation: 'Capricorn', detriment: ['Taurus', 'Libra'],       fall: 'Cancer'    },
  Jupiter: { domicile: ['Sagittarius', 'Pisces'], exaltation: 'Cancer',    detriment: ['Gemini', 'Virgo'],       fall: 'Capricorn' },
  Saturn:  { domicile: ['Capricorn', 'Aquarius'], exaltation: 'Libra',     detriment: ['Cancer', 'Leo'],         fall: 'Aries'     },
}

type Dig = 'domicile' | 'exaltation' | 'detriment' | 'fall' | null

function getDignity(planet: string, sign: string): Dig {
  const d = DIGNITIES[planet]
  if (!d) return null
  if (d.domicile.includes(sign)) return 'domicile'
  if (d.exaltation === sign) return 'exaltation'
  if (d.detriment.includes(sign)) return 'detriment'
  if (d.fall === sign) return 'fall'
  return null
}

function fmtDeg(deg: number): string {
  const d = Math.floor(deg)
  const m = Math.round((deg - d) * 60)
  return `${d}°${String(m).padStart(2, '0')}'`
}

const PLANET_ORDER = [
  'Sun', 'Moon', 'Mercury', 'Venus', 'Mars',
  'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Rahu', 'Ketu',
]

export default function ChartFactsPanel({ data }: Props) {
  const { tropical, sidereal } = data

  const tMap = Object.fromEntries(tropical.planets.map(p => [p.name, p]))
  const sMap = Object.fromEntries(sidereal.planets.map(p => [p.name, p]))
  const planets = PLANET_ORDER.filter(n => tMap[n] || sMap[n])

  const plutoLabel = data.plutoSource === 'local-meeus'
    ? 'Pluto: local Meeus (~0.3° approx)'
    : `Pluto: JPL Horizons ${data.plutoSource.replace('jpl-horizons-', '').toUpperCase()}`

  return (
    <section className={styles.panel}>
      <p className={styles.panelLabel}>Chart positions</p>
      <p className={styles.panelDesc}>
        Exact placements by degree, house, and dignity — both systems side by side.
        A <span style={{ color: 'var(--cyan)', fontStyle: 'normal' }}>≠</span> marks where Tropical and Sidereal diverge in sign.
      </p>

      {/* Column headers */}
      <div className={styles.headerRow}>
        <span className={styles.hName} />
        <span className={styles.hSys}>Tropical</span>
        <span className={styles.hDiff} />
        <span className={styles.hSys}>Sidereal</span>
      </div>

      {/* Angles */}
      <div className={styles.group}>
        {(
          [
            {
              label: 'Asc',
              tSign: tropical.ascendantSign, tDeg: tropical.ascendantDegree,
              sSign: sidereal.ascendantSign, sDeg: sidereal.ascendantDegree,
            },
            {
              label: 'MC',
              tSign: tropical.midheavenSign, tDeg: tropical.midheavenDegree,
              sSign: sidereal.midheavenSign, sDeg: sidereal.midheavenDegree,
            },
          ] as const
        ).map(({ label, tSign, tDeg, sSign, sDeg }) => {
          const shifted = tSign !== sSign
          return (
            <div key={label} className={`${styles.row} ${shifted ? styles.rowShifted : ''}`}>
              <span className={styles.name}><span className={styles.planetName}>{label}</span></span>
              <div className={`${styles.cell} ${shifted ? styles.cellShifted : ''}`}>
                <span className={styles.sign}>{SIGN_ABBR[tSign] ?? tSign}</span>
                <span className={styles.deg}>{fmtDeg(tDeg)}</span>
              </div>
              <span className={styles.diffCol}>{shifted ? '≠' : ''}</span>
              <div className={`${styles.cell} ${shifted ? styles.cellShifted : ''}`}>
                <span className={styles.sign}>{SIGN_ABBR[sSign] ?? sSign}</span>
                <span className={styles.deg}>{fmtDeg(sDeg)}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className={styles.separator} />

      {/* Planets */}
      <div className={styles.group}>
        {planets.map(name => {
          const t = tMap[name]
          const s = sMap[name]
          const shifted = !!(t && s && t.sign !== s.sign)
          const tDig = t ? getDignity(name, t.sign) : null
          const sDig = s ? getDignity(name, s.sign) : null

          return (
            <div key={name} className={`${styles.row} ${shifted ? styles.rowShifted : ''}`}>
              {/* Planet label */}
              <span className={styles.name}>
                <span className={styles.symbol} aria-hidden="true">{PLANET_SYMBOLS[name] ?? name[0]}</span>
                <span className={styles.planetName}>{name}</span>
              </span>

              {/* Tropical cell */}
              <div className={`${styles.cell} ${shifted ? styles.cellShifted : ''}`}>
                {t ? (
                  <>
                    <span className={styles.main}>
                      <span className={styles.sign}>{SIGN_ABBR[t.sign] ?? t.sign}</span>
                      <span className={styles.deg}>{fmtDeg(t.degree)}</span>
                      <span className={styles.house}>H{t.house}</span>
                      {t.retrograde && <span className={styles.retro}>℞</span>}
                    </span>
                    {tDig && (
                      <span className={`${styles.dignity} ${styles[tDig]}`}>
                        {tDig}
                      </span>
                    )}
                  </>
                ) : <span className={styles.absent}>—</span>}
              </div>

              {/* Shift indicator */}
              <span
                className={styles.diffCol}
                title={shifted ? 'Sign shifts between systems' : undefined}
              >
                {shifted ? '≠' : ''}
              </span>

              {/* Sidereal cell */}
              <div className={`${styles.cell} ${shifted ? styles.cellShifted : ''}`}>
                {s ? (
                  <>
                    <span className={styles.main}>
                      <span className={styles.sign}>{SIGN_ABBR[s.sign] ?? s.sign}</span>
                      <span className={styles.deg}>{fmtDeg(s.degree)}</span>
                      <span className={styles.house}>H{s.house}</span>
                      {s.retrograde && <span className={styles.retro}>℞</span>}
                    </span>
                    {sDig && (
                      <span className={`${styles.dignity} ${styles[sDig]}`}>
                        {sDig}
                      </span>
                    )}
                    {s.nakshatra && (
                      <span className={styles.nakshatra}>
                        {s.nakshatra}
                        {s.nakshatraPada != null && (
                          <span className={styles.pada}> · pada {s.nakshatraPada}</span>
                        )}
                      </span>
                    )}
                  </>
                ) : <span className={styles.absent}>—</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <span
          className={`${styles.plutoSource} ${data.plutoSource === 'local-meeus' ? styles.plutoFallback : ''}`}
        >
          {plutoLabel}
        </span>
        <div className={styles.legend}>
          <span className={`${styles.legendItem} ${styles.domicile}`}>domicile</span>
          <span className={styles.dot}>·</span>
          <span className={`${styles.legendItem} ${styles.exaltation}`}>exaltation</span>
          <span className={styles.dot}>·</span>
          <span className={`${styles.legendItem} ${styles.detriment}`}>detriment</span>
          <span className={styles.dot}>·</span>
          <span className={`${styles.legendItem} ${styles.fall}`}>fall</span>
          <span className={styles.dot}>·</span>
          <span className={styles.legendItem} style={{ color: 'var(--violet-light)' }}>℞ retrograde</span>
          <span className={styles.dot}>·</span>
          <span className={styles.legendItem} style={{ color: 'var(--cyan)' }}>≠ sign shift</span>
        </div>
      </div>
    </section>
  )
}
