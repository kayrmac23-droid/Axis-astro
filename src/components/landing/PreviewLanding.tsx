'use client'
/* ============================================================
   PreviewLanding — the AXIS landing view, rebuilt to the
   color-scheme + structural redesign (design_handoff).

   Hero (orientation kicker / thesis H1 / lede with the live
   offset / dual CTAs / ephemeris facts strip) beside the live
   HeroWheel instrument and its epoch scrubber, then the "Two
   maps" section, then the real BirthForm wired into the cast
   flow. The global Starfield, SiteHeader and SiteFooter supply
   the chrome; this component owns only the landing body.
   ============================================================ */
import { useState } from 'react'
import Link from 'next/link'
import BirthForm from '@/components/BirthForm'
import HeroWheel, { heroDms } from '@/components/HeroWheel'
import styles from './PreviewLanding.module.css'

interface PreviewLandingProps {
  onSubmit: (formData: Record<string, string>) => void
  loading: boolean
  error: string | null
  onRetry: () => void
}

// Lahiri ayanamsa for a given epoch year (zero c. 285 CE), clamped ≥ 0.
function ayan(y: number) {
  const t = y - 285
  const a = 0.013860 * t + 2.87e-8 * t * t
  return a < 0 ? 0 : a
}

const EPOCH_MIN = 285
const EPOCH_MAX = 2100

export default function PreviewLanding({ onSubmit, loading, error, onRetry }: PreviewLandingProps) {
  const [epoch, setEpoch] = useState(2026)
  const offset = ayan(epoch)
  const offsetStr = heroDms(offset)
  const epochPct = ((epoch - EPOCH_MIN) / (EPOCH_MAX - EPOCH_MIN)) * 100

  return (
    <div className={styles.root}>
      {/* ======================= HERO ======================= */}
      <section id="axis-hero" className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.kicker}>{'// ORIENTATION'}</div>
          <h1 className={styles.heroTitle}>Tropical maps the self you construct. Sidereal maps the terrain it was born into.</h1>
          <p className={styles.heroLede}>
            One birth, computed against two zodiacs held <span className={styles.num}>{offsetStr}</span> apart. AXIS never averages them. The divergence is the reading.
          </p>
          <div className={styles.ctas}>
            <Link href="#get-reading" className={`${styles.btn} ${styles.btnSolid}`}>CAST YOUR DUAL CHART</Link>
            <Link href="/sample" className={`${styles.btn} ${styles.btnOutline}`}>SAMPLE DOSSIER</Link>
          </div>
          <div className={styles.facts}>
            <div className={styles.fact}>
              <div className={styles.factHead}>EPHEMERIS</div>
              <div className={styles.factVal}>VSOP87 · ELP2000<br />JPL DE440</div>
            </div>
            <div className={styles.fact}>
              <div className={styles.factHead}>AYANAMSA</div>
              <div className={styles.factVal}>LAHIRI<br /><span className={styles.factEmph}>24°13′ · 2026</span></div>
            </div>
            <div className={`${styles.fact} ${styles.factLast}`}>
              <div className={styles.factHead}>HOUSES · NODE</div>
              <div className={styles.factVal}>WHOLE SIGN<br />TRUE NODE</div>
            </div>
          </div>
        </div>

        <div className={styles.heroRight}>
          <div className={styles.wheelbox}>
            <HeroWheel offset={offset} />
          </div>
          <div className={styles.epoch}>
            <span className={styles.eLab}>285 CE</span>
            <div className={styles.track}>
              <div className={styles.trackBase} />
              <div className={styles.trackFill} style={{ width: `${epochPct}%` }} />
              <input
                type="range" min={EPOCH_MIN} max={EPOCH_MAX} step={1} value={epoch}
                onChange={e => setEpoch(parseInt(e.target.value, 10))}
                aria-label="Epoch year"
                className={styles.slider}
              />
              <div className={styles.knob} style={{ left: `calc(${epochPct}% - 6px)` }} />
            </div>
            <span className={styles.eLab}>2100 CE</span>
          </div>
          <div className={styles.epochRead}>
            <span>EPOCH <b>{epoch} CE</b></span>
            <span>OFFSET <b className={styles.epochOffset}>{offsetStr}</b></span>
            <span>ZERO <b>c. 285 CE</b></span>
          </div>
        </div>
      </section>

      {/* ======================= TWO MAPS ======================= */}
      <section className={styles.twoMapsSection}>
        <div className={styles.twoMapsGrid}>
          <div className={styles.twoMapsCopy}>
            <div className={styles.kicker}>{'// THE TWO MAPS'}</div>
            <h2 className={styles.secH}>Two layers of one life. Not inner versus outer.</h2>
            <p className={styles.secLede}>Where both systems point at the same theme the insight is load-bearing. Where they part, AXIS names the divergence exactly and lets it stand.</p>
          </div>
          <div className={styles.twoMaps}>
            <div className={styles.mapCol}>
              <div className={styles.mapTitle}>TROPICAL</div>
              <div className={styles.mapAnchor}>ANCHOR · EQUINOX</div>
              <p className={styles.mapBody}>The symbolic architecture of conscious identity: ego structure, relational patterns, cognitive style, the shape of the defences.</p>
            </div>
            <div className={styles.neq}>≠</div>
            <div className={`${styles.mapCol} ${styles.mapColRight}`}>
              <div className={styles.mapTitle}>SIDEREAL</div>
              <div className={styles.mapAnchor}>ANCHOR · FIXED STARS</div>
              <p className={styles.mapBody}>Incarnational patterning: the body, circumstances and inherited tendencies a person arrived with. Not fate — the specific terrain.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ======================= CALIBRATION (real cast flow) ======================= */}
      <section id="get-reading" className={styles.calibSection}>
        <div className={styles.calibGrid}>
          <div className={styles.calibIntro}>
            <div className={styles.kicker}>{'// CALIBRATION'}</div>
            <h2 className={styles.secH}>Three facts set the instrument.</h2>
            <p className={styles.secLede}>Timezone is resolved from the place; both zodiacs are computed from the same instant. Time accuracy governs the Ascendant, houses and Moon degree — the elements the reading leans on hardest.</p>
            <div className={styles.calibMeta}>NOMINATIM GEOCODE · IANA TZ · DST-AWARE<br />NOTHING STORED · NO ACCOUNT</div>
          </div>
          <div className={styles.calibForm}>
            <BirthForm onSubmit={onSubmit} loading={loading} submitLabel="Cast chart" />
            {error && (
              <div className={styles.calcError}>
                <p className={styles.calcErrorMsg}>{error}</p>
                <button className={styles.calcRetryBtn} onClick={onRetry} disabled={loading}>Try again</button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
