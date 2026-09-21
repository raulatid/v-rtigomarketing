/**
 * Format and geometry rules for a case study's two brand marks.
 *
 * ── Why the Studio checks this at all ──
 * The artwork is drawn into a shared WebGL atlas whose cells are a fixed size,
 * and `drawLogoContained` in `createBrandAtlas.ts` CONTAIN-fits whatever arrives:
 * a wrong image never breaks the page, it just draws small, soft, or — for a
 * format without an alpha channel — as an opaque rectangle on the dark glass.
 * Quiet wrongness is the expensive kind, so an editor is told at the field,
 * while the file is still in their hand.
 *
 * ── This tier is the FAST one, not the guarantee ──
 * `content/lib/mirror.ts` enforces the same numbers again and fails the deploy.
 * It has to: `sanity dataset import`, a restored backup and the HTTP API all
 * write documents this file never sees. The duplication is deliberate and is the
 * same arrangement `brandMarksTogether` already has in `caseStudy.ts` — the
 * Studio and the content build are separate npm packages on purpose, and neither
 * may import the other. `docs/earth/logo-spec.md` is the source both copies
 * follow; change it there first.
 *
 * ── Why no async validator ──
 * A Sanity image asset id spells out its own dimensions and format:
 *
 *     image-a1b2c3…-1600x800-webp
 *
 * so every rule here is a synchronous string parse. No `getClient()` round-trip,
 * no image decoding, no spinner on a field an editor is still filling in. The
 * same content-addressed-id fact is already load-bearing in `mirror.ts`.
 */

import { EDITORIAL_BOUNDS } from '../../../src/content/editorialBounds'

export type BrandMarkKind = 'isotype' | 'logo'

export interface ParsedImageAsset {
  width: number
  height: number
  /** Lower-case, no dot. Sanity normalises `jpeg` to `jpg`. */
  extension: string
}

/** PNG and WebP, both of which carry an alpha channel. `formatHelp` has the rest. */
const ALLOWED_EXTENSIONS = ['png', 'webp']

const IMAGE_REF = /^image-[a-f0-9]+-(\d+)x(\d+)-([a-z0-9]+)$/

interface BrandMarkSpec {
  /** How the mark is named in a message, capitalised for sentence-initial use. */
  readonly noun: string
  readonly idealWidth: number
  readonly idealHeight: number
  /**
   * The widest source still worth its bytes; above it, a warning.
   *
   * Both values are ~2.4× the atlas box the artwork is fitted into — 432 and
   * 896 — which is the point where the extra pixels can no longer survive the
   * downscale into it. For the isotype that lands on 1024, which is the ceiling
   * `docs/earth/logo-spec.md` already names in prose; the logo's is the same
   * multiple, rounded to the neighbouring power of two.
   */
  readonly wastefulWidth: number
  /**
   * The isotype has NO aspect band: it is judged on its drawn size against
   * `brandMarkMinDrawn`, which is the header's subject. The logo has one,
   * because "a lockup must be horizontal" is not a statement about size.
   */
  readonly aspectMin?: number
  readonly aspectMax?: number
  /** Outside this band it still works, but bigger is available. Warning. */
  readonly idealAspectMin: number
  readonly idealAspectMax: number
  readonly aspectAdvice: string
}

/**
 * The numbers, and where each one comes from.
 *
 * The boxes the artwork is fitted into live in
 * `EDITORIAL_BOUNDS.caseStudy.brandMarkBox` — 432×368 and 896×368 — because
 * `content/` needs them too and neither package may import the atlas that owns
 * them. They were restated here as 432×432 and 900×400 until 2026-09-21, from
 * before `PAD_Y` was unified at 72, and the advice tier spent a fortnight
 * telling editors their artwork was too small for a hole that did not exist.
 * `createBrandAtlas.test.ts` now asserts the shared copy against the real cells.
 *
 * The ideals come from `docs/earth/logo-spec.md`: a canonical delivery size
 * comfortably above the box, so thin strokes survive the downscale at the
 * case-panel close-up.
 *
 * ── The isotype is judged on what it DRAWS, not on its aspect ──
 *
 * NOTHING in the renderer requires a square isotype. `fitInk` contains any
 * aspect on its measured ink and the panel shader contains the cell into a
 * field whose own aspect animates from 1:1 to 2:1; both are asserted across
 * 1:1, 2:1, 4:1 and portrait. The bound is a LEGIBILITY judgement, so it is
 * stated as the quantity legibility depends on:
 *
 *     aspect   drawn      ≈ on the 30px resting panel
 *     1:1      368×368    21.6 × 21.6
 *     4:3      432×324    25.3 × 19.0
 *     2:1      432×216    25.3 × 12.7
 *     2.35:1   432×184    25.3 × 10.8
 *     3:1      432×144    25.3 ×  8.4   <- the floor
 *
 * Anything wider than 432/368 = 1.174 is WIDTH-bound and already drawn as wide
 * as the box allows, so what a landscape mark loses is HEIGHT and nothing else.
 * `EDITORIAL_BOUNDS.caseStudy.brandMarkMinDrawn` is where that height stops
 * being a symbol.
 *
 * This was an aspect band until 2026-09-21 and it moved twice in one day — 4:3,
 * then 2:1 — because each real brand arrived just outside whatever the number
 * was. The aspect was a proxy; the ratchet was the proxy's fault. Saying "at
 * least 144 drawn pixels" fixes the bound to something that will not move, and
 * lets the message name the size the editor is actually going to get.
 *
 * Symmetric, so the portrait side moved with it: a tall mark is height-bound and
 * loses WIDTH instead, and is refused at the same 144. That loosens portrait
 * from 3:4 to about 1:2.6, which is deliberate — the same argument applies, and
 * a vertical mark drawn 147×368 is no less readable than a horizontal one drawn
 * 432×147.
 *
 * ── The logo keeps an aspect band, and that is not an inconsistency ──
 *
 * Its bound is not legibility. A lockup has to be HORIZONTAL to make sense of a
 * panel that unfolds to 2:1, and a square logo is not a lockup however large it
 * draws — a rule about drawn size could not express that. 1.5:1–5:1 around an
 * ideal 2:1–4:1.
 */
const BRAND_MARK_SPEC: Record<BrandMarkKind, BrandMarkSpec> = {
  isotype: {
    noun: 'El isotipo',
    idealWidth: 512,
    idealHeight: 512,
    wastefulWidth: 1024,
    idealAspectMin: 1,
    idealAspectMax: 1,
    aspectAdvice:
      'El panel en reposo es cuadrado: un isotipo exactamente cuadrado se dibuja más alto.',
  },
  logo: {
    noun: 'El logotipo completo',
    idealWidth: 1600,
    idealHeight: 800,
    wastefulWidth: 2048,
    aspectMin: 1.5,
    aspectMax: 5,
    idealAspectMin: 2,
    idealAspectMax: 4,
    aspectAdvice:
      'La proporción ideal está entre 2:1 y 4:1; fuera de ahí el logotipo se dibuja más pequeño.',
  },
}

/**
 * The dimensions and format of an uploaded image, read off its asset id.
 *
 * Returns null — and every rule then passes — when there is nothing to judge: an
 * empty field, a file still uploading (the value carries `_upload` and no asset
 * yet), or an id this parser does not recognise.
 *
 * That last case is a deliberate choice rather than an oversight. If Sanity ever
 * changes its asset-id format, the failure mode here must be "the Studio stops
 * pre-checking" and not "the client's Studio rejects every correct logo". The
 * content build is the half that guarantees; this half only has to be helpful.
 */
export function parseImageRef(value: unknown): ParsedImageAsset | null {
  if (value === null || typeof value !== 'object') return null
  const asset = (value as { asset?: unknown }).asset
  if (asset === null || typeof asset !== 'object') return null
  const ref = (asset as { _ref?: unknown })._ref
  if (typeof ref !== 'string') return null

  const match = IMAGE_REF.exec(ref)
  if (match === null) return null

  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null

  return { width, height, extension: match[3] }
}

/** `1600×800`, in the notation the field descriptions and the docs already use. */
function size(asset: ParsedImageAsset): string {
  return asset.width + '×' + asset.height
}

/**
 * What this file will actually be drawn at, in cell pixels, and by how much it
 * has to be scaled to get there.
 *
 * The same contain-fit as `fitInk` in `createBrandAtlas.ts`: the mark is scaled
 * until it fits the box on both axes, never cropped and never distorted. A
 * `scale` above 1 means the file is being ENLARGED, which is the only thing
 * that makes a mark soft.
 *
 * Approximate in one known way, and harmlessly. The atlas fits the measured
 * INK; this can only see the file. They agree exactly for the tight trim the
 * spec asks for, and where they differ the file is the more pessimistic of the
 * two — a mark with baked-in margins draws bigger than this predicts, never
 * smaller. So no artwork is refused for a margin the atlas is about to crop.
 */
function drawn(asset: ParsedImageAsset, kind: BrandMarkKind) {
  const box = EDITORIAL_BOUNDS.caseStudy.brandMarkBox[kind]
  const scale = Math.min(box.width / asset.width, box.height / asset.height)
  return {
    width: Math.round(asset.width * scale),
    height: Math.round(asset.height * scale),
    scale,
    box,
  }
}

/** `1,7:1` — one decimal, comma, as Spanish writes it. */
function ratio(asset: ParsedImageAsset): string {
  return (asset.width / asset.height).toFixed(1).replace('.', ',') + ':1'
}

/**
 * Why this particular format is refused, in the terms that matter to whoever has
 * the file open. A JPG is the common mistake and the one worth explaining: it is
 * not a corrupt or exotic file, it is a perfectly good photo format that cannot
 * do the one thing a logo on a dark panel needs.
 */
function formatHelp(extension: string): string {
  if (extension === 'jpg' || extension === 'jpeg') {
    return 'Un JPG no tiene transparencia, así que se vería como un rectángulo sobre el panel oscuro. Exporta la imagen a PNG o WebP.'
  }
  if (extension === 'svg' || extension === 'svgz') {
    return 'Los archivos SVG no se admiten. Exporta el mismo dibujo a PNG o WebP.'
  }
  return 'Exporta la imagen a PNG o WebP, con fondo transparente.'
}

/**
 * The blocking tier. A message returned from here disables Publicar.
 *
 * One message at a time, most fundamental first: an editor who uploaded a
 * 300×300 JPG should fix the format and meet the size complaint next, rather
 * than read a paragraph listing everything wrong at once.
 */
export function brandMarkErrors(kind: BrandMarkKind) {
  const spec = BRAND_MARK_SPEC[kind]

  return (value: unknown): true | string => {
    const asset = parseImageRef(value)
    if (asset === null) return true

    if (!ALLOWED_EXTENSIONS.includes(asset.extension)) {
      return 'Formato no admitido (.' + asset.extension + '). ' + formatHelp(asset.extension)
    }

    const aspect = asset.width / asset.height

    // The isotype is judged on what it DRAWS. Two messages rather than one,
    // because the two ways out are different: a very tall mark is usually a
    // lockup that needs cropping to its symbol, a very wide one usually has no
    // square version at all and the way out is to leave both fields empty.
    if (kind === 'isotype') {
      const fit = drawn(asset, kind)
      const floor = EDITORIAL_BOUNDS.caseStudy.brandMarkMinDrawn
      const at = ' Con esta forma se dibujaría ' + fit.width + '×' + fit.height +
        ' dentro de un hueco de ' + fit.box.width + '×' + fit.box.height + '.'
      if (fit.height < floor) {
        return (
          spec.noun +
          ' es demasiado apaisado: ' +
          size(asset) +
          ' (' +
          ratio(asset) +
          ').' +
          at +
          ' Queda como una tira y no se lee en la vista general. Si la marca no tiene un ' +
          'símbolo aparte del nombre, deja los dos campos vacíos y la web dibuja su propia placa.'
        )
      }
      if (fit.width < floor) {
        return (
          spec.noun +
          ' es demasiado estrecho: ' +
          size(asset) +
          ' (' +
          ratio(asset) +
          ').' +
          at +
          ' Recorta solo el símbolo, ajustado y sin márgenes.'
        )
      }
    }

    if (kind === 'logo' && aspect < spec.aspectMin!) {
      return (
        spec.noun +
        ' es apaisado: al menos vez y media más ancho que alto. Esta imagen mide ' +
        size(asset) +
        ' (' +
        ratio(asset) +
        '). Si la marca no tiene una versión horizontal, deja los dos campos vacíos ' +
        'y la web dibuja su propia placa.'
      )
    }
    if (kind === 'logo' && aspect > spec.aspectMax!) {
      return (
        'Demasiado alargada: ' +
        size(asset) +
        ' (' +
        ratio(asset) +
        '). Como máximo cinco veces más ancha que alta; por encima de eso el logotipo ' +
        'se dibuja diminuto.'
      )
    }

    return true
  }
}

/**
 * The advisory tier. Publicar stays enabled; the field shows a yellow note.
 *
 * Everything here is a quality difference an editor can act on but nobody should
 * be blocked over — the artwork works, it just will not look its best.
 *
 * File weight is deliberately absent: the asset id does not carry it, and a
 * warning about it would mean an async round-trip for a number the content build
 * already caps at 4 MB.
 */
export function brandMarkAdvice(kind: BrandMarkKind) {
  const spec = BRAND_MARK_SPEC[kind]
  const errors = brandMarkErrors(kind)

  return (value: unknown): true | string => {
    const asset = parseImageRef(value)
    if (asset === null) return true
    // Anything the blocking tier rejects is already reported there. Saying it
    // twice, once in red and once in yellow, reads as two separate problems.
    if (errors(value) !== true) return true

    const aspect = asset.width / asset.height
    if (aspect < spec.idealAspectMin || aspect > spec.idealAspectMax) {
      return (
        'Proporción poco habitual: ' + size(asset) + ' (' + ratio(asset) + '). ' + spec.aspectAdvice
      )
    }

    // WILL IT BE ENLARGED — the only thing that makes a mark soft. Asked of the
    // contain-fit rather than of each dimension against the box, which is what
    // it was until 2026-09-21 and was simply wrong for anything not square: a
    // 512×218 isotype is 218px tall against a 368px box, so it was told it
    // would be "amplía[da] ... borrosa" while in fact it is DOWNSCALED 512→432
    // and perfectly sharp. A landscape mark can never be as tall as the box
    // without being far wider than it.
    const fit = drawn(asset, kind)
    if (fit.scale > 1) {
      return (
        'Más pequeña que el hueco donde se dibuja: ' +
        size(asset) +
        ', y se dibuja a ' +
        fit.width +
        '×' +
        fit.height +
        '. La web la amplía para llenarlo, así que se verá borrosa, sobre todo al abrir la ficha. ' +
        'Puedes publicar así; si existe una versión más grande de la marca, mejor esa (ideal ' +
        spec.idealWidth +
        '×' +
        spec.idealHeight +
        ').'
      )
    }

    // Below the canonical delivery size, measured on the axis that BINDS the
    // fit — the other one is free to be anything the mark's shape implies, and
    // comparing it against the ideal asks a landscape mark to be square.
    const bindsOnWidth = fit.width >= fit.box.width - 0.5
    const shortOfIdeal = bindsOnWidth
      ? asset.width < spec.idealWidth
      : asset.height < spec.idealHeight
    if (shortOfIdeal) {
      return (
        'Por debajo del tamaño ideal: ' +
        size(asset) +
        ' en lugar de ' +
        spec.idealWidth +
        '×' +
        spec.idealHeight +
        '. Funciona, pero se verá algo blanda en el primer plano de la ficha.'
      )
    }

    if (asset.width > spec.wastefulWidth) {
      return (
        'Más grande de lo necesario: ' +
        size(asset) +
        '. El tamaño ideal es ' +
        spec.idealWidth +
        '×' +
        spec.idealHeight +
        '; lo que sobra son bytes que nadie llega a ver.'
      )
    }

    return true
  }
}
