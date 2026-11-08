// The privacy page (/privacy) promises that AXIS never autocaptures clicks,
// never records the screen and honours Do Not Track. Those promises are only
// true while analytics.ts passes the options that make them true, so they are
// pinned here: removing one fails the build instead of quietly falsifying the
// page.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const init = vi.fn()
const capture = vi.fn()
vi.mock('posthog-js', () => ({ default: { init, capture } }))

describe('analytics — privacy options are set in code', () => {
  beforeEach(() => {
    vi.resetModules()
    init.mockClear(); capture.mockClear()
    vi.stubGlobal('window', {})
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY
  })

  it('initialises PostHog with autocapture, session replay and anonymous profiles off, and DNT honoured', async () => {
    const { capture: track } = await import('../analytics')
    track('chart_submit')
    expect(init).toHaveBeenCalledTimes(1)
    const options = init.mock.calls[0][1]
    expect(options).toMatchObject({
      autocapture: false,
      disable_session_recording: true,
      person_profiles: 'identified_only',
      respect_dnt: true,
    })
    expect(capture).toHaveBeenCalledWith('chart_submit', undefined)
  })

  it('does nothing at all without a key', async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY
    const { capture: track } = await import('../analytics')
    track('chart_submit')
    expect(init).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
  })
})
