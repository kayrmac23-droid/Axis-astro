'use client'
import { useState, useRef, useEffect } from 'react'
import styles from './BirthForm.module.css'

interface BirthFormProps {
  onSubmit: (data: Record<string, string>) => void
  loading: boolean
  submitLabel?: string
}

interface GeoResult {
  display_name: string
  lat: string
  lon: string
}

export default function BirthForm({ onSubmit, loading, submitLabel = 'Begin the AXIS reading' }: BirthFormProps) {
  const [formData, setFormData] = useState({
    year: '',
    month: '',
    day: '',
    hour: '',
    minute: '',
    ampm: 'AM',
    location: '',
    latitude: '',
    longitude: '',
    timezone: '',
    tzName: '',
  })
  const [birthTimeUnknown, setBirthTimeUnknown] = useState(false)
  const [locationSuggestions, setLocationSuggestions] = useState<GeoResult[]>([])
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationConfirmed, setLocationConfirmed] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const geocodeAbortRef = useRef<AbortController | null>(null)
  const listboxId = 'location-listbox'

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      geocodeAbortRef.current?.abort()
    }
  }, [])

  const to24Hour = (hour: string, ampm: string): number => {
    const hRaw = parseInt(hour)
    const h = isNaN(hRaw) ? 12 : hRaw
    if (ampm === 'AM') return h === 12 ? 0 : h
    return h === 12 ? 12 : h + 12
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (name === 'location') {
      setLocationConfirmed(false)
      setActiveSuggestion(-1)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      if (value.length > 2) {
        searchTimerRef.current = setTimeout(() => searchLocation(value), 300)
      } else {
        setLocationSuggestions([])
      }
    }
  }

  const handleLocationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!locationSuggestions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveSuggestion(i => Math.min(i + 1, locationSuggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveSuggestion(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeSuggestion >= 0) {
      e.preventDefault()
      selectLocation(locationSuggestions[activeSuggestion])
    } else if (e.key === 'Escape') {
      setLocationSuggestions([])
      setActiveSuggestion(-1)
    }
  }

  const searchLocation = async (query: string) => {
    if (geocodeAbortRef.current) geocodeAbortRef.current.abort()
    geocodeAbortRef.current = new AbortController()
    setLocationLoading(true)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal: geocodeAbortRef.current.signal })
      const data = await res.json()
      // The endpoint returns an array on every path, but guard defensively so a
      // non-array body (e.g. an intermediary error page) can never crash the
      // suggestion list's .map() render.
      setLocationSuggestions(Array.isArray(data) ? data : [])
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') setLocationSuggestions([])
    } finally {
      setLocationLoading(false)
    }
  }

  const getUtcOffsetFromTzName = (tzName: string, year: number, month: number, day: number, hour: number, minute: number): string | null => {
    try {
      // Create a UTC-based Date that represents the wall-clock time in the target timezone.
      // We use a UTC timestamp matching the calendar values; Intl then maps it to the
      // correct UTC offset for that timezone at that calendar date (DST-aware).
      // Pad the year to 4 digits — otherwise an early-CE year (e.g. 50) yields a
      // non-ISO string that parses to Invalid Date, and this lookup silently falls
      // back to the rough longitude-based offset instead of the real DST/LMT offset.
      const isoStr = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`
      const date = new Date(isoStr)
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tzName,
        timeZoneName: 'longOffset'
      }).formatToParts(date)
      const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value ?? ''
      if (offsetStr === 'GMT') return '0'
      const m = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
      if (m) {
        const sign = m[1] === '+' ? 1 : -1
        const hours = parseInt(m[2])
        const minutes = parseInt(m[3] ?? '0')
        return String(sign * (hours + minutes / 60))
      }
    } catch { /* Intl not available for this timezone */ }
    return null
  }

  const selectLocation = async (result: GeoResult) => {
    // Fallback: rough estimate from longitude (±15°/hour)
    let tz = String(Math.round(parseFloat(result.lon) / 15))
    let tzName = ''

    try {
      const tzAbort = new AbortController()
      const tzTimeout = setTimeout(() => tzAbort.abort(), 8000)
      const tzRes = await fetch(
        `/api/timezone?lat=${result.lat}&lon=${result.lon}`,
        { signal: tzAbort.signal }
      ).finally(() => clearTimeout(tzTimeout))

      if (tzRes.ok) {
        const tzData = await tzRes.json()
        tzName = tzData.tzName || ''
      }
    } catch { /* offline or server error — use longitude fallback */ }

    if (tzName) {
      const year = parseInt(formData.year) || new Date().getFullYear()
      const month = parseInt(formData.month) || 1
      const day = parseInt(formData.day) || 1
      const hour = formData.hour ? to24Hour(formData.hour, formData.ampm) : 12
      const minute = parseInt(formData.minute) || 0
      const offset = getUtcOffsetFromTzName(tzName, year, month, day, hour, minute)
      if (offset !== null) tz = offset
    }

    setFormData(prev => ({
      ...prev,
      location: result.display_name.split(',').slice(0, 2).join(','),
      latitude: result.lat,
      longitude: result.lon,
      timezone: tz,
      tzName,
    }))
    setLocationSuggestions([])
    setActiveSuggestion(-1)
    setLocationConfirmed(true)
  }

  const handleToggleBirthTimeUnknown = () => {
    const next = !birthTimeUnknown
    setBirthTimeUnknown(next)
    if (next) {
      // Auto-set noon when birth time is flagged as unknown
      setFormData(prev => ({ ...prev, hour: '12', minute: '0', ampm: 'PM' }))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.latitude || !formData.longitude) {
      setSubmitError('Please select a location from the suggestions.')
      return
    }
    setSubmitError(null)
    const { ampm, ...rest } = formData
    const hour24 = birthTimeUnknown ? '12' : String(to24Hour(formData.hour, ampm))
    const minute = birthTimeUnknown ? '0' : rest.minute
    onSubmit({ ...rest, hour: hour24, minute, birthTimeUnknown: String(birthTimeUnknown) })
  }

  // Time is required unless the user has explicitly flagged the birth time as unknown.
  // Without this, a user who left hour/minute blank would silently get a noon chart
  // without the birth-time-unknown notice attached, so the unreliability of Ascendant,
  // MC, and houses would not surface in the reading.
  const dateOk = !!(formData.year && formData.year.length === 4 && formData.month && formData.day)
  const timeOk = !!(birthTimeUnknown || (formData.hour && formData.minute))
  const placeOk = locationConfirmed
  const setCount = [dateOk, timeOk, placeOk].filter(Boolean).length
  const missing = !dateOk ? 'DATE' : !timeOk ? 'TIME' : !placeOk ? 'PLACE' : null
  const isValid = dateOk && timeOk && placeOk
  const placeMeta = placeOk
    ? `${parseFloat(formData.latitude).toFixed(3)} · ${parseFloat(formData.longitude).toFixed(3)}${formData.tzName ? ' · ' + formData.tzName.toUpperCase() : ''}`
    : (formData.location ? 'SELECT A RESULT' : '')

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {/* DATE ─────────────────────────────────────────── */}
      <div className={styles.formRow}>
        <label className={styles.rowLabel}>DATE OF BIRTH</label>
        <div className={styles.rowField}>
          <input
            type="text" inputMode="numeric" name="day" placeholder="DD" maxLength={2}
            value={formData.day} onChange={handleChange} required aria-label="Day"
            className={styles.numInput}
          />
          <span className={styles.sep}>·</span>
          <input
            type="text" inputMode="numeric" name="month" placeholder="MM" maxLength={2}
            value={formData.month} onChange={handleChange} required aria-label="Month"
            className={styles.numInput}
          />
          <span className={styles.sep}>·</span>
          <input
            type="text" inputMode="numeric" name="year" placeholder="YYYY" maxLength={4}
            value={formData.year} onChange={handleChange} required aria-label="Year"
            className={`${styles.numInput} ${styles.numInputWide}`}
          />
          <span className={`${styles.rowStatus} ${dateOk ? styles.rowStatusLive : ''}`}>
            {dateOk ? '✓ SET' : 'DD · MM · YYYY'}
          </span>
        </div>
      </div>

      {/* TIME ─────────────────────────────────────────── */}
      <div className={`${styles.formRow} ${styles.formRowTop}`}>
        <label className={`${styles.rowLabel} ${styles.rowLabelTime}`}>TIME OF BIRTH</label>
        <div className={styles.timeStack}>
          <div className={styles.rowField} style={{ opacity: birthTimeUnknown ? 0.35 : 1 }}>
            <input
              type="text" inputMode="numeric" name="hour" placeholder="HH" maxLength={2}
              value={formData.hour} onChange={handleChange} disabled={birthTimeUnknown}
              required={!birthTimeUnknown} aria-label="Hour" className={styles.numInput}
            />
            <span className={styles.colon}>:</span>
            <input
              type="text" inputMode="numeric" name="minute" placeholder="MM" maxLength={2}
              value={formData.minute} onChange={handleChange} disabled={birthTimeUnknown}
              required={!birthTimeUnknown} aria-label="Minute" className={styles.numInput}
            />
            <div className={styles.ampmGroup} role="radiogroup" aria-label="AM or PM">
              <button
                type="button"
                className={`${styles.ampmButton} ${formData.ampm === 'AM' ? styles.ampmButtonActive : ''}`}
                onClick={() => !birthTimeUnknown && setFormData(prev => ({ ...prev, ampm: 'AM' }))}
                disabled={birthTimeUnknown} aria-pressed={formData.ampm === 'AM'}
              >AM</button>
              <button
                type="button"
                className={`${styles.ampmButton} ${formData.ampm === 'PM' ? styles.ampmButtonActive : ''}`}
                onClick={() => !birthTimeUnknown && setFormData(prev => ({ ...prev, ampm: 'PM' }))}
                disabled={birthTimeUnknown} aria-pressed={formData.ampm === 'PM'}
              >PM</button>
            </div>
          </div>

          <button type="button" className={styles.unknownCard} onClick={handleToggleBirthTimeUnknown} aria-pressed={birthTimeUnknown}>
            <span className={`${styles.unknownBox} ${birthTimeUnknown ? styles.unknownBoxOn : ''}`} />
            <span>
              <span className={styles.unknownTitle}>BIRTH TIME UNKNOWN</span>
              <span className={styles.unknownDesc}>Noon is assumed. Ascendant, houses, MC and Moon degree become unreliable and the dossier says so. Sign positions stay accurate.</span>
            </span>
          </button>
        </div>
      </div>

      {/* PLACE ────────────────────────────────────────── */}
      <div className={`${styles.formRow} ${styles.formRowLast}`}>
        <label className={styles.rowLabel}>PLACE OF BIRTH</label>
        <div className={styles.placeWrap}>
          <input
            type="text" name="location" placeholder="City, country"
            value={formData.location} onChange={handleChange} onKeyDown={handleLocationKeyDown}
            autoComplete="off" role="combobox" aria-expanded={locationSuggestions.length > 0}
            aria-autocomplete="list" aria-controls={listboxId}
            aria-activedescendant={activeSuggestion >= 0 ? `location-option-${activeSuggestion}` : undefined}
            className={styles.placeInput}
          />
          <span className={styles.placeMeta}>{locationLoading ? 'SEARCHING…' : placeMeta}</span>
          {locationSuggestions.length > 0 && (
            <ul id={listboxId} className={styles.suggestionList} role="listbox">
              {locationSuggestions.map((s, i) => (
                <li
                  key={s.display_name} id={`location-option-${i}`}
                  className={`${styles.suggestionItem} ${i === activeSuggestion ? styles.suggestionItemActive : ''}`}
                  role="option" aria-selected={i === activeSuggestion}
                  onClick={() => selectLocation(s)} onMouseEnter={() => setActiveSuggestion(i)}
                >
                  <span className={styles.suggestName}>{s.display_name}</span>
                  <span className={styles.suggestCoords}>{parseFloat(s.lat).toFixed(3)} · {parseFloat(s.lon).toFixed(3)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {submitError && (
        <p className={styles.submitError} role="alert">{submitError}</p>
      )}

      {/* FOOTER ───────────────────────────────────────── */}
      <div className={styles.formFooter}>
        <span className={`${styles.formStatus} ${setCount === 3 ? styles.formStatusLive : ''}`}>
          {`// ${setCount === 3 ? '3 OF 3 SET · READY' : `${setCount} OF 3 SET · AWAITING ${missing}`}`}
        </span>
        <button type="submit" className={styles.submitBtn} disabled={loading || !isValid}>
          {loading ? (
            <span className={styles.btnLoading}><span className={styles.btnSpinner} />CASTING</span>
          ) : submitLabel.toUpperCase()}
        </button>
      </div>
    </form>
  )
}
