import type { Metadata } from 'next'
import Link from 'next/link'
import styles from './guides.module.css'

// Guides used to restate the Method (Tropical, Sidereal, The Divergence, reading
// order). It now does the job the Method does not: how to read the instruments
// on the dossier page. What each frame MEANS lives on /method only.
export const metadata: Metadata = {
  title: 'Guides — Reading the AXIS Dossier',
  description: 'How to read the AXIS dossier: the frame-shift wheel, the readout table, the placement card beside each section, and the order of the three parts.',
}

const RAIL = [
  { n: '01', id: 'wheel', label: 'THE WHEEL' },
  { n: '02', id: 'readout', label: 'THE READOUT TABLE' },
  { n: '03', id: 'card', label: 'THE PLACEMENT CARD' },
  { n: '04', id: 'parts', label: 'THE THREE PARTS' },
]

export default function GuidesPage() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.kicker}>{'// GUIDES'}</div>
        <h1 className={styles.h1}>How to read an AXIS dossier</h1>
        <p className={styles.lede}>
          The Method explains what the two zodiacs are. This page explains the instruments:
          the wheel, the readout table, the card beside each section, and the order the
          three parts are written in.
        </p>
      </section>

      <section className={styles.body}>
        <div className={styles.prose}>
          <div id="wheel" className={styles.entry}>
            <div className={styles.microLabel}>01 · THE INSTRUMENT</div>
            <h2 className={styles.entryH}>The wheel: one sky, a band that turns</h2>
            <p className={styles.para}>
              The wheel draws the planets once, where they stood at the moment of birth. They
              do not move when you change frame. What moves is the band of twelve signs behind
              them: choosing Sidereal turns it by the offset between the two zodiacs, a little
              over twenty-four degrees for a birth in this era. A body early in a sign slides
              back into the one before it. A body late in a sign stays where it was.
            </p>
            <p className={styles.para}>
              Select any body and the wheel dims everything except that body and its aspect
              lines. The lines never change with the frame, because the angles between planets
              are the same in both.
            </p>
          </div>

          <div id="readout" className={styles.entry}>
            <div className={styles.microLabel}>02 · THE TABLE</div>
            <h2 className={styles.entryH}>The readout: both frames, always</h2>
            <p className={styles.para}>
              Beside the wheel is a table that lists every body twice: its Tropical position
              and its Sidereal position, each with its house. It shows both whichever frame the
              wheel is in. The Sidereal column also carries the nakshatra and its pada, and
              ℞ marks a retrograde body.
            </p>
            <p className={styles.para}>
              The last column carries the comparison. An arrow between two sign glyphs means the
              body changes sign between frames. HOLDS, in copper, means it does not, and the
              figure after it is the margin: how far past the boundary it sits. Most bodies
              shift, so a hold is the rare case, and a narrow margin is a body close to the edge.
            </p>
          </div>

          <div id="card" className={styles.entry}>
            <div className={styles.microLabel}>03 · BESIDE THE PROSE</div>
            <h2 className={styles.entryH}>The placement card: the data a section is about</h2>
            <p className={styles.para}>
              Each section of the reading has a small card pinned beside it. It repeats that
              body&apos;s two positions from the table, with houses, any dignity, the nakshatra
              and the same sign verdict, so the figures a paragraph refers to stay in view while
              it scrolls. A section about two bodies, such as Jupiter and Saturn, carries two
              cards. Aspects and The Divergence carry none; they are about the relationship
              between placements, not a placement.
            </p>
            <p className={styles.para}>
              The index to the right lists the sections of the part you are in. A section that
              has been written is a link to it; one still being written is marked in cyan.
            </p>
          </div>

          <div id="parts" className={`${styles.entry} ${styles.entryRule}`}>
            <div className={styles.microLabel}>04 · THE ORDER</div>
            <h2 className={styles.entryH}>Three parts, written in sequence</h2>
            <p className={styles.para}>
              The dossier is one document in three parts. Part 1 is the Tropical reading. Part 2
              is the Sidereal reading, written after Part 1 and collapsed until you open it; its
              heading states how long it runs, so skipping it is a choice you can see yourself
              making. Part 3 is The Divergence. It opens with a table of every body that changes
              sign and is written on the assumption that both earlier parts have been read.
            </p>
            <p className={styles.para}>
              Violet in that table marks unresolved tension. It is not an error to fix. For what
              each frame means, read <Link href="/method">the Method</Link>.
            </p>
          </div>

          <div className={styles.ctas}>
            <Link href="/#get-reading" className={`${styles.btn} ${styles.btnSolid}`}>CAST YOUR DUAL CHART</Link>
            <Link href="/method" className={`${styles.btn} ${styles.btnOutline}`}>THE METHOD</Link>
          </div>
        </div>

        {/* Prose left, narrow index right — the same frame as the reading. */}
        <aside className={styles.rail} aria-label="On this page">
          <div className={styles.railHead}>ON THIS PAGE</div>
          {RAIL.map(item => (
            <a key={item.n} href={`#${item.id}`} className={styles.railItem}>
              <span>{item.label}</span><span className={styles.railNum}>{item.n}</span>
            </a>
          ))}
        </aside>
      </section>
    </main>
  )
}
