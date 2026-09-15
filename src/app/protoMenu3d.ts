/**
 * The phone menu's tuning gate. Discovery scaffolding, not a feature — the
 * sibling of `protoHolo.ts`, built the same way for the same reasons.
 *
 * On a phone over the scene the menu is the viewport hinging away and sliding
 * down (styles.css, `.app__viewport`), and the composition — how far it drops,
 * how far it recedes, how far it hinges — is a handful of custom properties on
 * `.app__stage`. On a desktop they are edited in DevTools; on the phone the
 * composition is actually for, the address bar is the only knob panel there
 * is. This reads them from the URL and App writes them inline on the stage,
 * where they outrank the stylesheet's defaults.
 *
 *   ?menu3d=1&y=42&z=-140&tilt=12&scale=1&radius=18&persp=1200&hinge=100&eye=50
 *
 * Numbers only; the units are fixed here so a URL cannot smuggle in an
 * expression. Anything absent keeps the stylesheet's value, so a URL that sets
 * one knob compares against the defaults for the rest.
 *
 * With no `?menu3d=1` nothing is written. Gated on `DEBUG_TOOLS_ENABLED` too,
 * so in a production build the parser is never consulted and `?tilt=80` from a
 * visitor's address bar does nothing. Read ONCE, at module load, like the other
 * gates: screenshots of a composition that can change mid-run cannot be
 * compared with each other.
 */
import { DEBUG_TOOLS_ENABLED } from '../platform/buildFlags'

export interface ProtoMenu3dParams {
  /** True only when `?menu3d=1` opened the gate. */
  active: boolean
  /**
   * The custom properties to write on `.app__stage`, already carrying their
   * units. Empty when the gate is shut or nothing was asked for.
   */
  vars: Readonly<Record<string, string>>
}

const INERT: ProtoMenu3dParams = { active: false, vars: {} }

/** URL key → the property it drives, and the unit it is spelled in. */
const KNOBS: ReadonlyArray<readonly [key: string, property: string, unit: string]> = [
  ['y', '--menu-3d-y', 'vh'],
  ['z', '--menu-3d-z', 'px'],
  ['tilt', '--menu-3d-tilt', 'deg'],
  ['scale', '--menu-3d-scale', ''],
  ['radius', '--menu-3d-radius', 'px'],
  ['persp', '--menu-3d-perspective', 'px'],
  ['hinge', '--menu-3d-hinge', '%'],
  ['eye', '--menu-3d-eye', '%'],
]

function number(raw: string | null): number | null {
  // Empty is absent, not zero: a trailing `&tilt=` must not flatten the card
  // and leave nothing to explain why the menu stopped hinging.
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function parse(search: string): ProtoMenu3dParams {
  if (!DEBUG_TOOLS_ENABLED) return INERT
  const params = new URLSearchParams(search)
  if (params.get('menu3d') !== '1') return INERT
  const vars: Record<string, string> = {}
  for (const [key, property, unit] of KNOBS) {
    const value = number(params.get(key))
    if (value !== null) vars[property] = `${value}${unit}`
  }
  return { active: true, vars }
}

export const PROTO_MENU3D: ProtoMenu3dParams =
  typeof window === 'undefined' ? INERT : parse(window.location.search)

export { parse as parseProtoMenu3dParams }
