#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as z from 'zod'

import { decodeBase64Image } from './lib/decode-base64.js'
import { fetchPhoneMockupPng } from './lib/request-mockup.js'
import { MOCKIT_MCP_SERVER_INSTRUCTIONS, MOCKIT_PHONE_TOOL_DESCRIPTION } from './lib/mcp-instructions.js'
import { DEFAULT_DEVICE_ROTATION_RAD, DEFAULT_MCP_PHONE_ZOOM, mcpPhoneToolShape } from './lib/schemas.js'

function apiUrl(): string {
  const raw = process.env.MOCKIT_API_URL?.trim() || 'http://127.0.0.1:3945'
  return raw.replace(/\/$/, '')
}

function apiKey(): string | undefined {
  const k = process.env.MOCKIT_API_KEY?.trim()
  return k || undefined
}

function defaultOutputRoot(): string {
  const env = process.env.MOCKIT_OUTPUT_DIR?.trim()
  if (env) return resolve(env)
  return resolve(process.cwd(), 'mockit-output')
}

function parsePhoneArgs(raw: unknown) {
  const first = mcpPhoneToolShape.safeParse(raw)
  if (!first.success) return { ok: false as const, error: first.error.flatten() }

  const b64 = first.data.image_base64
  const pth = first.data.image_path
  const devices = first.data.devices

  if (!devices || devices.length === 0) {
    if ((b64 && pth) || (!b64 && !pth)) {
      return { ok: false as const, error: 'Provide exactly one of image_base64 or image_path (or a non-empty `devices` array)' }
    }
  } else {
    for (const [i, d] of devices.entries()) {
      const has64 = !!d.image_base64
      const hasPath = !!d.image_path
      if ((has64 && hasPath) || (!has64 && !hasPath)) {
        return { ok: false as const, error: `devices[${i}]: provide exactly one of image_base64 or image_path` }
      }
    }
  }

  return {
    ok: true as const,
    value: {
      image_base64: b64,
      image_path: pth,
      // MCP defaults to HQ (2x the HTTP defaults) — MSAA 8 + DPR 2 + this resolution = best output the renderer can produce.
      canvas_width: first.data.canvas_width ?? 2880,
      canvas_height: first.data.canvas_height ?? 5760,
      device_color_hex: first.data.device_color_hex ?? '#c0b9ad',
      background_hex: first.data.background_hex ?? '#0a0a0a',
      device_rotation: first.data.device_rotation,
      zoom: first.data.zoom,
      camera_offset_x: first.data.camera_offset_x,
      camera_offset_y: first.data.camera_offset_y,
      camera_roll: first.data.camera_roll,
      transparent: first.data.transparent ?? false,
      output_basename: first.data.output_basename,
      devices,
    },
  }
}

async function screenshotAsBase64ForApi(v: { image_base64?: string; image_path?: string }): Promise<string> {
  if (v.image_base64) return decodeBase64Image(v.image_base64).toString('base64')
  const buf = await readFile(resolve(v.image_path!))
  return buf.toString('base64')
}

const server = new McpServer(
  { name: 'mockit-api-mcp-bridge', version: '0.1.0' },
  {
    instructions: MOCKIT_MCP_SERVER_INSTRUCTIONS,
  },
)

server.registerTool(
  'mockit_phone_mockup',
  {
    description: MOCKIT_PHONE_TOOL_DESCRIPTION,
    inputSchema: mcpPhoneToolShape.shape,
  },
  async (args) => {
    const parsed = parsePhoneArgs(args)
    if (!parsed.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error) }],
      }
    }

    try {
      const devicesForBody = parsed.value.devices
        ? await Promise.all(
            parsed.value.devices.map(async (d) => ({
              kind: (d.kind ?? 'phone') as 'phone' | 'mac',
              image_base64: await screenshotAsBase64ForApi({ image_base64: d.image_base64, image_path: d.image_path }),
              device_color_hex: d.device_color_hex,
              device_rotation: d.device_rotation,
              position_x: d.position_x,
              position_y: d.position_y,
            })),
          )
        : undefined

      const topLevelImage =
        !devicesForBody && (parsed.value.image_base64 || parsed.value.image_path)
          ? await screenshotAsBase64ForApi(parsed.value)
          : undefined

      const png = await fetchPhoneMockupPng(
        apiUrl(),
        {
          ...(topLevelImage ? { image_base64: topLevelImage } : {}),
          canvas_width: parsed.value.canvas_width,
          canvas_height: parsed.value.canvas_height,
          device_color_hex: parsed.value.device_color_hex,
          background_hex: parsed.value.background_hex,
          device_rotation: parsed.value.device_rotation ?? DEFAULT_DEVICE_ROTATION_RAD,
          zoom: parsed.value.zoom ?? DEFAULT_MCP_PHONE_ZOOM,
          camera_offset_x: parsed.value.camera_offset_x ?? 0,
          camera_offset_y: parsed.value.camera_offset_y ?? 0,
          ...(typeof parsed.value.camera_roll === 'number' ? { camera_roll: parsed.value.camera_roll } : {}),
          transparent: parsed.value.transparent,
          ...(devicesForBody ? { devices: devicesForBody } : {}),
        },
        apiKey(),
      )

      const outDir = defaultOutputRoot()
      await mkdir(outDir, { recursive: true })
      const slugRaw = parsed.value.output_basename
      const slug = slugRaw?.replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) ?? ''
      const name = `${slug && slug.length > 0 ? slug : `mockit-${Date.now()}`}.png`
      const outPath = join(outDir, name)
      await writeFile(outPath, png)

      const summary = JSON.stringify({
        ok: true,
        api_url: apiUrl(),
        output_path: outPath,
        bytes: png.length,
        canvas: { width: parsed.value.canvas_width, height: parsed.value.canvas_height },
      })
      return { content: [{ type: 'text', text: summary }] }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { isError: true, content: [{ type: 'text', text: msg }] }
    }
  },
)

server.registerTool(
  'mockit_health',
  {
    description: 'GET /health against MOCKIT_API_URL to verify backend is reachable.',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const url = `${apiUrl()}/health`
      const headers: Record<string, string> = { Accept: 'application/json' }
      const k = apiKey()
      if (k) headers.Authorization = `Bearer ${k}`
      const res = await fetch(url, { headers })
      const txt = await res.text()
      return {
        content: [{ type: 'text', text: JSON.stringify({ status: res.status, body: txt.slice(0, 500), url }) }],
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { isError: true, content: [{ type: 'text', text: msg }] }
    }
  },
)

server.registerTool(
  'mockit_list_outputs',
  {
    description: 'Local PNG filenames under MCP output dir after mockit_phone_mockup saves.',
    inputSchema: z.object({}),
  },
  async () => {
    const outDir = defaultOutputRoot()
    try {
      const names = await readdir(outDir)
      const pngs = names.filter((n) => n.toLowerCase().endsWith('.png')).slice(-40)
      const lines = pngs.map((n) => join(outDir, n)).join('\n')
      const text =
        pngs.length === 0 ? `No PNG in ${outDir}. MOCKIT_OUTPUT_DIR=${process.env.MOCKIT_OUTPUT_DIR ?? '(unset)'}` : `${outDir}:\n${lines}`
      return { content: [{ type: 'text', text }] }
    } catch {
      return {
        content: [
          { type: 'text', text: `Output folder not readable: ${outDir}\nHOME=${homedir()}\ncwd=${process.cwd()}` },
        ],
      }
    }
  },
)

async function main(): Promise<void> {
  console.error('[mockit-mcp] MOCKIT_API_URL=%s', apiUrl())
  console.error('[mockit-mcp] MOCKIT_OUTPUT_DIR=%s', defaultOutputRoot())
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

await main()
