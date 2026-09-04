# ADR 009 — Navigation is a gesture, and the wheel has one owner

Status: **Accepted** — 2026-08-19, **§4 reversed 2026-08-26 by `adr/012`**,
**"zoom is removed" reversed 2026-09-04 by `adr/014`**
Reverses: `DECISIONS.md` §15 (*"The warp is triggered by a control, never by scroll"*)
Amends: `DECISIONS.md` §20 / §21 (the zoom band on wheel and pinch)

> **§4 no longer holds.** Touch navigates by pinching the scene, not on a right-edge rail, and
> the rail is deleted — `adr/012-touch-navigates-by-pinching-the-world.md`. §4's reasoning was
> about ONE finger (*"the canvas has no free vertical channel"*) and remains correct on its own
> terms; two fingers turned out to be a channel nothing was using. The consequence *"two-finger
> centroid rotation survives; pinch does not"* is reversed with it: a pinch now means NAVIGATE.
> There is still no zoom.
> 
> Parts 1–3 — one global wheel authority, raw input never reaching the transition, and the
> four-state machine — are untouched and are what the pinch was built on.

> **"Zoom is removed" no longer holds either** — `adr/014-zoom-is-a-position-the-viewer-owns.md`,
> a client decision after driving the build. The viewer owns a persistent signed zoom in both
> worlds and in both directions; travel fills it first and only the overflow at the
> transition-facing end reaches the accumulator.
>
> **Parts 1–3 survive this one too, and part 1 is what made it buildable.** The single wheel
> authority is why a zoom could be added back without any experience listening for `wheel`
> again: the band sits inside that one authority. The accumulator, its decay, its spring, the
> cooldown and the momentum latch are untouched — they are now the *second* stage of the
> gesture rather than the whole of it.
>
> Three consequences below invert with it: *"zoom is gone from the product"*, *"distance is no
> longer user state"*, and *"the terrain skirt's 700 units become slack"* — the zoom-out has
> spent that margin again. The consequences about focus flights are NOT reversed: a flight still
> dollies inward only, and it now multiplies the zoomed distance rather than the configured one.

## Context

`DECISIONS.md` §15 is the only decision in this repository that this ADR exists to overturn,
and it was not a weak one. It was decided in the Murcia prototype before either direction of
the warp existed, it listed four independent reasons, and it explicitly ruled out the exact
change being made here:

> **Ruled out.** Layering a discrete scroll trigger on top of the control later. It would keep
> the accidental-trigger risk and add nothing. A scroll-driven warp, if ever wanted, is
> continuous scrubbing — a different and much larger feature.

The client has required scroll navigation as a product decision. That is sufficient grounds to
change it and is recorded as such: **this is not a technical argument overturning a technical
argument.** §15's reasoning was sound for its constraints and most of it is still true. What
follows is which parts survived, which parts the accompanying decisions dissolved, and what had
to be built to make the rest safe.

A second product decision arrived with it and is load-bearing for this one: **there is no zoom
anywhere any more** — not on wheel, not on pinch, not on Earth, not on mobile. The only way to
get closer to anything is a controlled camera focus flight on a clickable object.

## Decision

**Navigation between Earth and Murcia is a gesture that accumulates deliberate progress and
commits at a threshold. The wheel has exactly one owner in the application. Zoom is removed.**

Four parts, none of which stands without the others:

1. **A single global wheel authority.** After zoom is removed no experience listens for `wheel`
   at all. `createFocusCameraRig`'s handler and `DragPanController`'s handler are both deleted —
   not disabled. One `window` listener, `{ passive: false }`, is the only wheel handler in the
   application, the only caller of `preventDefault`, and the only owner of `deltaMode`
   normalisation.
2. **Raw input never reaches the transition.** Input produces normalised displacement; a pure
   accumulator produces progress; a pure state machine produces intent; only the machine commits.
3. **A four-state machine that never expands by scene.** `IDLE / GESTURING / LOCKED / COOLDOWN`,
   with `ExperienceId` supplied rather than owned.
4. **Touch navigates on a right-edge rail**, not by a canvas swipe.

## What survived from §15, and how each objection is answered

§15's four reasons, taken in its own order:

- **"Touch has no `wheel` event, and single-finger drag is committed to navigation, so a
  tappable control has to exist regardless."** *Still entirely true, and it is why the touch
  gesture is a rail rather than a swipe.* The canvas has no free vertical channel — one finger
  orbits Earth and pans Murcia, two fingers rotate Murcia — so a swipe would have to be stolen
  from the primary navigation of a world. The rail is a real Pointer Events target with capture
  and `pointercancel`, so it needs no velocity heuristic and cannot misfire. §15 concluded from
  this that scroll *"could only ever be a desktop-only alias"*; the rail is what makes that
  conclusion no longer follow.
- **"Mouse wheel and trackpad produce incomparable event streams — discrete notches against a
  continuous stream with post-release momentum."** *True, and it is the reason for the trackpad
  protection below rather than a reason not to proceed.* The answer is that they are made
  comparable: normalised to CSS pixels, clamped per event, rationed per frame, and accumulated
  against a physical commit distance rather than an event count.
- **"An accidental scroll would warp the viewer into another world."** *This is the objection the
  accumulator exists to answer.* A single event cannot navigate; a single flick cannot navigate;
  progress decays to zero when input stops and subtracts on reversal. Navigation costs a
  deliberate, sustained, reversible gesture with a visible indicator counting it out.
- **"A `<button>` gets keyboard access, focus and an accessible name for free."** *This is the one
  objection that is not answered, and it is recorded as a cost rather than resolved.* See
  Consequences.

**What dissolved rather than being argued away:** §15's fifth point — *"the page is
`overflow: hidden` with a full-viewport canvas, so nothing signals that scroll does anything; an
affordance has to be drawn anyway"* — is now an argument *for* this design. The affordance is
drawn, it is the progress indicator, and it is the same object as the touch target.

## Why the wheel had to be emptied first

§15 recorded a consequence that had become the obstacle:

> `DragPanController` registers a non-passive `wheel` listener purely to `preventDefault` it.
> Wheel is actively suppressed, not merely unbound.

That listener ran on the shared canvas regardless of which experience was active, and it was
registered inside `loadAndSetup()` *after* an async GLB load — so its ordering against any new
listener would have depended on network timing. Earth's own wheel listener was `passive: true`
and could not `preventDefault` at all.

Two handlers with different capabilities, one of them ordered by load timing, both firing for
both worlds, is not a foundation on which trackpad momentum can be reasoned about. **Momentum
can only be handled where the whole stream is visible in one place.** The zoom removal is what
made a single authority available, which is why these are one decision and not two.

`preventDefault` **moves rather than disappears**: `touch-action: none` governs touch only, and
`overflow: hidden` stops neither ctrl+wheel page zoom nor macOS horizontal back-navigation. It
must not fire over `.audit-panel` or `.case-panel__body`, which are `overflow-y: auto`. Safari's
non-standard `gesture*` suppression moves with it or the whole page zooms.

## Why four states and not the obvious ten

`docs/plans/002` sketches a per-scene model — `EARTH_IDLE → EARTH_NAVIGATION_PROGRESS →
EARTH_EXITING → SCENE_TRANSITION → MURCIA_ENTERING → NAVIGATION_COOLDOWN → MURCIA_IDLE`, and
symmetrically. **Ruled out.** It doubles the state count, duplicates every transition, and makes
adding a third world a rewrite rather than a data change.

Scene identity already exists and already has an owner (`ExperienceId` in `App.tsx`). Duplicating
it into the navigation machine creates two sources of truth that can disagree. So the machine is
told what the current experience is and never learns what a scene *is*; direction is derived at
the edge and intent legality is a **guard**, not a state.

This also states the invariant plainly: `LOCKED` has no input transition *at all*, so
"transitioning while accepting navigation input" is not a combination that is checked for and
rejected — it is one that cannot be written down.

No state-machine library. A discriminated union with guarded transitions, matching
`DistrictInteraction`'s existing four-state union, which is the same problem solved the same way.

## Trackpad protection, and why quiescence alone deadlocks

Commit enters `LOCKED` **synchronously, on the committing event** — not on a React state flip,
because `transitioning` is one render behind. The warp's real completion moves it to `COOLDOWN`.

Cooldown cannot exit on a fixed timer, because a momentum tail has no fixed length. But it cannot
exit on silence alone either, and this is not hypothetical: the committing gesture *ends* in a
fast stream, and the natural next act — keep scrolling to see whether it worked — refills it.
Free-spinning wheels sustain events indefinitely. So:

- exit when `elapsed >= minMs && (quietFor >= quietGap || elapsed >= maxMs)`;
- exit **re-arm-latched** — accumulation is refused until either a sign reversal or a genuine
  quiet gap. Deliberate input clears the latch immediately; a momentum tail cannot, because it
  never reverses. This is what stops the deadline path from simply handing the tail a fresh
  commit;
- measure quiet from `event.timeStamp`, never from wall clock or accumulated frame delta — a
  hidden tab stops the frame loop while the clock keeps running, which would report an infinite
  quiet gap and exit cooldown on the first frame back.

## Consequences

- **Zoom is gone from the product.** `DECISIONS.md` §20's *"a small, bounded zoom band lands on
  the wheel and on pinch"* no longer holds. Two-finger centroid rotation survives; pinch does
  not. The *mechanism* survives and changes owner: `CameraRig`'s distance scale becomes the focus
  flight's, because a flight is now the only thing that changes distance.
- **Focus flights must grow a dolly they never had.** `CameraFlight` deliberately left distance,
  elevation and FOV untouched because distance sets the ground footprint. It is now the only way
  to get closer, so it must animate distance — inward only, where the footprint shrinks, and
  floored well above the ~28° pitch collapse where the bounds maths degenerates.
- **`close()` must restore the distance**, though it still deliberately does not restore focus or
  yaw. That asymmetry is the point: returning the *view* discards where the viewer chose to be,
  but leaving them dollied in with no zoom control strands them.
- **The terrain skirt's 700 units become slack.** It was widened from 600 to pay for zoom-out. Do
  not narrow it; the margin is now free and costs a few hundred transparent triangles.
- **`ReturnToEarthControl` is deleted**, taking the seam it was designed to offer. The geo marker
  survived this ADR as a visual and as the warp's aim target, but no longer navigated.
  *(Superseded 2026-08-19, same day, by a further client decision: the marker is removed
  outright — a visibly clickable-looking tag over a dead click was a false affordance. The
  warp's aim target is now data, `earth/navigation/destination.ts`, resolved against the spin
  group with no scene object behind it.)*
- **This removes every keyboard and assistive-technology path between the two worlds**, and §15's
  fourth objection is therefore unanswered. Recorded as a known accessibility regression, not as
  a solved problem. The mitigation is to make the rail itself focusable and arrow-key operable —
  the primary control made operable, rather than a second control reintroduced.
- **`transitionTo` gains `onSettled`, not a promise.** Its re-entrancy guard returns silently on
  refusal, which a promise would turn into a never-resolving path, and `tl.kill()` on unmount
  would dangle it forever.
- **Navigation progress is deliberately not `state.transitionProgress`.** The warp's progress is
  monotonic through a concealed cut; the gesture's is reversible and usually never arrives.
  Conflating them would break `transitionLeg`/`dollyAmount`, which assume a single pass. Gesture
  progress never enters `SequenceState` at all — it has one consumer, the indicator's DOM.

## How you would know it broke

- `check:navigation` fails its gesture-isolation section — something is driving the camera from
  the wheel again.
- The new navigation harness fails its momentum-tail case: a commit followed by a synthetic macOS
  inertia stream produces a second navigation.
- `check:footprint` fails — a focus flight reaches further across the ground than the resting
  pose, which is the invariant the skirt is sized against.
- Wheel over an open audit panel or case panel stops scrolling it: the global `preventDefault`
  has lost its exemption.
- The rail fills during the intro, which means accumulation is being refused only at commit rather
  than at `push()`.
