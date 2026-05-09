import { type Browser, type Page, chromium } from 'playwright'

export type Render3DOpts = {
  screenshotBuffer: Buffer
  canvasWidth: number
  canvasHeight: number
  deviceColorHex: string
  backgroundHex: string
  deviceRotation?: [number, number, number]
  zoom?: number
  cameraOffsetX?: number
  cameraOffsetY?: number
}

const PORT = process.env.MOCKIT_PORT ?? '3945'
const RENDERER_URL = `http://localhost:${PORT}/mockup3d/index.html`

let _browser: Browser | null = null
let _page: Page | null = null

async function getPage(): Promise<Page> {
  if (!_browser || !_browser.isConnected()) {
    _browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  }
  if (!_page || _page.isClosed()) {
    _page = await _browser.newPage()
    await _page.goto(RENDERER_URL, { waitUntil: 'networkidle' })
    await _page.waitForFunction(() => (window as any).__rendererReady === true, { timeout: 20000 })
  }
  return _page
}

export async function renderPhone3D(opts: Render3DOpts): Promise<Buffer> {
  const page = await getPage()
  const b64 = opts.screenshotBuffer.toString('base64')

  // Detect MIME type from magic bytes
  const mime = opts.screenshotBuffer[0] === 0xff && opts.screenshotBuffer[1] === 0xd8
    ? 'image/jpeg'
    : 'image/png'

  const dataUrl: string = await page.evaluate(async (args) => {
    return (window as any).renderMockup({
      imageDataUrl: `data:${args.mime};base64,${args.b64}`,
      deviceColor: args.deviceColor,
      bgColor: args.bgColor,
      width: args.width,
      height: args.height,
      deviceRotation: args.deviceRotation,
      zoom: args.zoom,
      camera_offset_x: args.cameraOffsetX,
      camera_offset_y: args.cameraOffsetY,
    })
  }, {
    b64,
    mime,
    deviceColor: opts.deviceColorHex,
    bgColor: opts.backgroundHex,
    width: opts.canvasWidth,
    height: opts.canvasHeight,
    deviceRotation: opts.deviceRotation ?? [0, 0, 0],
    zoom: opts.zoom ?? 1,
    cameraOffsetX: opts.cameraOffsetX ?? 0,
    cameraOffsetY: opts.cameraOffsetY ?? 0,
  })

  const pngB64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  return Buffer.from(pngB64, 'base64')
}

export async function closeRenderer(): Promise<void> {
  await _browser?.close()
  _browser = null
  _page = null
}
