import type { NextRequest } from 'next/server'

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string; status: 400 | 413 | 415 }

function isJsonContentType(value: string | null): boolean {
  if (!value) return false
  const mediaType = value.split(';', 1)[0].trim().toLowerCase()
  return mediaType === 'application/json' || mediaType.endsWith('+json')
}

// Read and parse a JSON body without ever buffering more than maxBytes.
// `await req.text()` reads the entire body into memory before any size check can
// run (Vercel accepts bodies up to 100 MB), and `.length` counts UTF-16 code
// units, not bytes. Content-Length is only an early rejection here — it can be
// omitted or spoofed — so the streamed byte count is the authoritative limit.
export async function readLimitedJsonBody(
  req: NextRequest,
  maxBytes: number,
): Promise<JsonBodyResult> {
  if (!isJsonContentType(req.headers.get('content-type'))) {
    return { ok: false, error: 'Content-Type must be application/json', status: 415 }
  }

  const lengthHeader = req.headers.get('content-length')
  if (lengthHeader) {
    const claimedLength = Number(lengthHeader)
    if (!Number.isSafeInteger(claimedLength) || claimedLength < 0) {
      return { ok: false, error: 'Invalid Content-Length header', status: 400 }
    }
    if (claimedLength > maxBytes) {
      return { ok: false, error: 'Request payload too large', status: 413 }
    }
  }

  if (!req.body) return { ok: false, error: 'Request body is required', status: 400 }

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel('payload too large').catch(() => undefined)
        return { ok: false, error: 'Request payload too large', status: 413 }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, error: 'Unable to read request body', status: 400 }
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return { ok: false, error: 'Request body must be valid UTF-8', status: 400 }
  }

  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, error: 'Invalid JSON body', status: 400 }
  }
}
