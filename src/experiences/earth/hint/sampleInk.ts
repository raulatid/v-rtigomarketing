// Picking N evenly-spread points out of a rasterized shape.
//
// This is the half of the particle hint that decides whether the sentence reads
// as words or as a smear, and it is deliberately pure: a plain alpha array in,
// pixel coordinates out. No canvas, no three, no DOM — so the property that
// actually matters (are the points ON the ink and EVENLY along it) is provable
// in Node, the way `hoverTutorial.ts` is provable next to `createHoverCue.ts`.
//
// ## Why a grid, and not a stride
//
// The obvious sampler collects every ink pixel into a list and takes every
// k-th one. That list is row-major, so "every k-th" walks the shape in scan
// order: on a line of text it spends its budget across the tops of the letters
// before it reaches their middles, and the result is combed rather than even.
//
// So the sampler buckets ink into square cells and takes ONE point per cell,
// round-robin, in a shuffled cell order. Cells are sized so that the number of
// occupied ones lands near the number of points asked for, which makes "one
// per cell" the common case and the spacing roughly uniform — a cheap
// blue-noise approximation with no rejection loop and no randomness.
//
// ## Determinism is a requirement, not a nicety
//
// Nothing here calls `Math.random`. The repo bans it (`fibonacciSphere.ts`,
// `createHoverCue.ts`) because e2e screenshot baselines diff against a seeded
// field; a sampler that reshuffled per load would make every capture of this
// hint a new image. The shuffle is a golden-ratio sort, which is a permutation
// rather than a hash — no collisions to resolve, and the same order every time.

/**
 * Below this, a pixel is antialiasing rather than ink.
 *
 * Matches `createBrandAtlas.inkBounds`, which measures the same kind of mask
 * for the same reason. A stroked glyph is mostly soft edge, and sampling the
 * edge places points in the haze AROUND a letter instead of on it.
 */
export const ALPHA_FLOOR = 8

/** The irrational whose fractional multiples spread most evenly over 0..1. */
const GOLDEN_RATIO = 0.6180339887

export interface InkMask {
  /** Alpha per pixel, row-major, length `width * height`. */
  alpha: Uint8Array
  width: number
  /**
   * Rows. Carried for the caller's sake — a crop of a larger mask has to say how
   * tall it is — though the sampler itself only ever needs the stride, since the
   * alpha array's own length bounds the scan.
   */
  height: number
}

/**
 * `count` points spread over the mask's ink, as `[x, y]` pixel CENTRES.
 *
 * Returns an empty array when the mask holds no ink — a figure that failed to
 * rasterize must read as absent, and points defaulting to the origin would draw
 * a bright knot in the corner of the frame instead of nothing.
 *
 * When there is less ink than the budget the cells are revisited, so the caller
 * always receives the `count` it asked for: the geometry is allocated once at a
 * fixed size and cannot be short a position.
 *
 * `seed` shifts the cell order. Two regions of one figure sampled with
 * different seeds do not land in the same relative places, which stops the
 * glyph and the sentence sharing a visible rhythm.
 */
export function sampleInk(mask: InkMask, count: number, seed = 0): Float32Array {
  if (count <= 0) return new Float32Array(0)

  const { alpha, width } = mask

  // Ink first: the cell size is derived from how much there is, so it cannot be
  // guessed before the mask has been read.
  const ink: number[] = []
  for (let i = 0; i < alpha.length; i += 1) if (alpha[i]! >= ALPHA_FLOOR) ink.push(i)
  if (ink.length === 0) return new Float32Array(0)

  // Aim for one occupied cell per point. Ink is a thin stroke, so its area in
  // pixels divided by the budget is the area each point should own, and the
  // cell is that square. Floored at 1 — a cell smaller than a pixel is just the
  // pixel, and the round-robin below still spreads them.
  const cellSize = Math.max(1, Math.floor(Math.sqrt(ink.length / count)))
  const cols = Math.ceil(width / cellSize)

  const cells = new Map<number, number[]>()
  for (const index of ink) {
    const x = index % width
    const y = (index - x) / width
    const key = Math.floor(y / cellSize) * cols + Math.floor(x / cellSize)
    const bucket = cells.get(key)
    if (bucket) bucket.push(index)
    else cells.set(key, [index])
  }

  // Insertion order is raster order, which is exactly the bias the cells exist
  // to remove — so walk them in a golden-ratio permutation instead. Sorting a
  // key rather than hashing an index means every cell appears exactly once.
  const order = [...cells.values()]
  const rank = new Map<number[], number>()
  order.forEach((bucket, i) => rank.set(bucket, frac((i + 1 + seed) * GOLDEN_RATIO)))
  order.sort((a, b) => rank.get(a)! - rank.get(b)!)

  const out = new Float32Array(count * 2)
  for (let i = 0; i < count; i += 1) {
    const bucket = order[i % order.length]!
    // Which pass this is over the cells. Past the first, a cell hands back a
    // different one of its pixels rather than repeating the first — so a mask
    // with less ink than the budget still spreads before it doubles up.
    const pass = Math.floor(i / order.length)
    const index = bucket[Math.floor(frac((pass + 1) * GOLDEN_RATIO) * bucket.length)]!
    const x = index % width
    out[i * 2] = x + 0.5
    out[i * 2 + 1] = (index - x) / width + 0.5
  }

  return out
}

function frac(value: number): number {
  return value - Math.floor(value)
}
