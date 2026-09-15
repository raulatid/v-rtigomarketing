/**
 * When the Earth intro's scripted tail may be skipped (plan 025).
 *
 * The intro has two halves with different jobs. The loading draw (`draw`) is
 * the cover for the load and must never be cut — the timeline does not even
 * exist until every required resource is ready. The tail after it (shrink to
 * orbits, ~9.7 s) plays over a scene that is already whole, and nothing in it
 * waits on loading (measured 2026-09-15, plan 025), so a visitor may leave it.
 * `site` is the landed page, where a press is the visitor using it.
 */
import type { Phase } from '../experiences/earth/config/introConfig'

export const TAIL_PHASES: readonly Phase[] = ['shrink', 'warp', 'swap', 'corner', 'orbits']

export function canSkipTail(phase: Phase): boolean {
  return TAIL_PHASES.includes(phase)
}
