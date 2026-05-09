#!/usr/bin/env node
/**
 * POST a local image file to Mockit HTTP API → PNG mockup on disk.
 *
 * Usage:
 *   node scripts/post-mockup-from-file.mjs <image-path> [output-png-path]
 *
 * Env:
 *   MOCKIT_API_URL   default http://127.0.0.1:3945
 *   MOCKIT_API_KEY   optional Bearer token
 */

import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, resolve } from 'node:path'

const imagePath = process.argv[2]
const outExplicit = process.argv[3]

const apiBase = (process.env.MOCKIT_API_URL ?? 'http://127.0.0.1:3945').replace(/\/$/, '')
const apiKey = process.env.MOCKIT_API_KEY?.trim()

async function main() {
  if (!imagePath) {
    console.error('Usage: node scripts/post-mockup-from-file.mjs <image-path> [output-png-path]')
    process.exit(1)
  }

  const resolvedIn = resolve(imagePath)
  const buf = await readFile(resolvedIn)
  const image_base64 = buf.toString('base64')

  const body = JSON.stringify({
    image_base64,
    canvas_width: 1440,
    canvas_height: 2880,
    device_color_hex: '#1a1a1a',
    background_hex: '#0a0a0a',
  })

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'image/png',
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  console.error(`POST ${apiBase}/v1/mockups/phone (file: ${resolvedIn})`)
  const res = await fetch(`${apiBase}/v1/mockups/phone`, { method: 'POST', headers, body })
  const outBuf = Buffer.from(await res.arrayBuffer())

  if (!res.ok) {
    console.error('API error:', res.status, outBuf.toString('utf8').slice(0, 800))
    process.exit(1)
  }

  const defaultOut = resolve(homedir(), 'Desktop', `mockit-${Date.now()}-${basename(imagePath)}.png`.replace(/\s+/g, '-'))
  const outPath = outExplicit ? resolve(outExplicit) : defaultOut
  await writeFile(outPath, outBuf)

  console.log(outPath)
  console.error(`Wrote ${outBuf.length} bytes`)
}

await main()
