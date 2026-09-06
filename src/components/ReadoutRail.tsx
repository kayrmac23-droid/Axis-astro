'use client'
/* ============================================================
   ReadoutRail — the dossier's READOUT panel: every body in BOTH
   frames in every toggle state (DOCTRINE.md: CO-VISIBILITY),
   the selected body's detail block, and the flip count.

   Selection is controlled by the page so the wheel and the table
   stay one selection, not two.

   Design: AXIS_Standalone, dossier view.
   ============================================================ */
import { useMemo } from 'react'
import {
  ZODIAC_GLYPHS as SG, SIGN_NAMES, lonStr, dms, norm, countBodies,
  type ReadoutRow,
} from '@/lib/readout'
import styles from './ReadoutRail.module.css'

interface ReadoutRailProps {
  rows: ReadoutRow[]
  frame: 'tropical' | 'sidereal'
  ayanamsa: number
  selected: string | null
  onSelect: (id: string | null) => void
}

export default function ReadoutRail({ rows, frame, ayanamsa, selected, onSelect }: ReadoutRailProps) {
  const sel = selected ? rows.find(r => r.id === selected) ?? null : null
  const flipCount = useMemo(() => rows.filter(r => r.flip && !r.isAngle).length, [rows])
  const bodyCount = useMemo(() => countBodies(rows), [rows])

  const pos = (lon: number, house: number | null) =>
    lonStr(lon) + (house != null ? ` · H${house}` : '')

  const verdict = sel
    ? sel.flip
      ? `SHIFTS · ${SIGN_NAMES[sel.tSign].toUpperCase()} → ${SIGN_NAMES[sel.sSign].toUpperCase()}`
      : `HOLDS ${SIGN_NAMES[sel.tSign].toUpperCase()} · MARGIN ${dms(Math.abs((norm(sel.tLon) % 30) - ayanamsa))}`
    : 'SELECT A BODY ON THE WHEEL OR IN THE TABLE'

  const dignities = sel
    ? [sel.tDignity && `T · ${sel.tDignity.toUpperCase()}`, sel.sDignity && `S · ${sel.sDignity.toUpperCase()}`]
      .filter(Boolean).join('  ')
    : ''

  return (
    <div className={styles.rail}>
      <div className={styles.head}>
        <span className={styles.headTitle}>READOUT</span>
        <span className={styles.headNote}>BOTH FRAMES · ALWAYS</span>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.table} data-frame={frame}>
          <thead>
            <tr>
              <th>BODY</th>
              <th className={styles.thT}>TROPICAL</th>
              <th className={styles.thS}>SIDEREAL</th>
              <th className={styles.thD}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={r.id}
                className={`${styles.row} ${selected === r.id ? styles.rowSel : ''}`}
                onClick={() => onSelect(selected === r.id ? null : r.id)}
              >
                <td className={styles.body}>
                  {r.glyph && <span className={styles.glyph}>{r.glyph} </span>}{r.name}
                  {r.retro && <span className={styles.retro}>℞</span>}
                </td>
                <td className={styles.ct}>
                  {lonStr(r.tLon)}
                  {r.tHouse != null && <span className={styles.house}> H{r.tHouse}</span>}
                  {r.tDignity && <span className={styles.dignity}>{r.tDignity}</span>}
                </td>
                <td className={styles.cs}>
                  {lonStr(r.sLon)}
                  {r.sHouse != null && <span className={styles.house}> H{r.sHouse}</span>}
                  {r.sDignity && <span className={styles.dignity}>{r.sDignity}</span>}
                  {r.nakshatra && (
                    <span className={styles.nak}>
                      {r.nakshatra}{r.nakPada != null ? ` · pada ${r.nakPada}` : ''}
                    </span>
                  )}
                </td>
                <td className={`${styles.delta} ${r.flip ? styles.flip : styles.hold}`}>
                  {r.flip ? `${SG[r.tSign]} → ${SG[r.sSign]}` : 'HOLDS'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.detail}>
        <div>
          <div className={styles.selName}>
            ● {sel ? `${sel.glyph ? sel.glyph + ' ' : ''}${sel.name}` : 'NONE SELECTED'}
          </div>
          <div className={styles.selPos}>
            TROPICAL&nbsp; {sel ? pos(sel.tLon, sel.tHouse) : '—'}<br />
            SIDEREAL&nbsp; {sel ? pos(sel.sLon, sel.sHouse) : '—'}
          </div>
          <div className={sel ? (sel.flip ? styles.verdictFlip : styles.verdictHold) : styles.verdictNone}>
            {verdict}
          </div>
        </div>
        <div className={styles.selMeta}>
          {sel?.nakshatra
            ? `${sel.nakshatra.toUpperCase()}${sel.nakPada != null ? ` · PADA ${sel.nakPada}` : ''}`
            : ''}
          <br />{dignities}
        </div>
      </div>

      <div className={styles.foot}>
        SELECT A BODY TO ISOLATE ITS ASPECTS · {flipCount} OF {bodyCount} BODIES CHANGE SIGN BETWEEN FRAMES
      </div>
    </div>
  )
}
