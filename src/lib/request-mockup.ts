import type { PhoneMockupBody } from './schemas.js'

export async function fetchPhoneMockupPng(apiBase: string, body: PhoneMockupBody, apiKey?: string): Promise<Buffer> {
  const base = apiBase.replace(/\/$/, '')
  const headers: Record<string, string> = {
    Accept: 'image/png',
    'Content-Type': 'application/json',
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const res = await fetch(`${base}/v1/mockups/phone`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...body,
    }),
  })

  const buf = Buffer.from(await res.arrayBuffer())
  if (!res.ok) {
    let msg = res.statusText
    try {
      const text = buf.toString('utf8').slice(0, 600)
      if (text.startsWith('{')) msg = text
      else msg = text || msg
    } catch {
      /* noop */
    }
    throw new Error(`Mockit API ${res.status}: ${msg}`)
  }
  return buf
}
