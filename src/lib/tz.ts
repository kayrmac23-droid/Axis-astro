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
    const isoStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`
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
