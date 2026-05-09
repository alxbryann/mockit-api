/**
 * Copied into MCP `server.instructions` and summarized in the mockit_phone_mockup tool description.
 * Goal: agents/users stop confusing “plantilla PSD” angles with what this renderer actually does.
 */
export const MOCKIT_MCP_SERVER_INSTRUCTIONS = `
Mockit MCP llama al backend HTTP (MOCKIT_API_URL). El proceso debe tener la API levantada:
  cd mockit-api && npm run build && npm run start:api
Tras cambiar el viewer 3D (repo mockup3d): npm run sync:mockup3d en mockit-api y reiniciar la API.

## Qué genera (y qué NO)
- SÍ: un iPhone 3D renderizado en Three.js con tu screenshot en la pantalla; fondo plano; sombra tipo estudio.
- NO: no incrusta tu screenshot en una foto/plantilla de marketing ajena; NO reproduce composición “texto a la izquierda, móvil a la derecha” — el teléfono va centrado en el lienzo. Eso solo en post (Figma/PS).

## Tres palancas que moldean el “ángulo tipo mockup de catálogo”
1) device_rotation [rx, ry, rz] en RADIANES, orden Euler XYZ (igual que los sliders del viewer mockup3d).
   - rx (eje X): inclina el frente del teléfono adelante/atrás (lay back vs más erguido).
   - ry (eje Y): “mesa giratoria”: qué lateral del marco se ve más.
   - rz (eje Z): balanceo lateral del dispositivo.
   Conversión: radians = degrees * Math.PI / 180.
   Si omites device_rotation, el API usa por defecto ~ X −36°, Y −34°, Z −16° (ajustado en la UI para mockups hero).

2) camera_offset_x / camera_offset_y (unidades de escena, antes de lookAt al origen):
   - camera_offset_y NEGATIVO = baja la cámara → contrapicado / mirada hacia arriba (muy típico en mockups stock).
   - camera_offset_x corrige el punto de vista en horizontal (combínalo con ry para “perfil derecho vs izquierdo”).
   Sin estos offsets la cámara queda a altura del centro del teléfono y el resultado parece más “plano” aunque ry sea correcto.

3) zoom (FOV): 1 = referencia en POST HTTP si no lo envías; en MCP, si omites zoom se usa 0.5 (más fondo). < 1 = más ancho; > 1 = más cerrado.

## Nitidez
Sube canvas_width y canvas_height (p.ej. 2880×1620 landscape o más). Entrada: PNG/JPEG del simulador lo más grande posible (@2x/@3x).

## Preset ejemplo (blanco sobre negro, hero)
device_color_hex "#f0e8df", background_hex "#000000",
device_rotation por defecto (o los radianes equivalentes a tus sliders),
zoom 0.82, camera_offset_x 2.5, camera_offset_y -4.2 — afina offsets ±1 si hace falta.

## Si el PNG ignoraba offsets de cámara
El viewer debe estar sincronizado (sync:mockup3d) y la cabecera renderMockup debe esperar a __mockitCtx; si algo falla, revisa build del viewer y reinicia la API.
`.trim()

/** Short line for registerTool description (MCP clients often show only this). */
export const MOCKIT_PHONE_TOOL_DESCRIPTION = [
  'PNG mockup 3D iPhone desde screenshot → MOCKIT_OUTPUT_DIR.',
  'NO es composición sobre plantilla PSD; el teléfono va centrado.',
  'Ángulo “hero/catálogo”: combina device_rotation (Euler XYZ rad = sliders mockup3d) + camera_offset_y negativo (contrapicado) + opcional camera_offset_x.',
  'Defaults rotación ≈ −36°/−34°/−16°. MCP sin zoom → 0.5 (HTTP sin zoom → 1). Colores marco: #f0e8df blanco, #1a1a1a negro, #c0b9ad natural.',
].join(' ')
