import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { decodeBase64Image } from './lib/decode-base64.js'
import { renderPhone3D, closeRenderer } from './lib/render-phone-3d.js'
import { phoneMockupBodySchema } from './lib/schemas.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.MOCKIT_PORT ?? '3945')
const MOCKIT_API_KEY = process.env.MOCKIT_API_KEY?.trim()

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '40mb' }))

// ── mockup3d static build (the real 3D renderer) ─────────────────────────
app.use('/mockup3d', express.static(
  path.join(__dirname, '../public/mockup3d'),
  { maxAge: '1d' }
))
app.use('/models', express.static(
  path.join(__dirname, '../public/mockup3d/models'),
  { maxAge: '1d' }
))

// ── Health ────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'mockit-api' })
})

// ── Mockup endpoint ───────────────────────────────────────────────────────
app.post('/v1/mockups/phone', async (req, res) => {
  if (MOCKIT_API_KEY) {
    const h = req.get('authorization') ?? ''
    const token = /^Bearer\s+(.+)$/i.exec(h)?.[1]
    if (!token || token !== MOCKIT_API_KEY) {
      res.status(401).type('application/json').send(JSON.stringify({ error: 'Unauthorized' }))
      return
    }
  }

  const parsed = phoneMockupBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).type('application/json').send(parsed.error.flatten())
    return
  }

  try {
    const screenshotBuffer = decodeBase64Image(parsed.data.image_base64)
    const { device_rotation } = parsed.data

    const png = await renderPhone3D({
      screenshotBuffer,
      canvasWidth: parsed.data.canvas_width,
      canvasHeight: parsed.data.canvas_height,
      deviceColorHex: parsed.data.device_color_hex,
      backgroundHex: parsed.data.background_hex,
      deviceRotation: device_rotation as [number, number, number] | undefined,
      zoom: parsed.data.zoom,
      cameraOffsetX: parsed.data.camera_offset_x,
      cameraOffsetY: parsed.data.camera_offset_y,
    })

    const filename = `mockit-${Date.now()}.png`
    res.status(200)
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Content-Length', png.length.toString())
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
    res.end(png)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[mockit-api]', msg)
    res.status(400).type('application/json').send(JSON.stringify({ error: msg }))
  }
})

const server = app.listen(PORT, () => {
  console.error('[mockit-api] Listening on http://127.0.0.1:%s POST /v1/mockups/phone', PORT)
  if (MOCKIT_API_KEY) console.error('[mockit-api] Auth: Bearer MOCKIT_API_KEY required')
})

process.on('SIGTERM', async () => { await closeRenderer(); server.close() })
process.on('SIGINT',  async () => { await closeRenderer(); server.close() })
