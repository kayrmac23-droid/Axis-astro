'use client'
import { useState, useRef, useEffect } from 'react'
import styles from './BirthForm.module.css'

interface BirthFormProps {
  onSubmit: (data: Record<string, string>) => void
  loading: boolean
}

interface GeoResult {
  display_name: string
  lat: string
  lon: string
}

export default function BirthForm({ onSubmit, loading }: BirthFormProps) {
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
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const geocodeAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      geocodeAbortRef.current?.abort()
    }
  }, [])

  const to24Hour = (hour: string, ampm: string): number => {
    const h = parseInt(hour) || 12
    if (ampm === 'AM') return h === 12 ? 0 : h
    return h === 12 ? 12 : h + 12
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (name === 'location') {
      setLocationConfirmed(false)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      if (value.length > 2) {
        searchTimerRef.current = setTimeout(() => searchLocation(value), 300)
      } else {
        setLocationSuggestions([])
      }
    }
  }

  const searchLocation = async (query: string) => {
    if (geocodeAbortRef.current) geocodeAbortRef.current.abort()
    geocodeAbortRef.current = new AbortController()
    setLocationLoading(true)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal: geocodeAbortRef.current.signal })
      const data = await res.json()
      setLocationSuggestions(data)
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
      const isoStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`
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
      const year  = parseInt(formData.year)  || new Date().getFullYear()
      const month = parseInt(formData.month) || 1
      const day   = parseInt(formData.day)   || 1
      const hour  = formData.hour ? to24Hour(formData.hour, formData.ampm) : 12
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
      alert('Please select a location from the suggestions.')
      return
    }
    const { ampm, ...rest } = formData
    const hour24 = birthTimeUnknown ? '12' : String(to24Hour(formData.hour, ampm))
    const minute = birthTimeUnknown ? '0'  : rest.minute
    onSubmit({ ...rest, hour: hour24, minute, birthTimeUnknown: String(birthTimeUnknown) })
  }

  const isValid = formData.year && formData.month && formData.day && locationConfirmed

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <p className={styles.formLabel}>Enter birth data</p>

      {/* Date */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>Date of birth</label>
        <div className={styles.dateRow}>
          <div className={styles.fieldWrap}>
            <input
              className={styles.input}
              name="day"
              type="number"
              placeholder="DD"
              min="1" max="31"
              value={formData.day}
              onChange={handleChange}
              required
            />
          </div>
          <div className={styles.fieldWrap}>
            <input
              className={styles.input}
              name="month"
              type="number"
              placeholder="MM"
              min="1" max="12"
              value={formData.month}
              onChange={handleChange}
              required
            />
          </div>
          <div className={styles.fieldWrap} style={{ flex: 2 }}>
            <input
              className={styles.input}
              name="year"
              type="number"
              placeholder="YYYY"
              min="1900" max="2099"
              value={formData.year}
              onChange={handleChange}
              required
            />
          </div>
        </div>
      </div>

      {/* Time */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>
          Time of birth
        </label>
        <div className={styles.dateRow}>
          <div className={styles.fieldWrap}>
            <input
              className={styles.input}
              name="hour"
              type="number"
              placeholder="HH"
              min="1" max="12"
              value={formData.hour}
              onChange={handleChange}
              disabled={birthTimeUnknown}
              style={birthTimeUnknown ? { opacity: 0.35 } : undefined}
            />
          </div>
          <span className={styles.timeSep}>:</span>
          <div className={styles.fieldWrap}>
            <input
              className={styles.input}
              name="minute"
              type="number"
              placeholder="MM"
              min="0" max="59"
              value={formData.minute}
              onChange={handleChange}
              disabled={birthTimeUnknown}
              style={birthTimeUnknown ? { opacity: 0.35 } : undefined}
            />
          </div>
          <div className={styles.ampmToggle} style={birthTimeUnknown ? { opacity: 0.35 } : undefined}>
            <button
              type="button"
              className={`${styles.ampmBtn} ${formData.ampm === 'AM' ? styles.ampmActive : ''}`}
              onClick={() => !birthTimeUnknown && setFormData(prev => ({ ...prev, ampm: 'AM' }))}
              disabled={birthTimeUnknown}
            >AM</button>
            <button
              type="button"
              className={`${styles.ampmBtn} ${formData.ampm === 'PM' ? styles.ampmActive : ''}`}
              onClick={() => !birthTimeUnknown && setFormData(prev => ({ ...prev, ampm: 'PM' }))}
              disabled={birthTimeUnknown}
            >PM</button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggleBirthTimeUnknown}
          className={styles.unknownTimeBtn}
        >
          <span className={`${styles.unknownTimeCheck} ${birthTimeUnknown ? styles.unknownTimeCheckActive : ''}`} />
          Birth time unknown — use noon approximation
        </button>
        {birthTimeUnknown && (
          <p className={styles.unknownTimeNote}>
            Ascendant, houses, and MC will be unreliable. Sign positions remain accurate.
          </p>
        )}
      </div>

      {/* Location */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>Place of birth</label>
        <div className={styles.locationWrap}>
          <input
            className={`${styles.input} ${locationConfirmed ? styles.inputConfirmed : ''}`}
            name="location"
            type="text"
            placeholder="City, country"
            value={formData.location}
            onChange={handleChange}
            autoComplete="off"
            required
          />
          {locationLoading && <span className={styles.locationLoader} />}
          {locationSuggestions.length > 0 && (
            <div className={styles.suggestions}>
              {locationSuggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className={styles.suggestion}
                  onClick={() => selectLocation(s)}
                >
                  {s.display_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        type="submit"
        className={styles.submitBtn}
        disabled={loading || !isValid}
      >
        {loading ? (
          <span className={styles.btnLoading}>
            <span className={styles.btnSpinner} />
            Calculating
          </span>
        ) : (
          'Generate chart'
        )}
      </button>
    </form>
  )
}
