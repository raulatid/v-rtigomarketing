// Standalone entry: starts the drawing before the app exists.
//
// Its own Rollup input (see vite.config.ts), shipped as a <script type="module">
// ahead of the app's, so the isotype is drawing while the scene chunk is still
// downloading. It imports nothing — the build fails if that stops being true.

import { createIntroDraw, IntroDrawHandle } from './introDraw'
import { bootState, BootState, Readiness, REQUIRED_IDS } from './bootState'
import { DRAW_TIMING } from './drawConfig'
import { isReturningVisitor } from './returningVisitor'

// Inline build constant keeps the boot entry independent of shared chunks.
// In dev this entry can run before Vite's client installs the define on window.
// Keep the same fallback as buildFlags.ts without importing a shared module.
declare const __VERTIGO_ENV__: string | undefined

export interface VertigoIntro {
  /** Document motion snapshot handed to the application without importing boot. */
  readonly reducedMotion: boolean
  /**
   * This browser has landed here before, with consent to remember it. Decided
   * here because the drawing has to know before it draws; handed to the
   * application the same way as the motion snapshot, so both act on one answer.
   */
  readonly returning: boolean
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
  let returning = false
  try {
    returning = isReturningVisitor(window.localStorage)
  } catch {
    // A browser blocking site data throws on the accessor itself. First visit.
  }

  let markComplete: () => void = () => {}
  const completed = new Promise<void>((resolve) => {
    markComplete = resolve
  })

  let waited = false
  let sawVisible = false
  let sawReady = false

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
    // A returning visitor waits unseen and goes straight to the 3D mark.
    quiet: returning,
  })

  // First visible frame of the drawing, for the waterfall record.
  // Not for a returning visitor: their wait is unseen, so there is no such frame
  // to record, and a mark here would put a drawing in the waterfall that nobody saw.
  requestAnimationFrame(() => {
    if (!sawVisible && !returning) {
      sawVisible = true
      mark('vertigo:intro-visible')
    }
  })

  // The backstop against a required resource that neither completes nor fails
  // (ADR 007). It reports FATAL, never ready — the rule that a timeout cannot
  // release the sequence into an unready scene is intact. What it prevents is
  // the other outcome: waiting forever with no explanation.
  const deadline = window.setTimeout(() => {
    const readiness = bootState.readiness()
    if (readiness === 'ready' || readiness === 'fatal') return

    // Name the resource actually responsible, so the console says which one
    // rather than "the site did not load". markFatal only accepts a required
    // id, which is the same set this filters to.
    const done = new Set(bootState.completed())
    const stuck = REQUIRED_IDS.filter((id) => !done.has(id))
    bootState.markFatal(
      stuck[0] ?? 'chunk:scene',
      `no readiness after ${DRAW_TIMING.hardDeadline}s; still pending: ${stuck.join(', ') || 'nothing'}`,
    )
  }, DRAW_TIMING.hardDeadline * 1000)

  // `ready` is latched, and the optional resources keep notifying after it, so
  // this subscription sees the ready state many times on a slow load. The mark
  // is the TRANSITION, not the state: marking it again would move the recorded
  // timestamp onto the last late notification. Same latch as `sawVisible`.
  bootState.subscribe(() => {
    if (!sawReady && bootState.readiness() === 'ready') {
      sawReady = true
      mark('vertigo:scene-ready')
      window.clearTimeout(deadline)
    }
  })

  if ((typeof __VERTIGO_ENV__ === 'undefined' ? 'development' : __VERTIGO_ENV__) !== 'production') {
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
  }

  return { reducedMotion, returning, handle, boot: bootState, completed, waitedTooLong: () => waited }
}

// Idempotent: if the app chunk somehow evaluates this first, it still gets the
// one instance rather than a second drawing on top of the first.
export const intro: VertigoIntro = (window.__vertigoIntro ??= boot())
