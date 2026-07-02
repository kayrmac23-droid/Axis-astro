/** @type {import('next').NextConfig} */

// Content-Security-Policy.
// Allowances beyond 'self':
//   - PostHog (product analytics): assets + ingestion on *.posthog.com.
//   - Vercel Analytics / Speed Insights: script proxied same-origin at
//     /_vercel/*, with va.vercel-scripts.com as the fallback CDN host.
//   - 'unsafe-inline' on script-src/style-src: required by Next.js's inline
//     bootstrap scripts and styled-jsx without a nonce/middleware pipeline.
//     XSS surface is low — no route renders user input as HTML
//     (no dangerouslySetInnerHTML; readings are streamed as plain text).
// Google Fonts are self-hosted at build time by next/font, so no external
// font host is needed.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://*.posthog.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.posthog.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.posthog.com https://*.i.posthog.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  // Belt-and-suspenders clickjacking guard alongside frame-ancestors.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Deny powerful features the app never uses.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  // 2 years, subdomains, preload-eligible. HTTPS-only in production (Vercel).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig
