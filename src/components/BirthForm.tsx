'use client'
import { useState } from 'react'
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
  })
  const [locationSuggestions, setLocationSuggestions] = useState<GeoResult[]>([])
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationConfirmed, setLocationConfirmed] = useState(false)

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
      if (value.length > 2) searchLocation(value)
      else setLocationSuggestions([])
    }
  }

  const searchLocation = async (query: string) => {
    setLocationLoading(true)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setLocationSuggestions(data)
    } catch {
      setLocationSuggestions([])
    } finally {
      setLocationLoading(false)
    }
  }

  const selectLocation = async (result: GeoResult) => {
    // Fallback: rough estimate from longitude
    let tz = String(Math.round(parseFloat(result.lon) / 15))

    try {
      const tzRes = await fetch(
        `https://timezonefinder.michelfe.it/api/0?lat=${result.lat}&lng=${result.lon}`
      )
      const tzData = await tzRes.json()
      const tzName: string = tzData.tz_name || tzData.timezone_id || ''

      if (tzName) {
        // Use the birth date for DST-aware offset (fall back to current date)
        const year = parseInt(formData.year) || new Date().getFullYear()
        const month = (parseInt(formData.month) || 1) - 1
        const day = parseInt(formData.day) || 1
        const hour = formData.hour ? to24Hour(formData.hour, formData.ampm) : 12
        const minute = parseInt(formData.minute) || 0
        const birthDate = new Date(year, month, day, hour, minute)

        // Get offset string like "GMT+05:30" via Intl
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: tzName,
          timeZoneName: 'longOffset'
        }).formatToParts(birthDate)

        const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value ?? ''
        if (offsetStr === 'GMT') {
          tz = '0'
        } else {
          const m = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
          if (m) {
            const sign = m[1] === '+' ? 1 : -1
            const hours = parseInt(m[2])
            const minutes = parseInt(m[3] ?? '0')
            tz = String(sign * (hours + minutes / 60))
          }
        }
      }
    } catch {}

    setFormData(prev => ({
      ...prev,
      location: result.display_name.split(',').slice(0, 2).join(','),
      latitude: result.lat,
      longitude: result.lon,
      timezone: tz
    }))
    setLocationSuggestions([])
    setLocationConfirmed(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.latitude || !formData.longitude) {
      alert('Please select a location from the suggestions.')
      return
    }
    const { ampm, ...rest } = formData
    onSubmit({ ...rest, hour: String(to24Hour(formData.hour, ampm)) })
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
          <span className={styles.labelNote}>use noon if unknown</span>
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
            />
          </div>
          <div className={styles.ampmToggle}>
            <button
              type="button"
              className={`${styles.ampmBtn} ${formData.ampm === 'AM' ? styles.ampmActive : ''}`}
              onClick={() => setFormData(prev => ({ ...prev, ampm: 'AM' }))}
            >AM</button>
            <button
              type="button"
              className={`${styles.ampmBtn} ${formData.ampm === 'PM' ? styles.ampmActive : ''}`}
              onClick={() => setFormData(prev => ({ ...prev, ampm: 'PM' }))}
            >PM</button>
          </div>
        </div>
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
