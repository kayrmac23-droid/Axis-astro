// The last chart this browser cast, so a reader can get back to a ~36-minute
// reading after a reload, a closed tab, or a phone killing the background tab.
// Re-casting the same birth data reproduces the same cache keys, so every
// section already generated comes straight back from the cache.
//
// localStorage, not the URL: a birth date, time and place in a query string
// lands in browser history, referrers and server logs. It is a per-viewer
// convenience and nothing else, so every access is guarded and the page works
// identically when storage is blocked or empty (private mode, cleared data).
// The privacy page states this; keep the two in step.
const KEY = 'axis:last-chart:v1'
// Matches the reading cache's 30-day TTL: past it, re-opening would regenerate
// the reading rather than restore it.
export const SAVED_CHART_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export type SavedForm = Record<string, string>

interface Stored { form: SavedForm; savedAt: number }

function isForm(v: unknown): v is SavedForm {
  return !!v && typeof v === 'object' && !Array.isArray(v) &&
    Object.values(v as Record<string, unknown>).every(x => typeof x === 'string') &&
    typeof (v as SavedForm).year === 'string' && typeof (v as SavedForm).latitude === 'string'
}

export function loadSavedChart(now: number = Date.now()): SavedForm | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Stored>
    if (!isForm(parsed.form) || typeof parsed.savedAt !== 'number' || now - parsed.savedAt > SAVED_CHART_MAX_AGE_MS) {
      window.localStorage.removeItem(KEY)
      return null
    }
    return parsed.form
  } catch {
    return null
  }
}

export function saveChart(form: SavedForm, now: number = Date.now()): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ form, savedAt: now } satisfies Stored))
  } catch { /* storage unavailable — the reading simply is not resumable */ }
}

export function forgetSavedChart(): void {
  try { window.localStorage.removeItem(KEY) } catch { /* nothing to forget */ }
}
