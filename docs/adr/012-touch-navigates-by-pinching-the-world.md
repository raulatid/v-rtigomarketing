# ADR 012 — Touch navigates by pinching the world

Status: **Accepted** — 2026-08-26
Reverses: `adr/009` §4 (*"Touch navigates on a right-edge rail, not by a canvas swipe"*) and its
consequence *"Two-finger centroid rotation survives; pinch does not"*
Amends: `DECISIONS.md` §20 / §21 (the zoom band on pinch), §29 (the hint's once-per-visit rule)

## Context

`adr/009` gave touch a right-edge rail because *"the canvas has no free vertical channel — one
finger orbits Earth and pans Murcia"*. That reasoning was sound and it is still sound. It was also
entirely about **one** finger.

Real users, on real phones, told us something the repository could not: shown the Earth, they
spontaneously **spread two fingers** to enter the city, without being taught, and were visibly
frustrated when nothing happened. Nobody reached for the rail.

Two things made that worth acting on rather than filing:

1. **The channel was empty.** Earth rejects a second pointer outright
   (`createFocusCameraRig.ts`); Murcia reads only the centroid's horizontal movement. The
   *separation* between two contacts was computed nowhere in the application. Where a one-finger
   swipe would have had to be stolen from the primary control of both worlds, a pinch takes a
   channel nothing was using.
2. **Earth → city is a scale change** in the mental model. Scroll semantics were a desktop
   metaphor carried onto a phone; zoom semantics are the native one.

An earlier attempt at a one-finger swipe classifier was built, tested and **discarded** on the same
evidence. Its removal is part of this decision, not a separate cleanup.

## Decision

**Between Earth and Murcia, touch navigates by changing the distance between two fingers. The rail
is removed. An accessible control replaces the part of it that was not about touch.**

Five parts, none of which stands without the others:

1. **The signal is growth in separation, in CSS pixels, normalised against the viewport's shorter
   side.** Not a scale ratio — see Consequences. It enters the *existing* pipeline unchanged:
   `navigationGesture` → `progressSpring` → `scrubProgress` → `state.transitionProgress`. There is
   no pinch-specific transition system, and no second commit path.
2. **One direction is eligible per world, and `towardOther` signs it** — the same authority the
   wheel uses. Spreading leaves Earth (the warp dollies *toward* the planet); closing leaves Murcia
   (the return is an ascent, ADR 006).
3. **Commit stays the accumulator's existing `progress >= 1` edge.** No velocity projection, no
   flick commit, no new API. A pinch's apparent velocity is enormous and misleading, and
   `DECISIONS.md` §15's objection — *an accidental gesture must not warp you* — is answered by the
   same deliberateness the wheel is held to.
4. **Murcia's rotate wins ties.** Two fingers there already mean centroid rotation. The pinch hands
   the gesture back the moment the pair has been carried as far as Murcia's own two-finger dead
   zone, checked *before* the claim — so whichever gesture proves itself first wins, and the loser
   has not moved anything yet.
5. **The rail is removed, and an invisible focusable control takes its accessibility role.** A pinch
   is not a universal input.

## Consequences

- **Zoom is still gone from the product.** `DECISIONS.md` §20's zoom band does not come back. A
  pinch here writes `state.transitionProgress` inside the reversible scrub band and nothing else; it
  cannot express a camera distance the committed warp could not already reach. The three existing
  pinch suppressors stay — ctrl+wheel on the wheel path, Safari's `gesture*` events, and Murcia's
  rule that separation does not move its camera. **What changed is that a pinch now means
  *navigate*, not *zoom*.**

- **The signal is growth, not a ratio, and that was learned on a device.** A ratio is free of screen
  size, DPR and grip, and makes the world's apparent scale track the fingers about 1:1 — all true,
  and all beside the point. What a ratio does *not* hold constant is the effort:

  | starting grip | growth to commit under ×1.6 |
  |---|---|
  | 40px | 24px (12px per finger) |
  | 60px | 36px |
  | 150px | 90px |
  | 250px | 150px |

  Spreading to zoom in starts with the fingers close — that is what the gesture *is* — so real use
  landed at the top of that table, reported as *"too quick, a small pinch triggered the
  transition"*. Raising the ratio would only rescale the table, not flatten it. Effort is felt;
  ratios are not.

- **The rail's two jobs went to the scene and to a button.** It was the indicator *and* the touch
  target. The scene is now the indicator — the world moves under your fingers — and there is
  nothing left to drag. `--nav-progress`, `data-state` and `data-direction` are still written, now
  as the observable surface the e2e suite reads and the only place the retreat's literal-zero
  property can be seen from outside.

- **Accessibility is not a side effect of the rail any more; it is explicit.** The rail was
  focusable, and that was the only keyboard and assistive-technology path between the worlds.
  Removing it without replacement would have removed that path. `.nav-control` is a `button`,
  clipped to a pixel and unclipped on `:focus-visible` (the skip-link pattern), labelled with its
  **destination** rather than with the journey, and it commits outright on Enter, Space or click —
  a button is not the slider it replaced, and eight presses would be ceremony rather than safety.

- **`DECISIONS.md` §29's hint rule is amended.** It had the hint appear at first paint and vanish
  forever on the first gesture, and closed with *"broken when… the hint comes back after a
  gesture"*. That was right for a rail: the rail was visible, so it advertised itself and the hint
  only had to explain it. A pinch on a bare canvas advertises nothing. The hint now waits five
  seconds without a navigation input and offers itself **once per world** — re-armed on arrival,
  because the two worlds are left by opposite gestures and demonstrating one teaches nothing about
  the other. A gesture classified as Murcia's *rotation* explicitly does not count as having
  demonstrated anything.

- **Reduced motion now agrees across both worlds.** Murcia gated its whole warp pose on the flag, so
  a reduced-motion viewer could pinch and watch the city do nothing. It now makes the same split
  Earth does: a scrub is direct manipulation and is kept; the committed cinematic's travel is an
  effect applied *to* the viewer and is suppressed.

- **What is still unproven.** Murcia's departing warp changes scale by about 4% across the whole
  band, so a close may not read as *leaving* the way a spread reads as *entering* — the elevation
  rise is most of what is perceptible. And a close is bounded by how wide the fingers started,
  where a spread is bounded by the screen. Both are device questions, and neither has been answered
  by hand. The levers for the first are in `docs/plans/006-pinch-navigation.md` §4, with the
  measured numbers behind them; every one of them is a ground-footprint change requiring the full
  `checks/warp-transition.ts` sweep, and none should be attempted by reasoning.

- **Every tuning constant remains provisional.** `claimGrowthPx`, `commitFraction`,
  `minStartDistancePx`, `declineRivalPx` and `HINT_DELAY_MS` are JUDGED, and `commitFraction` is the
  single number to move if the gesture is too easy or too demanding. `declineRivalPx` is coupled to
  Murcia's `rotation.twoPointerThresholdPx` and the coupling is undeclared in code, because `app/`
  may not read `experiences/`: if one moves, move the other.
