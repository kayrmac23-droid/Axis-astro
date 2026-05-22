// Thin PostHog wrapper. No-ops when NEXT_PUBLIC_POSTHOG_KEY is absent so local
// dev and CI never need the env var. All capture calls are client-side only.
import posthog from 'posthog-js'

let _initialised = false

function init(): void {
  if (_initialised || typeof window === 'undefined') return
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
  })
  _initialised = true
}

export function capture(event: string, properties?: Record<string, unknown>): void {
  init()
  if (!_initialised) return
  posthog.capture(event, properties)
}
