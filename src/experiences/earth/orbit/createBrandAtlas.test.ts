import { afterEach, describe, expect, it, vi } from 'vitest'
import { CASE_STUDIES } from '../../../content/generated/caseStudies'
import {
  createBrandAtlas,
  BrandPlate,
  CELL,
  fitInk,
  artworkHalfHeight,
} from './createBrandAtlas'
import { EDITORIAL_BOUNDS } from '../../../content/editorialBounds'

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
    expect(rec.calls.some((c) => c.op === 'fillRect')).toBe(false)
  })

  it('draws the mark as a RING, never a filled disc', () => {
    const rec = installCanvas()
    createBrandAtlas(plates, 'isotype')
    const ops = rec.calls.map((c) => c.op)
    // A filled disc with a dark initial is the "contact avatar" placeholder
    // look. The monogram is a stroked ring, so every arc is followed by a
    // stroke and nothing in the atlas is ever filled but text.
    expect(ops.filter((op) => op === 'arc')).toHaveLength(3)
    expect(ops.filter((op) => op === 'stroke')).toHaveLength(3)
    expect(ops).not.toContain('fill')
    for (let i = 0; i < ops.length; i++) {
      if (ops[i] === 'arc') expect(ops[i + 1]).toBe('stroke')
    }
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
    // One ring per lockup, and no accent rule — the wordmark carries no
    // decoration; contrast with the brand-colour ring is what separates them.
    expect(rec.calls.filter((c) => c.op === 'stroke')).toHaveLength(3)
    expect(rec.calls.some((c) => c.op === 'fillRect')).toBe(false)
    expect(rec.calls.some((c) => c.op === 'fill')).toBe(false)
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

describe('normalising the artwork on its ink (plan 012 task 3)', () => {
  // THE BUG THIS ANSWERS: the atlas used to contain-fit the whole FILE, so a
  // supplier's baked-in transparent margin became the mark's margin. The
  // shipped PcComponentes lockup is 1300x650 with 119px of nothing above the
  // ink and 122 below, so its mark filled 49% of the cell height where a tight
  // file filled 78% — geometrically centred, optically high, and different per
  // case study because the margin is per file.
  //
  // Fitting the INK makes the extent predictable, which is what lets one
  // clearance from the emitter line hold for every brand (orbitConfig.test.ts
  // asserts that half).
  // These cases are the aspect ratios the client's real assets will bring; the
  // repository has exactly one logo today, so nothing else exercises them.

  const LOGO_BOX = { w: CELL.logo.width - CELL.logo.padX * 2, h: CELL.logo.height - CELL.logo.padY * 2 }

  it('fills the box in exactly one axis, whatever the ink aspect', () => {
    // Contain means touching on the binding axis and short on the other. A fit
    // that touched neither would be leaving the mark smaller than it can be;
    // one that exceeded either would be cropping a trademark.
    for (const [label, w, h] of [
      ['square', 500, 500],
      ['wide 2:1', 1000, 500],
      ['very wide 4:1', 2000, 500],
      ['the shipped lockup 2.86:1', 1171, 409],
      ['portrait', 400, 900],
      ['tiny', 40, 20],
    ] as Array<[string, number, number]>) {
      const fit = fitInk({ width: w, height: h }, LOGO_BOX.w, LOGO_BOX.h)
      expect(fit.w, label).toBeLessThanOrEqual(LOGO_BOX.w + 1e-9)
      expect(fit.h, label).toBeLessThanOrEqual(LOGO_BOX.h + 1e-9)
      const touchesW = Math.abs(fit.w - LOGO_BOX.w) < 1e-9
      const touchesH = Math.abs(fit.h - LOGO_BOX.h) < 1e-9
      expect(touchesW || touchesH, label).toBe(true)
    }
  })

  it('never distorts the mark', () => {
    // The one thing a logo may never survive. Asserted separately from the fit
    // because a future "fill the cell" change would still pass the bounds above.
    for (const [w, h] of [[1000, 500], [500, 500], [1171, 409], [400, 900]]) {
      const fit = fitInk({ width: w, height: h }, LOGO_BOX.w, LOGO_BOX.h)
      expect(fit.w / fit.h).toBeCloseTo(w / h, 9)
    }
  })

  it('sizes the mark by its ink, not by the canvas around it', () => {
    // The regression, stated as the comparison that actually shows it: one
    // trademark, delivered twice — trimmed, and inside the shipped 1300x650
    // canvas with 18% transparent padding. Fitting the INK gives both the same
    // mark. Fitting the FILE, which is what this module did until 2026-09-04,
    // gives the padded delivery a visibly smaller one.
    const ink = { width: 1171, height: 409 }
    const paddedFile = { width: 1300, height: 650 }

    const byInk = fitInk(ink, LOGO_BOX.w, LOGO_BOX.h)
    const byFile = fitInk(paddedFile, LOGO_BOX.w, LOGO_BOX.h)
    // What the mark itself measures once the file's own margins are scaled with
    // it — the number a person actually sees.
    const markHeightByFile = byFile.h * (ink.height / paddedFile.height)

    expect(byInk.h).toBeGreaterThan(markHeightByFile)
    // Not a rounding difference: the old path drew this mark a third smaller.
    expect(markHeightByFile / byInk.h).toBeLessThan(0.8)
  })

  it('keeps both cells clear of the emitter line by construction', () => {
    // PAD_Y is no longer derived from anything — the rail it was derived from
    // went on 2026-09-07 — so this is the bound it is now held to: the field's
    // lower edge at 0.5 pane heights, where the emitter line and its wash sit,
    // less the 0.10 clearance PAD_Y's note derives. orbitConfig.test.ts asserts
    // the same clearance from the panel's side.
    const FIELD_EDGE = 0.5
    const CLEARANCE = 0.1
    for (const kind of ['logo', 'isotype'] as const) {
      expect(artworkHalfHeight(kind), kind).toBeLessThan(FIELD_EDGE - CLEARANCE)
    }
  })

  it('is the box the Studio and the content build judge artwork against', () => {
    // THIS module owns the cells and their padding. The other two tiers cannot
    // read it — the Studio is a separate npm package and `checks/architecture.ts`
    // §1b forbids `content/` importing an experience — so they read a restated
    // copy in `editorialBounds.ts`, and this is what stops that copy drifting.
    //
    // It drifted once, for a fortnight: `PAD_Y` was unified at 72 and both tiers
    // went on advising against a 432×432 isotype box and a 900×400 logo one. An
    // editor was told their artwork was too small for a hole that did not exist.
    for (const kind of ['isotype', 'logo'] as const) {
      const cell = CELL[kind]
      expect(EDITORIAL_BOUNDS.caseStudy.brandMarkBox[kind], kind).toEqual({
        width: cell.width - cell.padX * 2,
        height: cell.height - cell.padY * 2,
      })
    }
  })
})

/**
 * The one thing about this module that an EDITOR can change.
 *
 * Everything else here is geometry a developer chose. The number of rows is not:
 * it is `ceil(caseStudies / 2)`, so the atlases grow with the CMS. Two atlases
 * are uploaded, both RGBA8 with a mip chain, and they are resident the whole
 * time the overview is — which is most of a visit.
 *
 * At the six case studies committed today that is 3 rows: 1024x1536 and
 * 2048x1536, about 25 MB together. The ceiling below is roughly twice that, so
 * the client can add case studies without a developer, and a build that would
 * put 50 MB of atlas on a phone stops instead. When it fires the fix is a
 * smaller cell or a compressed upload, not a bigger number — the iOS budget it
 * is measured against is ~226 MB for EVERYTHING
 * (docs/audits/ios-safari-2026-08-14.md §3).
 */
describe('what the CMS can grow', () => {
  /** RGBA8 plus a full mip chain is 4/3 of the base level. Decimal MB. */
  const vram = (w: number, h: number) => (w * h * 4 * 4) / 3 / 1e6

  const CEILING_MB = 50

  it('keeps both atlases under a ceiling at the committed case-study count', () => {
    const real: BrandPlate[] = CASE_STUDIES.map((_, i) => ({
      name: 'Caso ' + i,
      brandColor: '#ffffff',
      isotype: null,
      logo: null,
    }))

    const rec = installCanvas()
    createBrandAtlas(real, 'isotype')
    createBrandAtlas(real, 'logo')

    const total = rec.canvases.reduce((sum, c) => sum + vram(c.width, c.height), 0)
    expect(
      total,
      `${CASE_STUDIES.length} case studies produce ${total.toFixed(1)} MB of brand atlas ` +
        `(${rec.canvases.map((c) => `${c.width}x${c.height}`).join(', ')}), over the ` +
        `${CEILING_MB} MB ceiling. This grows with the CMS, so the fix is a smaller cell ` +
        'or a compressed upload — see the note above this test.',
    ).toBeLessThanOrEqual(CEILING_MB)
  })

  it('grows exactly one row every two case studies, which is why the ceiling exists', () => {
    const atlasHeight = (count: number) => {
      const rec = installCanvas()
      createBrandAtlas(
        Array.from({ length: count }, (_, i) => ({
          name: 'C' + i,
          brandColor: '#ffffff',
          isotype: null,
          logo: null,
        })),
        'isotype',
      )
      return rec.canvases[0].height
    }
    expect(atlasHeight(6)).toBe(CELL.isotype.height * 3)
    expect(atlasHeight(7)).toBe(CELL.isotype.height * 4)
  })
})
