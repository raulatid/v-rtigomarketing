/**
 * The sky-cubemap prototype's URL gate. Discovery scaffolding, not a feature.
 *
 * `docs/plans/005-sky-cubemap-prototype.md` asks one question — can a
 * procedurally generated high-resolution cubemap give the Earth scene a
 * cleaner, sharper, more controllable backdrop than the flat 2:1 photograph it
 * currently treats as equirectangular — and answering it needs the two skies
 * side by side in the SAME scene, under the same camera, at the same moment.
 *
 * So this is a switch, and everything it switches on is additive. With no
 * `?sky=` in the URL every value below is the inert default, `active()` is
 * false, and the app renders exactly what it rendered before this file existed.
 * `e2e/backdrop.spec.ts` passing against its committed baselines is what proves
 * that rather than what asserts it.
 *
 * It is also gated on `DEBUG_TOOLS_ENABLED`, so in a production build the
 * variant is unconditionally null and the whole prototype is unreachable —
 * `?sky=c` from a visitor's address bar does nothing. That is the same seam
 * buildFlags.ts already draws for `/debug` and `?stats=1`, for the same
 * reason: these tools are worth having, and worth not shipping.
 *
 * Read ONCE, at module load. A prototype whose parameters can change mid-run is
 * a prototype whose screenshots cannot be compared with each other.
 */
import { DEBUG_TOOLS_ENABLED } from './buildFlags'

export interface ProtoSkyParams {
  /**
   * Which cubemap to load, from `public/proto-sky/<variant>/`. Null means the
   * shipped panorama — the baseline arm of the comparison, and the default.
   */
  variant: string | null
  /**
   * Face resolution, only as an escape hatch. 6 x 4096^2 RGBA is 402 MB of
   * VRAM with mipmaps off, which is a real risk on weaker GPUs rather than a
   * theoretical one. If the context is lost, `?skyRes=2048` is 100 MB — and the
   * plan is explicit that dropping to it is a FINDING to record, not a
   * workaround to apply quietly.
   */
  resolution: number
  /**
   * The shipped `uSkyBrightness` 0.60 and `uSkyContrast` 1.00 are tuned to the
   * photograph and do not transfer to a baked sky (research part 3, §5). These
   * start at the identity so each variant can be given its own measured pair.
   */
  brightness: number
  contrast: number
  /** Degrees, into the cubemap's own frame. Aims a nebula off the resting view. */
  yawDegrees: number
  tiltDegrees: number
  /**
   * Star-particle count override, or null to leave `SpaceBackdrop` alone.
   *
   * Not cosmetic. The shipped panorama contains ZERO stars — the median filter
   * in the preparation script removed them — so every star on screen today is a
   * particle. A cubemap bakes them in for the first time, which makes "keep the
   * particles?" a real architectural fork rather than a preference. The whole
   * first capture pass runs at `?stars=0` so the baked sky can be judged on its
   * own.
   */
  stars: number | null
  /**
   * Stop the 0.035 rad/s surface spin (`earthConfig.ts:15`). It is the only
   * source of screenshot non-determinism in the resting scene: a shot taken at
   * a wall-clock delay is a shot of a different rotation every run.
   */
  freezeEarth: boolean
  /**
   * Which structure to draw over the sky, to answer "is the line I can see the
   * CUBE or the MESH". 0 off, 1 faces, 2 mesh.
   *
   * The two are a genuine confound and they are not distinguishable by looking.
   * `shell.vert.glsl` hands the fragment shader the interpolated vertex
   * POSITION of a 48x32 sphere, so the sampled direction is piecewise-warped
   * with a break at every triangle edge — and that mesh degenerates to a
   * triangle fan at exactly +/-Y, which is where the seams were reported. A
   * cube face boundary and a fan seam both draw a straight-ish line through the
   * pole, so a fix aimed at the wrong one would "work" for a while.
   *
   * `faces` tints by dominant axis and lays a hard line on the boundary itself.
   * `mesh` shows how far the interpolated position sags below the sphere, which
   * is zero at every vertex and maximal at the centre of every triangle — i.e.
   * it draws the tessellation directly, without needing to know it here.
   */
  debug: 0 | 1 | 2
  /**
   * A raw image dropped into `public/textures/`, loaded AS IS with no
   * preparation at all, or null for the shipped panorama.
   *
   * This exists to answer "I have candidate skies, is any of them any good",
   * and the only honest way to answer it is to put each one in the running
   * scene at the scene's own exposure through ACES. Screening a candidate as a
   * flat file is what the 2026-08 round did, and it is how six images that are
   * not panoramas got through: `scripts/screen-sky-source.mjs` says whether an
   * image is worth looking at, and this says what it looks like.
   *
   * The name must begin `sky-test-`, which does three jobs at once. Directory
   * traversal becomes impossible; it matches the `.gitignore` entry, so a 20 MB
   * scratch PNG cannot be committed by accident; and it says out loud that the
   * file is scaffolding rather than a deliverable.
   */
  image: string | null
}

const INERT: ProtoSkyParams = {
  variant: null,
  resolution: 4096,
  brightness: 1,
  contrast: 1,
  yawDegrees: 0,
  tiltDegrees: 0,
  stars: null,
  freezeEarth: false,
  debug: 0,
  image: null,
}

function number(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key)
  // Empty is absent, not zero. `Number('')` is 0 and 0 is finite, so without
  // this a trailing `&skyRes=` in a hand-edited URL would ask for a
  // zero-pixel cubemap and get a black sky with nothing to explain it.
  if (raw === null || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function starCount(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null
}

/** `faces` / `mesh`, or nothing. Anything else is off rather than an error. */
function debugMode(raw: string | null): 0 | 1 | 2 {
  if (raw === 'faces') return 1
  if (raw === 'mesh') return 2
  return 0
}

/**
 * Variant names index a directory under `public/`, so they are restricted to
 * the shape a directory name actually takes. Without this, `?sky=../../etc`
 * would be assembled into a fetch path — the prototype is dev-only, but a URL
 * that builds a path from a query parameter should never be the loose kind.
 */
function variantName(raw: string | null): string | null {
  if (raw === null) return null
  return /^[a-z0-9][a-z0-9-]{0,31}$/i.test(raw) ? raw : null
}

/**
 * A scratch image in `public/textures/`, or nothing.
 *
 * The `sky-test-` prefix is required rather than conventional — see the field's
 * doc comment. The pattern contains no `/`, so `..` cannot traverse out of the
 * directory, and the explicit check below is belt and braces for the same
 * reason `variantName` gives: a URL parameter assembled into a fetch path
 * should never be the loose kind, dev-only or not.
 */
const SKY_TEST_IMAGE = /^sky-test-[a-z0-9][a-z0-9._-]{0,47}\.(png|jpe?g|webp|avif)$/i

function imageName(raw: string | null): string | null {
  if (raw === null) return null
  if (raw.includes('..')) return null
  return SKY_TEST_IMAGE.test(raw) ? raw : null
}

function parse(search: string): ProtoSkyParams {
  if (!DEBUG_TOOLS_ENABLED) return INERT

  const params = new URLSearchParams(search)
  const variant = variantName(params.get('sky'))

  // Two kinds of knob, and the split is not arbitrary.
  //
  // `freezeEarth` and `stars` belong to the CAPTURE, not to the cubemap. The
  // comparison's baseline arm is the shipped panorama, and it has to be shot
  // under the same conditions as the variants or it is not a comparison: the
  // same stopped spin, and the same particle count. The first pass runs every
  // arm at ?stars=0 precisely so the baked sky and the photograph are both
  // judged without a particle field on top.
  //
  // Everything else — resolution, brightness, contrast, yaw, tilt — only means
  // something to a cubemap, so with no variant named it stays at the identity.
  // That keeps a stray `?skyBrightness=4` in a shared URL from changing the
  // shipped sky.
  const capture = {
    stars: starCount(params.get('stars')),
    freezeEarth: params.get('freezeEarth') === '1',
    // With the capture pair rather than with resolution/brightness, because it
    // applies to the PANORAMA path — the arm with no `?sky=` variant. When a
    // cubemap variant IS named, EarthExperience mounts SkyShellCube instead and
    // this is inert; harmless, and not worth a second gate.
    image: imageName(params.get('skyImage')),
  }

  // Belongs with resolution/brightness rather than with the capture pair: it
  // draws the CUBE's own structure, so it means nothing without a cubemap and
  // stays off when no variant is named.
  const debug = debugMode(params.get('skyDebug'))

  if (variant === null) return { ...INERT, ...capture }

  return {
    variant,
    resolution: number(params, 'skyRes', INERT.resolution),
    brightness: number(params, 'skyBrightness', INERT.brightness),
    contrast: number(params, 'skyContrast', INERT.contrast),
    yawDegrees: number(params, 'skyYaw', INERT.yawDegrees),
    tiltDegrees: number(params, 'skyTilt', INERT.tiltDegrees),
    debug,
    ...capture,
  }
}

/**
 * Read once, at module load, for the reason in the header. Exported as a
 * function rather than the value so the tests can exercise `parse` against a
 * string without a browser.
 */
export const PROTO_SKY: ProtoSkyParams =
  typeof window === 'undefined' ? INERT : parse(window.location.search)

/** True only when a cubemap variant was actually requested. */
export function protoSkyActive(): boolean {
  return PROTO_SKY.variant !== null
}

/**
 * The six faces, in the order `THREE.CubeTextureLoader` wants them.
 *
 * Resolution is a directory rather than a suffix so a variant can hold both the
 * 4096 set the discovery is really about and the 2048 fallback, and switching
 * between them is a URL edit rather than a re-export.
 */
export function protoSkyFaceUrls(variant: string, resolution: number): string[] {
  // px, nx, py, ny, pz, nz — which is the editor's own `posx negx posy negy
  // posz negz` naming in the same order, so the export needs no remapping.
  return ['posx', 'negx', 'posy', 'negy', 'posz', 'negz'].map(
    (face) => `/proto-sky/${variant}/${resolution}/${face}.png`,
  )
}

/**
 * Where a scratch sky image lives. `public/textures/` rather than a directory
 * of its own, so the candidate sits beside the files it is auditioning to
 * replace and the same Vite static path serves both.
 */
export function protoSkyImageUrl(image: string): string {
  return `/textures/${image}`
}

export { parse as parseProtoSkyParams }
