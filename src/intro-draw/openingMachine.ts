// The opening's discrete state, as one transition function (ADR 016).
//
// Pure and dependency-free, like everything in intro-draw: no clocks, no curves,
// no per-frame logic. The motion inside a state belongs to whatever clock drives
// it; this only says which state the opening is in, what may move it on, and
// how much main-thread work that state admits.
//
// The intro's tail (experiences/earth/timeline/openingTail) moves through the
// phases only as `elapsed` events this accepts, in this machine's sequence for
// the way in; the tail owns only how long each lasts (migration step 4). Events
// are plain objects on purpose: a worker can sit on the other side of them (step 3).
//
// There is one opening per page: `openingStore` holds it, and the app creates it
// when it adopts the boot (`loading/opening.ts`).

import type { Readiness } from './bootState'

/**
 * The application's `Phase`, by the same names and in the same order (§26.1).
 * Restated rather than imported because intro-draw imports nothing; the
 * timeline's test fails to compile if the two lists ever differ.
 */
export type Presentation = 'draw' | 'shrink' | 'warp' | 'swap' | 'corner' | 'orbits' | 'site'

/**
 * Which way in. A returning visitor waits unseen and enters at the crossover,
 * so there is no warp; reduced motion has no tail at all.
 */
export type Way = 'first' | 'returning' | 'reduced'

/**
 * Where a unit of work runs. A program link is `gpu`, and `gpu` counts as main
 * thread: the link-status query blocks, measured at 86–100 ms per batch even
 * with KHR_parallel_shader_compile (2026-10-16).
 */
export type WorkKind = 'network' | 'worker' | 'main' | 'gpu'

export interface Opening {
  readonly presentation: Presentation
  readonly way: Way
  readonly readiness: Readiness
  /** The 3D mark can be substituted for the 2D one (§26.8). */
  readonly logoReady: boolean
}

export type OpeningEvent =
  /** bootState's readiness after a step reported. The hard deadline arrives here as `fatal`. */
  | { readonly type: 'readiness'; readonly readiness: Readiness }
  /** The drawing's fill completed: readiness, minimum duration and ending gesture (§26.20). */
  | { readonly type: 'fill' }
  /** The current presentation state's time is up. */
  | { readonly type: 'elapsed' }
  | { readonly type: 'logo-ready' }
  /** Debug replay: the drawing again, then the whole tail whatever `returning` said. */
  | { readonly type: 'replay' }
  /** The tail starts again from its first phase: a seek back, or the tail rebuilt. */
  | { readonly type: 'rewind' }

const SEQUENCE: Record<Way, readonly Presentation[]> = {
  first: ['draw', 'shrink', 'warp', 'swap', 'corner', 'orbits', 'site'],
  // `shrink` stays: it is where a drawing that outlasted its grace collapses.
  returning: ['draw', 'shrink', 'swap', 'corner', 'orbits', 'site'],
  reduced: ['draw', 'site'],
}

// ADR 016's table. `draw` admits everything because the drawing is still on the
// main thread and the required steps have to run somewhere; once it moves to a
// worker (step 3) the answer stays the same for a different reason. `site`
// admits main-thread work in slices, whose budget is still an open question.
const MAIN_THREAD: Record<Presentation, boolean> = {
  draw: true,
  shrink: false,
  warp: false,
  swap: false,
  corner: false,
  orbits: false,
  site: true,
}

export function createOpening(options: { returning: boolean; reducedMotion: boolean }): Opening {
  return {
    presentation: 'draw',
    way: options.reducedMotion ? 'reduced' : options.returning ? 'returning' : 'first',
    readiness: 'starting',
    logoReady: false,
  }
}

/** Returns `state` itself when the event changes nothing. */
export function next(state: Opening, event: OpeningEvent): Opening {
  switch (event.type) {
    case 'readiness':
      // Fatal latches, as it does in bootState.
      return state.readiness === event.readiness || state.readiness === 'fatal'
        ? state
        : { ...state, readiness: event.readiness }
    case 'fill':
      // The guard §26.5 states: the scene is never entered before the required
      // steps are done, whatever the drawing believes.
      return state.presentation === 'draw' && state.readiness === 'ready' ? advance(state) : state
    case 'elapsed':
      // `draw` ends on its fill, never on time.
      return state.presentation === 'draw' ? state : advance(state)
    case 'logo-ready':
      return state.logoReady ? state : { ...state, logoReady: true }
    case 'replay':
      return {
        ...state,
        presentation: 'draw',
        way: state.way === 'reduced' ? 'reduced' : 'first',
      }
    case 'rewind': {
      // Never out of `draw`: only the fill can do that.
      if (state.presentation === 'draw') return state
      const [first] = tail(state)
      return state.presentation === first ? state : { ...state, presentation: first }
    }
  }
}

/** The phases after `draw` on this way in, in order, ending at `site`. */
export function tail(state: Pick<Opening, 'way'>): readonly Presentation[] {
  return SEQUENCE[state.way].slice(1)
}

function advance(state: Opening): Opening {
  const sequence = SEQUENCE[state.way]
  const at = sequence.indexOf(state.presentation)
  // A state outside its own way's sequence would restart at `draw` here.
  // Unreachable today (`replay` resets both together), and refused if not.
  const following = at < 0 ? undefined : sequence[at + 1]
  return following ? { ...state, presentation: following } : state
}

/** The work rule: the scheduler starts nothing the current state does not admit. */
export function admits(state: Pick<Opening, 'presentation'>, kind: WorkKind): boolean {
  return kind === 'network' || kind === 'worker' || MAIN_THREAD[state.presentation]
}

/** The 2D mark may change hands only into a model that exists (§26.8). */
export function canSubstitute(state: Opening): boolean {
  return state.presentation === 'swap' && state.logoReady
}
