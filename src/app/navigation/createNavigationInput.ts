import type { ExperienceId } from '../experience'
import { normalizeWheelDelta } from '../../utils/wheelDelta'
import { createNavigationMachine, intentFor } from './navigationMachine'
import type { NavigationIntent } from './navigationMachine'
import { createZoomBand } from './zoomBand'
import {
  NAVIGATION_COOLDOWN,
  NAVIGATION_PINCH,
  NAVIGATION_ZOOM,
  pinchGain,
  type NavigationCooldownLimits,
  type PinchLimits,
  type ZoomBandLimits,
} from './navigationConfig'

// DOM input and control state. The zoom band owns travel; the machine owns
// transition locking. Each scene supplies direction and visual style.
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
// The input loop commits on the next frame and advances cooldown independently
// of rendering. It stops when the machine is idle; persistent zoom needs no clock.

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
  /**
   * Something is holding the viewer's attention, and a pinch toward the way
   * out should release it rather than be refused.
   *
   * Set only while `canNavigate` is false BECAUSE of that thing — today the
   * Murcia district's in-world display, whose close is a drawn glyph a finger
   * can miss. A pinch that would have left the world instead leaves the
   * display: same direction, one level. Null (or absent) keeps the refusal
   * every other attention-holder gets, because the DOM panels have real closes.
   *
   * Read live like `canNavigate`, for the same reason.
   */
  releaseFocus?: (() => void) | null
}

export interface NavigationInputDeps {
  /**
   * The navigation control's root. Owned by the caller.
   *
   * Carries the painted state, and contains the focusable button and the hint —
   * both optional, so a harness can pass a bare element and still exercise the
   * input path without building the markup around it.
   */
  root: HTMLElement
  getContext: () => NavigationContext
  /** A commit. The caller runs the transition and must call `settle` when it ends. */
  onCommit: (intent: NavigationIntent) => void
  /**
   * The zoom moved, -1..+1. Called on every event that changes it.
   *
   * Persistent and raw: each world applies its own camera smoothing.
   *
   * Not called per frame: nothing here advances it, so the only moments it can
   * change are an event and a reset.
   */
  onZoom?: (depth: number) => void
  /**
   * A horizontal wheel swipe in Murcia, in normalised CSS px, capped per event
   * like travel, and signed like a pointer drag's `dx`: positive slides the
   * world right. Only for events whose horizontal component dominates, and
   * only while a gesture could accumulate. Nothing here consumes it; the caller
   * turns the camera.
   */
  onLook?: (dxPx: number) => void
  pinchLimits?: PinchLimits
  cooldownLimits?: NavigationCooldownLimits
  zoomLimits?: ZoomBandLimits
}

export interface NavigationInput {
  /** Explicit navigation shares the gesture lock and never toggles at its destination. */
  navigateTo(destination: NavigationContext['current']): void
  /** The transition finished. Starts the cooldown from this instant. */
  settle(): void
  /**
   * The context's semantic inputs changed — a panel opened or closed, a world
   * finished loading, the intro moved. Re-derives the control's painted state
   * from the context right now.
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

/**
 * The depth at which the band counts as parked against its far end.
 *
 * `zoomBand` clamps to exactly 1, so this only has to survive the division that
 * produces it. It is a guard against float, not a tolerance anyone may tune.
 */
const SATURATED_DEPTH = 1 - 1e-6

export function createNavigationInput(deps: NavigationInputDeps): NavigationInput {
  const cooldownLimits = deps.cooldownLimits ?? NAVIGATION_COOLDOWN

  const zoomLimits = deps.zoomLimits ?? NAVIGATION_ZOOM

  const machine = createNavigationMachine(cooldownLimits)
  const band = createZoomBand(zoomLimits)
  /** Mirrors what the caller has been told, so a no-op event reports nothing. */
  let reportedZoom = 0

  // Refused events still count as input. The latch survives resets and cuts.
  let lastInputMs = Number.NEGATIVE_INFINITY
  let latched = false
  let bandEndReached = false

  function latch(timeStampMs: number): void {
    latched = true
    lastInputMs = timeStampMs
  }

  const root = deps.root
  /** The focusable button. Falls back to the root so a bare host still keys. */
  const control: HTMLElement = root.querySelector('.nav-control') ?? root
  let frame = 0
  /** Mirrors what is on the element, so a frame with no change writes nothing. */
  let paintedState = ''
  let paintedDirection = ''

  // --- The clock -------------------------------------------------------------
  //
  // `performance.now()` and event timestamps share an origin, so cooldown and
  // latch gaps can compare frame time with input time.

  const now = () => performance.now()

  // --- Direction -------------------------------------------------------------

  /**
   * Raw signed input -> travel toward the other world.
   *
   * Positive raw means approach: a forward wheel rotation (negated deltaY at
   * the wheel boundary), or fingers spreading on the screen. From Earth that
   * is toward Murcia; from Murcia the same gesture means the opposite, so the
   * sign flips. Keep this mapping shared; only wheel input is inverted.
   *
   * This flip is why a momentum tail is harmless a second time over: the scene has
   * already swapped by the time the tail arrives, so the tail maps to NEGATIVE
   * travel in the new world and subtracts from a total that is already zero. The
   * cooldown is still the real guard; this is a free one.
   */
  function towardOther(raw: number, current: ExperienceId): number {
    return current === 'earth' ? raw : -raw
  }

  /** Every input crosses the same band; its far end is the commit threshold. */
  function pushTravel(
    rawTravelPx: number,
    timeStampMs: number,
    accumulate: boolean,
    mayCommit = true,
  ): void {
    if (!Number.isFinite(rawTravelPx) || !Number.isFinite(timeStampMs)) return
    if (latched && (timeStampMs - lastInputMs) / 1000 >= cooldownLimits.latchGapSeconds) {
      latched = false
    }
    lastInputMs = timeStampMs
    // Guard the band itself, not just the commit: refused input cannot zoom.
    if (!accumulate || latched) return
    const travelPx =
      Math.sign(rawTravelPx) * Math.min(Math.abs(rawTravelPx), zoomLimits.maxEventTravelPx)
    band.push(travelPx)
    if (mayCommit && travelPx > 0 && band.depth >= SATURATED_DEPTH) {
      bandEndReached = true
    }
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
    frame = requestAnimationFrame(tick)
  }

  function tick(): void {
    frame = 0
    const t = now()
    const context = deps.getContext()
    const released = machine.tick(t, lastInputMs)
    if (released?.onDeadline) latch(t)

    // Events can reach and then leave the limit before this frame.
    const reached = bandEndReached
    bandEndReached = false
    const abandoned = reached && band.depth < SATURATED_DEPTH

    if (reached) {
      const intent = abandoned ? null : machine.commit(context.current)
      if (intent && context.canNavigate) {
        // The remaining movement belongs to the departing world. Spend the pair
        // so it cannot zoom the destination after the cut and cooldown.
        pinchSpent = true
        pinchDeliveredPx = 0
        paint('locked', context.current)
        deps.onCommit(intent)
        ensureRunning()
        return
      }
      // Attention may change between the arming event and this frame.
      machine.reset()
    }

    paint(phaseClass(context), context.current)
    if (machine.phase !== 'idle') ensureRunning()
  }

  function phaseClass(context: NavigationContext): string {
    if (machine.phase === 'locked') return 'locked'
    if (machine.phase === 'cooldown') return 'cooldown'
    if (!context.canNavigate) return 'suppressed'
    return 'idle'
  }

  // --- Painting --------------------------------------------------------------
  //
  // Discrete control state is written directly, without per-event React renders.
  function paint(state: string, current: ExperienceId): void {
    const direction = current === 'earth' ? 'down' : 'up'
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

    // A trackpad swipe is never pure: one meant to turn carries some deltaY, and
    // fed to the band that deltaY zooms the city while nothing turns. So in
    // Murcia each event goes to its DOMINANT axis — horizontal turns, vertical
    // zooms and leaves. The pointer drag deliberately does not classify
    // (DECISIONS §44); this is the wheel only. A turn never touches the gesture
    // or the band, so a horizontal stream cannot zoom, commit or hold a latch.
    if (context.current === 'murcia' && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      if (!(machine.canAccumulate() && context.canNavigate)) return
      // Negated so a natural-scrolling swipe to the right (deltaX < 0) reads as
      // a drag to the right: the world follows the fingers.
      deps.onLook?.(-normalizeWheelDelta({ deltaY: event.deltaX, deltaMode: event.deltaMode }))
      return
    }

    // Forward wheel rotation approaches; backward rotation pulls away. Invert
    // only vertical wheel input, preserving touch spread and horizontal look.
    const raw = -normalizeWheelDelta(event)
    pushTravel(
      towardOther(raw, context.current),
      event.timeStamp,
      machine.canAccumulate() && context.canNavigate,
      true,
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
   * Explicit navigation commits from any zoom depth. Each world re-bases the
   * cinematic on its actual camera pose, preserved until the covered cut.
   */
  function activate(timeStampMs: number): void {
    const context = deps.getContext()
    if (!context.canNavigate) return
    const intent = machine.commit(context.current)
    if (!intent) return
    // Preserve the departing zoom pose until the covered cut.
    bandEndReached = false
    pinchSpent = true
    latch(timeStampMs)
    paint('locked', context.current)
    deps.onCommit(intent)
    ensureRunning()
  }
  // --- Two fingers, on the canvas --------------------------------------------
  //
  // THE shipped touch path, in both worlds. It was a prototype behind `?pinch=1`
  // and Earth-only when this comment was first written; the flag was removed with
  // `adr/012` and Murcia was wired in the same decision, so a reader who came
  // here looking for the gate it used to describe was being sent somewhere that
  // no longer exists.
  //
  // `adr/009` chose a rail over a canvas gesture because "the canvas has no free
  // vertical channel — one finger orbits Earth and pans Murcia". That premise was
  // about ONE finger and it still holds. Two fingers are a different question:
  // Earth rejects a second pointer outright, and the SEPARATION between two
  // contacts is a channel nothing in this application has ever read. This takes
  // an empty channel rather than borrowing a full one.
  //
  // ── There is nothing left to arbitrate ──
  //
  // Murcia's two fingers used to ALSO mean centroid rotation, and this module
  // carried a classifier whose whole job was deciding which of the two a given
  // pair meant. `adr/015` was the second attempt at that rule; the first was
  // unpassable by an ordinary hand, because an anchored-thumb close moves the
  // midpoint by half its own growth BY CONSTRUCTION and so looked like a turn.
  //
  // Two-finger rotation is gone. A pair of contacts now means exactly one thing,
  // in both worlds, so there is no verdict to reach and no rival to measure: the
  // pinch takes the gesture the moment the second finger lands and drives the
  // band from the first sample. `pinchClassifier.ts`, `declineRivalPx` and the
  // undeclared coupling to Murcia's `twoPointerThresholdPx` all went with it.
  //
  // The fingers ARE still taken from whatever was following them, once, when the
  // pair arms — see `cancelContacts`. That is not an arbitration; it is telling
  // the experiences that the one finger they were tracking is now half of
  // something else.

  const pinchLimits = deps.pinchLimits ?? NAVIGATION_PINCH
  /** Separation when the pair armed. All growth is measured against this. */
  let pinchStartDistancePx = 0
  /**
   * The pair is SPENT: no further growth from these two contacts drives
   * anything until they lift.
   *
   * Three things spend a pair — a commit (the world changed underneath it), a
   * focus release (the display it dismissed must not then zoom), and a refusal
   * at arm time (a scrolling panel, or attention held with no release offered).
   */
  let pinchSpent = false
  /** True once a pair has armed a NAVIGATING pinch. */
  let pinchArmed = false
  /**
   * Separation-growth px -> zoom-band px. Sampled per gesture, not per module.
   *
   * It depends on the viewport, and a phone that turns between one pinch and the
   * next must be measured against the side it now has. Re-read at each second
   * contact rather than mid-gesture, so a rotation can never rescale a pinch
   * that is already in flight.
   */
  let gain = pinchGain(zoomLimits.towardTravelPx, 1, pinchLimits)

  /** The touch contacts in play, keyed by pointer id, in the order they landed. */
  const contacts = new Map<number, { x: number; y: number }>()
  /** Growth px already handed over, so each sample pushes only the difference. */
  let pinchDeliveredPx = 0
  /**
   * Fixed when the pair arms: a pinch starting below the limit only zooms.
   * A fresh pinch at the limit may commit after deliberate growth, in either world.
   */
  let pinchMayCommit = true
  /**
   * True only while `cancelContacts` is dispatching its synthetic cancels.
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

  /**
   * The release a claimed pinch will make instead of navigating, while an
   * attention-holder that allows one is up (`NavigationContext.releaseFocus`).
   *
   * Decided at the second contact, once per sequence, like `pinchMayCommit`:
   * a district closing under the fingers must not turn the rest of the same
   * gesture into a zoom. Cleared by `endPinch`.
   *
   * Like a transition commit, this action needs a deliberate movement, and
   * `releaseGrowthPx` says why: dismissing what someone is reading cannot be
   * undone, so it may not happen on fingertip drift.
   */
  let pinchReleasesFocus: (() => void) | null = null

  function pinchDistance(): number {
    const points = [...contacts.values()]
    if (points.length < 2) return 0
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
  }

  /**
   * The most growth one event may carry, given the per-event travel cap.
   *
   * `maxEventTravelPx` exists so one absurd WHEEL event cannot navigate. A pinch
   * is not an impulse though — it is a position, and the separation between two
   * fingers is ground truth about where the viewer has put the world. So the
   * clamp is respected and the remainder is CARRIED rather than discarded.
   */
  const maxGrowthPerEvent = () => zoomLimits.maxEventTravelPx / gain

  /**
   * Hands over as much of `targetGrowthPx` as one event may carry, and remembers
   * exactly how much that was.
   *
   * The bookkeeping has to record what LANDED, not what was intended, and the
   * difference is not theoretical: fingers move in steps, so a fast spread
   * routinely asks for more than one event may carry. Recording the intended
   * figure would silently drop the remainder and open a dead zone in the middle
   * of the gesture. It is carried instead.
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
      pinchMayCommit && targetGrowthPx >= pinchLimits.releaseGrowthPx,
    )
    ensureRunning()
  }

  /** A lifted or cancelled pair cannot resume from its previous separation. */
  function endPinch(): void {
    pinchDeliveredPx = 0
    // Back to the permissive default. The next pair re-decides it from the band
    // when it arms; leaving a stale `false` here would be a refusal nothing
    // could account for.
    pinchMayCommit = true
    pinchReleasesFocus = null
    pinchStartDistancePx = 0
    pinchSpent = false
    pinchArmed = false
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
      endPinch()
      return
    }
    if (contacts.size < 2) return

    const context = deps.getContext()
    // Not while something else owns attention, and two fingers inside a
    // scrolling panel belong to the panel (same helper the wheel uses, so a new
    // scroll region never has to register itself twice).
    //
    // Refused EXPLICITLY rather than by declining to arm. A pair that was never
    // armed still has a start distance of 0, and would answer the next move as
    // though the fingers had opened from nothing.
    if (!context.canNavigate || overScrollable(event.target)) {
      // One refusal is not a refusal: an attention-holder that offers a release
      // gets the pair armed for THAT instead, and a deliberate opening of the
      // hand dismisses it rather than moving the world. See `onPinchMove`.
      const releaseFocus = context.canNavigate ? null : (context.releaseFocus ?? null)
      if (releaseFocus === null || overScrollable(event.target)) {
        pinchSpent = true
        return
      }
      pinchReleasesFocus = releaseFocus
      pinchStartDistancePx = pinchDistance()
      return
    }

    pinchDeliveredPx = 0
    // Decided here, once, for the whole sequence. See the declaration.
    pinchMayCommit = band.depth >= SATURATED_DEPTH
    // Preserve zoom travel per pixel, sampled once per gesture.
    gain = pinchGain(
      zoomLimits.towardTravelPx,
      Math.min(window.innerWidth || 0, window.innerHeight || 0),
      pinchLimits,
    )
    pinchStartDistancePx = pinchDistance()
    pinchArmed = true
    // Taken from whatever was following the first finger, NOW rather than after
    // a threshold. The experiences hear one cancel per contact and drop the
    // gesture; the district also closes its press ledger on it, which is what
    // lets the next tap after this pinch still be a tap.
    cancelContacts(event)
  }

  const onPinchMove = (event: PointerEvent): void => {
    const contact = contacts.get(event.pointerId)
    if (!contact) return
    contact.x = event.clientX
    contact.y = event.clientY

    if (contacts.size !== 2) return
    if (pinchSpent || (!pinchArmed && pinchReleasesFocus === null)) return

    const context = deps.getContext()
    // Signed by the SAME authority the wheel uses, so which
    // direction leaves a world is stated in exactly one place. On Earth that
    // makes spreading positive; in Murcia, closing.
    const grownPx = towardOther(pinchDistance() - pinchStartDistancePx, context.current)

    if (pinchReleasesFocus !== null) {
      // The gesture that lets go of an attention-holder.
      //
      // `grownPx` is already signed toward the other world, so requiring it to
      // reach `releaseGrowthPx` is the same as requiring an opening of the hand:
      // the way IN is a zoom the holder cannot honour, and it simply never
      // reaches the threshold. Releasing SPENDS the pair, because the tail of
      // the closing hand must not then zoom the world it has just been handed
      // back — the trap `adr/014`'s commit avoids the same way.
      if (grownPx < pinchLimits.releaseGrowthPx) return
      const release = pinchReleasesFocus
      pinchReleasesFocus = null
      pinchSpent = true
      cancelContacts(event)
      release()
      return
    }

    // Owned from the moment the pair armed. Everything here belongs to
    // navigation.
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
    endPinch()
  }

  /**
   * One synthetic `pointercancel` per contact, on the event's target.
   *
   * Sent when a pair ARMS, and again when a pair releases a focused display,
   * because both take the fingers away from whatever was following them. The
   * experience being told is the same either way: a camera controller drops the
   * finger it was tracking and the district closes its press ledger, which is
   * what lets the next tap after this gesture still be a tap.
   *
   * Sent for BOTH contacts because either one may be the pointer an experience
   * had claimed. Nothing is taken away visually — an experience only ever
   * followed one of these two fingers, and after the cancel it follows neither,
   * which is exactly what a pinch should mean.
   */
  function cancelContacts(event: PointerEvent): void {
    const target = event.target
    if (!(target instanceof Element)) return
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
    paint(phaseClass(context), context.current)
  }

  contextChanged()

  function reset(): void {
    bandEndReached = false
    machine.reset()
    endPinch()
    if (frame !== 0) {
      cancelAnimationFrame(frame)
      frame = 0
    }
    const context = deps.getContext()
    paint(phaseClass(context), context.current)
  }

  return {
    navigateTo(destination) {
      if (deps.getContext().current === destination) return
      activate(now())
    },
    settle() {
      machine.settle(now())
      ensureRunning()
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
      window.removeEventListener('pointerdown', onPinchDown, { capture: true })
      window.removeEventListener('pointermove', onPinchMove, { capture: true })
      window.removeEventListener('pointerup', onPinchUp, { capture: true })
      window.removeEventListener('pointercancel', onPinchUp, { capture: true })
      control.removeEventListener('keydown', onKeyDown)
      control.removeEventListener('click', onClick)
      document.removeEventListener('visibilitychange', onVisibility)
      if (frame !== 0) {
        cancelAnimationFrame(frame)
        frame = 0
      }
    },
  }
}

export { intentFor }
