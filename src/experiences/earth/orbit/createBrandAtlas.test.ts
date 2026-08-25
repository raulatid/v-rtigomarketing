import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBrandAtlas, BrandPlate } from './createBrandAtlas'

// createBrandAtlas draws into a real 2D context, which neither Node nor jsdom
// provides. Rather than pull in a native canvas just to assert geometry, the
// context is recorded: every call is captured so a test can ask what was drawn
// where, and the canvas reports the size the atlas gave it.
//
// This is enough to hold the two things that actually break silently — the cell
// grid the UVs are computed against, and which plate each kind draws — without
// asserting a single pixel.
interface Recorder {
  canvases: Array<{ width: number; height: number }>
  calls: Array<{ op: string; args: unknown[] }>
}

function installCanvas(): Recorder {
  const rec: Recorder = { canvases: [], calls: [] }

  const makeContext = () =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === 'canvas') return undefined
          // Property writes (fillStyle, font, …) land in `set`; everything read
          // here is a method, and measureText has to return something usable.
          if (prop === 'measureText') {
            return (text: string) => {
              rec.calls.push({ op: 'measureText', args: [text] })
              return { width: text.length * 40 }
            }
          }
          return (...args: unknown[]) => {
            rec.calls.push({ op: prop, args })
          }
        },
        set() {
          return true
        },
      },
    ) as unknown as CanvasRenderingContext2D

  const createElement = (tag: string) => {
    if (tag !== 'canvas') throw new Error('unexpected element: ' + tag)
    const canvas = { width: 0, height: 0, getContext: () => makeContext() }
    rec.canvases.push(canvas as { width: number; height: number })
    return canvas
  }

  vi.stubGlobal('document', { createElement })
  // three's CanvasTexture only stores the element; nothing here uploads it.
  vi.stubGlobal('Image', class {})
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  return rec
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const plates: BrandPlate[] = [
  { name: 'Mango', brandColor: '#e0b33c', isotype: null, logo: null },
  { name: 'Cabify', brandColor: '#7b4dff', isotype: null, logo: null },
  { name: 'Estrella Galicia', brandColor: '#e2452f', isotype: null, logo: null },
]

describe('the isotype atlas', () => {
  it('is a grid of SQUARE cells', () => {
    const rec = installCanvas()
    const atlas = createBrandAtlas(plates, 'isotype')
    // 3 plates at 2 columns → 2 rows of 512² cells.
    expect(rec.canvases[0]).toMatchObject({ width: 1024, height: 1024 })
    expect(atlas.aspect).toBe(1)
  })

  it('draws the mark alone, never a wordmark', () => {
    const rec = installCanvas()
    createBrandAtlas(plates, 'isotype')
    const drawn = rec.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0])
    // One glyph per plate — the initial — and no company name anywhere.
    expect(drawn).toEqual(['M', 'C', 'E'])
    expect(drawn).not.toContain('Mango')
    // The accent rule under a wordmark is the lockup's, not the mark's.
    expect(rec.calls.some((c) => c.op === 'fillRect')).toBe(false)
  })

  it('centres the mark in its cell', () => {
    const rec = installCanvas()
    createBrandAtlas(plates, 'isotype')
    const arcs = rec.calls.filter((c) => c.op === 'arc')
    // First cell: centre of a 512² cell at the origin.
    expect(arcs[0].args.slice(0, 2)).toEqual([256, 256])
    // Second cell sits one column across, still vertically centred.
    expect(arcs[1].args.slice(0, 2)).toEqual([768, 256])
    // Third wraps to the next row.
    expect(arcs[2].args.slice(0, 2)).toEqual([256, 768])
  })
})

describe('the logo atlas', () => {
  it('is a grid of 2:1 cells', () => {
    const rec = installCanvas()
    const atlas = createBrandAtlas(plates, 'logo')
    expect(rec.canvases[0]).toMatchObject({ width: 2048, height: 1024 })
    expect(atlas.aspect).toBe(2)
  })

  it('draws the mark AND the wordmark', () => {
    const rec = installCanvas()
    createBrandAtlas(plates, 'logo')
    const drawn = rec.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0])
    expect(drawn).toContain('M')
    expect(drawn).toContain('Mango')
    expect(drawn).toContain('Estrella Galicia')
    // The accent rule under each wordmark.
    expect(rec.calls.filter((c) => c.op === 'fillRect')).toHaveLength(3)
  })
})

describe('addressing a cell', () => {
  it('maps square cells to the right UV rect', () => {
    installCanvas()
    const atlas = createBrandAtlas(plates, 'isotype')
    // 2 columns × 2 rows.
    expect(atlas.cellUv(0).scale.toArray()).toEqual([0.5, 0.5])
    // Row 0 is the TOP of the canvas, which is the TOP of UV space under
    // CanvasTexture's flipY — hence v = 0.5, not 0.
    expect(atlas.cellUv(0).offset.toArray()).toEqual([0, 0.5])
    expect(atlas.cellUv(1).offset.toArray()).toEqual([0.5, 0.5])
    expect(atlas.cellUv(2).offset.toArray()).toEqual([0, 0])
  })

  it('gives the two atlases the same cell index for the same plate', () => {
    installCanvas()
    const iso = createBrandAtlas(plates, 'isotype')
    const logo = createBrandAtlas(plates, 'logo')
    // The grids differ in pixels but not in layout, which is what lets one
    // `index` address a panel's pair.
    for (let i = 0; i < plates.length; i += 1) {
      expect(iso.cellUv(i).offset.toArray()).toEqual(logo.cellUv(i).offset.toArray())
      expect(iso.cellUv(i).scale.toArray()).toEqual(logo.cellUv(i).scale.toArray())
    }
  })

  it('clamps an out-of-range index to a cell that exists', () => {
    installCanvas()
    const atlas = createBrandAtlas(plates, 'isotype')
    // Negative v offsets sample outside the atlas entirely — garbage rather
    // than a visible failure, which is why this is clamped rather than thrown.
    expect(atlas.cellUv(99).offset.toArray()).toEqual([0.5, 0])
    expect(atlas.cellUv(-1).offset.toArray()).toEqual([0, 0.5])
  })
})
