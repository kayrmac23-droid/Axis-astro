import type { Metadata } from 'next'
import styles from './guides.module.css'

export const metadata: Metadata = {
  title: 'Guides — How to Read AXIS',
  description: 'How to read a dual-system chart: what Tropical shows, what Sidereal shows, and why the divergence between them is the point.',
}

export default function GuidesPage() {
  return (
    <main>
      <article className={styles.wrap}>
        <p className={styles.eyebrow}>Guides</p>
        <h1 className={styles.title}>How to read your AXIS chart</h1>
        <p className={styles.lede}>
          AXIS gives you two charts for one birth, plus a third reading that holds them
          together. They are not two answers to the same question — they are two
          different questions. Read them in order, and read the divergence last.
        </p>

        <section className={styles.section}>
          <p className={styles.kicker}>The first layer</p>
          <h2 className={styles.sectionTitle}>Tropical — the self you know</h2>
          <p className={styles.body}>
            The Tropical chart maps the psychological architecture of conscious identity:
            how you organise your sense of self, the patterns you construct in response to
            the world, and the drives closest to your waking awareness. When a placement
            here feels immediately recognisable, that recognition is the point — this is the
            self you already live inside.
          </p>
        </section>

        <section className={styles.section}>
          <p className={styles.kicker}>The deeper layer</p>
          <h2 className={styles.sectionTitle}>Sidereal — the self beneath</h2>
          <p className={styles.body}>
            The Sidereal chart is calculated against the actual observed positions of the
            constellations, and it often shifts planets into different signs. It describes
            the terrain you arrived with rather than the identity you built: inherited
            tendencies, instinctive orientations, the patterning underneath the constructed
            self. Where the Tropical chart shows what you made, the Sidereal shows what you
            were handed.
          </p>
        </section>

        <section className={styles.section}>
          <p className={styles.kicker}>The reason AXIS exists</p>
          <h2 className={styles.sectionTitle}>The Divergence — the reading that doesn&apos;t close</h2>
          <p className={styles.body}>
            Most tools would try to average the two systems into one tidy answer. AXIS does
            the opposite. The Divergence reading finds where both charts agree — the part of
            you that is least negotiable — and then names exactly where they pull apart. That
            divergence is not an error to be resolved; it is the most informative thing in the
            chart. The closing movement describes how you live inside that divergence, not how it
            disappears.
          </p>
        </section>

        <section className={styles.section}>
          <p className={styles.kicker}>How to use it</p>
          <h2 className={styles.sectionTitle}>Reading in order</h2>
          <p className={styles.body}>
            Start with Tropical to meet the familiar self. Move to Sidereal to feel the layer
            underneath — note especially any planet that changed signs between the two. Then
            read The Divergence, which assumes you have already read both. The point is never
            to decide which chart is &ldquo;true.&rdquo; Both are. The truth you are looking
            for lives in the tension between them.
          </p>
        </section>
      </article>
    </main>
  )
}
