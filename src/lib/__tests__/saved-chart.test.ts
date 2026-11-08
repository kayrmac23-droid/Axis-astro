// The resume convenience must never break the page: storage can be missing,
// blocked (private mode throws on access), stale, or hold junk from another
// version. Every one of those reads as "no saved chart".
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loadSavedChart, saveChart, forgetSavedChart, SAVED_CHART_MAX_AGE_MS } from '../saved-chart'

const FORM = { year: '1990', month: '3', day: '5', hour: '9', minute: '30', latitude: '51.5', longitude: '-0.12', location: 'London', birthTimeUnknown: 'false' }

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
    dump: m,
  }
}

describe('saved chart', () => {
  let store: ReturnType<typeof memoryStorage>
  beforeEach(() => { store = memoryStorage(); vi.stubGlobal('window', { localStorage: store }) })
  afterEach(() => vi.unstubAllGlobals())

  it('round-trips the last cast chart', () => {
    saveChart(FORM, 1000)
    expect(loadSavedChart(2000)).toEqual(FORM)
  })

  it('expires with the reading cache (30 days) and clears the stale entry', () => {
    saveChart(FORM, 0)
    expect(loadSavedChart(SAVED_CHART_MAX_AGE_MS + 1)).toBeNull()
    expect(store.dump.size).toBe(0)
  })

  it('forgets on request', () => {
    saveChart(FORM)
    forgetSavedChart()
    expect(loadSavedChart()).toBeNull()
  })

  it('treats junk as nothing saved', () => {
    store.setItem('axis:last-chart:v1', '{not json')
    expect(loadSavedChart()).toBeNull()
    store.setItem('axis:last-chart:v1', JSON.stringify({ form: { year: 1990 }, savedAt: Date.now() }))
    expect(loadSavedChart()).toBeNull()
  })

  it('never throws when storage itself throws (private mode, blocked site data)', () => {
    vi.stubGlobal('window', { get localStorage(): Storage { throw new Error('SecurityError') } })
    expect(() => saveChart(FORM)).not.toThrow()
    expect(loadSavedChart()).toBeNull()
    expect(() => forgetSavedChart()).not.toThrow()
  })
})
