/**
 * The AVIF surface-map prototype's URL gate. Discovery scaffolding, not a feature.
 *
 * `audits/reports/project-resource-budget-earth-2026-11-18.md` (option B)
 * measured day and night as AVIF at roughly half the bytes of the shipped
 * ETC1S, with better PSNR — and at three to four times the GPU memory, because
 * an AVIF uploads as RGBA8 where the KTX2 stays block-compressed. Bytes and
 * PSNR are offline numbers. What is left to answer needs the running scene: how
 * it looks at the zoom's near end, what the decode costs, and whether an iPad
 * keeps the tab alive with ~90 MB of surface maps instead of ~25.
 *
 * So this is a switch, and everything it switches on is additive. With no
 * `?earthTex=` every value below is the inert default and the scene loads the
 * shipped set — since 2026-11-23 that is AVIF day and night on a desktop
 * (`EARTH_TEXTURES.wideAvif`), so the baseline arm of a desktop comparison is
 * no longer the KTX2 pair. Gated on `DEBUG_TOOLS_ENABLED`, like
 * `protoSky.ts`: in a production build the variant is unconditionally null.
 *
 * Only day and night are switched. The clouds stay KTX2: the audit's cloud
 * variant needs a remapped mask and a shader change, which is a separate
 * question from the memory one this exists to answer.
 *
 * Read ONCE, at module load, so every capture in a session is of the same arm.
 */
import { DEBUG_TOOLS_ENABLED } from '../../../platform/buildFlags'

export interface ProtoEarthTextureParams {
  /**
   * Which variant to load, from `public/proto-earth/<variant>/`. Null means the
   * shipped maps (`EARTH_TEXTURES`) — the baseline arm, and the default.
   */
  variant: string | null
}

const INERT: ProtoEarthTextureParams = { variant: null }

/**
 * Variant names index a directory under `public/`, so they are restricted to
 * the shape a directory name takes: no `/`, no `..`. Same rule as `protoSky.ts`.
 */
function variantName(raw: string | null): string | null {
  if (raw === null) return null
  return /^[a-z0-9][a-z0-9-]{0,31}$/i.test(raw) ? raw : null
}

function parse(search: string): ProtoEarthTextureParams {
  if (!DEBUG_TOOLS_ENABLED) return INERT
  return { variant: variantName(new URLSearchParams(search).get('earthTex')) }
}

export const PROTO_EARTH_TEXTURES: ProtoEarthTextureParams =
  typeof window === 'undefined' ? INERT : parse(window.location.search)

/**
 * The day and night maps of a variant, for the tier this session latched.
 * The narrow files carry a `-narrow` suffix, like the shipped set.
 */
export function protoEarthTextureUrls(
  variant: string,
  narrow: boolean,
): { day: string; night: string } {
  const suffix = narrow ? '-narrow' : ''
  return {
    day: `/proto-earth/${variant}/day${suffix}.avif`,
    night: `/proto-earth/${variant}/night${suffix}.avif`,
  }
}

export { parse as parseProtoEarthTextureParams }
