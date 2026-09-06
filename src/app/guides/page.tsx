import type { Metadata } from 'next'
import Link from 'next/link'
import styles from './guides.module.css'

export const metadata: Metadata = {
  title: 'Guides — How to Read AXIS',
  description: 'How to read a dual-system chart: what Tropical shows, what Sidereal shows, and why the divergence between them is the point.',
}

const RAIL = [
  { n: '01', label: 'TROPICAL · THE SELF YOU KNOW' },
  { n: '02', label: 'SIDEREAL · THE SELF YOU WERE HANDED' },
  { n: '03', label: 'THE DIVERGENCE' },
  { n: '04', label: 'READING IN ORDER' },
]

export default function GuidesPage() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.kicker}>{'// GUIDES'}</div>
        <h1 className={styles.h1}>How to read your AXIS chart</h1>
        <p className={styles.lede}>
          AXIS gives you two charts for one birth, plus a third reading that holds them
          together. They are not two answers to the same question — they are two different
          questions. Read them in order, and read the divergence last.
        </p>
      </section>

      <section className={styles.body}>
        <aside className={styles.rail}>
          {RAIL.map(item => (
            <span key={item.n} className={styles.railItem}>
              <span className={styles.railNum}>{item.n}</span>{item.label}
            </span>
          ))}
          <div className={styles.railNote}>
            NEITHER CHART IS &ldquo;TRUE&rdquo;.<br />BOTH ARE. THE READING LIVES<br />IN THE DISTANCE BETWEEN THEM.
          </div>
        </aside>

        <div className={styles.prose}>
          <div className={styles.entry}>
            <div className={styles.microLabel}>01 · THE FIRST LAYER</div>
            <h2 className={styles.entryH}>Tropical — the self you know</h2>
            <p className={styles.para}>
              The Tropical chart maps the psychological architecture of conscious identity:
              how you organise your sense of self, the patterns you construct in response to
              the world, and the drives closest to your waking awareness. When a placement here
              feels immediately recognisable, that recognition is the point — this is the self
              you already live inside.
            </p>
          </div>

          <div className={styles.entry}>
            <div className={styles.microLabel}>02 · THE SECOND LAYER</div>
            <h2 className={styles.entryH}>Sidereal — the self you were handed</h2>
            <p className={styles.para}>
              The Sidereal chart is calculated against the observed positions of the
              constellations, and it often shifts planets into different signs. It describes
              the terrain you arrived with rather than the identity you built: inherited
              tendencies, instinctive orientations, the patterning you did not construct.
              Where the Tropical chart shows what you made, the Sidereal shows what you
              were handed.
            </p>
          </div>

          <div className={`${styles.entry} ${styles.entryRule}`}>
            <div className={styles.microLabel}>03 · THE REASON AXIS EXISTS</div>
            <h2 className={styles.entryH}>The Divergence — the reading that doesn&apos;t close</h2>
            <p className={styles.para}>
              Most tools would try to average the two systems into one tidy answer. AXIS does
              the opposite. The Divergence reading finds where both charts agree — the part of
              you that is least negotiable — and then names exactly where they pull apart. That
              divergence is not an error to be resolved; it is the most informative thing in the
              chart. The closing movement describes how you live inside that divergence, not how
              it disappears.
            </p>
          </div>

          <div className={styles.entry}>
            <div className={styles.microLabel}>04 · HOW TO USE IT</div>
            <h2 className={styles.entryH}>Reading in order</h2>
            <p className={styles.para}>
              Start with Tropical to meet the familiar self. Move to Sidereal to feel the inherited
              layer — note especially any planet that changed signs between the two. Then
              read The Divergence, which assumes you have already read both. The point is never
              to decide which chart is &ldquo;true.&rdquo; Both are. The truth you are looking
              for lives in the tension between them.
            </p>
          </div>

          <div className={styles.ctas}>
            <Link href="/#get-reading" className={`${styles.btn} ${styles.btnSolid}`}>CAST YOUR DUAL CHART</Link>
            <Link href="/method" className={`${styles.btn} ${styles.btnOutline}`}>THE METHOD</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
