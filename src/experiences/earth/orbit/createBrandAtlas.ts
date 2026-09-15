import * as THREE from 'three'
import { DEBUG_TOOLS_ENABLED } from '../../../platform/buildFlags'

// One canvas texture holding all six brand plates, so the orbit panels cost a
// single texture bind instead of six. Each panel samples its own cell through a
// UV offset/scale uniform pair.
//
// THERE ARE TWO OF THESE, one per `AtlasKind`. The panel rests showing the
// ISOTYPE — the brand's square symbol — and unfolds into the LOGO, the full
// horizontal lockup, only while its case study is selected. Two atlases means
// two texture binds rather than one, which is still nothing like the twelve a
// per-panel texture would cost, and it keeps each grid at its artwork's own
// aspect instead of wasting half of every square cell.
//
// The kind is a closed set of exactly two, and the cell size and padding are
// constants keyed by it rather than parameters. A caller able to pass arbitrary
// dimensions could build a grid whose aspect disagrees with nothing in
// particular — the panel shader contain-fits every sample, so the mismatch would
// not throw, it would just quietly letterbox artwork that should have filled the
// cell. Two named combinations cannot drift.
//
// Every cell is DRAWN first — a ring monogram carrying the initial, plus a wordmark
// in the logo atlas — and then UPGRADED IN PLACE if the case study supplies an
// artwork URL for this kind that loads.
// The draw is the floor, not the fallback of last resort: it is what the panel
// shows while the image is in flight, and what it keeps forever if the image
// 404s, fails CORS or decodes to nothing. A panel is never blank.
//
// The build stays SYNCHRONOUS on purpose. `orbits:build` is a REQUIRED boot
// resource (bootState.ts) and createOrbitSystem constructs everything inside one
// effect — making the atlas await its images would put a decorative asset on the
// readiness path, where a slow media host could hold the loading screen hostage.
// That is the exact failure the required/optional split exists to prevent. The
// timing is generous anyway: the first panel's opacity only leaves zero ~2s into
// the orbit reveal, so a same-origin logo lands long before anything is visible.

const COLUMNS = 2

/**
 * Rows needed for `count` plates at `COLUMNS` per row.
 *
 * ROWS used to be a hardcoded 3, i.e. exactly six cells for exactly six case
 * studies. That agreed with `ORBIT_PRESETS.length` by convention, not by
 * construction: a seventh plate was silently dropped by a `slice` and then
 * `cellUv` clamped its index back to the sixth cell, so the seventh satellite
 * wore the sixth company's logo. Three independent constants had to be kept in
 * step by hand, and nothing asserted it.
 *
 * At least one row: a zero-height canvas throws on some platforms, and an atlas
 * with no plates is a legitimate state (no orbits assigned) rather than a bug.
 */
function rowsFor(count: number): number {
  return Math.max(1, Math.ceil(count / COLUMNS))
}
/**
 * Which artwork an atlas carries.
 *
 * `'isotype'` is the resting state — on screen the entire time the overview is,
 * across all six satellites at once. `'logo'` appears only under selection, one
 * at a time. That asymmetry is why the isotype is the file that matters most in
 * docs/earth/logo-spec.md, even though the logo is the bigger asset.
 */
export type AtlasKind = 'isotype' | 'logo'

/**
 * Cell geometry per kind. THE ATLAS OWNS THE PADDING, not the artwork — a file
 * delivered with its own built-in whitespace renders smaller than its neighbours
 * and there is no way to detect that automatically. See docs/earth/logo-spec.md,
 * which asks for a tight bounding-box trim.
 *
 * Both are sized for the case-panel close-up (closeUp.distance 0.55R), where the
 * panel is the most magnified thing on screen — at half these dimensions the
 * wordmark visibly softens there. The isotype cell is square and therefore
 * smaller, which is correct: a symbol at 512² carries the same detail per
 * on-screen pixel as a lockup at 1024×512, because the unfolded panel is twice
 * as wide.
 *
 * The isotype is padded TIGHTER than the lockup. It is the resting state, seen
 * at ~30px across the overview, where every pixel of margin is a pixel the
 * symbol does not get; the lockup is only ever seen at the close-up, where it
 * can afford to breathe.
 */
/**
 * Vertical padding, and it is INHERITED rather than derived (2026-09-07).
 *
 * It WAS derived, on 2026-09-04: a rail ran beneath the mark at 0.41 pane
 * heights, and clearing it by 0.05 gave padY >= 71.7, hence 72. The rails were
 * removed at the client's request, so that derivation no longer stands behind
 * this number and the old note's "move the rail and this number moves with it"
 * has nothing left to point at.
 *
 * 72 is KEPT rather than recomputed, and the bound it is now held to is the
 * one thing still drawn at the field's lower edge: the emitter line and its
 * wash, at p.y = -0.5, which is where `fuv = p + 0.5` puts the bottom of the
 * cell. Clearing that by 0.10 gives
 *
 *   0.5 * (512 - 2*padY) / 512 <= 0.5 - 0.10   ->   padY >= 51.2
 *
 * and 0.10 is not arbitrary: it is half the e-fold of the wash climbing off
 * that line (`exp(-above / 0.20)` in createHoloPanel), so ink inside it would
 * sit in the brightest part of the light rather than above it. 72 lands the
 * mark's half-height at 0.359 — clear by 0.141 against a bound of 0.10.
 *
 * The headroom down to 52 is real and deliberately unspent: taking it would
 * enlarge every shipped mark at once, which is a visual change nobody asked
 * for. 72 for both kinds, because both cells are 512 tall.
 *
 * None of this mattered before the ink normalisation below. Drawing the whole
 * FILE meant the shipped lockup's mark reached only 0.246 and the isotype's
 * 0.335, so nothing was ever close — the margins the suppliers baked in were
 * doing the clearing by accident. Fitting to the ink is what made the extent
 * predictable, and a predictable extent is what can be given a real clearance
 * instead of an accidental one.
 */
const PAD_Y = 72

/**
 * Cell geometry per kind. THE ATLAS OWNS THE PADDING, not the artwork — and
 * since 2026-09-04 it owns it properly: `drawLogoContained` fits the measured
 * ink, so a file delivered with built-in whitespace no longer renders smaller
 * than its neighbours. `docs/earth/logo-spec.md` still asks for a tight trim,
 * because the wasted resolution is real even once the placement is not.
 *
 * Both are sized for the case-panel close-up (closeUp.distance 0.55R), where the
 * panel is the most magnified thing on screen — at half these dimensions the
 * wordmark visibly softens there. The isotype cell is square and therefore
 * smaller, which is correct: a symbol at 512² carries the same detail per
 * on-screen pixel as a lockup at 1024×512, because the unfolded panel is twice
 * as wide.
 *
 * The isotype is padded tighter HORIZONTALLY. It is the resting state, seen at
 * ~30px across the overview, where every pixel of margin is a pixel the symbol
 * does not get; the lockup is only ever seen at the close-up, where it can
 * afford to breathe. Vertically they share PAD_Y, because they share the
 * emitter line at the field's base that they both have to clear.
 */
export const CELL: Record<
  AtlasKind,
  { width: number; height: number; padX: number; padY: number }
> = {
  isotype: { width: 512, height: 512, padX: 40, padY: PAD_Y },
  logo: { width: 1024, height: 512, padX: 64, padY: PAD_Y },
}

/**
 * The artwork's half-height at the deployed field, in pane heights.
 *
 * Exported because `orbitConfig.test.ts` asserts it clears the emitter line at
 * the field's base, and the two numbers live in different modules with nothing
 * else connecting them. Derived here rather than restated there, so the guard
 * cannot pass against a copy of the value it is supposed to be checking.
 *
 * The cell's full height maps to p.y ∈ ±0.5 at the deployed field
 * (`createHoloPanel`'s `fuv`), so this is half the padded fraction.
 */
export function artworkHalfHeight(kind: AtlasKind): number {
  const cell = CELL[kind]
  return 0.5 * ((cell.height - cell.padY * 2) / cell.height)
}

export interface BrandPlate {
  name: string
  brandColor: string
  /**
   * URL of the real logo — the full horizontal lockup. Same-origin path under
   * /public today, a CMS media URL later; the loader does not care which. Null
   * keeps the drawn plate.
   */
  logo?: string | null
  /**
   * URL of the real isotype — the square symbol alone. Same rules as `logo`.
   *
   * The content build guarantees these two are either both present or both
   * absent (see content/collections/caseStudies.collection.ts), so nothing here
   * has to reason about a brand that has one and not the other.
   */
  isotype?: string | null
}

export interface BrandAtlas {
  texture: THREE.CanvasTexture
  /**
   * Cell aspect, width / height.
   *
   * Published rather than left for the caller to remember, because the panel
   * shader needs it to contain-fit each sample into a quad whose own aspect is
   * animating. Reading it off the atlas is what stops "the isotype cell is
   * square" from becoming a literal `1.0` in the panel, silently wrong the day
   * the cell changes.
   */
  aspect: number
  /** UV rect for one plate, in the order the plates were passed. */
  cellUv(index: number): { offset: THREE.Vector2; scale: THREE.Vector2 }
  dispose(): void
}

/**
 * The accent used when `brandColor` is not a colour this function can read.
 *
 * A neutral pale blue in the scene's own holographic register, so a plate with
 * unusable colour still reads as part of the language rather than as an error.
 */
const FALLBACK_BRAND_COLOR = '#8fd0ff'

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/**
 * `brandColor` as a `#rrggbb` string, or the fallback.
 *
 * Worth a guard now that the value is authored somewhere else: canvas ignores an
 * unparseable strokeStyle/fillStyle SILENTLY — keeping whatever colour was set
 * last. The plate does not fail, it just comes out the wrong colour, which is
 * the hardest kind of wrong to notice in a review.
 */
function safeBrandColor(color: string): string {
  return HEX_COLOR.test(color) ? color : FALLBACK_BRAND_COLOR
}

/**
 * The wordmark's colour: a soft white, so it contrasts with the brand ring.
 *
 * 78% white and OPAQUE rather than pure white at partial alpha. The scene's
 * bloom pass thresholds on linear luminance (introConfig.bloomThreshold, 0.62),
 * and alpha does not lower the sampled value — a translucent pure white still
 * blooms into a blown-out glow. rgb(200) is ~0.58 linear: just under the knee,
 * so the name stays a crisp glyph while the brand ring beside it may glow.
 */
const WORDMARK_COLOR = 'rgb(200, 200, 200)'

/**
 * The mark alone: a thin brand-colour RING carrying the company's initial, also
 * in the brand colour, centred in the cell. The drawn stand-in for an isotype.
 *
 * A ring, not a filled disc. The filled disc with a dark initial is the
 * universal "no picture yet" avatar and read as unfinished; a stroked ring with
 * a medium-weight initial reads as a monogram or a seal, and it survives
 * whatever system sans the platform substitutes because the letter carries
 * little weight of its own.
 *
 * Radius is a fraction of the cell rather than a fixed 84px, because this is
 * drawn into two cell sizes — the square isotype cell, where it is the whole
 * plate, and the wide logo cell, where it is the left third of a lockup.
 */
function drawMark(
  ctx: CanvasRenderingContext2D,
  plate: BrandPlate,
  cx: number,
  cy: number,
  radius: number,
) {
  const brand = safeBrandColor(plate.brandColor)
  // Stroke ~7% of the diameter, drawn inside the radius so the ring's outer
  // edge lands exactly on the padded box like a real isotype would.
  const stroke = radius * 0.14
  ctx.beginPath()
  ctx.arc(cx, cy, radius - stroke / 2, 0, Math.PI * 2)
  ctx.lineWidth = stroke
  ctx.strokeStyle = brand
  ctx.stroke()

  ctx.fillStyle = brand
  ctx.font = `500 ${Math.round(radius * 1.05)}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Optical centering: cap-height glyphs sit high against a geometric centre.
  ctx.fillText(plate.name.charAt(0).toUpperCase(), cx, cy + radius * 0.06)
}

/**
 * The isotype plate: the mark, centred and filling the square cell.
 *
 * Sized off the padded box rather than the cell so it lands at the same optical
 * weight as a real isotype, which `drawLogoContained` fits into that same box.
 */
function drawMarkPlate(
  ctx: CanvasRenderingContext2D,
  plate: BrandPlate,
  originX: number,
  originY: number,
) {
  const cell = CELL.isotype
  const radius = Math.min(cell.width - cell.padX * 2, cell.height - cell.padY * 2) / 2
  drawMark(ctx, plate, originX + cell.width / 2, originY + cell.height / 2, radius)
}

// Mark + wordmark on a transparent ground. Everything is measured rather than
// hardcoded because the six names range from "Mango" to "Estrella Galicia" —
// the same problem the old badge texture hit once real brand names replaced
// "CASE 01".
function drawLockup(
  ctx: CanvasRenderingContext2D,
  plate: BrandPlate,
  originX: number,
  originY: number,
) {
  const cell = CELL.logo
  const pad = 44
  const markR = 84
  const markCx = originX + pad + markR
  const markCy = originY + cell.height / 2

  drawMark(ctx, plate, markCx, markCy, markR)

  // The wordmark: near-white, medium weight, lightly tracked. It CONTRASTS with
  // the ring rather than matching it — mark, name and ground all in one hue was
  // what made figure and ground merge. No rule beneath it; the ring is the
  // brand's one coloured element and the name needs no decoration.
  const textX = markCx + markR + 46
  // A WIDTH, not a coordinate. This used to add `originX`, which made the
  // limit 1024px too generous for every plate in the second atlas column —
  // their names never shrank and "PcComponentes" ran off the cell's edge.
  const textLimit = cell.width - pad - (textX - originX)
  let fontSize = 112
  const font = (px: number) => `500 ${px}px system-ui, -apple-system, sans-serif`
  ctx.font = font(fontSize)
  // Chrome and Safari honour it; elsewhere the assignment is a harmless no-op.
  ctx.letterSpacing = '0.02em'
  const width = ctx.measureText(plate.name).width
  if (width > textLimit) {
    fontSize = Math.max(Math.floor(fontSize * (textLimit / width)), 28)
    ctx.font = font(fontSize)
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = WORDMARK_COLOR
  ctx.fillText(plate.name, textX, markCy + fontSize * 0.04)
  ctx.letterSpacing = '0px'
}

/**
 * The artwork's INK, in source pixels — the tightest box containing any pixel
 * that is not fully transparent.
 *
 * Null when the image cannot be measured (a tainted canvas, a context refused
 * under memory pressure) or when it is entirely transparent, and the caller
 * falls back to the file's own bounds. Never throws: an unmeasurable logo is a
 * survivable outcome, and the drawn plate behind it is still correct.
 *
 * Scanning the alpha channel rather than trusting the file is the whole point.
 * `docs/earth/logo-spec.md` asks for a zero-margin trim and records that it is
 * "el punto que más se incumple" — the shipped PcComponentes lockup is 1300×650
 * with 119px of transparency above the ink and 122 below, so its mark fills 49%
 * of the cell where a tight file would fill 78%. Measuring is what stops the
 * frame having to guess.
 */
function inkBounds(
  img: HTMLImageElement,
  sw: number,
  sh: number,
): { x: number; y: number; width: number; height: number } | null {
  let data: Uint8ClampedArray
  try {
    const probe = document.createElement('canvas')
    probe.width = sw
    probe.height = sh
    const probeCtx = probe.getContext('2d', { willReadFrequently: true })
    if (!probeCtx) return null
    probeCtx.drawImage(img, 0, 0)
    data = probeCtx.getImageData(0, 0, sw, sh).data
  } catch {
    return null
  }

  let minX = sw
  let minY = sh
  let maxX = -1
  let maxY = -1
  // Anything below this is a soft edge or a compression artefact, not ink. A
  // strict `> 0` would let a single stray pixel from a lossy encode define the
  // box and undo the whole measurement.
  const ALPHA_FLOOR = 8

  for (let y = 0; y < sh; y++) {
    const row = y * sw * 4
    for (let x = 0; x < sw; x++) {
      if (data[row + x * 4 + 3] <= ALPHA_FLOOR) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (maxX < minX || maxY < minY) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * Contain-fit an ink rectangle into the cell's padded box.
 *
 * Separated from the drawing so it can be asserted directly across the aspect
 * ratios the client's real assets will bring. The shipped lockup is the only
 * artwork in the repository today, and a fit exercised only at 2.86:1 is a fit
 * nobody has actually checked.
 *
 * No upscale clamp. A source smaller than the box is better shown large and
 * soft than sharp and tiny — the panel's job is to be readable at the close-up,
 * and an undersized asset is a content problem, not a fit problem.
 */
export function fitInk(
  ink: { width: number; height: number },
  boxW: number,
  boxH: number,
): { w: number; h: number } {
  const scale = Math.min(boxW / ink.width, boxH / ink.height)
  return { w: ink.width * scale, h: ink.height * scale }
}

// CONTAIN, never cover: a cropped trademark is worse than a small one. Aspect is
// always preserved, so a square or portrait mark simply ends up smaller and
// centred rather than stretched. Returns false when the image has no usable
// intrinsic size, which is how an SVG lacking width/height attributes arrives.
//
// NORMALISED ON THE INK, not on the file (2026-09-04, plan 012 task 3). The
// artwork is fitted and centred by its measured alpha bounds, so what lands in
// the cell is a mark of predictable extent whatever margins the supplier baked
// in. That is what makes the mark's extent the same for every brand, which is
// what lets PAD_Y's clearance of the emitter line hold for all of them instead
// of depending on whatever margin this particular file happened to contain. No
// per-logo information leaves this function.
function drawLogoContained(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  kind: AtlasKind,
  originX: number,
  originY: number,
): boolean {
  const sw = img.naturalWidth
  const sh = img.naturalHeight
  if (!sw || !sh) return false

  const cell = CELL[kind]
  const boxW = cell.width - cell.padX * 2
  const boxH = cell.height - cell.padY * 2

  // Falls back to the whole file when the alpha cannot be read, which is the
  // pre-2026-09-04 behaviour and still correct — just less tight.
  const ink = inkBounds(img, sw, sh) ?? { x: 0, y: 0, width: sw, height: sh }
  const { w, h } = fitInk(ink, boxW, boxH)

  // Artwork quality diagnostics belong to development. The shared build flag
  // also works in the Node harnesses, where import.meta.env does not exist.
  // Measured against the INK now, so an asset is called undersized only when the
  // part that draws is undersized — a 1300px file whose mark is 700px wide was
  // previously reported as comfortable and was not.
  if (DEBUG_TOOLS_ENABLED && ink.width < boxW) {
    console.warn(
      `[brand-atlas] ${kind} ink is ${ink.width}×${ink.height} (file ${sw}×${sh}); it will be ` +
        `upscaled into a ${boxW}×${boxH} box and soften at the case-panel close-up. ` +
        'See docs/earth/logo-spec.md.',
    )
  }

  // The margin the supplier baked in, as a fraction of the file. The spec asks
  // for zero; this is the number that says how far off it is, and it is worth
  // saying because normalising HIDES the problem — the mark now lands correctly
  // and the only remaining cost is resolution nobody can see was lost.
  const marginFraction = 1 - (ink.width * ink.height) / (sw * sh)
  if (DEBUG_TOOLS_ENABLED && marginFraction > 0.25) {
    console.warn(
      `[brand-atlas] ${kind} carries ${Math.round(marginFraction * 100)}% transparent margin ` +
        '— normalised here, but the file wastes that share of its own resolution. ' +
        'docs/earth/logo-spec.md asks for a tight trim.',
    )
  }

  // Default downscale filtering aliases thin strokes badly at the ~2× ratio a
  // 1600px-wide source hits against this box.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // Source rectangle is the ink, so the baked-in margins are cropped rather than
  // drawn — that, and not the destination maths, is what re-centres the mark.
  ctx.drawImage(
    img,
    ink.x,
    ink.y,
    ink.width,
    ink.height,
    originX + (cell.width - w) / 2,
    originY + (cell.height - h) / 2,
    w,
    h,
  )
  return true
}

// Never rejects. A missing or broken logo is an expected, survivable outcome —
// resolving null lets the caller keep the drawn plate without a try/catch per
// cell. `onload` rather than `img.decode()`: Safari throws EncodingError from
// decode() on some perfectly valid SVGs.
function loadLogo(url: string, track: Set<HTMLImageElement>): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    // MUST be set before .src, and set unconditionally: it is a no-op for
    // same-origin files today and is the whole ballgame once the URL points at
    // a CMS. See the taint note on canvasSafe().
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    const done = (value: HTMLImageElement | null) => {
      track.delete(img)
      img.onload = null
      img.onerror = null
      resolve(value)
    }
    img.onload = () => done(img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null)
    img.onerror = () => done(null)
    track.add(img)
    img.src = url
  })
}

// Drawing a cross-origin image into a canvas WITHOUT usable CORS permission
// taints it, and a tainted canvas cannot be uploaded as a WebGL texture —
// texImage2D throws SecurityError from inside three's render loop. This atlas is
// shared by all six panels, so one bad logo would not degrade one cell, it would
// kill the whole orbit system. Hence a disposable 1×1 probe: draw there first,
// and only touch the real atlas if reading the pixel back is allowed.
//
// crossOrigin='anonymous' is necessary but not sufficient — a redirect that
// drops the header, or an SVG referencing a cross-origin subresource, taints
// anyway. The probe catches all of them.
function canvasSafe(img: HTMLImageElement): boolean {
  try {
    const probe = document.createElement('canvas')
    probe.width = 1
    probe.height = 1
    const probeCtx = probe.getContext('2d', { willReadFrequently: true })
    if (!probeCtx) return false
    probeCtx.drawImage(img, 0, 0, 1, 1)
    probeCtx.getImageData(0, 0, 1, 1)
    return true
  } catch {
    // The probe canvas is discarded either way — a tainted canvas stays tainted.
    return false
  }
}

/**
 * Builds the atlas and starts loading any real logos in the background.
 *
 * Not a singleton, deliberately. createOrbitSystem already constructs this and
 * already calls dispose() in its own teardown — it is the sole owner in
 * everything but name. A module-level cache would ignore a changed plate list on
 * the second call (the blocker for fetched content), leak the GPU texture across
 * HMR, and give an in-flight image load no scope to be cancelled against.
 */
export function createBrandAtlas(plates: BrandPlate[], kind: AtlasKind): BrandAtlas {
  const cell = CELL[kind]
  const drawPlate = kind === 'isotype' ? drawMarkPlate : drawLockup
  const sourceUrl = (plate: BrandPlate) => (kind === 'isotype' ? plate.isotype : plate.logo)

  const canvas = document.createElement('canvas')
  // Derived from what was actually passed, so every plate gets a cell and no
  // plate shares one.
  const rows = rowsFor(plates.length)
  canvas.width = COLUMNS * cell.width
  canvas.height = rows * cell.height
  // Not asserted: a 2D context can legitimately be refused under memory
  // pressure. createOrbitSystem's caller turns a throw here into the Spanish
  // failure caption, and a named error says which resource gave out.
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(`[brand-atlas] 2D canvas context unavailable (${kind})`)
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // No slice: the grid is sized for the plates rather than the plates trimmed to
  // the grid, so there is nothing left to silently drop.
  const visible = plates
  const cellOrigin = (index: number) => ({
    x: (index % COLUMNS) * cell.width,
    y: Math.floor(index / COLUMNS) * cell.height,
  })

  visible.forEach((plate, index) => {
    const { x, y } = cellOrigin(index)
    drawPlate(ctx, plate, x, y)
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

  let disposed = false
  const inFlight = new Set<HTMLImageElement>()
  let flushHandle = 0

  // needsUpdate re-uploads the ENTIRE canvas and regenerates the full mip chain,
  // so six logos resolving at six moments would mean six full uploads.
  // Coalescing to one per frame collapses the common case (all six landing
  // together from disk cache) into a single upload — and makes the plates flip
  // as a set, which reads better than a stagger.
  function scheduleFlush() {
    if (disposed || flushHandle) return
    flushHandle = requestAnimationFrame(() => {
      flushHandle = 0
      if (disposed) return
      texture.needsUpdate = true
    })
  }

  visible.forEach((plate, index) => {
    const url = sourceUrl(plate)
    if (!url) return
    void loadLogo(url, inFlight).then((img) => {
      // The load outlived the atlas: the canvas and texture are gone.
      if (disposed) return
      if (!img) {
        // Silence here would make a typo'd path indistinguishable from a
        // deliberate null, and the plate looks identical either way.
        console.warn(
          `[brand-atlas] "${plate.name}" ${kind} did not load (${url}); keeping the drawn plate.`,
        )
        return
      }
      if (!canvasSafe(img)) {
        console.warn(
          `[brand-atlas] "${plate.name}" ${kind} is not CORS-readable and would taint the ` +
            `atlas; keeping the drawn plate. Origin must send Access-Control-Allow-Origin.`,
        )
        return
      }

      const { x, y } = cellOrigin(index)
      // Cell-local clear, never the whole canvas — the other five plates are
      // already correct and may include images that landed a frame earlier.
      ctx.clearRect(x, y, cell.width, cell.height)
      if (drawLogoContained(ctx, img, kind, x, y)) {
        // Only the logo. Keeping the initial disc and the accent rule underneath
        // a real trademark is noise; the brand colour still reaches the panel
        // through the shader's uBrandColor wash.
        scheduleFlush()
      } else {
        // No intrinsic size (an SVG missing width/height). Put the plate back.
        console.warn(
          `[brand-atlas] "${plate.name}" ${kind} has no intrinsic size — an SVG needs explicit ` +
            `width and height attributes, not just a viewBox. Keeping the drawn plate.`,
        )
        drawPlate(ctx, plate, x, y)
        scheduleFlush()
      }
    })
  })

  return {
    texture,
    aspect: cell.width / cell.height,
    cellUv(index: number) {
      // Clamped to the cells that exist. Out-of-range row arithmetic produces a
      // NEGATIVE v offset — outside the atlas entirely — so an unclamped index
      // samples garbage instead of failing visibly. The bound is the grid this
      // atlas was actually built with, not a fixed 2×3.
      const safeIndex = Math.min(Math.max(index, 0), COLUMNS * rows - 1)
      const col = safeIndex % COLUMNS
      const row = Math.floor(safeIndex / COLUMNS)
      return {
        // CanvasTexture keeps flipY, so row 0 (top of the canvas) is the
        // TOP of UV space — hence the inversion on v.
        offset: new THREE.Vector2(col / COLUMNS, 1 - (row + 1) / rows),
        scale: new THREE.Vector2(1 / COLUMNS, 1 / rows),
      }
    },
    dispose() {
      disposed = true
      if (flushHandle) cancelAnimationFrame(flushHandle)
      flushHandle = 0
      // Nulling the handlers is what guarantees no callback fires; clearing src
      // aborts the in-flight request on top of that.
      for (const img of inFlight) {
        img.onload = null
        img.onerror = null
        img.src = ''
      }
      inFlight.clear()
      texture.dispose()
    },
  }
}
