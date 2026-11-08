'use client'
// Last-resort boundary for an error in the root layout itself. It replaces the
// whole document, so it renders its own <html>/<body> and cannot rely on the
// global stylesheet or fonts — the few styles it needs are inline, in the site's
// own palette (void background, copper accent).
import { useEffect } from 'react'

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error('[AXIS_CLIENT_ERROR] root layout', error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', background: '#02030A', color: '#EAE8F8', fontFamily: 'Georgia, serif', display: 'grid', placeItems: 'center', padding: 16 }}>
        <title>AXIS — something broke</title>
        <main style={{ maxWidth: 520 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.14em', color: '#B87333' }}>{'// SOMETHING BROKE'}</div>
          <h1 style={{ fontWeight: 400, fontSize: 32 }}>AXIS hit an error</h1>
          <p style={{ lineHeight: 1.6 }}>Your chart is not the problem. Try again, or reload the page.</p>
          <button type="button" onClick={() => retry()}
            style={{ marginTop: 8, padding: '12px 20px', background: '#B87333', color: '#02030A', border: 0, fontFamily: 'monospace', letterSpacing: '0.1em', cursor: 'pointer' }}>
            TRY AGAIN
          </button>
        </main>
      </body>
    </html>
  )
}
