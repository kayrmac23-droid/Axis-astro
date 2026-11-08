import type { Metadata } from 'next'
import Link from 'next/link'
import styles from '../guides/guides.module.css'

export const metadata: Metadata = {
  title: 'Privacy — AXIS',
  description: 'What AXIS does with your birth details: what is sent where, what is kept, and for how long.',
}

// ⚠ This page describes what the code does. When a data flow changes — a new
// third party, a new thing cached, a TTL moved — change this page in the same
// PR. Sources of truth: reading-cache.ts (TTL_SECONDS, PROVISIONAL_TTL_SECONDS),
// reading-thread.ts (THREAD_TTL_SECONDS), api/geocode (GEO_CACHE_TTL_SECONDS),
// route-rate-limiter.ts (QUOTA_TTL_SECS), analytics.ts, layout.tsx.

const RAIL = [
  { n: '01', label: 'WHAT YOU GIVE US' },
  { n: '02', label: 'WHERE IT GOES' },
  { n: '03', label: 'WHAT IS KEPT' },
  { n: '04', label: 'ANALYTICS' },
]

export default function PrivacyPage() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.kicker}>{'// PRIVACY'}</div>
        <h1 className={styles.h1}>What happens to your birth details</h1>
        <p className={styles.lede}>
          A chart needs a date, a time and a place. Here is exactly where those go, what is
          kept, and for how long. There are no accounts, and nothing is sold.
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
            NO ACCOUNTS.<br />NOTHING SOLD.<br />EVERYTHING EXPIRES.
          </div>
        </aside>

        <div className={styles.prose}>
          <div className={styles.entry}>
            <div className={styles.microLabel}>01 · WHAT YOU GIVE US</div>
            <h2 className={styles.entryH}>Date, time and place of birth</h2>
            <p className={styles.para}>
              You enter a birth date, a birth time (or mark it unknown) and a place. For synastry,
              you enter the same for a second person, so only do that with their agreement. AXIS
              does not ask for a name, an email address or any account details.
            </p>
          </div>

          <div className={styles.entry}>
            <div className={styles.microLabel}>02 · WHERE IT GOES</div>
            <h2 className={styles.entryH}>Outside services, each given only what it needs</h2>
            <p className={styles.para}>
              <strong>Place search.</strong> The text you type into the place field is sent, from
              our server, to OpenStreetMap&rsquo;s Nominatim service to find coordinates. Your
              own IP address is not passed on.
            </p>
            <p className={styles.para}>
              <strong>Pluto&rsquo;s position.</strong> Only for a birth before 1885 or after 2099:
              the moment of birth (as a UTC date and time, with no place) is sent, from our
              server, to NASA JPL&rsquo;s Horizons service to look up Pluto. For every other birth,
              Pluto is calculated on our server.
            </p>
            <p className={styles.para}>
              <strong>The reading.</strong> The chart is calculated on our server. The AI service
              that writes the reading (Anthropic) receives the calculated planetary positions,
              signs, houses and aspects, not your birth date, time or place.
            </p>
          </div>

          <div className={`${styles.entry} ${styles.entryRule}`}>
            <div className={styles.microLabel}>03 · WHAT IS KEPT</div>
            <h2 className={styles.entryH}>Everything expires on its own</h2>
            <p className={styles.para}>
              <strong>Readings</strong> are cached for up to 30 days so that opening the same chart
              again does not regenerate it. A reading that could not be fully checked is kept for
              24 hours instead. The cache is looked up by a fingerprint computed from the birth
              details, not by the details themselves, though anyone holding the same details could
              compute the same fingerprint.
            </p>
            <p className={styles.para}>
              <strong>The reading in progress</strong> (each section, so later sections can build on
              earlier ones) is kept for 24 hours.
            </p>
            <p className={styles.para}>
              <strong>Place searches</strong> are cached for 30 days, looked up by a fingerprint of the
              search text, so repeat searches do not hit OpenStreetMap again.
            </p>
            <p className={styles.para}>
              <strong>Your IP address</strong> is used to apply rate limits and daily reading limits,
              and is kept for at most 48 hours for that purpose.
            </p>
            <p className={styles.para}>
              Your birth details themselves stay in your browser for the length of your visit and
              are not saved to a database.
            </p>
          </div>

          <div className={styles.entry}>
            <div className={styles.microLabel}>04 · ANALYTICS</div>
            <h2 className={styles.entryH}>Counting visits, not reading charts</h2>
            <p className={styles.para}>
              AXIS uses Vercel Web Analytics and Speed Insights to count page views and measure load
              times, and PostHog to count a small set of named events, such as a chart being
              calculated or a reading section finishing. PostHog stores a random identifier in your
              browser. Neither is sent your birth details, neither records your screen, and AXIS
              does not track clicks automatically. If your browser sends Do Not Track, PostHog is
              not used.
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
