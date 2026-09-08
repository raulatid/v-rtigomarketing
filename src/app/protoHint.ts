/**
 * The particle hint's tuning gate. The sibling of `protoTutorial.ts` and
 * `protoSky.ts`, built the same way for the same reason.
 *
 * The hint is offered 1.2s after an arrival and gone three seconds after the
 * first scroll — which is right for a visitor and hopeless for judging it: the
 * arrival is minutes into the intro, and the gesture that would let you look at
 * the figure is the one that dismisses it. `?hint=1` holds it on screen and
 * ignores the linger, so the dot spacing, the sentence size, the colour against
 * a bright limb and the gathering can be looked at against the live scene.
 *
 * That looking is not optional here. The values in `hintConfig.ts` were derived
 * by arithmetic — skeleton length over budget against sprite diameter — and
 * arithmetic can say a figure is legible without saying it is good.
 *
 * Gated on `DEBUG_TOOLS_ENABLED`, so a production build never consults the
 * parser. Read ONCE at module load, like the other gates.
 */
import { DEBUG_TOOLS_ENABLED } from './buildFlags'

export interface ProtoHintParams {
  /** True only when `?hint=1` opened the gate: hold it, never dismiss. */
  hold: boolean
}

const INERT: ProtoHintParams = { hold: false }

function parse(search: string): ProtoHintParams {
  if (!DEBUG_TOOLS_ENABLED) return INERT
  return { hold: new URLSearchParams(search).get('hint') === '1' }
}

export const PROTO_HINT: ProtoHintParams =
  typeof window === 'undefined' ? INERT : parse(window.location.search)
