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
  /** Below either of these the artwork is upscaled into its atlas cell. Error. */
  readonly minWidth: number
  readonly minHeight: number
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
  /** Outside this band the mark draws too small to read. Error. */
  readonly aspectMin: number
  readonly aspectMax: number
  /** Outside this band it still works, but bigger is available. Warning. */
  readonly idealAspectMin: number
  readonly idealAspectMax: number
  readonly aspectAdvice: string
}

/**
 * The numbers, and where each one comes from.
 *
 * `createBrandAtlas.ts` pads a 512×512 isotype cell by 40 and a 1024×512 logo
 * cell by 64/56, so the artwork is fitted into a 432×432 box and an 896×400 box
 * respectively — which is what the minimums are. The ideals come from
 * `docs/earth/logo-spec.md`: roughly 2× the box, so thin strokes survive the
 * downscale at the case-panel close-up.
 *
 * The isotype's error band is 3:4–4:3 rather than exactly square, because a
 * nearly-square symbol is still perfectly usable; only an exactly square one
 * earns a clean field. The logo's is 1.5:1–5:1 around an ideal 2:1–4:1, because
 * the expanded panel is 2:1 and a taller lockup is drawn small inside it.
 */
const BRAND_MARK_SPEC: Record<BrandMarkKind, BrandMarkSpec> = {
  isotype: {
    noun: 'El isotipo',
    idealWidth: 512,
    idealHeight: 512,
    minWidth: 432,
    minHeight: 432,
    wastefulWidth: 1024,
    aspectMin: 0.75,
    aspectMax: 4 / 3,
    idealAspectMin: 1,
    idealAspectMax: 1,
    aspectAdvice:
      'El panel en reposo es cuadrado: un isotipo exactamente cuadrado se dibuja más grande.',
  },
  logo: {
    noun: 'El logotipo completo',
    idealWidth: 1600,
    idealHeight: 800,
    minWidth: 900,
    minHeight: 400,
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

    if (asset.width < spec.minWidth || asset.height < spec.minHeight) {
      return (
        'Demasiado pequeña: ' +
        size(asset) +
        '. ' +
        spec.noun +
        ' necesita al menos ' +
        spec.minWidth +
        '×' +
        spec.minHeight +
        ' píxeles; por debajo la web la amplía y pierde nitidez al abrir la ficha. ' +
        'El tamaño ideal es ' +
        spec.idealWidth +
        '×' +
        spec.idealHeight +
        '.'
      )
    }

    const aspect = asset.width / asset.height
    if (kind === 'isotype' && (aspect < spec.aspectMin || aspect > spec.aspectMax)) {
      return (
        spec.noun +
        ' debe ser cuadrado, o casi. Esta imagen mide ' +
        size(asset) +
        '. Recorta el símbolo ajustado, sin márgenes, dentro de una caja cuadrada.'
      )
    }
    if (kind === 'logo' && aspect < spec.aspectMin) {
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
    if (kind === 'logo' && aspect > spec.aspectMax) {
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

    if (asset.width < spec.idealWidth || asset.height < spec.idealHeight) {
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
