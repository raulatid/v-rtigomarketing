/**
 * The Earth hint's tuning gate. The sibling of `protoTutorial.ts` and
 * `protoSky.ts`, built the same way for the same reason.
 *
 * The hint appears after two seconds of stillness and steps aside the moment the
 * viewer acts — which is right for a visitor and hopeless for judging it, since
 * the act of looking at it on a laptop is usually the act that dismisses it.
 * `?hint=1` holds it on screen, so the type size, the bottom gap against the
 * footer and the sentence's legibility over a bright limb can be looked at
 * against the live scene.
 *
 * That looking is not optional. The sizes in `.earth-hint` were carried over
 * from a figure tuned at a different medium, and a stylesheet can say the
 * sentence fits without saying it reads.
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
