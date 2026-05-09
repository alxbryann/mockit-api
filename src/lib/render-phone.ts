import sharp from 'sharp'

export type RenderPhoneOpts = {
  screenshot: Buffer
  canvasWidth: number
  canvasHeight: number
  deviceColorHex: string
  backgroundHex: string
}

function hexToRgba(cssHex: string, alpha = 1): { r: number; g: number; b: number; alpha: number } {
  const raw = cssHex.trim()
  let h = raw.startsWith('#') ? raw.slice(1) : raw
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  const n = parseInt(h, 16)
  if (h.length !== 6 || Number.isNaN(n)) throw new Error(`Invalid hex color: ${cssHex}`)
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
    alpha,
  }
}

function escapeSvgHex(cssHex: string): string {
  const raw = cssHex.trim()
  if (!/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(raw)) throw new Error(`Invalid hex for SVG: ${cssHex}`)
  return raw.toLowerCase()
}

const BODY_H_OVER_W = 19.8 / 9

/** 2D phone bezel mockup — Sharp compositing only. */
export async function renderPhoneMockupPNG(opts: RenderPhoneOpts): Promise<Buffer> {
  const W = opts.canvasWidth
  const H = opts.canvasHeight
  if (W < 320 || H < 320) throw new Error('canvas dimensions must be at least 320px')
  if (W > 8192 || H > 8192) throw new Error('canvas dimensions must be ≤ 8192px')

  const bg = hexToRgba(opts.backgroundHex)

  let pw = Math.round(Math.min(W * 0.78, H * 0.44))
  let ph = Math.round(pw * BODY_H_OVER_W)
  while (ph + 40 > H && pw > 200) {
    pw -= 16
    ph = Math.round(pw * BODY_H_OVER_W)
  }
  while (pw + 40 > W && pw > 200) {
    pw -= 16
    ph = Math.round(pw * BODY_H_OVER_W)
  }

  const left = Math.floor((W - pw) / 2)
  const top = Math.floor((H - ph) / 2)
  const bezel = Math.max(Math.round(pw * 0.032), 4)
  const screenW = Math.max(pw - bezel * 2, 44)
  const screenH = Math.max(ph - bezel * 2, 80)
  const outerRx = Math.round(pw * 0.118)
  const screenRx = Math.max(outerRx - Math.max(4, Math.round(bezel * 0.45)), 6)

  const deviceFill = escapeSvgHex(opts.deviceColorHex)

  const bodySvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}">
<rect fill="${deviceFill}" width="100%" height="100%" rx="${outerRx}" ry="${outerRx}"/></svg>`,
    'utf8',
  )

  const bodyBuf = await sharp(bodySvg).png().toBuffer()

  const maskSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${screenW}" height="${screenH}">
<rect x="0" y="0" width="${screenW}" height="${screenH}" rx="${screenRx}" ry="${screenRx}"/></svg>`,
    'utf8',
  )

  const screenBase = await sharp(opts.screenshot)
    .resize(screenW, screenH, { fit: 'cover', position: 'centre' })
    .ensureAlpha()
    .png()
    .toBuffer()

  const screenRounded = await sharp(screenBase)
    .composite([{ input: maskSvg, blend: 'dest-in' as const }])
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: bg,
    },
  })
    .composite([
      { input: bodyBuf, left, top },
      { input: screenRounded, left: left + bezel, top: top + bezel },
    ])
    .png()
    .toBuffer()
}
