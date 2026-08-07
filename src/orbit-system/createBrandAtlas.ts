import * as THREE from 'three'

// One canvas texture holding all six brand plates, so the orbit panels cost a
// single texture bind instead of six. Each panel samples its own cell through a
// UV offset/scale uniform pair.
//
// The plates are DRAWN, not loaded. Two reasons, and both are deliberate:
// real trademark artwork sitting next to the invented case-study results in
// caseStudies.ts would read as a client endorsement (that file's own warning),
// and generating them keeps the atlas a build-free asset — the same reasoning
// that produced `createPlaceholderLogoTexture` for the old badges. When real
// client logos exist, this is the seam: swap the per-cell draw for a
// drawImage of the loaded SVG and keep the atlas layout untouched.

const COLUMNS = 2
const ROWS = 3
// 2:1 cells, matching the panel geometry's aspect. 1024×512 is sized for the
// case-panel close-up (closeUp.distance 0.55R), where the panel is the most
// magnified thing on screen — at 512×256 the wordmark visibly softens there.
const CELL_W = 1024
const CELL_H = 512

export interface BrandPlate {
  name: string
  brandColor: string
}

export interface BrandAtlas {
  texture: THREE.CanvasTexture
  /** UV rect for one plate, in the order the plates were passed. */
  cellUv(index: number): { offset: THREE.Vector2; scale: THREE.Vector2 }
  dispose(): void
}

function mixWithWhite(hex: string, amount: number): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const lift = (c: number) => Math.round(c + (255 - c) * amount)
  return `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`
}

// Mark + wordmark on a transparent ground. Everything is measured rather than
// hardcoded because the six names range from "Mango" to "Estrella Galicia" —
// the same problem the old badge texture hit once real brand names replaced
// "CASE 01".
function drawPlate(
  ctx: CanvasRenderingContext2D,
  plate: BrandPlate,
  originX: number,
  originY: number,
) {
  const pad = 44
  const markR = 84
  const markCx = originX + pad + markR
  const markCy = originY + CELL_H / 2

  // The mark: a filled disc carrying the initial. Stands in for a real logo.
  ctx.beginPath()
  ctx.arc(markCx, markCy, markR, 0, Math.PI * 2)
  ctx.fillStyle = plate.brandColor
  ctx.fill()

  ctx.fillStyle = '#05060a'
  ctx.font = `700 ${Math.round(markR * 1.15)}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Optical centering: cap-height glyphs sit high against a geometric centre.
  ctx.fillText(plate.name.charAt(0).toUpperCase(), markCx, markCy + markR * 0.06)

  // The wordmark, lifted toward white so saturated hues stay legible when the
  // panel is small in the overview.
  const textX = markCx + markR + 46
  const textLimit = originX + CELL_W - pad - (textX - originX)
  let fontSize = 112
  const font = (px: number) => `650 ${px}px system-ui, -apple-system, sans-serif`
  ctx.font = font(fontSize)
  const width = ctx.measureText(plate.name).width
  if (width > textLimit) {
    fontSize = Math.max(Math.floor(fontSize * (textLimit / width)), 28)
    ctx.font = font(fontSize)
  }
  ctx.textAlign = 'left'
  ctx.fillStyle = mixWithWhite(plate.brandColor, 0.42)
  ctx.fillText(plate.name, textX, markCy - fontSize * 0.16)

  // Accent rule under the wordmark, in the undiluted brand colour.
  const ruleW = Math.min(ctx.measureText(plate.name).width, textLimit)
  ctx.fillStyle = plate.brandColor
  ctx.fillRect(textX, markCy + fontSize * 0.5, ruleW, 6)
}

let cached: BrandAtlas | null = null

// Built once and shared by every panel. The plate list is fixed at first call —
// the six satellites are created in one pass, so there is no second shape to
// reconcile.
export function getBrandAtlas(plates: BrandPlate[]): BrandAtlas {
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = COLUMNS * CELL_W
  canvas.height = ROWS * CELL_H
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  plates.slice(0, COLUMNS * ROWS).forEach((plate, index) => {
    const col = index % COLUMNS
    const row = Math.floor(index / COLUMNS)
    drawPlate(ctx, plate, col * CELL_W, row * CELL_H)
  })

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  // Mipmaps carry the whole overview range, where a plate can fall to ~50px
  // tall; without them the wordmark aliases into noise as the satellite orbits.
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  // Cells sit edge to edge, so clamping stops a plate bleeding into its
  // neighbour at the highest mip levels.
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.anisotropy = 4

  cached = {
    texture,
    cellUv(index: number) {
      const col = index % COLUMNS
      const row = Math.floor(index / COLUMNS)
      return {
        // CanvasTexture keeps flipY, so row 0 (top of the canvas) is the
        // TOP of UV space — hence the inversion on v.
        offset: new THREE.Vector2(col / COLUMNS, 1 - (row + 1) / ROWS),
        scale: new THREE.Vector2(1 / COLUMNS, 1 / ROWS),
      }
    },
    dispose() {
      texture.dispose()
      cached = null
    },
  }

  return cached
}
