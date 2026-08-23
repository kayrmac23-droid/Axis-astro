// True when (year, month, day) is a real calendar date — rejects Feb 31, Apr 31,
// Feb 29 in non-leap years, etc. `month` is 1-based. Uses setFullYear so years
// 1–99 aren't remapped to 1900–1999 by the Date constructor's legacy two-digit-year
// rule (which would otherwise reject valid early-CE years the API permits).
export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const d = new Date(0)
  d.setFullYear(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
}

// Build the UTC instant (ms since epoch) for a local wall-clock birth moment,
// honouring the true year for all values 1–9999. Uses setUTCFullYear because the
// Date constructor and Date.UTC() apply a legacy rule that remaps years 0–99 to
// 1900–1999 — which would compute the wrong instant (and, downstream, fetch Pluto
// for the wrong year) for any early-CE birth the API's 1–9999 range permits.
export function birthToUtcMs(
  year: number, month: number, day: number,
  hour: number, minute: number, tzOffsetHours: number,
): number {
  const d = new Date(0)
  d.setUTCFullYear(year, month - 1, day)
  d.setUTCHours(hour, minute, 0, 0)
  return d.getTime() - tzOffsetHours * 3_600_000
}

// The UTC offset (hours) an IANA timezone had at a specific UTC instant.
// Returns null for unrecognised timezone identifiers.
function offsetAtInstant(tzName: string, utcMs: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date(utcMs))
    const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value ?? ''
    if (offsetStr === 'GMT') return 0
    const m = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
    if (m) {
      const sign    = m[1] === '+' ? 1 : -1
      const hours   = parseInt(m[2])
      const minutes = parseInt(m[3] ?? '0')
      return sign * (hours + minutes / 60)
    }
  } catch { /* unknown timezone identifier */ }
  return null
}

// Derive the UTC offset (hours) for an IANA timezone name at a specific
// wall-clock moment. The calendar values are treated as local time in the
// target timezone; the returned offset is what was active at that moment
// (DST-aware). Returns null for unrecognised timezone identifiers.
export function tzNameToOffset(
  tzName: string,
  year: number, month: number, day: number,
  hour: number, minute: number,
): number | null {
  // The wall-clock values are LOCAL time, but we only have UTC-based APIs. Treat
  // the wall clock as if it were UTC to get a first-guess instant, look up the
  // offset there, then refine: the true instant is (wall − offset), and querying
  // the zone at that refined instant returns the offset actually in force. Without
  // this refinement a birth in the hours just after a DST spring-forward gets the
  // pre-transition offset (off by an hour), which shifts the Ascendant ~15°.
  //
  // Pad the year to 4 digits: `Date.UTC` is fine for the ms math, but building the
  // instant via setUTCFullYear avoids the legacy two-digit-year remap so early-CE
  // births (the API permits years 1–9999) stay DST/LMT-accurate — the IANA database
  // returns the historical local-mean-time offset for pre-standard-time dates.
  const base = new Date(0)
  base.setUTCFullYear(year, month - 1, day)
  base.setUTCHours(hour, minute, 0, 0)
  const wallAsUtcMs = base.getTime()

  // First guess: offset at the wall clock read as UTC.
  let offset = offsetAtInstant(tzName, wallAsUtcMs)
  if (offset === null) return null
  // Two refinement passes converge for all standard DST rules (a single hop can
  // land on the wrong side of a same-day transition; the second settles it).
  for (let i = 0; i < 2; i++) {
    const refined = offsetAtInstant(tzName, wallAsUtcMs - offset * 3_600_000)
    if (refined === null) return offset
    if (refined === offset) break
    offset = refined
  }
  return offset
}
