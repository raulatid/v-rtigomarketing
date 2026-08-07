// Standalone entry: starts the drawing before the app exists.
//
// Its own Rollup input (see vite.config.ts), shipped as a <script type="module">
// ahead of the app's, so the isotype is drawing while the scene chunk is still
// downloading. It imports nothing — the build fails if that stops being true.

import { createIntroDraw, IntroDrawHandle } from './introDraw'
import { bootState, BootState, Readiness } from './bootState'

export interface VertigoIntro {
  handle: IntroDrawHandle
  boot: BootState
  /** Resolves the first time the fill completes. Replays use subscribeComplete. */
  completed: Promise<void>
  /**
   * The intro waited past its notice threshold. DIAGNOSTIC ONLY — it never
   * means ready, and never releases the sequence (plan 007 Phase 4).
   */
  waitedTooLong(): boolean
}

declare global {
  interface Window {
    __vertigoIntro?: VertigoIntro
    __vertigoBootDebug?: {
      state(): Readiness
      visualProgress(): number
      measuredProgress(): number
      pending(): string[]
      completed(): string[]
      elapsed(): number
      holding(): boolean
      waitedTooLong(): boolean
      fatalReason(): string | null
      zones(): { zoneAEnd: number; preReadyLimit: number; ceiling: number }
    }
  }
}

const mark = (name: string) => {
  try {
    performance.mark(name)
  } catch {
    // Never let instrumentation break the boot path.
  }
}

function boot(): VertigoIntro {
  mark('vertigo:boot-start')
  const startedAt = performance.now()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let markComplete: () => void = () => {}
  const completed = new Promise<void>((resolve) => {
    markComplete = resolve
  })

  let waited = false
  let sawVisible = false

  const handle = createIntroDraw({
    // Two separate inputs, deliberately. Progress moves the drawing; readiness
    // gates its ending. Conflating them is what produced the blank screen.
    getProgress: () => bootState.progress(),
    getReadiness: () => bootState.readiness(),
    onComplete: () => {
      mark('vertigo:intro-complete')
      markComplete()
    },
    onTimeoutNotice: () => {
      waited = true
      console.warn(
        `[boot] still waiting after ${(performance.now() - startedAt) / 1000 | 0}s — ` +
          `pending: ${bootState.pending().join(', ') || 'none'}. ` +
          'The intro keeps waiting; it will NOT enter an unready scene.',
      )
    },
    reducedMotion,
  })

  // First visible frame of the drawing, for the waterfall record.
  requestAnimationFrame(() => {
    if (!sawVisible) {
      sawVisible = true
      mark('vertigo:intro-visible')
    }
  })

  bootState.subscribe(() => {
    if (bootState.readiness() === 'ready') mark('vertigo:scene-ready')
  })

  // Small enough to ship in production: when the intro looks stuck, this is
  // the difference between "which resource is pending" and guesswork.
  window.__vertigoBootDebug = {
    state: () => bootState.readiness(),
    visualProgress: () => handle.playhead(),
    measuredProgress: () => bootState.progress(),
    pending: () => bootState.pending(),
    completed: () => bootState.completed(),
    elapsed: () => (performance.now() - startedAt) / 1000,
    holding: () => handle.isHolding(),
    waitedTooLong: () => waited,
    fatalReason: () => bootState.fatalReason(),
    zones: () => handle.zones(),
  }

  return { handle, boot: bootState, completed, waitedTooLong: () => waited }
}

// Idempotent: if the app chunk somehow evaluates this first, it still gets the
// one instance rather than a second drawing on top of the first.
export const intro: VertigoIntro = (window.__vertigoIntro ??= boot())
