'use client'
/* ============================================================
   DossierHeader — the head of the chart dossier: the kicker,
   the chart title, the cast line, and the provenance strip that
   states where every number came from. Below it, the birth-time
   warning when noon was assumed.

   Design: AXIS_Standalone, dossier view.
   ============================================================ */
import styles from './DossierHeader.module.css'

interface DossierHeaderProps {
  /** e.g. "Chart of 14 March 1991" */
  title: string
  /** PLACE · D MON YYYY · TIME · TZ */
  castLine: string
  /** Lahiri offset, already formatted (e.g. "24°13′"). */
  ayanamsa: string
  /** Birth year — the epoch the ayanamsa was evaluated at. */
  year: number | string
  birthTimeUnknown?: boolean
  /** Which ephemeris supplied Pluto, from DualChartData.plutoSource. */
  plutoSource?: string
}

// Mirrors MEEUS_PLUTO_VALID_YEARS in lib/astro-calc.ts (not imported: that
// module pulls the ephemeris data into the client bundle).
const MEEUS_FROM = 1885
const MEEUS_TO   = 2099

export default function DossierHeader({
  title, castLine, ayanamsa, year, birthTimeUnknown = false, plutoSource,
}: DossierHeaderProps) {
  const local = plutoSource === 'local-meeus'
  const y = Number(year)
  // The local series is only a FALLBACK — and only worth a warning — outside
  // the span where it is valid. Inside it, it is the primary source and agrees
  // with JPL DE440 to ~2″, so labelling it a fallback overstated a difference
  // no reading could ever show.
  const plutoFallback = local && Number.isFinite(y) && (y < MEEUS_FROM || y > MEEUS_TO)
  // 'jpl-horizons-de441' for dates outside DE440's 1550–2650 span — say which.
  const plutoEphem = plutoSource?.match(/de\d+$/i)?.[0].toUpperCase() ?? 'DE440'
  return (
    <>
      <div className={styles.head}>
        <div>
          <div className={styles.kicker}>{'// DOSSIER'}</div>
          <h2 className={styles.title}>{title}</h2>
          <div className={styles.castLine}>{castLine}</div>
        </div>
        <div className={styles.provenance}>
          <div className={styles.cell}>
            <div className={styles.cellHead}>PLUTO</div>
            <div className={plutoFallback ? styles.cellWarn : undefined}>
              {plutoFallback ? <>LOCAL MEEUS<br />APPROXIMATE</>
                : local ? <>MEEUS CH.37<br />≈ DE440</>
                : <>JPL HORIZONS<br />{plutoEphem}</>}
            </div>
          </div>
          <div className={styles.cell}>
            <div className={styles.cellHead}>PLANETS · MOON</div>
            <div>VSOP87<br />ELP2000</div>
          </div>
          <div className={styles.cell}>
            <div className={styles.cellHead}>NODES · HOUSES</div>
            <div>TRUE NODE<br />WHOLE SIGN</div>
          </div>
          <div className={styles.cell}>
            <div className={styles.cellHead}>AYANAMSA</div>
            <div className={styles.cellCopper}>LAHIRI<br />{ayanamsa} · {year}</div>
          </div>
        </div>
      </div>

      {birthTimeUnknown && (
        <div className={styles.warning}>
          <span className={styles.warnIcon} aria-hidden="true">⚠</span>
          <span className={styles.warnText}>
            BIRTH TIME UNKNOWN — NOON ASSUMED. ASCENDANT, HOUSES, MC AND MOON DEGREE ARE
            UNRELIABLE IN BOTH FRAMES. SIGN POSITIONS ARE RELIABLE.
          </span>
        </div>
      )}
    </>
  )
}
