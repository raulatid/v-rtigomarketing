import type { BootState, StepId } from '../intro-draw/bootState'

// App-side accessor for the boot coordinator.
//
// The coordinator itself lives in the boot chunk. App code reaches it through
// the global rather than by importing the module, and that indirection is
// load-bearing: a static import would make Rollup hoist intro-draw into a chunk
// SHARED by the boot entry and the app bundle, giving that entry an import and
// failing the standalone assertion in vite.config.ts.
//
// Every import here is type-only, so nothing survives compilation.

function store(): BootState | undefined {
  return window.__vertigoIntro?.boot
}

// No-ops when the store is absent: reporting progress must never be able to
// break a scene that would otherwise render fine.
export const loadProgress = {
  setStep: (id: StepId, fraction: number) => store()?.setStep(id, fraction),
  markDone: (id: StepId) => store()?.markDone(id),
  report: (id: StepId, loaded: number, total: number) => store()?.report(id, loaded, total),
  /**
   * A REQUIRED resource cannot be obtained, so the scene can never render.
   * Optional resources failing are logged and ignored — one missing subsystem
   * must not deadlock or kill the intro (plan 007 §12 case 4).
   */
  markFatal: (id: StepId, reason: string) => store()?.markFatal(id, reason),
  get: () => store()?.progress() ?? 0,
  readiness: () => store()?.readiness() ?? 'starting',
}
