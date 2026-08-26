/**
 * The split-plate hologram's inspection gate. Discovery scaffolding, not a
 * feature — the sibling of `protoSky.ts`, built the same way for the same
 * reasons.
 *
 * `docs/plans/007-satellite-hologram-redesign-variant-split-plate.md` phase 2
 * asks for a way to look at the hologram collapsed, half-deployed and fully
 * deployed in the real Earth scene without performing the whole select /
 * deselect journey for every shader tweak. This pins every panel's expansion
 * from the URL and, optionally, stops its clock.
 *
 * With no `?holo=1` every value below is the inert default and the panels
 * behave exactly as selection drives them. Gated on `DEBUG_TOOLS_ENABLED` too,
 * so in a production build the parser is never consulted and `?holoExpand=1`
 * from a visitor's address bar does nothing.
 *
 * Read ONCE, at module load, like the sky gate: screenshots of a prototype
 * whose parameters can change mid-run cannot be compared with each other.
 * `freezeEarth` and `stars` are NOT duplicated here — they belong to the
 * capture and already live in `protoSky.ts`; the two gates compose in one URL.
 */
import { DEBUG_TOOLS_ENABLED } from './buildFlags'

export interface ProtoHoloParams {
  /** True only when `?holo=1` opened the gate. */
  active: boolean
  /**
   * Eased expansion to pin EVERY panel at, 0..1, or null to let selection
   * drive them. Pinned means the per-frame advance is bypassed; the derived
   * uniforms are still written through the normal path, so what is inspected
   * is the real shader state at that value, not a special case.
   */
  expand: number | null
  /** Stop the panel clock (`uTime`): no breathing, for a deterministic shot. */
  freeze: boolean
}

const INERT: ProtoHoloParams = { active: false, expand: null, freeze: false }

function pin(raw: string | null): number | null {
  // Empty is absent, not zero: a trailing `&holoExpand=` must not pin the
  // panels shut and leave nothing to explain why selection stopped working.
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function parse(search: string): ProtoHoloParams {
  if (!DEBUG_TOOLS_ENABLED) return INERT
  const params = new URLSearchParams(search)
  if (params.get('holo') !== '1') return INERT
  return {
    active: true,
    expand: pin(params.get('holoExpand')),
    freeze: params.get('holoFreeze') === '1',
  }
}

export const PROTO_HOLO: ProtoHoloParams =
  typeof window === 'undefined' ? INERT : parse(window.location.search)

export { parse as parseProtoHoloParams }
