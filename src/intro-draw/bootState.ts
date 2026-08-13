// Boot coordinator: owns visual progress, readiness, and timeout semantics.
// Zero dependencies, by rule — it lives in the boot chunk, upstream of the app.
//
// Replaces loadProgress.ts. The change that matters is that a resource now
// carries TWO independent properties:
//
//   weight    how much it contributes to VISUAL progress
//   required  whether readiness waits for it
//
// Previously there was only weight, so "the drawing has advanced" and "the app
// can be shown" were the same number. They are not the same question:
// satellite models are 15% of the bytes but are not needed until P5, seconds
// after the intro hands over — they should move the drawing without gating it.

export type StepId =
  | 'chunk:scene'
  | 'earth:textures'
  | 'sky:panorama'
  | 'gpu:warmup'
  | 'satellite:assets'
  | 'logo:assets'
  | 'orbits:build'
  | 'murcia:model'

export type Readiness = 'starting' | 'loading' | 'ready' | 'fatal'

interface Resource {
  weight: number
  required: boolean
}

// `required` is the readiness contract: everything needed to render a valid
// first frame of the scene the warp cuts into.
const RESOURCES: Record<StepId, Resource> = {
  // three.js + the scene module, evaluated.
  'chunk:scene': { weight: 20, required: true },
  'earth:textures': { weight: 30, required: true },
  // The sky the Earth cuts into. Required, because the backdrop is gated on the
  // same predicate as the Earth and the design is that nothing cross-fades or
  // pops in afterwards — a sky that arrives late arrives visibly.
  //
  // Only 111 KB against the Earth's 2.43 MB, so the weight is small: it must be
  // able to gate readiness without dominating the drawing's measured progress.
  //
  // NOTE for whoever loads it: `required` here means a failure to load must
  // still call markDone(), never markFatal(). Fatal is for a resource without
  // which the scene is invalid; a missing sky is a black sky, and the site is
  // worth more than the backdrop. Getting this wrong holds every visitor to the
  // 45s hard deadline for a decorative texture.
  'sky:panorama': { weight: 5, required: true },
  // Uploads + shader compile. Without it the cut lands on an unshaded sphere.
  'gpu:warmup': { weight: 15, required: true },
  // Needed for the P3 crossover, which is the first thing after the intro.
  'logo:assets': { weight: 10, required: true },
  'orbits:build': { weight: 10, required: true },
  // NOT required: satellites appear in P5, several seconds after handover.
  // They move the drawing along without ever being able to block it.
  'satellite:assets': { weight: 15, required: false },
  // NOT required: Murcia is a different experience entirely, reachable only by
  // a button that does not exist until the intro has landed. It loads here
  // rather than on demand so the transition never waits on a 456KB Draco parse
  // and a shader compile (ADR 004) — but it must never be able to hold the
  // intro back, which is exactly what `required: false` buys.
  //
  // Weight kept low deliberately: this is the one manifest entry whose bytes
  // the viewer is not waiting for, so it should not dominate the drawing's
  // measured progress.
  'murcia:model': { weight: 10, required: false },
}

const IDS = Object.keys(RESOURCES) as StepId[]
const TOTAL_WEIGHT = IDS.reduce((sum, id) => sum + RESOURCES[id].weight, 0)
const REQUIRED = IDS.filter((id) => RESOURCES[id].required)

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export interface BootState {
  /** Fraction 0..1 for one resource. Monotonic and idempotent. */
  setStep(id: StepId, fraction: number): void
  markDone(id: StepId): void
  report(id: StepId, loaded: number, total: number): void
  /** A required resource cannot be obtained. Never recoverable. */
  markFatal(id: StepId, reason: string): void
  /** Visual progress, 0..1. NOT readiness. */
  progress(): number
  readiness(): Readiness
  subscribe(fn: () => void): () => void
  pending(): StepId[]
  completed(): StepId[]
  fatalReason(): string | null
  reset(): void
}

/**
 * A fresh, independent boot state.
 *
 * Exported for tests only. The application must use the `bootState` singleton
 * below — a second live instance would mean two answers to "is the scene ready",
 * and the one the intro reads would not be the one the app writes.
 *
 * It is exported rather than reconstructed in the test because testing a
 * readiness machine against the cross-chunk global means every case contaminates
 * the next, and `reset()` cannot undo a `fatal` that a previous case latched.
 *
 * Costs nothing: this module is in the 16 KB intro chunk, and Rollup tree-shakes
 * the unused export. The budget assertion in vite.config.ts reports immediately
 * if that ever stops being true.
 */
export function createBootState(): BootState {
  return create()
}

function create(): BootState {
  const fractions = new Map<StepId, number>()
  const listeners = new Set<() => void>()
  let cachedProgress = 0
  let state: Readiness = 'starting'
  let fatal: string | null = null

  function recompute() {
    let sum = 0
    for (const id of IDS) sum += (fractions.get(id) ?? 0) * RESOURCES[id].weight
    const nextProgress = sum / TOTAL_WEIGHT

    let nextState: Readiness = state
    if (state !== 'fatal') {
      // Readiness counts ONLY required resources, and only at full completion.
      // A resource is not "ready" because its source file executed.
      const allRequired = REQUIRED.every((id) => (fractions.get(id) ?? 0) >= 1)
      nextState = allRequired ? 'ready' : nextProgress > 0 ? 'loading' : 'starting'
    }

    if (nextProgress === cachedProgress && nextState === state) return
    cachedProgress = nextProgress
    state = nextState
    for (const fn of listeners) fn()
  }

  function setStep(id: StepId, fraction: number) {
    if (state === 'fatal') return
    const value = clamp01(fraction)
    // Monotonic and idempotent: reporting the same milestone twice, or a
    // regressed byte count, must not corrupt progress.
    if (value <= (fractions.get(id) ?? 0)) return
    fractions.set(id, value)
    recompute()
  }

  return {
    setStep,
    markDone: (id) => setStep(id, 1),
    report: (id, loaded, total) => setStep(id, total > 0 ? loaded / total : 0),
    markFatal(id, reason) {
      if (state === 'fatal') return
      // Only a REQUIRED resource can be fatal. An optional one failing must
      // never take the site down — it just never contributes its weight.
      if (!RESOURCES[id]?.required) {
        console.warn(`[boot] optional resource ${id} failed: ${reason}`)
        return
      }
      fatal = `${id}: ${reason}`
      state = 'fatal'
      console.error(`[boot] fatal — ${fatal}`)
      for (const fn of listeners) fn()
    },
    progress: () => cachedProgress,
    readiness: () => state,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    pending: () => IDS.filter((id) => (fractions.get(id) ?? 0) < 1),
    completed: () => IDS.filter((id) => (fractions.get(id) ?? 0) >= 1),
    fatalReason: () => fatal,
    reset() {
      fractions.clear()
      cachedProgress = 0
      state = 'starting'
      fatal = null
      for (const fn of listeners) fn()
    },
  }
}

// One instance across chunks — the boot entry creates it, the app adopts it.
const KEY = '__vertigoBootState'
const scope = globalThis as unknown as Record<string, BootState | undefined>
export const bootState: BootState = (scope[KEY] ??= create())

export const REQUIRED_IDS = REQUIRED
