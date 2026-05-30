import { type Browser, type Page, chromium } from 'playwright'
import sharp from 'sharp'

export type DeviceRenderConfig = {
  kind?: 'phone' | 'mac'
  screenshotBuffer: Buffer
  deviceColorHex?: string
  deviceRotation?: [number, number, number]
  positionX?: number
  positionY?: number
}

export type Render3DOpts = {
  screenshotBuffer?: Buffer
  canvasWidth: number
  canvasHeight: number
  deviceColorHex: string
  backgroundHex: string
  deviceRotation?: [number, number, number]
  zoom?: number
  cameraOffsetX?: number
  cameraOffsetY?: number
  cameraRoll?: number
  transparent?: boolean
  devices?: DeviceRenderConfig[]
}

const PORT = process.env.MOCKIT_PORT ?? '3945'
const RENDERER_URL = `http://localhost:${PORT}/mockup3d/index.html?studio=1`

let _browser: Browser | null = null
let _page: Page | null = null

async function getPage(): Promise<Page> {
  if (!_browser || !_browser.isConnected()) {
    _browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--enable-features=Vulkan,UseSkiaRenderer',
      ],
    })
  }
  if (!_page || _page.isClosed()) {
    _page = await _browser.newPage({ deviceScaleFactor: 2 })
    _page.on('console', msg => console.log(`[browser] ${msg.type()}: ${msg.text()}`))
    _page.on('pageerror', err => console.error(`[browser error] ${err.message}`))
    await _page.goto(RENDERER_URL, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await _page.waitForFunction(() => (window as any).__rendererReady === true, { timeout: 30000 })
  }
  return _page
}

function bufferToDataUrl(buf: Buffer): string {
  const mime = buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : 'image/png'
  return `data:${mime};base64,${buf.toString('base64')}`
}

type RenderOnceArgs = {
  bgColor: string
  width: number
  height: number
  zoom: number
  cameraOffsetX: number
  cameraOffsetY: number
  cameraRoll: number
}

async function renderOnce(page: Page, devices: object[], args: RenderOnceArgs): Promise<Buffer> {
  page.setDefaultTimeout(60000)
  const dataUrl: string = await page.evaluate(async (a) => {
    return (window as any).renderMockup({
      devices: a.devices,
      bgColor: a.bgColor,
      width: a.width,
      height: a.height,
      zoom: a.zoom,
      camera_offset_x: a.cameraOffsetX,
      camera_offset_y: a.cameraOffsetY,
      camera_roll: a.cameraRoll,
    })
  }, { devices, ...args })
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  return Buffer.from(b64, 'base64')
}

/** Black+white double-render alpha extraction — guarantees correct transparent PNG. */
async function makeTransparent(blackPng: Buffer, whitePng: Buffer): Promise<Buffer> {
  const [{ data: bD, info }, { data: wD }] = await Promise.all([
    sharp(blackPng).raw().toBuffer({ resolveWithObject: true }),
    sharp(whitePng).raw().toBuffer({ resolveWithObject: true }),
  ])
  const { width, height, channels } = info
  const rgba = Buffer.alloc(width * height * 4)

  for (let i = 0; i < width * height; i++) {
    const si = i * channels
    const bR = bD[si], bG = bD[si + 1], bB = bD[si + 2]
    const wR = wD[si], wG = wD[si + 1], wB = wD[si + 2]

    // alpha = 1 – (white – black)/255 per channel; take the maximum across channels
    const alpha = Math.max(0, Math.min(255, Math.round(Math.max(
      255 - (wR - bR),
      255 - (wG - bG),
      255 - (wB - bB),
    ))))

    const a = alpha / 255
    rgba[i * 4]     = a > 0 ? Math.min(255, Math.round(bR / a)) : 0
    rgba[i * 4 + 1] = a > 0 ? Math.min(255, Math.round(bG / a)) : 0
    rgba[i * 4 + 2] = a > 0 ? Math.min(255, Math.round(bB / a)) : 0
    rgba[i * 4 + 3] = alpha
  }

  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

export async function renderPhone3D(opts: Render3DOpts): Promise<Buffer> {
  const page = await getPage()

  const devicesPayload =
    opts.devices && opts.devices.length > 0
      ? opts.devices.map((d) => ({
          kind: d.kind ?? 'phone',
          imageDataUrl: bufferToDataUrl(d.screenshotBuffer),
          deviceColor: d.deviceColorHex,
          deviceRotation: d.deviceRotation,
          positionX: d.positionX,
          positionY: d.positionY,
        }))
      : opts.screenshotBuffer
      ? [{
          kind: 'phone' as const,
          imageDataUrl: bufferToDataUrl(opts.screenshotBuffer),
          deviceColor: opts.deviceColorHex,
          deviceRotation: opts.deviceRotation,
        }]
      : []

  if (devicesPayload.length === 0) {
    throw new Error('renderPhone3D requires either `screenshotBuffer` or a non-empty `devices` array')
  }

  const baseArgs: RenderOnceArgs = {
    bgColor: opts.backgroundHex,
    width: opts.canvasWidth,
    height: opts.canvasHeight,
    zoom: opts.zoom ?? 1,
    cameraOffsetX: opts.cameraOffsetX ?? 0,
    cameraOffsetY: opts.cameraOffsetY ?? 0,
    cameraRoll: opts.cameraRoll ?? 0,
  }

  if (opts.transparent) {
    // Render on black then white — compute true alpha from the difference
    const blackPng = await renderOnce(page, devicesPayload, { ...baseArgs, bgColor: '#000000' })
    const whitePng = await renderOnce(page, devicesPayload, { ...baseArgs, bgColor: '#ffffff' })
    return makeTransparent(blackPng, whitePng)
  }

  return renderOnce(page, devicesPayload, baseArgs)
}

export async function closeRenderer(): Promise<void> {
  await _browser?.close()
  _browser = null
  _page = null
}
