// Thin PostHog wrapper. No-ops when NEXT_PUBLIC_POSTHOG_KEY is absent so local
// dev and CI never need the env var. All capture calls are client-side only.
import posthog from 'posthog-js'

let _initialised = false

function init(): void {
  if (_initialised || typeof window === 'undefined') return
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return
  // Every privacy-relevant option is set HERE, in code, rather than left to
  // PostHog's defaults or its dashboard. The defaults autocapture every click
  // with the clicked element's text (on this site, that includes the birthplace
  // suggestion a person picked), and session replay can be switched on remotely
  // from the PostHog project settings — on a page whose whole input is a birth
  // date, time and place. The privacy page (/privacy) states what this sends;
  // keep the two in step.
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    // Only the named capture() calls below are sent — never automatic clicks.
    autocapture: false,
    // Never record the screen, whatever the project's remote settings say.
    disable_session_recording: true,
    // No person profiles for anonymous visitors (AXIS has no accounts).
    person_profiles: 'identified_only',
    // A browser asking not to be tracked is not tracked.
    respect_dnt: true,
  })
  _initialised = true
}

export function capture(event: string, properties?: Record<string, unknown>): void {
  init()
  if (!_initialised) return
  posthog.capture(event, properties)
}
