import { describe, expect, it } from 'vitest'
import {
  nearestVariant,
  parsePreviewManifest,
  platePageSvg,
  restingTextureSize,
  textureSize,
} from './pageImage'
import type { PreviewVariant } from './pageImage'

// The two routes to the panel's texture, tested where they can be: the selection
// and the plate are arithmetic and strings, and neither needs a canvas. What is
// deliberately NOT tested here is the drawing — a 2D context is a browser
// capability, and asserting it in jsdom would be asserting a stub.

const CAPTURED: readonly PreviewVariant[] = [
  { src: '/generated/blog-preview-1400x880-aaaaaaaa.webp', width: 1400, height: 880 },
  { src: '/generated/blog-preview-820x1000-bbbbbbbb.webp', width: 820, height: 1000 },
  { src: '/generated/blog-preview-390x844-cccccccc.webp', width: 390, height: 844 },
]

describe('choosing a captured variant', () => {
  it('picks the nearest shape, not the nearest size', () => {
    // A 4K desktop and a 1400px one want the same capture: the panel cover-fits it,
    // so shape is the only thing that decides how much gets cropped.
    expect(nearestVariant(CAPTURED, 3840, 2160)?.width).toBe(1400)
    expect(nearestVariant(CAPTURED, 1400, 880)?.width).toBe(1400)
    expect(nearestVariant(CAPTURED, 390, 844)?.width).toBe(390)
    expect(nearestVariant(CAPTURED, 820, 1000)?.width).toBe(820)
  })

  it('measures in log space, so equal ratios either side count equally', () => {
    // Comparing raw ratios makes the wide end look further away than it is and
    // biases every choice toward the narrowest capture. Two shapes the same factor
    // apart from a capture must therefore be equidistant from it.
    const target = CAPTURED[1] // 0.82
    const ratio = target.width / target.height
    const wider = { width: ratio * 1.3 * 1000, height: 1000 }
    const taller = { width: (ratio / 1.3) * 1000, height: 1000 }

    const distance = (v: { width: number; height: number }): number =>
      Math.abs(Math.log(target.width / target.height) - Math.log(v.width / v.height))

    expect(distance(wider)).toBeCloseTo(distance(taller), 12)
  })

  it('always returns something when there is anything to return', () => {
    // No tolerance gate, deliberately: the worst outcome is a modestly cropped
    // page, and a threshold nobody can pick well would silently send common window
    // shapes to the plate instead.
    expect(nearestVariant(CAPTURED, 10000, 1)).not.toBeNull()
    expect(nearestVariant(CAPTURED, 1, 10000)).not.toBeNull()
  })

  it('returns null only when there is nothing usable', () => {
    expect(nearestVariant([], 1400, 880)).toBeNull()
    expect(
      nearestVariant([{ src: 'x', width: 0, height: 10 } as PreviewVariant], 1400, 880),
    ).toBeNull()
  })
})

describe('reading the manifest', () => {
  it('accepts what the build writes', () => {
    expect(parsePreviewManifest({ variants: CAPTURED })).toHaveLength(3)
  })

  it('falls to the plate for every kind of no', () => {
    // Each of these is a real state of a deploy: no capture, a truncated write, a
    // hand-edited file, a proxy answering JSON that is not ours. None may throw —
    // the panel simply wears its plate.
    for (const value of [
      null,
      undefined,
      'not json at all',
      42,
      {},
      { variants: null },
      { variants: 'nope' },
      { variants: [] },
      { variants: [{ src: '', width: 100, height: 100 }] },
      { variants: [{ src: 'x', width: 0, height: 100 }] },
      { variants: [{ src: 'x', width: 100, height: Number.NaN }] },
      { variants: [{ width: 100, height: 100 }] },
    ]) {
      expect(parsePreviewManifest(value), JSON.stringify(value) ?? 'undefined').toBeNull()
    }
  })

  it('keeps the usable rows out of a partly broken manifest', () => {
    const parsed = parsePreviewManifest({
      variants: [{ src: 'x', width: 0, height: 10 }, CAPTURED[0]],
    })
    expect(parsed).toHaveLength(1)
    expect(parsed?.[0]?.src).toBe(CAPTURED[0].src)
  })
})

describe('the texture size', () => {
  it('doubles the layout size on a 2x screen, because that is what the capture does too', () => {
    expect(textureSize(1400, 880, 2)).toEqual({ width: 2800, height: 1760 })
  })

  it('follows the pixel ratio down to 1x and stops at 2x, as the renderer does', () => {
    // At 1x a 2x page is detail the canvas never draws, uploaded on every approach.
    expect(textureSize(1920, 1080, 1)).toEqual({ width: 1920, height: 1080 })
    expect(textureSize(1440, 900, 1.5)).toEqual({ width: 2160, height: 1350 })
    expect(textureSize(390, 844, 3)).toEqual({ width: 780, height: 1688 })
    expect(textureSize(1920, 1080, 0.8)).toEqual({ width: 1920, height: 1080 })
  })

  it('stops at a side any GL will accept', () => {
    // Chrome's floor is 4096 and the panel is sampled 1:1 for one frame; a texture
    // the driver refuses is a blank page at the moment the page must be there.
    const size = textureSize(3000, 2000, 2)
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(4096)
    // And the aspect survives the clamp to within a rounded pixel, because the
    // panel's shape is solved from the same numbers.
    expect(size.width / size.height).toBeCloseTo(3000 / 2000, 3)
  })
})

describe('the resting texture size', () => {
  it('shrinks a desktop page to 2048 on its long side, keeping its shape', () => {
    // 1920x1080 lays out to 3840x2160: ~44 MiB with mips for a panel in the distance.
    const size = restingTextureSize(3840, 2160)
    expect(size).toEqual({ width: 2048, height: 1152 })
    expect(size.width / size.height).toBeCloseTo(3840 / 2160, 3)
  })

  it('leaves a page that is already small enough alone', () => {
    // A phone's page, so it wears one canvas and never swaps.
    expect(restingTextureSize(780, 1688)).toEqual({ width: 780, height: 1688 })
  })
})

describe('the neutral plate', () => {
  it('takes the requested shape, so the panel is never stretched', () => {
    expect(platePageSvg(1400, 880)).toContain('width="1400" height="880"')
    expect(platePageSvg(390, 844)).toContain('viewBox="0 0 390 844"')
  })

  it('is paper with a header bar and carries no blog content whatsoever', () => {
    // The point of this route: it cannot go stale, because there is nothing in it
    // that could be out of date. If a future change puts a headline or a topic in
    // here, that claim stops being true and this test should stop passing.
    const svg = platePageSvg(1400, 880)
    expect(svg).toContain('#fbfbfa')
    expect(svg).toContain('#0b0b0d')
    expect(svg).not.toMatch(/<text|<foreignObject|<image/)
    expect(svg.match(/<rect/g)).toHaveLength(2)
  })

  it('never draws a bar taller than the page it is on', () => {
    // A panel is asked for the viewport's shape, and a landscape phone is 390 tall.
    expect(platePageSvg(844, 40)).toContain('height="40" fill="#0b0b0d"')
  })

  it('is well-formed enough to be decoded as an image', () => {
    // It travels as a data URI into an `<img>`, which parses it as XML: an unclosed
    // tag or a missing namespace is a silent decode rejection, not an error.
    const svg = platePageSvg(800, 600)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).not.toContain('&')
  })
})
