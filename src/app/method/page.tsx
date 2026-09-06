import type { Metadata } from 'next'
import Link from 'next/link'
import styles from './method.module.css'

export const metadata: Metadata = {
  title: 'The Method — AXIS',
  description: 'How AXIS compares two charts — Tropical and Sidereal — and reads the tension between them.',
}

const STEPS = [
  { n: '01', label: 'GEOCODE', desc: 'Place resolved to coordinates via Nominatim. Nothing stored.' },
  { n: '02', label: 'TIMEZONE', desc: 'IANA zone from the coordinates, DST-aware for the birth date. Local time becomes one UT instant.' },
  { n: '03', label: 'EPHEMERIS', desc: 'VSOP87 planets, ELP2000 Moon, True Node. Pluto from JPL Horizons DE440.' },
  { n: '04', label: 'TWO FRAMES', desc: 'Tropical as computed. Sidereal by subtracting the Lahiri ayanamsa — one sky, the band rotated. Whole Sign houses in both.' },
  { n: '05', label: 'THREE READINGS', desc: 'Tropical, Sidereal, then The Divergence — which assumes you have read both.' },
]

export default function MethodPage() {
  return (
    <main className={styles.main}>
      {/* Hero */}
      <section className={styles.hero}>
        <div>
          <div className={styles.kicker}>{'// THE METHOD'}</div>
          <h1 className={styles.h1}>Two maps. One pressure point.</h1>
        </div>
        <p className={styles.heroBody}>
          Most astrology tools flatten you into one system. AXIS does not. It computes one birth
          against two zodiacs, reads each on its own terms, then reads the distance between them.
          Nothing is averaged.
        </p>
      </section>

      {/* Two maps + divergence */}
      <section className={styles.mapsSection}>
        <div className={styles.twoMaps}>
          <div className={styles.mapCol}>
            <div className={styles.mapHead}>
              <span className={styles.mapTitle}>TROPICAL</span>
              <span className={styles.readTag}>01 · READ FIRST</span>
            </div>
            <div className={styles.mapAnchor}>ANCHOR · EQUINOX · THE SELF YOU RECOGNISE</div>
            <p className={styles.mapBody}>Personality, patterning, immediate identity. The symbolic architecture of the self you already live inside: ego structure, relational habits, cognitive style, the shape of the defences.</p>
          </div>
          <div className={styles.neq}>≠</div>
          <div className={`${styles.mapCol} ${styles.mapColRight}`}>
            <div className={styles.mapHead}>
              <span className={styles.mapTitle}>SIDEREAL</span>
              <span className={styles.readTag}>02 · READ SECOND</span>
            </div>
            <div className={styles.mapAnchor}>ANCHOR · FIXED STARS · THE SELF YOU WERE HANDED</div>
            <p className={styles.mapBody}>A recalibrated sky, older terrain. The body, circumstances and inherited tendencies a person arrived with — a second lens that often moves the centre of gravity by a whole sign.</p>
          </div>
        </div>

        <div className={styles.ritualRule} />

        <div className={styles.divGrid}>
          <div>
            <div className={styles.divHead}>
              <span className={styles.divTitle}>THE DIVERGENCE</span>
              <span className={styles.readTag}>03 · READ LAST</span>
            </div>
            <div className={styles.divSub}>FRAME-INDEPENDENT · THE READING THAT DOESN&apos;T CLOSE</div>
            <h2 className={styles.h2}>Not a third column. What happens between the two.</h2>
          </div>
          <dl className={styles.defList}>
            <div className={styles.defRow}>
              <dt className={styles.defTermCopper}>CONCORDANCE</dt>
              <dd className={styles.defDesc}>Where both charts point at the same theme. The least negotiable part of the person — load-bearing.</dd>
            </div>
            <div className={styles.defRow}>
              <dt className={styles.defTermViolet}><span className={styles.dot} />WHERE THEY PART</dt>
              <dd className={styles.defDesc}>Every body that changes sign or house between frames, named exactly. Violet marks unresolved tension. It is not an error to fix.</dd>
            </div>
            <div className={styles.defRow}>
              <dt className={styles.defTermViolet}>CENTRAL TENSION</dt>
              <dd className={styles.defDesc}>The single operation the two charts disagree about most — stated as an event, not a trait.</dd>
            </div>
            <div className={`${styles.defRow} ${styles.defRowLast}`}>
              <dt className={styles.defTermMuted}>LIVING THE DIVERGENCE</dt>
              <dd className={styles.defDesc}>How the person walks the distance. Never how it disappears.</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Calculation standard band */}
      <div className={styles.calcBand}>
        <div className={styles.calcInner}>
          <div className={styles.calcHeadRow}>
            <span>{'// CALCULATION STANDARD'}</span>
            <span>ONE INSTANT · TWO FRAMES · THREE READINGS</span>
          </div>
          <div className={styles.steps}>
            {STEPS.map(s => (
              <div key={s.n} className={styles.step}>
                <div className={styles.stepN}>{s.n}</div>
                <div className={styles.stepLabel}>{s.label}</div>
                <div className={styles.stepDesc}>{s.desc}</div>
              </div>
            ))}
          </div>
          <div className={styles.chips}>
            <span className={styles.chipCopper}>DUAL-MAP COMPARISON</span>
            <span className={styles.chip}>WHOLE SIGN HOUSES</span>
            <span className={styles.chip}>LAHIRI AYANAMSA · 24°13′</span>
            <span className={styles.chip}>VSOP87 / ELP2000</span>
            <span className={styles.chip}>JPL HORIZONS PLUTO</span>
            <span className={styles.chip}>TRUE NODE</span>
          </div>
        </div>
      </div>

      {/* Refusals closer */}
      <section className={styles.closer}>
        <div>
          <div className={styles.kicker}>{'// WHAT AXIS REFUSES'}</div>
          <h2 className={styles.h2Closer}>No horoscopes. No predictions. No affirmations.</h2>
        </div>
        <div className={styles.closerRight}>
          <p className={styles.closerBody}>A reading names the operation, states its cost, and leaves the distance standing. It does not tell you what will happen, and it does not tell you that you are fine.</p>
          <div className={styles.ctas}>
            <Link href="/#get-reading" className={`${styles.btn} ${styles.btnSolid}`}>CAST YOUR DUAL CHART</Link>
            <Link href="/sample" className={`${styles.btn} ${styles.btnOutline}`}>SAMPLE DOSSIER</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
