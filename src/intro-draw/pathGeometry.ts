// The isotype's paths as point tables, with no DOM in them.
//
// The SVG drawing asks the browser (getTotalLength / getPointAtLength), which a
// worker cannot do: there is no SVG geometry off the main thread. The two paths
// in isotype.ts use absolute M, L, C and Z only, so this reads exactly that and
// refuses anything else rather than drawing a wrong mark.

export interface PathSampler {
  readonly length: number
  /** The point at fraction `t` of the path's length, 0..1. */
  at(t: number): { x: number; y: number }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

// Chords per cubic. The longest curve here is ~150 units; at 32 chords the
// polyline is within a hundredth of a unit of it, far below a stroke's width.
const CHORDS = 32

/** The path as one polyline, closepaths included, the way getTotalLength counts it. */
export function flattenPath(d: string): Array<[number, number]> {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? []
  const points: Array<[number, number]> = []
  let i = 0
  let command = ''
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  const num = () => {
    const v = Number(tokens[i++])
    if (!Number.isFinite(v)) throw new Error(`pathGeometry: bad number in path near token ${i}`)
    return v
  }
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++]
    switch (command) {
      case 'M':
        x = startX = num()
        y = startY = num()
        points.push([x, y])
        // Further pairs after a moveto are linetos.
        command = 'L'
        break
      case 'L':
        x = num()
        y = num()
        points.push([x, y])
        break
      case 'C': {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num()
        for (let k = 1; k <= CHORDS; k++) {
          const t = k / CHORDS
          const u = 1 - t
          points.push([
            u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
          ])
        }
        x = x3
        y = y3
        break
      }
      case 'Z':
        x = startX
        y = startY
        points.push([x, y])
        command = ''
        break
      default:
        throw new Error(`pathGeometry: unsupported path command "${command}"`)
    }
  }
  return points
}

/**
 * Same table, and the same interpolation, as introDraw's DOM sampler: `samples`
 * points evenly spaced along the length.
 */
export function samplePathData(d: string, samples = 256): PathSampler {
  const points = flattenPath(d)
  const cumulative = new Float64Array(points.length)
  for (let k = 1; k < points.length; k++) {
    const [ax, ay] = points[k - 1]
    const [bx, by] = points[k]
    cumulative[k] = cumulative[k - 1] + Math.hypot(bx - ax, by - ay)
  }
  const length = cumulative[points.length - 1] ?? 0

  const xs = new Float64Array(samples + 1)
  const ys = new Float64Array(samples + 1)
  let seg = 1
  for (let s = 0; s <= samples; s++) {
    const target = (s / samples) * length
    while (seg < points.length - 1 && cumulative[seg] < target) seg++
    const span = cumulative[seg] - cumulative[seg - 1]
    const f = span > 0 ? (target - cumulative[seg - 1]) / span : 0
    const [ax, ay] = points[seg - 1] ?? points[0]
    const [bx, by] = points[seg] ?? points[0]
    xs[s] = ax + (bx - ax) * f
    ys[s] = ay + (by - ay) * f
  }

  return {
    length,
    at(t: number) {
      const u = clamp01(t) * samples
      const i = Math.floor(u)
      const j = Math.min(i + 1, samples)
      const f = u - i
      return { x: xs[i] + (xs[j] - xs[i]) * f, y: ys[i] + (ys[j] - ys[i]) * f }
    },
  }
}
