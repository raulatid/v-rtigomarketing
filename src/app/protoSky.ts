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

function parse(search: string): ProtoSkyParams {
  if (!DEBUG_TOOLS_ENABLED) return INERT

  const params = new URLSearchParams(search)
  const variant = variantName(params.get('sky'))
  if (variant === null) {
    // `?freezeEarth=1` is useful on its own — the existing e2e suite stops the
    // spin by hand for exactly this reason — so it is read even with no
    // variant. Nothing else is: the remaining knobs only mean something to a
    // cubemap that is not loaded.
    return { ...INERT, freezeEarth: params.get('freezeEarth') === '1' }
  }

  return {
    variant,
    resolution: number(params, 'skyRes', INERT.resolution),
    brightness: number(params, 'skyBrightness', INERT.brightness),
    contrast: number(params, 'skyContrast', INERT.contrast),
    yawDegrees: number(params, 'skyYaw', INERT.yawDegrees),
    tiltDegrees: number(params, 'skyTilt', INERT.tiltDegrees),
    // Same rule as `number`: only an actual value counts, so `&stars=` leaves
    // the shipped particle field alone rather than silently deleting it.
    stars: starCount(params.get('stars')),
    freezeEarth: params.get('freezeEarth') === '1',
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

export { parse as parseProtoSkyParams }
