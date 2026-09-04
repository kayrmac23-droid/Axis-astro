import type { Metadata } from 'next'
import Link from 'next/link'
import styles from './sample.module.css'

export const metadata: Metadata = {
  title: 'Sample Reading — AXIS',
  description: 'An excerpt of what AXIS surfaces: not traits, but the tension between two charts.',
}

const V = '︎'
const FLIPS = [
  { glyph: '☉' + V, name: 'SUN', trop: 'Leo · H10', sid: 'Cancer · H9', signal: 'SIGN + HOUSE', holds: false },
  { glyph: '♀' + V, name: 'VENUS', trop: 'Virgo · H11', sid: 'Leo · H10', signal: 'SIGN + HOUSE', holds: false },
  { glyph: '♂' + V, name: 'MARS', trop: 'Aquarius · H4', sid: 'Capricorn · H3', signal: 'SIGN + HOUSE', holds: false },
  { glyph: '☽' + V, name: 'MOON', trop: 'Scorpio · H1', sid: 'Scorpio · H1', signal: 'HOLDS', holds: true },
  { glyph: '♄' + V, name: 'SATURN', trop: 'Pisces · H5', sid: 'Aquarius · H4', signal: 'SIGN + HOUSE', holds: false },
]

export default function SamplePage() {
  return (
    <main className={styles.main}>
      {/* Hero */}
      <section className={styles.hero}>
        <div>
          <div className={styles.kicker}>{'// SAMPLE DOSSIER · EXCERPT'}</div>
          <h1 className={styles.h1}>This is what AXIS looks for: not traits, but tension.</h1>
        </div>
        <div className={styles.heroMeta}>
          ANONYMISED CHART · 2 AUG 1994 · 09:20 PM · SYDNEY<br />
          <span className={styles.heroMetaDim}>EXCERPT ONLY. A FULL DOSSIER RUNS 9 SECTIONS PER FRAME AND THE DIVERGENCE.</span>
        </div>
      </section>

      {/* Axis tension */}
      <section className={styles.tensionSection}>
        <div>
          <div className={styles.ritualRule} />
          <div className={styles.axisTension}>AXIS TENSION</div>
          <h2 className={styles.h2}>The Tropical chart performs coherence. The Sidereal chart keeps interrupting it with a hunger for rupture, depth and private truth.</h2>
          <dl className={styles.defList}>
            <div className={styles.defRow}>
              <dt className={styles.defTermWhite}>CONCORDANCE</dt>
              <dd className={styles.defDesc}>Both maps intensify fixed emotional patterning. The Moon holds Scorpio in either frame.</dd>
            </div>
            <div className={`${styles.defRow} ${styles.defRowRules}`}>
              <dt className={styles.defTermViolet}><span className={styles.dot} />DIVERGENCE</dt>
              <dd className={styles.defDesc}>Public identity and private instinct operate at different temperatures. The Sun leaves Leo for Cancer and drops from the tenth house to the ninth.</dd>
            </div>
          </dl>
        </div>

        <div className={styles.flipTable}>
          <div className={styles.flipHead}>
            <span>WHERE THEY PART</span><span>TROPICAL</span><span>SIDEREAL</span><span className={styles.right}>SIGNAL</span>
          </div>
          {FLIPS.map(f => (
            <div key={f.name} className={styles.flipRow}>
              <span><span className={styles.flipGlyph}>{f.glyph}</span>{f.name}</span>
              <span>{f.trop}</span>
              <span>{f.sid}</span>
              {f.holds ? (
                <span className={`${styles.right} ${styles.holds}`}>HOLDS</span>
              ) : (
                <span className={`${styles.right} ${styles.signal}`}><span className={styles.dot} />{f.signal}</span>
              )}
            </div>
          ))}
          <div className={styles.flipFoot}>4 OF 12 BODIES CHANGE SIGN BETWEEN FRAMES · VIOLET MARKS UNRESOLVED TENSION</div>
        </div>
      </section>

      {/* Divergence excerpt band */}
      <div className={styles.divBand}>
        <div className={styles.divInner}>
          <div className={styles.divHeadRow}>
            <span>{'// THE DIVERGENCE · EXCERPT'}</span>
            <span>CENTRAL TENSION · SECTION 3 OF 4</span>
          </div>
          <div className={styles.divBody}>
            <aside className={styles.rail}>
              <div className={styles.railWhite}>CONCORDANCE</div>
              <div className={styles.railViolet}>WHERE THEY PART</div>
              <div className={styles.railViolet}>CENTRAL TENSION</div>
              <div>LIVING THE DIVERGENCE</div>
            </aside>
            <div className={styles.prose}>
              <div className={styles.proseKicker}>CENTRAL TENSION</div>
              <p className={styles.para}>The Tropical Sun in Leo in the tenth house builds a public self that is legible from across a room: warm, composed, visibly in charge of its own story. The Sidereal Sun in Cancer in the ninth is doing something else. It is protecting a belief system, and it protects it by withdrawing rather than performing. Both are true at once. This person is most visible exactly when they are most defended.</p>
              <p className={styles.para}>The Scorpio Moon, which holds its sign in both frames, is the fixed point the two Suns argue over. It wants depth and it wants it privately. The Leo Sun offers it a stage; the Cancer Sun offers it a shell. The event this produces is specific: a confident public statement followed, within hours, by the private conviction that too much was said. AXIS does not resolve this into balance. The stage and the shell are the terrain.</p>
            </div>
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div className={styles.ctas}>
        <Link href="/#get-reading" className={`${styles.btn} ${styles.btnSolid}`}>BEGIN YOUR OWN READING</Link>
        <Link href="/method" className={`${styles.btn} ${styles.btnOutline}`}>READ THE METHOD</Link>
      </div>
    </main>
  )
}
