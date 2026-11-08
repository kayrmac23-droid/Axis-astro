'use client'
// A boundary around the reading alone. ReadingPanel parses model output into
// blocks on every streamed chunk, which makes it the likeliest place in the app
// for a render-time fault — and without this, one would replace the whole page,
// taking the wheel, the readout and the dossier header with it. Here the reader
// keeps the chart and gets a way back into the reading. retry() re-renders the
// panel; already-generated sections are served from the cache, so nothing is
// paid for twice.
import type React from 'react'
import { catchError, type ErrorInfo } from 'next/error'
import styles from './ReadingPanel.module.css'

function ReadingErrorFallback(_props: { children?: React.ReactNode }, { error, retry }: ErrorInfo) {
  console.error('[AXIS_CLIENT_ERROR] reading panel', error)
  return (
    <section role="alert" style={{ padding: '32px 16px', textAlign: 'center' }}>
      <p style={{ marginBottom: 16 }}>
        The reading hit a display error. Your chart above is unaffected, and sections already
        written are saved.
      </p>
      <button type="button" className={styles.retrySectionBtn} onClick={() => retry()}>
        SHOW THE READING AGAIN
      </button>
    </section>
  )
}

export default catchError(ReadingErrorFallback)
