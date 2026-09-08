import { describe, expect, it } from 'vitest'
import { ALPHA_FLOOR, sampleInk } from './sampleInk'

// The sampler decides whether the hint is a sentence or a smear, and it is the
// one part of this feature that can be proved without a GPU: given a mask, does
// it place N points ON the ink and EVENLY along it. Both halves matter — a
// sampler that clusters passes "every point is on ink" and still renders an
// unreadable letter.
//
// Masks here are built by hand rather than rasterized, because jsdom has no
// canvas and because a synthetic outline is a harder case than real text: a
// one-pixel ring has nowhere to hide a clump.

const W = 64
const H = 64

/** A hollow rectangle, one pixel thick — the shape `strokeText` produces. */
function ringMask(inset = 8): Uint8Array {
  const alpha = new Uint8Array(W * H)
  for (let x = inset; x < W - inset; x += 1) {
    alpha[inset * W + x] = 255
    alpha[(H - inset - 1) * W + x] = 255
  }
  for (let y = inset; y < H - inset; y += 1) {
    alpha[y * W + inset] = 255
    alpha[y * W + (W - inset - 1)] = 255
  }
  return alpha
}

function isInk(alpha: Uint8Array, x: number, y: number): boolean {
  const px = Math.floor(x)
  const py = Math.floor(y)
  return alpha[py * W + px]! >= ALPHA_FLOOR
}

function points(out: Float32Array): Array<[number, number]> {
  const list: Array<[number, number]> = []
  for (let i = 0; i < out.length; i += 2) list.push([out[i]!, out[i + 1]!])
  return list
}

describe('sampleInk', () => {
  it('returns exactly the requested number of points', () => {
    const alpha = ringMask()
    for (const count of [1, 12, 200, 1400]) {
      expect(sampleInk({ alpha, width: W, height: H }, count).length).toBe(count * 2)
    }
  })

  it('places every point on ink', () => {
    const alpha = ringMask()
    const out = sampleInk({ alpha, width: W, height: H }, 300)
    for (const [x, y] of points(out)) expect(isInk(alpha, x, y), `${x},${y}`).toBe(true)
  })

  it('is deterministic — the same mask samples identically every time', () => {
    // Screenshot baselines depend on this, which is why the repo bans
    // `Math.random` outright rather than seeding it.
    const alpha = ringMask()
    const a = sampleInk({ alpha, width: W, height: H }, 250)
    const b = sampleInk({ alpha, width: W, height: H }, 250)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('gives a different arrangement for a different seed, on the same ink', () => {
    const alpha = ringMask()
    const a = sampleInk({ alpha, width: W, height: H }, 250, 0)
    const b = sampleInk({ alpha, width: W, height: H }, 250, 7)
    expect(Array.from(a)).not.toEqual(Array.from(b))
    for (const [x, y] of points(b)) expect(isInk(alpha, x, y)).toBe(true)
  })

  it('spreads along the whole shape rather than clustering', () => {
    // The property a naive stride over a row-major ink list FAILS: it walks the
    // top edge first and spends the budget there. Each side of the ring holds a
    // quarter of the ink, so each should hold roughly a quarter of the points.
    const alpha = ringMask()
    const out = sampleInk({ alpha, width: W, height: H }, 400)
    const mid = W / 2
    const quadrants = [0, 0, 0, 0]
    for (const [x, y] of points(out)) quadrants[(y < mid ? 0 : 2) + (x < mid ? 0 : 1)] += 1
    for (const share of quadrants) {
      expect(share).toBeGreaterThan(400 * 0.15)
      expect(share).toBeLessThan(400 * 0.35)
    }
  })

  it('keeps a hairline when a thick stem is next to it', () => {
    // THE test the grid exists for, and the one the ring above is too kind to
    // make. A letter is not an even stroke: stems are many pixels wide and
    // hairlines are one, so ink AREA is a bad proxy for how much of the shape a
    // region is. Sampling proportionally to area — which is what taking every
    // k-th pixel of a row-major list amounts to — spends everything on the stem.
    //
    // Measured on this mask: the stem holds 480 ink pixels and the hairline 48,
    // and a stride sampler gives the hairline 0 of 120 points. It disappears.
    const alpha = new Uint8Array(W * H)
    for (let y = 8; y < 56; y += 1) {
      for (let x = 6; x < 16; x += 1) alpha[y * W + x] = 255
      alpha[y * W + 48] = 255
    }

    const out = sampleInk({ alpha, width: W, height: H }, 120)
    const hairline = points(out).filter(([x]) => x >= 32).length
    expect(hairline).toBeGreaterThan(12)
  })

  it('reaches both extremes of the shape', () => {
    const alpha = ringMask()
    const out = sampleInk({ alpha, width: W, height: H }, 400)
    const xs = points(out).map(([x]) => x)
    const ys = points(out).map(([, y]) => y)
    // The ring runs 8..55 inclusive; a sampler that misses an edge would show
    // up here as a range pulled in from both ends.
    expect(Math.min(...xs)).toBeLessThan(10)
    expect(Math.max(...xs)).toBeGreaterThan(54)
    expect(Math.min(...ys)).toBeLessThan(10)
    expect(Math.max(...ys)).toBeGreaterThan(54)
  })

  it('ignores pixels below the alpha floor, so antialiasing is not ink', () => {
    // A stroked glyph is mostly soft edges. Sampling them would place points in
    // the haze around the letter rather than on it.
    const alpha = new Uint8Array(W * H)
    for (let i = 0; i < alpha.length; i += 1) alpha[i] = ALPHA_FLOOR - 1
    alpha[10 * W + 10] = 255
    alpha[10 * W + 11] = 255
    const out = sampleInk({ alpha, width: W, height: H }, 8)
    for (const [x, y] of points(out)) {
      expect(Math.floor(y)).toBe(10)
      expect(Math.floor(x)).toBeGreaterThanOrEqual(10)
      expect(Math.floor(x)).toBeLessThanOrEqual(11)
    }
  })

  it('returns nothing for a mask with no ink, rather than points at the origin', () => {
    // A figure that failed to rasterize must read as absent. Points at (0,0)
    // would draw a bright dot in the corner of the viewport instead.
    const alpha = new Uint8Array(W * H)
    expect(sampleInk({ alpha, width: W, height: H }, 100).length).toBe(0)
  })

  it('fills the whole budget when there is less ink than points asked for', () => {
    // The geometry is allocated once at a fixed count, so the sampler owes the
    // caller that many positions whatever the mask turned out to hold.
    const alpha = new Uint8Array(W * H)
    alpha[5 * W + 5] = 255
    alpha[5 * W + 6] = 255
    alpha[6 * W + 5] = 255
    const out = sampleInk({ alpha, width: W, height: H }, 30)
    expect(out.length).toBe(60)
    for (const [x, y] of points(out)) expect(isInk(alpha, x, y)).toBe(true)
  })

  it('samples pixel centres, so a point never sits on a pixel boundary', () => {
    const alpha = ringMask()
    for (const [x, y] of points(sampleInk({ alpha, width: W, height: H }, 50))) {
      expect(x % 1).toBeCloseTo(0.5, 10)
      expect(y % 1).toBeCloseTo(0.5, 10)
    }
  })

  it('asks for nothing and returns nothing', () => {
    expect(sampleInk({ alpha: ringMask(), width: W, height: H }, 0).length).toBe(0)
  })
})
