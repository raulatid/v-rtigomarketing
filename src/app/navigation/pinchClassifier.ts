import type { PinchLimits } from './navigationConfig'

// What two fingers MEAN: look at this world, or leave it.
//
// Pure — no DOM, no clock of its own, no idea what a world is. Fed the distance
// between two contact points and asked for a verdict, on the same shape as
// `navigationGesture` beside it.
//
// ── Why this is so much smaller than the classifier it replaces ──
//
// The one-finger version had to discriminate against the gesture it was sitting
// on top of: one finger orbits Earth and pans Murcia, so every rule it applied
// was a tax on a primary control, and it needed four of them plus a 120ms race
// to stay honest. Two fingers are not like that. The SEPARATION between two
// contacts is a channel nothing in the application has ever read.
//
// On Earth there is no competing meaning at all — a second contact does nothing
// — so a false decline costs a viewer nothing they were doing. In Murcia two
// fingers already mean centroid rotation, and that is the one rival: the caller
// supplies its travel and it is weighed against the spread, first past the post.
// The asymmetry still holds and still decides ties: a false decline leaves you
// turning a city you were already turning, a false claim throws you out of it.
//
// ── The signal is GROWTH in separation, not a scale ratio ──
//
// It was a ratio until 2026-08-26, and the device said no: a ratio holds the
// apparent scale change constant but lets the EFFORT scale with whatever grip
// you started from, so a spread begun with the fingers close together — which
// is how the gesture is actually made — committed after about a centimetre.
// navigationConfig.ts carries the table. Pixels of growth are the same
// everywhere, and are already additive and already signed, which is all the
// accumulator downstream ever wanted.
//
// ── Direction ──
//
// BOTH directions are eligible, and THE CALLER SIGNS THEM — this module is
// handed growth "toward the other world" and never learns which world that is.
// Same division of labour as `navigationGesture` next door, and for the same
// reason: which way leads out of a world already has an owner (`towardOther`),
// and a second opinion would be a second place to get it wrong.
//
// Concretely: on Earth spreading is positive, because the transition dollies the
// camera toward the planet — pull the world open and it comes closer, which is
// the gesture people already use to zoom a map. In Murcia CLOSING is positive,
// because leaving is an ascent (ADR 006): the camera rises away from the city.
//
// Only the positive direction was eligible until `adr/014`, and the negative one
// was declined outright. That was right while a pinch could only mean "leave this
// world" — but it is a ZOOM now and a zoom has two ends, so what latches is the
// claim rather than the direction. The magnitude decides, and the sign is passed
// on to the band, which is the only thing that has to know what it means.
//
// Note the verdict is still about OWNERSHIP, not about navigating: claiming
// means these two fingers belong to the camera rather than to the city they are
// resting on. Whether the gesture eventually navigates is decided much later, by
// whether it runs out of zoom and keeps pushing.

export type PinchVerdict = 'watching' | 'claimed' | 'declined'

export interface PinchClassifier {
  /**
   * A second contact point has landed. Clears everything.
   *
   * Returns the verdict, because a grip that is already too small to measure is
   * declined here rather than on some later sample the caller has to wait for.
   */
  begin(startDistancePx: number): PinchVerdict
  /**
   * One sample. Returns the verdict, which never changes once decided.
   *
   * `eligibleGrowthPx` is the change in separation since `begin`, signed by the
   * caller so that positive always means "toward the other world".
   *
   * `rivalTravelPx` is how far a COMPETING two-finger gesture has been carried
   * by the same fingers — Murcia's centroid rotation. Pass 0 where no rival
   * exists, which on Earth is always: passing a real number there would decline
   * good pinches in favour of a gesture that does not exist.
   */
  sample(eligibleGrowthPx: number, rivalTravelPx?: number): PinchVerdict
  /**
   * This gesture is not a candidate at all — wrong world, attention elsewhere,
   * two fingers inside a scrolling panel.
   *
   * Exists so a caller that refuses a gesture can SAY so, rather than declining
   * to begin one and leaving a classifier that still answers questions.
   */
  decline(): void
  /** The gesture ended while still undecided: that was not a pinch. */
  end(): PinchVerdict
  reset(): void
  readonly verdict: PinchVerdict
  readonly startDistancePx: number
  /**
   * Growth in separation, in CSS px, at the moment of the claim.
   *
   * Handed to the accumulator so the spread spent proving intent still counts
   * toward the gesture. Without it the scrub would open with a dead zone the
   * size of `claimGrowthPx`, and the world would sit still through the part of
   * the gesture the viewer was watching most closely.
   */
  readonly backlogPx: number
}

export function createPinchClassifier(limits: PinchLimits): PinchClassifier {
  let verdict: PinchVerdict = 'watching'
  let startDistancePx = 0
  let backlogPx = 0

  function begin(distancePx: number): PinchVerdict {
    startDistancePx = distancePx
    backlogPx = 0
    // Two contacts too close together to be two fingers, or a degenerate
    // reading. A low floor now that the signal is growth rather than a ratio —
    // it no longer has to protect a division, only reject a mis-touch.
    verdict =
      Number.isFinite(distancePx) && distancePx >= limits.minStartDistancePx
        ? 'watching'
        : 'declined'
    return verdict
  }

  function decide(eligibleGrowthPx: number, rivalTravelPx: number): PinchVerdict {
    if (!Number.isFinite(eligibleGrowthPx)) return 'declined'
    // A classifier that was never begun — because the caller looked at the
    // gesture and refused it — sits at 'watching' with no start distance. It
    // must not answer questions about a gesture nobody wanted.
    if (!(startDistancePx > 0)) return 'declined'

    // ── The rival, first ──
    //
    // Checked BEFORE the claim so a tie goes to the gesture that already exists.
    // The threshold is the travel at which that gesture starts moving something,
    // so at the moment this fires the city has not turned yet and handing the
    // fingers back costs nothing.
    //
    // What is compared against it is the rival travel a pinch CANNOT account
    // for. Read raw, this rule was unpassable by a real hand: a pinch that
    // closes by `g` with one finger anchored moves the midpoint by `g/2`, so
    // reaching the 16px claim put the midpoint at exactly the 8px decline — and
    // the decline is tested first. Every anchored-thumb pinch in Murcia was
    // handed to the rotation, which is what the client reported as "sometimes it
    // rotates, sometimes nothing happens". A pinch that drifts vertically was
    // worse: the city reads only the centroid's X, so the fingers were taken
    // from the zoom and given to a turn of zero degrees.
    //
    // `growth / 2` is an INTENT ALLOWANCE, not a geometric correction, and the
    // distinction is load-bearing. The exact displacement is `g/2` along the
    // line between the contacts, while the rival is measured on X alone; the two
    // coincide only for a horizontal grip. Taking the unprojected half is
    // deliberately the generous bound — the most X-travel a pinch could possibly
    // explain — so that whatever is left over is travel no pinch accounts for. A
    // reader who mistakes this for a derivation will "fix" it into a projection
    // and re-break the vertical-pinch case.
    //
    // A pair carried without changing separation has zero growth, so it still
    // declines at exactly `declineRivalPx` and the tie still goes to the turn.
    const unexplainedRivalPx = Math.abs(rivalTravelPx) - Math.abs(eligibleGrowthPx) / 2
    if (Number.isFinite(rivalTravelPx) && unexplainedRivalPx >= limits.declineRivalPx) {
      return 'declined'
    }

    // BOTH directions claim, since `adr/014`. The wrong way used to be declined
    // outright, and it was the right rule while a pinch could only mean "leave
    // this world": moving away from the other world meant nothing, so latching a
    // decline stopped the gesture flipping halfway through.
    //
    // A pinch is a zoom now, and a zoom has two ends. Closing on Earth is
    // zooming out and opening in Murcia is zooming in — both are real, both are
    // persistent, and neither can navigate on its own because the band's far end
    // returns no overflow. So the threshold is on the MAGNITUDE and the sign is
    // carried through to the band, which is the only thing that has to know what
    // it means.
    //
    // Symmetric for free either way: a signed distance is its own mirror, so one
    // constant serves both directions and they cannot be tuned into disagreeing.
    if (Math.abs(eligibleGrowthPx) >= limits.claimGrowthPx) {
      backlogPx = eligibleGrowthPx
      return 'claimed'
    }

    return 'watching'
  }

  return {
    begin,

    sample(eligibleGrowthPx, rivalTravelPx = 0) {
      // Latched. One irreversible decision per two-pointer sequence, so
      // ownership can never oscillate mid-gesture between the world and the
      // navigation — which at a frame boundary would read as the scene tearing.
      if (verdict !== 'watching') return verdict
      verdict = decide(eligibleGrowthPx, rivalTravelPx)
      return verdict
    },

    decline() {
      verdict = 'declined'
      startDistancePx = 0
      backlogPx = 0
    },

    end() {
      // Lifting while undecided is two fingers that rested and left. Saying so
      // explicitly means the caller never has to treat 'watching' as a state
      // that outlives the gesture.
      if (verdict === 'watching') verdict = 'declined'
      return verdict
    },

    reset() {
      verdict = 'watching'
      startDistancePx = 0
      backlogPx = 0
    },

    get verdict() {
      return verdict
    },
    get startDistancePx() {
      return startDistancePx
    },
    get backlogPx() {
      return backlogPx
    },
  }
}
