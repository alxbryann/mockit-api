import * as z from 'zod'

/** Euler XYZ (radians), tuned to match in-app sliders ~ X −36°, Y −34°, Z −16°. */
export const DEFAULT_DEVICE_ROTATION_RAD: [number, number, number] = [
  (-36 * Math.PI) / 180,
  (-34 * Math.PI) / 180,
  (-16 * Math.PI) / 180,
]

/** MCP `mockit_phone_mockup`: si no pasas `zoom`, se envía este valor a la API (el default del cuerpo HTTP sigue siendo 1). */
export const DEFAULT_MCP_PHONE_ZOOM = 0.5 as const

/** HTTP POST `/v1/mockups/phone` — only base64, no filesystem paths. */
export const phoneMockupBodySchema = z.object({
  image_base64: z.string().min(1).describe('Screenshot as base64, optional data: URL prefix'),
  canvas_width: z.number().int().min(320).max(8192).default(1440),
  canvas_height: z.number().int().min(320).max(8192).default(2880),
  device_color_hex: z.string().default('#c0b9ad'),
  background_hex: z.string().default('#0a0a0a'),
  /** Euler [x, y, z] rotation in radians (XYZ). Default matches UI −36° / −34° / −16°. */
  device_rotation: z.tuple([z.number(), z.number(), z.number()]).default(DEFAULT_DEVICE_ROTATION_RAD),
  /** Camera zoom multiplier. 1 = default, >1 = closer/tighter, <1 = further/wider. */
  zoom: z.number().min(0.3).max(3).default(1),
  /** World-space offset added to camera X before lookAt(0,0,0). Negative often matches “stock” hero angles. */
  camera_offset_x: z.number().min(-30).max(30).default(0),
  /** World-space offset added to camera Y before lookAt(0,0,0). Negative = camera lower (contrapicado). */
  camera_offset_y: z.number().min(-30).max(30).default(0),
})

export type PhoneMockupBody = z.infer<typeof phoneMockupBodySchema>

/** MCP tool args: local path or inline base64, forwarded to HTTP body. */
export const mcpPhoneToolShape = z.object({
  image_base64: z.string().optional().describe('Screenshot as raw base64 (no data: prefix needed)'),
  image_path: z.string().optional().describe('Absolute path to a local PNG/JPEG screenshot'),
  canvas_width: z.number().int().min(320).max(8192).optional().describe('Output width in px (default 1440)'),
  canvas_height: z.number().int().min(320).max(8192).optional().describe('Output height in px (default 2880)'),
  device_color_hex: z.string().optional().describe('Phone frame color hex, e.g. "#c0b9ad" (natural titanium), "#1a1a1a" (black titanium), "#f0e8df" (white)'),
  background_hex: z.string().optional().describe('Canvas background color hex, e.g. "#0a0a0a"'),
  /** Euler XYZ en radianes (mismos ejes que los sliders del viewer mockup3d). Omitir = defaults API (~ −36° / −34° / −16°). rad = ° × π/180. */
  device_rotation: z
    .tuple([z.number(), z.number(), z.number()])
    .optional()
    .describe(
      'Rotación del teléfono [rx,ry,rz] radianes orden XYZ: rx inclina frente atrás/adelante; ry gira en horizontal (qué lateral se ve); rz balanceo lateral. No es copiar una foto PSD — aquí solo mueves el modelo 3D.',
    ),
  zoom: z
    .number()
    .min(0.3)
    .max(3)
    .optional()
    .describe(
      `Campo visual del render headless (FOV): 1 = referencia API; omitir en MCP = ${DEFAULT_MCP_PHONE_ZOOM}; <1 más ancho/más fondo; >1 más cerrado. No sustituye camera_offset_* para contrapicado.`,
    ),
  camera_offset_x: z
    .number()
    .min(-30)
    .max(30)
    .optional()
    .describe(
      'Offset horizontal de la cámara antes de mirar al origen; combinar con ry para acercarse al perfil derecho/izquierdo del mockup de referencia.',
    ),
  camera_offset_y: z
    .number()
    .min(-30)
    .max(30)
    .optional()
    .describe(
      'Offset vertical de la cámara antes de mirar al origen; valores negativos (~ −3 a −5) = cámara más baja / contrapicado típico de mockups stock.',
    ),
  output_basename: z.string().max(180).optional().describe('Filename stem for the saved PNG (no extension)'),
})
