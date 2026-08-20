import type { ExperienceId } from '../experience'
import { normalizeWheelDelta } from '../../utils/wheelDelta'
import { createNavigationGesture } from './navigationGesture'
import { createNavigationMachine, intentFor } from './navigationMachine'
import type { NavigationIntent } from './navigationMachine'
import { createProgressSpring } from './progressSpring'
import {
  NAVIGATION_COOLDOWN,
  NAVIGATION_GESTURE,
  NAVIGATION_SPRING,
  type NavigationCooldownLimits,
  type NavigationGestureLimits,
  type NavigationSpringLimits,
} from './navigationConfig'

// The only impure module in `app/navigation/`: DOM listeners, a frame loop, and
// the writes that drive the indicator. Everything it decides is decided by the
// pure accumulator and the pure machine beside it.
//
// ── One global wheel authority ──
//
// After `adr/009` no experience listens for `wheel`. This is the ONLY wheel
// handler in the application: the only caller of `preventDefault`, the only owner
// of `deltaMode` normalisation, the only producer of navigation travel. That is
// not tidiness — momentum can only be reasoned about where the whole stream is
// visible in one place, and the two handlers this replaced had different
// capabilities (one `passive`, one not) and an ordering that depended on when a
// GLB finished downloading.
//
// It listens on `window` for the same reason. The canvas is not the only thing on
// screen, and a listener on it would miss the wheel over the audit panel, over the
// case panel, and over the rail itself.
//
// ── Its own frame loop, and why not R3F's ──
//
// The accumulator needs a clock and there is no application-level frame loop —
// R3F's belongs to the scene graph, and ADR 002 makes its priority ordering a
// render contract. Putting a navigation concern in `useFrame` would make the
// indicator a scene-graph citizen and tie input to a renderer that is allowed to
// stop. So this owns a small rAF that runs only while something is happening:
// started by the first input, stopped when travel reaches zero with nothing to
// cool down. An idle Earth costs no frames here at all.

export interface NavigationContext {
  /** Which experience is showing. Supplied, never owned — see navigationMachine. */
  current: ExperienceId
  /**
   * Whether a gesture may be accumulated at all.
   *
   * Read fresh on every event and again at the commit, never cached and never
   * mirrored into React state: a mirror lags by a render on the clearing edge,
   * and a value sampled when the gesture began would let a gesture that started
   * legally commit into a district the viewer opened half way through it.
   */
  canNavigate: boolean
}

export interface NavigationInputDeps {
  /** The rail: the indicator, and the touch target. Owned by the caller. */
  rail: HTMLElement
  getContext: () => NavigationContext
  /** A commit. The caller runs the transition and must call `settle` when it ends. */
  onCommit: (intent: NavigationIntent) => void
  gestureLimits?: NavigationGestureLimits
  cooldownLimits?: NavigationCooldownLimits
  springLimits?: NavigationSpringLimits
}

export interface NavigationInput {
  /** The transition finished. Starts the cooldown from this instant. */
  settle(): void
  /**
   * The context's semantic inputs changed — a panel opened or closed, a world
   * finished loading, the intro moved. Re-derives the rail's painted state
   * from the context right now.
   *
   * This is a notification, not a rendering control: the frame loop only runs
   * while a gesture is in flight, so without it an idle rail would keep
   * advertising a navigation the context refuses (it sat fully visible and
   * 'idle' behind every open panel). The caller says WHAT happened; how the
   * rail is painted stays this module's business.
   */
  contextChanged(): void
  /** Drops everything and returns to idle. Tab hidden, scene reset, unmount. */
  reset(): void
  dispose(): void
}

/** Ancestors walked looking for a scroll container before giving up. */
const SCROLLABLE_SEARCH_DEPTH = 12

export function createNavigationInput(deps: NavigationInputDeps): NavigationInput {
  const gestureLimits = deps.gestureLimits ?? NAVIGATION_GESTURE
  const cooldownLimits = deps.cooldownLimits ?? NAVIGATION_COOLDOWN

  const gesture = createNavigationGesture(gestureLimits)
  const machine = createNavigationMachine(cooldownLimits)

  // The painted progress chases the accumulator through a damped spring, so a
  // notch lands with weight and a release settles instead of fading (see
  // progressSpring.ts). Elasticity is presentation, which is why reduced motion
  // picks its damping here — in the one DOM-facing module — and the spring
  // itself stays pure.
  const springLimits = deps.springLimits ?? NAVIGATION_SPRING
  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const spring = createProgressSpring({
    omegaRadPerSec: springLimits.omegaRadPerSec,
    damping: reducedMotion ? springLimits.reducedMotionDamping : springLimits.damping,
  })

  const rail = deps.rail
  let frame = 0
  let lastFrameMs = 0
  /** Mirrors what is on the element, so a frame with no change writes nothing. */
  let paintedProgress = -1
  let paintedState = ''
  let paintedDirection = ''
  /**
   * Whether the gesture hint beside the rail has been dismissed this visit.
   *
   * The hint answers the one objection the rail alone cannot: nothing on
   * screen says a gesture EXISTS. The first frame a gesture is visibly in
   * flight is the moment the viewer has proven they know it, and every input
   * path — wheel, rail drag, keyboard — funnels through the same frame, so
   * this is the single dismissal authority. Never cleared: a reset returns
   * progress to zero, not the viewer to ignorance.
   */
  let hintDismissed = false

  // --- The clock -------------------------------------------------------------
  //
  // `performance.now()` and event timestamps share an origin, so the accumulator
  // can be fed event time and stepped with frame time without the two drifting.

  const now = () => performance.now()

  // --- Direction -------------------------------------------------------------

  /**
   * Raw signed input -> travel toward the other world.
   *
   * Positive raw is "downward": a positive `deltaY`, or a finger moving up the
   * rail (which carries the content down, the way a scroll does). From Earth that
   * is toward Murcia; from Murcia the same physical gesture means the opposite, so
   * the sign flips.
   *
   * This flip is why a momentum tail is harmless a second time over: the scene has
   * already swapped by the time the tail arrives, so the tail maps to NEGATIVE
   * travel in the new world and subtracts from a total that is already zero. The
   * cooldown is still the real guard; this is a free one.
   */
  function towardOther(raw: number, current: ExperienceId): number {
    return current === 'earth' ? raw : -raw
  }

  // --- The loop --------------------------------------------------------------

  function ensureRunning(): void {
    if (frame !== 0) return
    lastFrameMs = now()
    frame = requestAnimationFrame(tick)
  }

  function tick(): void {
    frame = 0
    const t = now()
    const dt = Math.max(0, (t - lastFrameMs) / 1000)
    lastFrameMs = t

    const context = deps.getContext()
    const state = gesture.state()

    // Cooldown first: it is what decides whether this frame may accumulate.
    const released = machine.tick(t, state.lastInputMs)
    if (released?.onDeadline) {
      // Released because it ran out of patience, not because the stream stopped —
      // so the stream is still running and handing it a fresh gesture now would
      // undo the entire lock. Latch until it genuinely goes quiet.
      gesture.latch(t)
    }

    const f = gesture.step(dt, t)

    if (!hintDismissed && f.active) {
      hintDismissed = true
      rail.dataset.hintDismissed = 'true'
    }

    if (f.committed) {
      const intent = machine.commit(context.current)
      if (intent && context.canNavigate) {
        // Reset BEFORE handing over: the transition swaps the scene, and travel
        // banked under the old scene's sign means nothing under the new one.
        gesture.reset()
        spring.reset(0)
        paint(0, 'locked', context.current)
        deps.onCommit(intent)
        ensureRunning()
        return
      }
      // The commit was refused — a stale scene, or attention moved to a POI
      // between the last event and this frame. Drop it and start over rather
      // than leaving a full accumulator primed to fire on the next pixel.
      machine.reset()
      gesture.reset()
    } else if (f.active) {
      machine.beginGesture()
    } else {
      machine.endGesture()
    }

    // Clamped because the spring is allowed past the target — that overshoot is
    // the point — but the reveal transform is only meaningful on 0..1.
    const displayed = Math.min(1, Math.max(0, spring.step(f.progress, dt)))
    paint(displayed, phaseClass(context), context.current)

    // Keep running while there is anything left to advance — including a spring
    // still settling after the accumulator has stopped. Stopping here is what
    // makes an idle session cost nothing.
    if (f.active || machine.phase !== 'idle' || !spring.settled(f.progress)) ensureRunning()
  }

  function phaseClass(context: NavigationContext): string {
    if (machine.phase === 'locked') return 'locked'
    if (machine.phase === 'cooldown') return 'cooldown'
    if (!context.canNavigate) return 'suppressed'
    return 'idle'
  }

  // --- Painting --------------------------------------------------------------
  //
  // Straight onto the element, never through React. A wheel can produce well over
  // a hundred events a second and every one of them would otherwise be a render of
  // the whole tree. The rail reads `--nav-progress` in a transform, so this costs
  // a compositor property and no layout.

  function paint(progress: number, state: string, current: ExperienceId): void {
    const direction = current === 'earth' ? 'down' : 'up'
    // Rounded before comparing: sub-pixel churn on a scaleY is invisible and a
    // raw float would defeat the guard on every frame.
    const rounded = Math.round(progress * 1000) / 1000

    if (rounded !== paintedProgress) {
      paintedProgress = rounded
      rail.style.setProperty('--nav-progress', String(rounded))
    }
    if (state !== paintedState) {
      paintedState = state
      rail.dataset.state = state
    }
    if (direction !== paintedDirection) {
      paintedDirection = direction
      rail.dataset.direction = direction
    }
  }

  // --- Wheel -----------------------------------------------------------------

  /**
   * Whether the wheel is over something that scrolls, and must keep doing so.
   *
   * The audit panel and the case panel's body are `overflow-y: auto`. An
   * unconditional `preventDefault` on a window listener would stop both of them
   * scrolling — a regression that is invisible until someone opens a long panel on
   * a short screen, which is exactly the case those panels exist for.
   *
   * Walks the ancestors rather than matching class names, so a future scroll
   * region does not have to remember to register itself here. The walk is bounded
   * and only runs for events that are not on the canvas, which is almost all of
   * them in practice.
   */
  function overScrollable(target: EventTarget | null): boolean {
    let node = target instanceof Element ? target : null
    for (let depth = 0; node && depth < SCROLLABLE_SEARCH_DEPTH; depth += 1) {
      if (node.scrollHeight > node.clientHeight) {
        const overflowY = getComputedStyle(node).overflowY
        if (overflowY === 'auto' || overflowY === 'scroll') return true
      }
      node = node.parentElement
    }
    return false
  }

  const onWheel = (event: WheelEvent): void => {
    // A trackpad pinch arrives as ctrl+wheel in every browser. It is not a scroll
    // and must not navigate — but it must still be swallowed, or the browser zooms
    // the whole document over a full-viewport canvas.
    if (event.ctrlKey) {
      if (!overScrollable(event.target)) event.preventDefault()
      return
    }

    if (overScrollable(event.target)) return

    // Inherited from the handler this replaced, and still true whether or not the
    // wheel drives anything: nothing may scroll the page behind a fixed,
    // full-viewport canvas.
    event.preventDefault()

    const context = deps.getContext()
    const raw = normalizeWheelDelta(event)
    // Pushed even when it must not count, so a stream being refused still reads as
    // a stream. The cooldown's quiescence test depends on that — see `push`.
    gesture.push(
      towardOther(raw, context.current),
      event.timeStamp,
      machine.canAccumulate() && context.canNavigate,
    )
    ensureRunning()
  }

  // --- The rail, as a touch target -------------------------------------------
  //
  // Touch navigates here and nowhere else. The canvas has no free vertical
  // channel: one finger orbits Earth and pans Murcia, and two fingers rotate
  // Murcia. Stealing either would degrade the primary navigation of a world in
  // order to add a second one.

  let dragPointer: number | null = null
  let lastPointerY = 0

  const onPointerDown = (event: PointerEvent): void => {
    if (dragPointer !== null || event.button !== 0) return
    dragPointer = event.pointerId
    lastPointerY = event.clientY
    rail.setPointerCapture?.(event.pointerId)
    ensureRunning()
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== dragPointer) return
    const dy = event.clientY - lastPointerY
    lastPointerY = event.clientY

    const context = deps.getContext()
    // Negated: a finger moving UP carries the content down, which is the same
    // direction a positive wheel delta means.
    gesture.push(
      towardOther(-dy, context.current),
      event.timeStamp,
      machine.canAccumulate() && context.canNavigate,
    )
    ensureRunning()
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== dragPointer) return
    dragPointer = null
    if (rail.hasPointerCapture?.(event.pointerId)) {
      rail.releasePointerCapture(event.pointerId)
    }
    // Nothing else to do: releasing below the threshold simply stops feeding the
    // accumulator, and the idle decay takes the indicator back down.
  }

  /**
   * iOS needs this and `pointermove` will not do it.
   *
   * `touch-action: none` on the rail stops the browser claiming the gesture, but a
   * non-passive `touchmove` is what stops the page rubber-banding behind it. The
   * rail is a sibling of the canvas, so it does not inherit the canvas's own
   * suppression.
   */
  const onTouchMove = (event: TouchEvent): void => {
    if (dragPointer !== null) event.preventDefault()
  }

  // --- Keyboard --------------------------------------------------------------
  //
  // The rail is focusable and arrow keys drive it. This is not a second control
  // reintroduced against the "gesture only" decision — it is the primary control
  // made operable. Without it there is no keyboard or assistive-technology path
  // between the two worlds at all, which `adr/009` records as the one objection
  // from DECISIONS §15 that the gesture does not answer.

  const onKeyDown = (event: KeyboardEvent): void => {
    const forward = event.key === 'ArrowDown' || event.key === 'PageDown'
    const back = event.key === 'ArrowUp' || event.key === 'PageUp'
    if (!forward && !back) return
    event.preventDefault()

    const context = deps.getContext()
    // One press is worth exactly one capped event, so a keyboard gesture costs the
    // same travel as a wheel one — about eight presses against about eight notches.
    //
    // It is expressed as the cap rather than as a fraction of the commit distance,
    // because the accumulator clamps every push to that cap anyway: a larger step
    // would be silently truncated, and the two numbers would disagree with no error
    // to say so. That is not a nicety — a quarter-commit step was written here first
    // and the clamp cut it to a seventh, so the keyboard could never reach the
    // threshold at all and the only accessible path between the worlds was dead.
    //
    // The cap earns its keep here too: holding an arrow key auto-repeats, which is a
    // stream like any other.
    const raw = (forward ? 1 : -1) * gestureLimits.maxEventTravelPx
    gesture.push(
      towardOther(raw, context.current),
      event.timeStamp,
      machine.canAccumulate() && context.canNavigate,
    )
    ensureRunning()
  }

  // --- Lifecycle -------------------------------------------------------------

  const onVisibility = (): void => {
    // The frame loop stops with the tab but the clock does not, so on return a
    // quiet gap measured in minutes would release a cooldown instantly and a
    // half-charged gesture would resume from a stale total. The same hazard
    // `useExperienceTransition` pauses its timeline for.
    if (document.hidden) reset()
  }

  window.addEventListener('wheel', onWheel, { passive: false })
  rail.addEventListener('pointerdown', onPointerDown)
  rail.addEventListener('pointermove', onPointerMove)
  rail.addEventListener('pointerup', onPointerUp)
  rail.addEventListener('pointercancel', onPointerUp)
  rail.addEventListener('touchmove', onTouchMove, { passive: false })
  rail.addEventListener('keydown', onKeyDown)
  document.addEventListener('visibilitychange', onVisibility)

  function contextChanged(): void {
    const context = deps.getContext()
    const travel = gesture.state().travelPx
    const progress = Math.min(1, Math.max(0, travel / gestureLimits.commitDistancePx))
    // A semantic edge is a discontinuity, not a gesture: the spring must not be
    // seen animating across a panel opening or a world swap.
    spring.reset(progress)
    paint(progress, phaseClass(context), context.current)
  }

  // The initial paint is a derivation like any other: the JSX may mount the
  // rail long before navigation is possible (the whole intro), and a hardcoded
  // starting attribute would stand until the first gesture ran a frame.
  contextChanged()

  function reset(): void {
    gesture.reset()
    machine.reset()
    spring.reset(0)
    if (frame !== 0) {
      cancelAnimationFrame(frame)
      frame = 0
    }
    const context = deps.getContext()
    paint(0, phaseClass(context), context.current)
  }

  return {
    settle() {
      machine.settle(now())
      ensureRunning()
    },
    contextChanged,
    reset,
    dispose() {
      window.removeEventListener('wheel', onWheel)
      rail.removeEventListener('pointerdown', onPointerDown)
      rail.removeEventListener('pointermove', onPointerMove)
      rail.removeEventListener('pointerup', onPointerUp)
      rail.removeEventListener('pointercancel', onPointerUp)
      rail.removeEventListener('touchmove', onTouchMove)
      rail.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('visibilitychange', onVisibility)
      if (dragPointer !== null && rail.hasPointerCapture?.(dragPointer)) {
        rail.releasePointerCapture(dragPointer)
      }
      dragPointer = null
      if (frame !== 0) {
        cancelAnimationFrame(frame)
        frame = 0
      }
    },
  }
}

export { intentFor }
