import * as THREE from 'three'

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
// Every cell is DRAWN first — a mark disc carrying the initial, plus a wordmark
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
 * Padding is proportionally the same on both so a symbol and a lockup sit at the
 * same optical weight when the panel crossfades between them.
 */
const CELL: Record<AtlasKind, { width: number; height: number; padX: number; padY: number }> = {
  isotype: { width: 512, height: 512, padX: 56, padY: 56 },
  logo: { width: 1024, height: 512, padX: 64, padY: 56 },
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
 * The frame blue, so a plate with unusable colour still reads as part of the
 * holographic language rather than as an error.
 */
const FALLBACK_BRAND_COLOR = '#8fd0ff'

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/**
 * `brandColor` as a `#rrggbb` string, or the fallback.
 *
 * Worth a guard now that the value is authored somewhere else: `parseInt` on a
 * non-hex string returns NaN, `mixWithWhite` then produced `rgb(NaN, NaN, NaN)`,
 * and canvas ignores an unparseable fillStyle SILENTLY — keeping whatever colour
 * was set last. The plate did not fail, it just came out the wrong colour, which
 * is the hardest kind of wrong to notice in a review.
 */
function safeBrandColor(color: string): string {
  return HEX_COLOR.test(color) ? color : FALLBACK_BRAND_COLOR
}

function mixWithWhite(hex: string, amount: number): string {
  const value = safeBrandColor(hex).replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const lift = (c: number) => Math.round(c + (255 - c) * amount)
  return `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`
}

/**
 * The mark alone: a brand-colour disc carrying the company's initial, centred in
 * the cell. The drawn stand-in for an isotype.
 *
 * Radius is a fraction of the cell rather than a fixed 84px, because this is now
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
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = safeBrandColor(plate.brandColor)
  ctx.fill()

  ctx.fillStyle = '#05060a'
  ctx.font = `700 ${Math.round(radius * 1.15)}px system-ui, -apple-system, sans-serif`
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

  // The wordmark, lifted toward white so saturated hues stay legible when the
  // panel is small in the overview.
  const textX = markCx + markR + 46
  const textLimit = originX + cell.width - pad - (textX - originX)
  let fontSize = 112
  const font = (px: number) => `650 ${px}px system-ui, -apple-system, sans-serif`
  ctx.font = font(fontSize)
  const width = ctx.measureText(plate.name).width
  if (width > textLimit) {
    fontSize = Math.max(Math.floor(fontSize * (textLimit / width)), 28)
    ctx.font = font(fontSize)
  }
  ctx.textAlign = 'left'
  ctx.fillStyle = mixWithWhite(plate.brandColor, 0.42)
  ctx.fillText(plate.name, textX, markCy - fontSize * 0.16)

  // Accent rule under the wordmark, in the undiluted brand colour.
  const ruleW = Math.min(ctx.measureText(plate.name).width, textLimit)
  ctx.fillStyle = safeBrandColor(plate.brandColor)
  ctx.fillRect(textX, markCy + fontSize * 0.5, ruleW, 6)
}

// CONTAIN, never cover: a cropped trademark is worse than a small one. Aspect is
// always preserved, so a square or portrait mark simply ends up smaller and
// centred rather than stretched. Returns false when the image has no usable
// intrinsic size, which is how an SVG lacking width/height attributes arrives.
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

  // No upscale clamp. A source smaller than the box is better shown large and
  // soft than sharp and tiny — the panel's job is to be readable at the
  // close-up, and an undersized asset is a content problem, not a fit problem.
  const scale = Math.min(boxW / sw, boxH / sh)
  const w = sw * scale
  const h = sh * scale

  // Not gated on a DEV flag: nothing in src/ reads import.meta.env, because
  // checks/ bundles these modules for Node with esbuild where it does not exist.
  //
  // Threshold is the box the artwork is actually fitted into, so the square
  // isotype cell does not warn about a perfectly adequate 512² symbol.
  if (sw < boxW) {
    console.warn(
      `[brand-atlas] ${kind} source is ${sw}×${sh}; it will be upscaled into a ` +
        `${boxW}×${boxH} box and soften at the case-panel close-up. See docs/earth/logo-spec.md.`,
    )
  }

  // Default downscale filtering aliases thin strokes badly at the ~2× ratio a
  // 1600px-wide source hits against this box.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, originX + (cell.width - w) / 2, originY + (cell.height - h) / 2, w, h)
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
