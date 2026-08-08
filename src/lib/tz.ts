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

// Derive the UTC offset (hours) for an IANA timezone name at a specific
// wall-clock moment. The calendar values are treated as local time in the
// target timezone; the returned offset is what was active at that moment
// (DST-aware). Returns null for unrecognised timezone identifiers.
export function tzNameToOffset(
  tzName: string,
  year: number, month: number, day: number,
  hour: number, minute: number,
): number | null {
  try {
    // Pad the year to 4 digits: `new Date('50-06-15T…')` is not valid ISO 8601 and
    // parses to Invalid Date, which would make formatToParts throw and this function
    // silently return null for every year before 1000 CE — despite the API accepting
    // years 1–9999. Padding keeps early-CE births DST/LMT-accurate (the IANA database
    // returns the historical local-mean-time offset for pre-standard-time dates).
    const isoStr = `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`
    const date = new Date(isoStr)
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName,
      timeZoneName: 'longOffset',
    }).formatToParts(date)
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
