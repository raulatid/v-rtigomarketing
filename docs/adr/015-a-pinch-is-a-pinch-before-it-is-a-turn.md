# ADR 015 — A pinch is a pinch before it is a turn, and leaving Murcia is its own gesture

Status: **Accepted** — 2026-09-06
Amends: `adr/012` §4 (*"Murcia's rotate wins ties"*) — the tie is now decided on the rival
travel a pinch cannot account for, not on raw centroid travel; `adr/014`'s *"one continuous
track, retraced backwards"* — for Murcia's transition-facing direction only; `adr/014`'s
near end, which was `focusFlight.minDistanceScale` reused and is now measured
Amends: `DECISIONS.md` §20 (the zoom band, for the fourth time)

> **SUPERSEDED IN PART, 2026-09-10 — `DECISIONS.md` §44.** The arbitration this ADR exists for is gone, because the conflict is gone: two-finger rotation was deleted with the camera-navigation port, so a pair of contacts now means a pinch and nothing else. `pinchClassifier.ts`, the rival-travel rule and the anchored-thumb allowance were deleted with it. What SURVIVES is the second half — leaving Murcia is still its own gesture: a pinch may commit only if it STARTED with the band already at the exit-facing end, so one close zooms out and parks and a second leaves. That rule is unchanged and still load-bearing, and the reasoning below is why.

## Context

The client drove the build on a phone and reported that zoom in Murcia frequently did not
work: *"sometimes rotate, sometimes nothing happens, and when the zoom out triggers it just
jumps out to Earth."* Zoom-out was the worse direction. **The mouse wheel in Murcia was
fine.**

That last fact is the whole diagnosis. Wheel and pinch share everything downstream — the
same `zoomBand`, the same `zoomDepth`, the same `murciaZoomPose`. A fault that takes the
pinch and spares the wheel is upstream of the band, in `pinchClassifier`.

Four separate defects were found. Only the first was suspected, and the third was found
only by driving the change end to end.

### The rival rule was unpassable by a human hand

`adr/012` §4 gave Murcia's centroid rotation the tie, declining the pinch once the pair had
been carried `declineRivalPx: 8` — deliberately Murcia's own
`rotation.twoPointerThresholdPx`, so that whichever gesture proved itself first won and the
loser had not moved anything yet. The reasoning was sound. The measurement was not.

**A pinch moves the centroid as an unavoidable consequence of being a pinch.** Close by `g`
with one finger anchored — which is what a thumb-and-finger pinch *is* — and the midpoint
travels `g/2`. Reaching the 16px claim therefore put the midpoint at exactly the 8px
decline, and the decline was tested first. The verdict latches for the whole two-pointer
sequence. So every anchored-thumb pinch in Murcia was handed to the rotation, and the
symptom depended only on which way the hand happened to drift:

- drift mostly horizontal → **the city rotated instead**;
- drift mostly vertical → `applyTwoPointer` reads the centroid's X and nothing else, so the
  fingers were taken from the zoom and given to a turn of **zero degrees**. Nothing
  happened at all.

`navigationConfig.ts` had the mechanism written down from the start — *"thumbs are not
symmetric, so every pinch drifts the centroid a little"* — and treated it as noise to be
out-thresholded rather than as geometry.

It shipped because every test of the rivalry moved the two contacts perfectly symmetrically
about a fixed centroid: `pinchInput.test.ts`, and `checks/navigation-feel.ts` §10, whose own
comment notes that its pinch is symmetric-only. `murciaConfig.ts` recorded the gap in
writing — *"JUDGED 2026-08-25, and not yet driven on a real phone"* — and no browser test
performed a pinch inside Murcia at all.

### Zooming out of the city and leaving it were the same motion

`adr/014` put 600px of zoom band in front of 300px of commit push and scaled `pinchGain` so
that `commitFraction` of the viewport's shorter side is the whole 900px journey. On a 393px
phone that is 165px of closure: **110px fills the band, 55px more flies you to Earth**, with
nothing between them. A close is bounded by how wide the fingers started, so an ordinary
pinch-to-zoom-out ran off the end of the band and out of the world. `adr/014` had flagged
the split as never driven on hardware.

### The city was entered at the closest the camera goes

Found while proving the change end to end, and it is probably the largest of the four.

A pinch that commits is still moving. The accumulator was reset at the commit — *"travel
banked under the old scene's sign means nothing under the new one"* — but the **band** is fed
from the same events and does not reset. So the tail of the entering spread arrived after the
worlds had swapped, and `towardOther` signed it under the new world, where the very spread
that had just entered Murcia means zoom **in**.

Measured on a phone-shaped build, 2026-09-06: **Murcia was entered at `zoomDepth` −1** —
parked at the closest the camera goes, with the entire band to cross before zooming out did
anything, and with zooming in already exhausted. That is "nothing happens" and "zoom out is
worse" in one defect, and it was invisible from inside the product because it looked like an
arrival pose.

It stayed invisible in testing because until now a single close leaving Murcia hid it: the
first gesture after arrival committed regardless of where the band was.

### The inward half was worth almost nothing

`zoomNearScale` was `focusFlight.minDistanceScale` reused rather than measured, so that
there was one number for "as close as the city goes". A full pinch-in bought 285 → 199.5
units — an apparent **×1.43 for an entire opening of the hand**.

## Decision

**Four changes, one per defect.**

1. **The rival is the travel a pinch cannot account for, on the axis the rival consumes.**
   `pinchRivalTravel()` reports the centroid's X displacement only, because
   `DragPanController.applyTwoPointer` reads only X — a vertical carry turns the city by
   nothing, and handing a gesture to a rotation of zero degrees is how "nothing happens"
   was manufactured. The classifier then subtracts an allowance of `growth / 2` before
   applying the dead zone.

   **The allowance is a statement of intent, not a derivation.** The exact displacement is
   `g/2` *along the line between the contacts*, while the rival is measured on X; the two
   coincide only for a horizontal grip. The unprojected half is deliberately the generous
   bound — the most X-travel a pinch could possibly explain — so whatever exceeds it is
   travel no pinch accounts for. A reader who mistakes it for a projection will "correct" it
   and re-break the vertical-pinch case.

   `declineRivalPx` did not move, and did not need to: a pair carried without changing
   separation has zero allowance and still declines at exactly 8. **`adr/012` §4's rule is
   intact** — the tie still goes to the gesture that already exists, and
   `checks/navigation-feel.ts` §10 now asserts the property that makes it true, that an
   anchored-thumb pinch turns the city by nothing before the claim can take it.

2. **A pinch may leave Murcia only if it began with the band already at the exit-facing
   end.** One close zooms out and parks; lift, close again, and the second one spends
   everything it has on the push. The zoom is persistent, so the second gesture starts
   saturated.

   **Eligibility is decided when the pair arms, not at the claim.** The claim happens after
   `claimGrowthPx` has already been spent, so a gesture that saturated the band on its way
   to being claimed would hand itself the permission this exists to withhold.

   Murcia only, and Earth's spread-to-enter is untouched: entering is bounded by the screen
   and can always be pushed further, where leaving is bounded by the grip the hand happened
   to start with. The wheel is untouched in both worlds — it works today, and a ratchet of
   discrete notches has no equivalent of a single bounded motion.

3. **The gesture that commits is spent, not merely unowned.** At the commit the classifier is
   declined, which latches until the contacts lift. Clearing `pinchOwnsProgress` stopped the
   accumulator being fed and left the band being fed; declining stops both. A gesture whose
   world changed underneath it is exactly what a latched decline is for.

4. **`zoomNearScale` is measured on its own, at `0.45`** — ×2.22 rather than ×1.43. The
   reuse cost more than it saved: the two numbers answer different questions, one being how
   close a *flight* may dolly from wherever the viewer is and the other how close the
   *viewer* may put themselves.

## The near end was swept, and the value is not the lowest that passes

`check:footprint` 2026-09-06: **0.35 passes, 0.30 fails** at a compound closest approach of
59.8 units against the ~60-unit inversion floor, below which the fixed `lookAtHeight` tilts
the camera up faster than the shorter distance narrows the view and flying *in* stops being
the safe direction. The binding case is the compound one — full zoom-in and then a district
flight — which neither floor finds alone.

0.45 lands that compound minimum at 89.8 units, half again above the floor and two sweep
steps clear of the cliff. A value chosen hard against a boundary is one the next GLB
discovers in production, so the margin is now an assertion rather than a habit:
`checks/warp-transition.ts` §7 requires the compound minimum to keep a quarter of the floor
in hand, which is what replaced the equality it used to assert.

## Consequences

- **`onCut`s zoom reset was never the problem, and would not have fixed it.** The reset
  fires at the black frame and did fire; the tail arrived after it. Anything that clears the
  band on arrival would have been overwritten by the same events a moment later.

- **The commit stage can now be starved deliberately, and that is a new state.** A pinch
  that may not commit still fills the band; it pushes `0` to the accumulator rather than
  skipping the push, because the cooldown's quiescence test reads the stream and a gesture
  that went quiet is not the same as one that was refused.

- **Leaving Murcia is two gestures, and nothing on screen says so yet.** The band saturates
  and the world stops; the viewer has to discover that lifting and closing again is what
  leaves. The hint frame is where that belongs and it is **not done in this change**.

- **`e2e/mobile.spec.ts`'s return leg is two closes**, and it now waits for the navigation
  root to read `data-state="idle"` first. That wait was already the documented remedy for
  the test's known nondeterminism (`docs/plans/011-phone-menu-glass-field.md`); with two
  closes it stops being politeness and becomes correctness, because a first close refused
  during the cinematic's `locked` window parks nothing and the second would be the first.

- **Three unit fixtures were restated rather than repaired.** `pinchClassifier.test.ts` used
  `sample(CLAIM, RIVAL)` to mean "a rival is carrying them", which under the allowance is
  now the description of an ordinary anchored-thumb pinch. The fixtures state the rival as
  "the allowance, plus the travel that is really a turn". `pinchInput.test.ts`'s *"declines
  a close that is really a turn"* closed by half a journey while sliding 140px — more
  closing than sliding, which is a pinch — and is now stated as what its name says.

- **What is still unproven is the same thing that was unproven before, and it is the only
  thing that can close this**: none of it has been judged by hand on a phone. The three
  gesture defects were found by reading and are pinned by tests that model an asymmetric
  hand, but a test that dispatches its own `PointerEvent`s proves the logic and nothing
  else.

## How you would know it broke

- An anchored-thumb pinch in Murcia turns the city instead of zooming it. The allowance is
  gone, or has been "corrected" into a projection onto the grip axis.
- A two-finger sideways sweep zooms instead of turning. The allowance is being applied to a
  gesture with no growth to justify it, or `declineRivalPx` has been raised to paper over
  something.
- A vertical pinch carried sideways zooms. The X-only rival has been widened back to a
  `hypot`, or the allowance has grown.
- One close leaves Murcia. `pinchMayCommit` is being decided at the claim instead of when
  the pair arms, or has stopped being consulted in `pushTravel`.
- The zoom band never fills in Murcia because every pinch is refused. `pinchMayCommit` has
  leaked a stale `false` across gestures — it resets in `endPinch` for exactly that reason.
- `check:footprint` fails at the compound minimum, or `check:warp` §7 fails its margin. The
  near end has been tightened toward the cliff; that is never a tuning question.
