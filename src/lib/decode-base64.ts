export function decodeBase64Image(s: string): Buffer {
  const t = s.trim()
  const m = /^data:[^;]+;base64,(.+)$/is.exec(t)
  const payload = (m?.[1] ?? t.replace(/\s/g, '')).trim()
  if (!payload.length) throw new Error('Empty image_base64 payload')
  return Buffer.from(payload, 'base64')
}
