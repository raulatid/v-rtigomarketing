// Turning the hint into a mask, and the mask into points.
//
// The only part of this feature that needs a canvas, kept as thin as it can be
// so that everything provable lives next door in `sampleInk.ts` instead. jsdom
// has no 2D context — `createBrandAtlas.test.ts` already lives with that, and
// PROJECT_MEMORY §11.57 records what stubbing one costs: its fake `measureText`
// returned `text.length * 40` and hid a real shipped bug for weeks. So there is
// no unit test of this file on purpose, and the parts worth proving were moved
// out of it rather than faked.
//
// ## FILL, not stroke
//
// The tempting move is `strokeText`, on the theory that an outline is already a
// skeleton. It is not: stroking outlines BOTH sides of every stem, so each
// stroke of the letter becomes two dotted lines a stem apart, and every counter
// grows a second ring inside it. At this dot spacing that reads as a doubled,
// blurred glyph.
//
// Filling and letting `sampleInk` derive its cell size from the ink gives the
// skeleton for free: the cell lands at roughly the stem width, so a one-stem
// cross-section keeps exactly one point and a fatter one — a bowl's shoulder,
// the join of a chevron — keeps two or three, which is the correct reading.
//
// ## Two regions, sampled separately
//
// The chevrons and the sentence are rasterized into one mask but sampled from
// two crops with their own budgets. A shared budget apportioned by ink would let
// a longer sentence quietly starve the glyph, and the glyph is the half that
// says which way to go.

import { HINT_CHEVRONS, HINT_CONFIG, HINT_FONT_FAMILY, HINT_SENTENCE } from './hintConfig'
import { sampleInk } from './sampleInk'

export interface HintFigure {
  /** Point positions in design px, origin at the figure's centre, +y UP. */
  points: Float32Array
  /** 0 for a chevron point, 1 for a sentence point. Drives the arrival stagger. */
  regions: Float32Array
  /**
   * Design-px extent of the INK — the sampled points' own bounding box, not the
   * canvas they were rasterized on.
   *
   * The canvas carries whatever headroom `textH` allowed for descenders, and
   * that headroom is empty on a sentence that happens not to use it. Reporting
   * it would make "32px above the bottom of the screen" mean 45px under the
   * lowest dot on a desktop and something else again once the figure is scaled
   * down — measured, exactly that. The bbox makes the gap mean what it says.
   */
  width: number
  height: number
}

/**
 * Rasterizes the hint and samples it. Returns null when there is no 2D context
 * to draw into — a hint that cannot be built must read as absent rather than as
 * an empty figure.
 *
 * `coarse` picks the sentence, and it is a parameter rather than a media query
 * read in here so the caller owns when that question is asked.
 */
export function buildHintFigure(coarse: boolean): HintFigure | null {
  const fig = HINT_CONFIG.figure
  const scale = fig.rasterScale
  const sentence = coarse ? HINT_SENTENCE.coarse : HINT_SENTENCE.fine

  const measurer = document.createElement('canvas').getContext('2d')
  if (!measurer) return null

  const font = `${fig.fontWeight} ${fig.fontPx * scale}px ${HINT_FONT_FAMILY}`
  measurer.font = font
  // MEASURED, never assumed. The resolved face differs per platform because the
  // stack is `system-ui` (see HINT_FONT_FAMILY), so a hardcoded advance width
  // would be wrong on every machine but the one it was written on.
  const textWidth = measurer.measureText(sentence).width

  const chevronScale = (fig.chevronWidthPx * scale) / HINT_CHEVRONS.box.width
  const chevronW = fig.chevronWidthPx * scale
  const chevronH = HINT_CHEVRONS.box.height * chevronScale
  const gap = fig.gapPx * scale
  // A little headroom below the baseline for descenders, which `measureText`'s
  // width says nothing about.
  const textH = fig.fontPx * scale * 1.3

  const width = Math.ceil(Math.max(textWidth, chevronW))
  const height = Math.ceil(chevronH + gap + textH)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  // The chevrons, from the authored path data. `Path2D` takes SVG path strings
  // verbatim, so this is the same drawing the Murcia chip renders rather than a
  // second one that would drift away from it.
  ctx.save()
  ctx.translate((width - chevronW) / 2, 0)
  ctx.scale(chevronScale, chevronScale)
  ctx.translate(-HINT_CHEVRONS.box.x, -HINT_CHEVRONS.box.y)
  ctx.strokeStyle = '#fff'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = HINT_CHEVRONS.strokeWidth
  for (const path of HINT_CHEVRONS.paths) ctx.stroke(new Path2D(path))
  ctx.restore()

  // The sentence. Filled — see the header.
  ctx.fillStyle = '#fff'
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(sentence, width / 2, chevronH + gap)

  const alpha = alphaOf(ctx, width, height)
  const glyphRows = Math.ceil(chevronH + gap * 0.5)

  // Two crops of the one mask, each sampled with its own budget. Different
  // seeds so the glyph and the sentence do not land in the same relative places
  // and share a visible rhythm.
  const glyph = sampleInk(crop(alpha, width, 0, glyphRows), fig.glyphCount, 0)
  const text = sampleInk(
    crop(alpha, width, glyphRows, height - glyphRows),
    fig.textCount,
    11,
  )

  const total = glyph.length / 2 + text.length / 2
  const points = new Float32Array(total * 2)
  const regions = new Float32Array(total)

  // Design px, centred, y flipped: the mask grows downward and the scene's +y
  // is up, and doing it here means nothing downstream has to remember.
  const put = (src: Float32Array, rowOffset: number, region: number, at: number): number => {
    for (let i = 0; i < src.length; i += 2) {
      const index = at + i / 2
      points[index * 2] = (src[i]! - width / 2) / scale
      points[index * 2 + 1] = -(src[i + 1]! + rowOffset - height / 2) / scale
      regions[index] = region
    }
    return at + src.length / 2
  }

  const after = put(glyph, 0, 0, 0)
  put(text, glyphRows, 1, after)

  // Re-centre on the ink rather than on the canvas, so the caller can place the
  // figure by its own edges. Everything above worked in canvas coordinates
  // because that is what the sampler returns; this is the one conversion.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]!
    const y = points[i + 1]!
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (!Number.isFinite(minX)) return null

  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  for (let i = 0; i < points.length; i += 2) {
    points[i] = points[i]! - cx
    points[i + 1] = points[i + 1]! - cy
  }

  return { points, regions, width: maxX - minX, height: maxY - minY }
}

function alphaOf(ctx: CanvasRenderingContext2D, width: number, height: number): Uint8Array {
  const { data } = ctx.getImageData(0, 0, width, height)
  const alpha = new Uint8Array(width * height)
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = data[i * 4 + 3]!
  return alpha
}

/** A horizontal band of the mask, as a mask in its own right. */
function crop(alpha: Uint8Array, width: number, top: number, rows: number) {
  return {
    alpha: alpha.subarray(top * width, (top + rows) * width),
    width,
    height: rows,
  }
}
