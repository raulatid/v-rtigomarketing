/**
 * The hover tutorial's tuning gate. Discovery scaffolding, the sibling of
 * `protoHolo.ts`, built the same way for the same reasons.
 *
 * The tutorial plays twice per session and retires the moment the viewer
 * hovers or selects a satellite — which is right for a visitor and hopeless
 * for tuning it: every look at a changed value costs a reload and a full
 * intro. `?tutorial=1` makes it loop and ignore retirement so its particles,
 * timing and the hover light can be judged against the live scene.
 *
 * Gated on `DEBUG_TOOLS_ENABLED`, so a production build never consults the
 * parser. Read ONCE at module load, like the other gates.
 */
import { DEBUG_TOOLS_ENABLED } from './buildFlags'

export interface ProtoTutorialParams {
  /** True only when `?tutorial=1` opened the gate: loop forever, never retire. */
  loop: boolean
}

const INERT: ProtoTutorialParams = { loop: false }

function parse(search: string): ProtoTutorialParams {
  if (!DEBUG_TOOLS_ENABLED) return INERT
  return { loop: new URLSearchParams(search).get('tutorial') === '1' }
}

export const PROTO_TUTORIAL: ProtoTutorialParams =
  typeof window === 'undefined' ? INERT : parse(window.location.search)

export { parse as parseProtoTutorialParams }
