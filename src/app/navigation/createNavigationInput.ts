import type { ExperienceId } from '../experience'
import { normalizeWheelDelta } from '../../utils/wheelDelta'
import { createNavigationGesture } from './navigationGesture'
import { createNavigationMachine, intentFor } from './navigationMachine'
import type { NavigationIntent } from './navigationMachine'
import { createProgressSpring } from './progressSpring'
import { createPinchClassifier } from './pinchClassifier'
import { createZoomBand } from './zoomBand'
import {
  NAVIGATION_COOLDOWN,
  NAVIGATION_GESTURE,
  HINT_ARRIVAL_MS,
  HINT_LINGER_MS,
  NAVIGATION_PINCH,
  NAVIGATION_SPRING,
  NAVIGATION_ZOOM,
  commitTravelPx,
  pinchGain,
  type NavigationCooldownLimits,
  type NavigationGestureLimits,
  type NavigationSpringLimits,
  type PinchLimits,
  type ZoomBandLimits,
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
// case panel, and over the navigation control.
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
  /**
   * The navigation control's root. Owned by the caller.
   *
   * Carries the painted state, and contains the focusable button and the hint —
   * both optional, so a harness can pass a bare element and still exercise the
   * accumulator without building the markup around it.
   */
  root: HTMLElement
  getContext: () => NavigationContext
  /** A commit. The caller runs the transition and must call `settle` when it ends. */
  onCommit: (intent: NavigationIntent) => void
  /**
   * The gesture moved, 0..1, spring-smoothed. Called once per frame while
   * anything is in flight, and once on every semantic edge.
   *
   * The SPRING output, not the accumulator's — the accumulator is deliberately
   * blunt (travel lands the instant an event does), and a camera driven from it
   * raw teleports on every notch. The spring is why a scrubbed world reads as
   * having weight, and it is the same one the indicator used.
   *
   * Optional because this module's job is to produce navigation intent; what
   * consumes the intermediate value is the caller's business, and the tests
   * construct it without one.
   */
  onProgress?: (progress: number) => void
  /**
   * The zoom moved, -1..+1. Called on every event that changes it.
   *
   * PERSISTENT, and that is the whole difference from `onProgress` above: this
   * number stays where the viewer left it, so the caller's job is to transport
   * it to the scenes rather than to animate anything with it. Raw, not sprung —
   * each world eases the depth through the smoothing its own camera already has
   * (`adr/014`), because a spring here plus a rig ease there is two lags in
   * series and the second one is not optional.
   *
   * Not called per frame: nothing here advances it, so the only moments it can
   * change are an event and a reset.
   */
  onZoom?: (depth: number) => void
  pinchLimits?: PinchLimits
  /** Overridable so a test need not wait three real seconds. */
  hintLingerMs?: number
  /** Overridable for the same reason. */
  hintArrivalMs?: number
  gestureLimits?: NavigationGestureLimits
  cooldownLimits?: NavigationCooldownLimits
  springLimits?: NavigationSpringLimits
  zoomLimits?: ZoomBandLimits
}

export interface NavigationInput {
  /** The transition finished. Starts the cooldown from this instant. */
  settle(): void
  /**
   * The context's semantic inputs changed — a panel opened or closed, a world
   * finished loading, the intro moved. Re-derives the control's painted state
   * from the context right now, and re-arms the gesture hint for the world the
   * viewer is now in.
   *
   * This is a notification, not a rendering control: the frame loop only runs
   * while a gesture is in flight, so without it an idle rail would keep
   * advertising a navigation the context refuses (it sat fully visible and
   * 'idle' behind every open panel). The caller says WHAT happened; how the
   * rail is painted stays this module's business.
   */
  contextChanged(): void
  /**
   * Drops everything and returns to idle. Tab hidden, scene reset, unmount.
   *
   * Deliberately does NOT touch the zoom. A tab coming back to the foreground
   * has not asked for its camera to move, and a viewer who left the world zoomed
   * in should find it zoomed in. See `resetZoom` for the one thing that clears
   * it, and `zoomBand.reset` for why that thing is the cut.
   */
  reset(): void
  /**
   * The world under the zoom has been replaced. Returns the band to rest.
   *
   * Called at the warp's CUT, not at the commit: the departing cinematic
   * continues from wherever the zoom left the camera, so clearing the depth when
   * the gesture commits would snap the pose on the first frame of the transition
   * it just started. At the cut there is a fully black overlay over the whole
   * viewport and a different world on the other side of it.
   */
  resetZoom(): void
  dispose(): void
}

/** Ancestors walked looking for a scroll container before giving up. */
const SCROLLABLE_SEARCH_DEPTH = 12

export function createNavigationInput(deps: NavigationInputDeps): NavigationInput {
  const gestureLimits = deps.gestureLimits ?? NAVIGATION_GESTURE
  const cooldownLimits = deps.cooldownLimits ?? NAVIGATION_COOLDOWN

  const zoomLimits = deps.zoomLimits ?? NAVIGATION_ZOOM

  const gesture = createNavigationGesture(gestureLimits)
  const machine = createNavigationMachine(cooldownLimits)
  const band = createZoomBand(zoomLimits)
  /** Mirrors what the caller has been told, so a no-op event reports nothing. */
  let reportedZoom = 0

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

  const root = deps.root
  /** The focusable button. Falls back to the root so a bare host still keys. */
  const control: HTMLElement = root.querySelector('.nav-control') ?? root
  /** The gesture hint. Absent in harnesses that do not render the markup. */
  const hint: HTMLElement | null = root.querySelector('.nav-hint')
  let frame = 0
  let lastFrameMs = 0
  /** Mirrors what is on the element, so a frame with no change writes nothing. */
  let paintedProgress = -1
  let paintedState = ''
  let paintedDirection = ''
  // --- The hint clock --------------------------------------------------------
  //
  // The hint answers the objection neither the scene nor the control can:
  // nothing on screen says a gesture EXISTS. DECISIONS section 29 had it appear
  // at first paint and vanish forever on the first gesture, which was right for
  // a rail — the rail was visible, so it advertised itself and the hint only had
  // to explain it. A pinch on a bare canvas advertises nothing.
  //
  // So it is OFFERED on every arrival — a beat after the intro hands the world
  // over, a beat after each warp settles — because the first thing a viewer
  // should be told on landing is how to leave. And it has ONE closing rule
  // (2026-09-05, the client's, replacing a hide-on-input plus a fifteen-second
  // idle re-offer plus, in Murcia, a separate reading clock): the first time
  // the viewer interacts with the SCENE while the frame is showing — a wheel, a
  // pinch, a press on the canvas — it lingers three seconds and closes, and
  // does not come back until the next arrival. A press on a button is not the
  // viewer trying the world, and an interaction that lands before the frame is
  // on screen (the tail of the gesture that carried them here — mobile audit
  // M22) cannot be them having read it. Section 29 records the history.

  const hintLingerMs = deps.hintLingerMs ?? HINT_LINGER_MS
  const hintArrivalMs = deps.hintArrivalMs ?? HINT_ARRIVAL_MS
  /**
   * An arrival was offered while the context was still refusing — the app
   * settles the machine a render before it clears `transitioning` — so the
   * offer is owed to the next context edge, at the arrival beat rather than
   * the silence. Cleared by the hint showing, or by the viewer navigating.
   */
  let hintArrivalOwed = false
  let hintTimer = 0
  /** The linger, once the first interaction has started it. */
  let hintLingerTimer = 0
  let hintVisible = false

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

  // --- The two stages, and the order they are fed in ------------------------

  /**
   * Signed travel toward the other world -> the zoom, then the commit.
   *
   * The whole of `adr/014` at the input layer. There are two accumulators in
   * series now — a persistent zoom that absorbs the first 600px, and the
   * unchanged commit accumulator that only ever sees what is left over — and
   * every event goes through here so that which one gets it is decided in
   * exactly one place.
   *
   * ── The order flips with the direction, and that is not symmetry for its own
   *    sake ──
   *
   * Think of the two as one continuous track: rest, then the zoom band, then the
   * push against its limit. Travel toward the other world fills the band first
   * and spills into the accumulator; travel away from it has to drain the
   * accumulator first and only then unzoom, because that is retracing the same
   * track backwards.
   *
   * Fed the other way round, a viewer who had banked half a commit and changed
   * their mind would watch the camera pull back out while an invisible total was
   * still nearly full — and the next nudge would navigate from a pose that no
   * longer looked like the edge of anything. Which is the exact complaint
   * `adr/009`'s decay was answering, reintroduced at a different layer.
   *
   * The accumulator has no way to report how much of a push it took, so it is
   * measured: its total before and after. That is deliberate rather than lazy —
   * `navigationGesture` refuses travel for four different reasons (latched,
   * committed, clamped, not accumulating) and a return value would be a second
   * statement of rules that already have one home.
   */
  function pushTravel(rawTravelPx: number, timeStampMs: number, accumulate: boolean): void {
    // The per-event cap, applied HERE rather than left to the accumulator.
    //
    // `maxEventTravelPx` exists so one absurd wheel event cannot navigate —
    // macOS momentum delivers hundreds of pixels in the event at the head of a
    // flick. It used to live entirely inside `navigationGesture`, which was the
    // only thing an event could reach.
    //
    // That stopped being true with `adr/014`, and leaving it there was a real
    // defect rather than an untidiness: an uncapped 100,000px flick saturated
    // the whole zoom band in one event AND arrived at the accumulator with
    // 99,400px of overflow, which the clamp then dutifully reduced to a capped
    // push that armed a commit. One notch of the wheel both threw the camera to
    // the end of its travel and banked 40% of a warp.
    //
    // Capping the input to the pair keeps the guarantee the cap was written for,
    // now stated over the whole journey: no single event may cross more than
    // `maxEventTravelPx` of it, wherever in the two stages that lands.
    const travelPx =
      Math.sign(rawTravelPx) * Math.min(Math.abs(rawTravelPx), gestureLimits.maxEventTravelPx)

    if (!accumulate) {
      // Still pushed, so a stream being refused reads as a stream. The
      // cooldown's quiescence test depends on that — see `gesture.push`. Nothing
      // may move: a refused gesture must not zoom either, or a wheel over a
      // closed panel would leave the world somewhere the viewer never asked for.
      gesture.push(travelPx, timeStampMs, false)
      return
    }

    if (travelPx >= 0) {
      gesture.push(band.push(travelPx), timeStampMs, true)
    } else {
      const before = gesture.state().travelPx
      gesture.push(travelPx, timeStampMs, true)
      const drained = before - gesture.state().travelPx
      band.push(travelPx + drained)
    }

    // Travel that was ACCEPTED is a gesture in flight, and that is what hides
    // the hint — the viewer has found the control, for now.
    //
    // Here rather than on the accumulator's rising edge, which is where it used
    // to be. Since `adr/014` the first 600px of every gesture never reach the
    // accumulator at all, so a viewer could zoom the world halfway across the
    // band with the hint still breathing at them about how to do it. What shows
    // they know is that the world MOVED, and the zoom moves it first. The wheel
    // path has already postponed above; this is the pinch's.
    if (travelPx !== 0) hintInteracted()

    reportZoom()
  }

  function reportZoom(): void {
    if (band.depth === reportedZoom) return
    reportedZoom = band.depth
    deps.onZoom?.(reportedZoom)
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

    // Two fingers holding a spread still are still INPUT.
    //
    // The accumulator decides when to retreat by measuring SILENCE, because the
    // wheel has no other way to say it has stopped — and a wheel cannot be held.
    // A pinch can, and without this the world would start easing back out from
    // under fingers that had not moved, half a second in. Zero travel, so it
    // changes nothing except "input arrived", which is exactly the fact the idle
    // gap is asking about.
    if (pinchOwnsProgress && contacts.size === 2) gesture.push(0, t)

    const f = gesture.step(dt, t)

    if (f.committed) {
      const intent = machine.commit(context.current)
      if (intent && context.canNavigate) {
        // Reset BEFORE handing over: the transition swaps the scene, and travel
        // banked under the old scene's sign means nothing under the new one.
        gesture.reset()
        spring.reset(0)
        // The fingers may still be down, but the gesture they were making is
        // over: the machine is locked from here and the keep-alive above would
        // otherwise keep feeding an accumulator nobody is reading.
        pinchOwnsProgress = false
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

    // Direct manipulation bypasses the spring; everything else goes through it.
    //
    // The spring exists to smooth DISCRETE impulses: a wheel notch lands whole
    // and would otherwise teleport the camera. A pinch is already continuous, so
    // the same spring contributes only its ~0.1s of lag — and lag between a
    // finger and the thing it is holding does not read as weight, it reads as
    // the world being late. Clamped either way, because the reveal transform is
    // only meaningful on 0..1 and the spring is allowed past the target.
    //
    // The spring is kept SYNCHRONISED rather than skipped, so the frame the
    // fingers leave hands back from exactly where they left it — no step, and no
    // second code path for the retreat, which is still the spring settling.
    const direct = pinchOwnsProgress && contacts.size === 2
    if (direct) spring.reset(f.progress)
    const displayed = direct
      ? Math.min(1, Math.max(0, f.progress))
      : Math.min(1, Math.max(0, spring.step(f.progress, dt)))
    paint(displayed, phaseClass(context), context.current)
    // Deliberately NOT reached on the commit frame above, which returns early:
    // the accumulator is reset there, so reporting from here would hand the
    // caller a 0 on the very frame it started a transition from a non-zero
    // position — and snap the camera back to rest under the warp.
    deps.onProgress?.(displayed)

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

  // --- The hint --------------------------------------------------------------

  function showHint(): void {
    hintTimer = 0
    const context = deps.getContext()
    // Never advertise a navigation the context is refusing. The rail used to get
    // this for free by being the hint parent and inheriting its opacity; the
    // hint is a sibling now, so it has to be asked.
    if (!context.canNavigate) return
    hintArrivalOwed = false
    hintVisible = true
    if (hint) hint.dataset.visible = 'true'
  }

  /**
   * The viewer did something to the scene. The FIRST time, with the frame on
   * screen, starts the linger; every later one is ignored, so the close is
   * three seconds after they began rather than three seconds after they
   * stopped.
   */
  function hintInteracted(): void {
    if (!hintVisible || hintLingerTimer !== 0) return
    hintLingerTimer = setTimeout(() => {
      hintLingerTimer = 0
      hideHint()
    }, hintLingerMs) as unknown as number
  }

  /** Something else owns attention: down now, and nothing pending. */
  function closeHint(): void {
    hintArrivalOwed = false
    if (hintTimer !== 0) {
      clearTimeout(hintTimer)
      hintTimer = 0
    }
    hideHint()
  }

  /** A world has just settled in front of the viewer: offered after a beat. */
  function offerHint(): void {
    hintArrivalOwed = true
    hideHint()
    scheduleHint(hintArrivalMs)
  }

  function hideHint(): void {
    if (hintLingerTimer !== 0) {
      clearTimeout(hintLingerTimer)
      hintLingerTimer = 0
    }
    if (!hintVisible) return
    hintVisible = false
    if (hint) delete hint.dataset.visible
  }

  function scheduleHint(delayMs: number): void {
    if (hintTimer !== 0) {
      clearTimeout(hintTimer)
      hintTimer = 0
    }
    if (!deps.getContext().canNavigate) return
    hintTimer = setTimeout(showHint, delayMs) as unknown as number
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
      root.style.setProperty('--nav-progress', String(rounded))
    }
    if (state !== paintedState) {
      paintedState = state
      root.dataset.state = state
    }
    if (direction !== paintedDirection) {
      paintedDirection = direction
      root.dataset.direction = direction
      // The label names the DESTINATION, and the destination changes with the
      // world. Written here because this is the one place that already knows
      // the direction changed; the strings live on the element because they are
      // visitor-facing Spanish and belong with the markup.
      const label = control.dataset[current === 'earth' ? 'labelEarth' : 'labelMurcia']
      if (label) control.setAttribute('aria-label', label)
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
    // Someone driving the wheel is not someone who is stuck. Postponed rather
    // than retired: they have used a navigation input, but on touch that says
    // nothing about whether they know the pinch.
    hintInteracted()
    pushTravel(
      towardOther(raw, context.current),
      event.timeStamp,
      machine.canAccumulate() && context.canNavigate,
    )
    ensureRunning()
  }

  // --- Keyboard, and everything a pinch cannot reach ------------------------
  //
  // Not a second control reintroduced against the gesture-only decision. It is
  // the ONLY control for anyone a pinch excludes — keyboard users, switch access,
  // screen readers, anyone who cannot make a two-finger gesture — and removing
  // the rail without it would have removed their only route to Murcia.
  //
  // ── Why this commits outright, where the rail accumulated ──
  //
  // The rail was a slider: arrow keys fed travel and eight presses crossed the
  // threshold, so the keyboard paid the same deliberateness the wheel does. A
  // button is not a slider. Deliberateness on a gesture is the answer to "an
  // accidental scroll must not warp you"; there is no accidental Enter on a
  // control you had to tab to and that announces its destination first. Making
  // someone press Enter eight times would be ceremony, not safety.
  //
  // The machine still arbitrates: a commit refused because a panel owns
  // attention, or because a transition is already running, is refused here too.

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    activate(event.timeStamp)
  }

  const onClick = (): void => activate(now())

  /**
   * Take the whole journey at once.
   *
   * Through the machine rather than around it, so the lock, the cooldown and the
   * legality check are the same ones every gesture passes — one commit path, as
   * it has been since `adr/009`.
   *
   * BOTH stages at once since `adr/014`: from any zoom depth, including a full
   * one, and with no zoom of its own on the way. Both worlds re-base the warp on
   * the pose the viewer is actually at, so committing from full zoom-out is the
   * same seamless departure as committing from rest — the cinematic simply has
   * less of the journey left to cover.
   */
  function activate(timeStampMs: number): void {
    const context = deps.getContext()
    if (!context.canNavigate) return
    const intent = machine.commit(context.current)
    if (!intent) return
    // The accumulator may hold travel from a gesture in flight; it means nothing
    // under the world we are about to be in.
    //
    // The ZOOM is deliberately left alone here. It is a pose, not banked intent,
    // and the departing camera is still standing in it for another few hundred
    // milliseconds — clearing it now would pull the world back to rest in plain
    // view, in front of the cinematic. `resetZoom` is called at the cut instead,
    // under full cover.
    gesture.reset()
    gesture.latch(timeStampMs)
    spring.reset(0)
    hintInteracted()
    paint(0, 'locked', context.current)
    deps.onCommit(intent)
    ensureRunning()
  }
  // --- Two fingers, on the canvas --------------------------------------------
  //
  // PROTOTYPE, and EARTH ONLY. Off unless `?pinch=1`, so the shipped touch path
  // is one query parameter away for comparison on the same device.
  //
  // `adr/009` chose a rail over a canvas gesture because "the canvas has no free
  // vertical channel — one finger orbits Earth and pans Murcia". That premise was
  // about ONE finger and it still holds. Two fingers are a different question:
  // Earth rejects a second pointer outright, and the SEPARATION between two
  // contacts is a channel nothing in this application has ever read. This takes
  // an empty channel rather than borrowing a full one.
  //
  // Murcia is deliberately not here. Its two fingers already mean centroid
  // rotation, so it needs an arbitration this prototype is not trying to design
  // — and its departing warp only changes scale by about 4%, which is a separate
  // problem with its own decision to make.
  //
  // ── No swallow-while-watching, unlike the one-finger prototype ──
  //
  // That design held pointermove back from both worlds until the verdict landed,
  // so that a DECLINE cost nothing. Here it would cost something: the first
  // finger may already be orbiting Earth, and freezing it while a second finger
  // is merely resting would make the globe stick for no reason the viewer can
  // see. A decline is already free — two fingers on Earth do nothing — so there
  // is nothing to buy. The orbit is stopped at the CLAIM instead, and only then.

  const pinchLimits = deps.pinchLimits ?? NAVIGATION_PINCH
  const classifier = createPinchClassifier(pinchLimits)
  /**
   * Separation-growth px -> accumulator px. Sampled per gesture, not per module.
   *
   * It depends on the viewport, and a phone that turns between one pinch and the
   * next must be measured against the side it now has. Re-read at each second
   * contact rather than mid-gesture, so a rotation can never rescale a pinch
   * that is already in flight.
   */
  let gain = pinchGain(commitTravelPx(zoomLimits, gestureLimits), 1, pinchLimits)

  /** The touch contacts in play, keyed by pointer id, in the order they landed. */
  const contacts = new Map<number, { x: number; y: number }>()
  /** Growth px already handed over, so each sample pushes only the difference. */
  let pinchDeliveredPx = 0
  /** Where the pair sat when the second contact landed. See pinchRivalTravel. */
  const pinchStartCentroid = { x: 0, y: 0 }
  /** True while a claimed pinch is driving progress. Read by the frame loop. */
  let pinchOwnsProgress = false
  /**
   * True only while `claimPinch` is dispatching its own synthetic cancels.
   *
   * Without it this module cancels the claim it has just made: the cancels are
   * addressed to the experiences, but they are dispatched on the canvas and
   * therefore travel straight back through this module's own `pointercancel`
   * listener on `window`.
   *
   * `event.isTrusted` would be tidier and is not usable: a harness dispatching
   * the gesture itself produces untrusted events throughout, so it would make
   * the thing under test behave differently from production.
   */
  let dispatchingPinchCancel = false

  function pinchDistance(): number {
    const points = [...contacts.values()]
    if (points.length < 2) return 0
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
  }

  /**
   * How far the pair has been carried as a whole, in CSS px.
   *
   * Murcia turns on the centroid, so this is the rival gesture stated in the
   * same units as the spread. Measured from the gesture ORIGIN rather than the
   * previous sample, for the reason the city itself learned on 2026-08-25: two
   * fingers never move in the same event, so a per-sample centroid swings by half
   * the separation change and back, and a rule reading that would see a rival in
   * every symmetric pinch.
   */
  function pinchRivalTravel(): number {
    const points = [...contacts.values()]
    if (points.length < 2) return 0
    return Math.hypot(
      (points[0].x + points[1].x) / 2 - pinchStartCentroid.x,
      (points[0].y + points[1].y) / 2 - pinchStartCentroid.y,
    )
  }

  /**
   * The most growth one event may carry, given the accumulator clamp.
   *
   * `maxEventTravelPx` exists so one absurd WHEEL event cannot navigate. A pinch
   * is not an impulse though — it is a position, and the separation between two
   * fingers is ground truth about where the viewer has put the world. So the
   * clamp is respected and the remainder is CARRIED rather than discarded.
   */
  const maxGrowthPerEvent = () => gestureLimits.maxEventTravelPx / gain

  /**
   * Hands over as much of `targetLog` as one event may carry, and remembers
   * exactly how much that was.
   *
   * The bookkeeping has to record what LANDED, not what was intended. Setting it
   * to the intended figure was a real defect: the claim backlog overshoots its
   * own threshold (fingers move in steps, so the first sample past `claimScale`
   * is usually well past it), and a backlog of x1.075 is 138px against a 120px
   * clamp. The 18px difference was silently dropped and never carried — which
   * reopened, at a smaller size, precisely the dead zone the backlog exists to
   * close.
   */
  function deliverPinch(targetGrowthPx: number, timeStampMs: number): void {
    const wanted = targetGrowthPx - pinchDeliveredPx
    if (wanted === 0) return
    const delivered =
      Math.sign(wanted) * Math.min(Math.abs(wanted), maxGrowthPerEvent())
    pinchDeliveredPx += delivered
    const context = deps.getContext()
    // NOT run through `towardOther` again. What arrives here is already travel
    // toward the other world — the caller signs it once, at the point where the
    // raw separation is read — and signing it a second time would send Murcia
    // the wrong way, which is exactly the sort of thing two sign conventions in
    // one pipeline are for.
    pushTravel(
      delivered * gain,
      timeStampMs,
      machine.canAccumulate() && context.canNavigate,
    )
    ensureRunning()
  }

  /** Drops the gesture. `retreat` starts the elastic return for a claimed one. */
  function endPinch(retreat: boolean): void {
    if (retreat && classifier.verdict === 'claimed') {
      // An explicit end, so the return starts now instead of waiting out an idle
      // gap that only exists because the wheel has no release event. It is also
      // what stops two disconnected pinches adding up into one.
      gesture.release()
      ensureRunning()
    }
    pinchOwnsProgress = false
    pinchDeliveredPx = 0
    classifier.reset()
  }

  const onPinchDown = (event: PointerEvent): void => {
    if (dispatchingPinchCancel) return
    // Touch only, and that is the whole device gate. A trackpad pinch reaches
    // the page as ctrl+wheel (or Safari's gesture events), both of which are
    // swallowed elsewhere so they cannot navigate — the desktop path is the
    // wheel, and one device should not carry two navigation gestures.
    if (event.pointerType !== 'touch') return

    contacts.set(event.pointerId, { x: event.clientX, y: event.clientY })

    // A third finger is not a bigger pinch. Hand the whole thing back rather
    // than inventing a meaning for it.
    if (contacts.size > 2) {
      endPinch(true)
      return
    }
    if (contacts.size < 2) return

    const context = deps.getContext()
    // Not while something else owns attention, and two fingers inside a
    // scrolling panel belong to the panel (same helper the wheel uses, so a new
    // scroll region never has to register itself twice).
    //
    // Refused EXPLICITLY rather than by declining to begin. A classifier that was
    // never begun is still 'watching', and it would answer the next move from a
    // gesture it never saw the start of.
    if (!context.canNavigate || overScrollable(event.target)) {
      classifier.decline()
      return
    }

    pinchDeliveredPx = 0
    const points = [...contacts.values()]
    pinchStartCentroid.x = (points[0].x + points[1].x) / 2
    pinchStartCentroid.y = (points[0].y + points[1].y) / 2
    // The viewport is read here, once, for the gesture about to happen. Scaled
    // against the WHOLE journey — the zoom band plus the push against it — so
    // `commitFraction` of the viewport is still one complete navigation.
    gain = pinchGain(
      commitTravelPx(zoomLimits, gestureLimits),
      Math.min(window.innerWidth || 0, window.innerHeight || 0),
      pinchLimits,
    )
    classifier.begin(pinchDistance())
  }

  const onPinchMove = (event: PointerEvent): void => {
    const contact = contacts.get(event.pointerId)
    if (!contact) return
    contact.x = event.clientX
    contact.y = event.clientY

    if (contacts.size !== 2) return
    if (classifier.verdict === 'declined') return

    const context = deps.getContext()
    // Signed by the SAME authority the wheel uses, so which
    // direction leaves a world is stated in exactly one place. On Earth that
    // makes spreading positive; in Murcia, closing.
    const grownPx = towardOther(pinchDistance() - classifier.startDistancePx, context.current)

    if (classifier.verdict === 'watching') {
      // Murcia turns on the centroid and Earth does nothing with two fingers, so
      // the rival is only real in one of them. Reporting one on Earth would hand
      // back good pinches to a gesture that does not exist there.
      const rival = context.current === 'murcia' ? pinchRivalTravel() : 0
      if (classifier.sample(grownPx, rival) === 'claimed') claimPinch(event)
      return
    }

    // Owned. Everything from here belongs to navigation.
    //
    // Measured against the gesture's START rather than the previous sample, and
    // differenced here. Two fingers never move in the same event — each
    // pointermove carries one contact — so a per-sample ratio would read half of
    // every spread as a shrink and back again. Stated against the origin, the
    // artifact cancels within the frame.
    if (!Number.isFinite(grownPx)) return
    deliverPinch(grownPx, event.timeStamp)
  }

  const onPinchUp = (event: PointerEvent): void => {
    // Our own cancels, on their way to the experiences. See dispatchingPinchCancel.
    if (dispatchingPinchCancel) return
    if (!contacts.has(event.pointerId)) return
    contacts.delete(event.pointerId)
    // A pinch needs two. One contact has no separation and therefore no scale,
    // so a lift ends the gesture rather than pausing it.
    endPinch(true)
  }

  /**
   * Take the gesture from Earth's orbit rig.
   *
   * One synthetic `pointercancel` per contact unwinds its bookkeeping — the
   * active pointer id and its capture — and the rig already handles a cancel as
   * an end-of-gesture, so nothing new is asked of it. Sent for BOTH contacts
   * because either one of them may be the pointer that claimed the orbit.
   *
   * Nothing is being taken away visually: the rig only ever followed one of
   * these two fingers, and after the cancel it follows neither, which is exactly
   * what a pinch should mean. If this proves unreliable on a real device the
   * fallback is an explicit `cancelGesture()` on the rig — deliberately not
   * written until it is needed.
   */
  function claimPinch(event: PointerEvent): void {
    const target = event.target
    if (target instanceof Element) {
      dispatchingPinchCancel = true
      try {
        for (const pointerId of contacts.keys()) {
          target.dispatchEvent(
            new PointerEvent('pointercancel', {
              pointerId,
              pointerType: 'touch',
              bubbles: true,
              cancelable: false,
            }),
          )
        }
      } finally {
        // `finally`, because a listener further down the path may throw and this
        // flag staying set would deafen this module to every real cancel after.
        dispatchingPinchCancel = false
      }
    }

    // The spread spent proving intent still counts, or the scrub would open with
    // a dead zone the size of the claim. Fed through the accumulator like any
    // other travel, so the spring ramps it in rather than snapping — and through
    // the same carry, so an overshooting claim loses nothing to the clamp.
    pinchOwnsProgress = true
    // Intent is enough — the hint steps aside the moment the viewer makes the
    // gesture, not when they finish it.
    hintInteracted()
    deliverPinch(classifier.backlogPx, event.timeStamp)
  }

  // --- Grabbing the world lets go of the gesture -----------------------------

  /**
   * A press anywhere but the navigation control retreats any gesture in flight,
   * immediately.
   *
   * Grabbing the world means you want to manipulate it, not travel through it.
   * Without this the viewer scrolls, reaches for the globe, and has to drag
   * against a scene that is still leaning somewhere else for the rest of the
   * idle gap — which is most of what "it feels laggy" was.
   *
   * The control is exempt for a different reason than the rail was. The rail
   * DROVE the gesture, so a press on it was the start of one. The control
   * commits outright, so a press on it is a navigation about to happen — and
   * retreating the scrub out from under it would be a visible flinch on the way
   * into a transition.
   *
   * Capture phase and passive: this must see the press before any experience
   * claims it, and it never needs to prevent anything.
   */
  const onPointerDownRelease = (event: PointerEvent): void => {
    const target = event.target
    if (target instanceof Node && root.contains(target)) return
    // A press ON THE SCENE is the viewer trying the world — what the hint waits
    // for. Anything else under the pointer (a header button, a panel, the
    // consent sheet) is chrome, and pressing chrome teaches nothing.
    if (target instanceof Element && target.closest('.scene-canvas')) hintInteracted()
    gesture.release()
    ensureRunning()
  }

  // --- Safari trackpad pinch -------------------------------------------------

  /**
   * macOS Safari reports a trackpad pinch through non-standard `gesture*`
   * events INSTEAD of ctrl+wheel. Unsuppressed, the whole document zooms.
   *
   * Murcia has suppressed these on the canvas since it was written, but only
   * while its controller is alive — so Earth, which has no such controller, had
   * the gap. Moved here because this module is the one that is always mounted
   * and already owns every other pinch-shaped input.
   *
   * Scoped to the canvas by TARGET rather than suppressed globally, and that is
   * the whole care in it: `preventDefault` on every gesture event would take
   * away the browser zoom a viewer needs to read a panel. `styles.css` records
   * the same trap from the other side — the canvas being `touch-action: none`
   * once left people unable to pinch the page at all.
   */
  const onSafariGesture = (event: Event): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (!target.closest('.scene-canvas')) return
    event.preventDefault()
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
  // Non-passive declared rather than inferred: `gesture*` is not in the
  // passive-by-default set today, and relying on that is relying on a list.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    window.addEventListener(type, onSafariGesture, { capture: true, passive: false })
  }
  window.addEventListener('pointerdown', onPointerDownRelease, { capture: true, passive: true })
  // Capture phase on `window`, so the contacts are seen wherever they land and
  // ahead of anything that might stop their propagation. Passive: nothing here
  // ever calls preventDefault — `.scene-canvas` is already `touch-action: none`,
  // so the browser has no gesture of its own to take away.
  window.addEventListener('pointerdown', onPinchDown, { capture: true, passive: true })
  window.addEventListener('pointermove', onPinchMove, { capture: true, passive: true })
  window.addEventListener('pointerup', onPinchUp, { capture: true, passive: true })
  window.addEventListener('pointercancel', onPinchUp, { capture: true, passive: true })
  control.addEventListener('keydown', onKeyDown)
  control.addEventListener('click', onClick)
  document.addEventListener('visibilitychange', onVisibility)

  function contextChanged(): void {
    const context = deps.getContext()
    const travel = gesture.state().travelPx
    const progress = Math.min(1, Math.max(0, travel / gestureLimits.commitDistancePx))
    // A semantic edge is a discontinuity, not a gesture: the spring must not be
    // seen animating across a panel opening or a world swap.
    spring.reset(progress)
    paint(progress, phaseClass(context), context.current)
    deps.onProgress?.(progress)
    // An arrival still owed from a settle the context refused is paid here, at
    // the arrival beat. Otherwise the only thing an edge can mean for the hint
    // is that something took the viewer's attention: a panel over the scene is
    // not a scene to be taught, so the frame stands down and stays down.
    if (hintArrivalOwed) offerHint()
    else if (!context.canNavigate) closeHint()
  }

  // The initial paint is a derivation like any other: the JSX may mount the
  // rail long before navigation is possible (the whole intro), and a hardcoded
  // starting attribute would stand until the first gesture ran a frame.
  contextChanged()

  function reset(): void {
    gesture.reset()
    machine.reset()
    spring.reset(0)
    // The contacts are deliberately NOT cleared: the fingers are still on the
    // glass and their pointerup is still coming, and forgetting them here would
    // leave that lift unmatched. Dropping the CLAIM is enough — without it, a
    // gesture the tab-hide just cancelled would keep driving the scrub.
    endPinch(false)
    if (frame !== 0) {
      cancelAnimationFrame(frame)
      frame = 0
    }
    const context = deps.getContext()
    paint(0, phaseClass(context), context.current)
    // A reset is a scene event as much as an indicator one: the tab went away or
    // the intro moved under us, and a world left leaning mid-scrub would stay
    // that way until the next gesture.
    deps.onProgress?.(0)
    // And it is an ARRIVAL. The intro reaching 'site' comes here rather than
    // through contextChanged — App resets on the phase edge — and it is the
    // first moment the viewer is looking at a world they can leave, so the hint
    // is offered after the arrival beat, not the silence.
    offerHint()
  }

  return {
    settle() {
      machine.settle(now())
      ensureRunning()
      // The warp has ended and a world is in front of the viewer: an arrival,
      // and the hint is offered for it. The cut ~0.8s earlier went through
      // contextChanged under full black cover; this is the moment they can see.
      offerHint()
    },
    contextChanged,
    reset,
    resetZoom() {
      band.reset()
      reportZoom()
    },
    dispose() {
      window.removeEventListener('wheel', onWheel)
      for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
        window.removeEventListener(type, onSafariGesture, { capture: true })
      }
      window.removeEventListener('pointerdown', onPointerDownRelease, { capture: true })
      window.removeEventListener('pointerdown', onPinchDown, { capture: true })
      window.removeEventListener('pointermove', onPinchMove, { capture: true })
      window.removeEventListener('pointerup', onPinchUp, { capture: true })
      window.removeEventListener('pointercancel', onPinchUp, { capture: true })
      control.removeEventListener('keydown', onKeyDown)
      control.removeEventListener('click', onClick)
      if (hintTimer !== 0) clearTimeout(hintTimer)
      if (hintLingerTimer !== 0) clearTimeout(hintLingerTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      if (frame !== 0) {
        cancelAnimationFrame(frame)
        frame = 0
      }
    },
  }
}

export { intentFor }
