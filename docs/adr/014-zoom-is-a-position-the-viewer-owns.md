# ADR 014 — Zoom is a position the viewer owns, and the transition is what lies past it

Status: **Accepted** — 2026-09-04

> **AMENDED FOR EARTH — `DECISIONS.md` §44.** "Hold, then push" below is how MURCIA is left.
> Earth commits on arriving at the end of the band (2026-09-10), and since 2026-09-17 it does so
> from any orbit: the transition swings the camera above the destination itself, after the
> commit, so no part of the band takes the orbit away.
Reverses: `adr/009`'s third decision (*"Zoom is removed"*) and its consequence
*"Zoom is gone from the product"*; `adr/012`'s consequence *"Zoom is still gone from the
product"*
Amends: `DECISIONS.md` §20 (the zoom band, twice-amended and now partly restored), §29 (what
the hint says and when it retires); ADR 006 (the ascent is now the tail of a control the viewer
drives, not the whole of it); ADR 005 (the warp starts from the viewer's pose, not from rest)

## Context

The client drove the build and reported that the wheel and the pinch "bounce". They are right,
and the word is exact: let go and the world returns to where it started, every time, in both
worlds. They asked for a **real zoom** — one that stays where it is left — in Earth and in
Murcia, in both directions, with the transition firing at a threshold beyond it.

**The bounce was not a camera effect and could not be tuned out.** There was no zoom state
anywhere in the product. `adr/009` removed zoom outright, and what looked like zooming was the
first third of the *warp cinematic* being scrubbed back and forth by the navigation
accumulator: `navigationGesture` held `0..900px` of travel, `scrubProgress()` mapped it into
the departing leg under a `SCRUB_CEILING` of 0.33, and each world posed itself from that one
number. Abandoned travel decayed and a spring eased it home. The bounce *was* the decay, and
the decay is the mechanism that answers `DECISIONS.md` §15's *"an accidental scroll must not
warp you"*. It could not simply be switched off.

It also explains the asymmetry the client noticed without naming: **Murcia only zoomed out and
Earth only zoomed in**, because a scrub only ever runs the *departing* leg, and the two worlds
depart in opposite directions. There was nothing to make symmetric. Earth's orbit radius was a
constant (`overviewRadius: 7 * R`) and Murcia's `distanceScale` had exactly one writer
(`CameraFlight`).

As with `adr/009` and `adr/012`, **this is a product decision, not a technical argument
overturning a technical argument.** `adr/009`'s grounds for deleting zoom were sound and are
mostly still true; what changed is that a client who has now seen the thing running wants a
control that the deletion made impossible.

## Decision

**The viewer owns one persistent, signed, normalised zoom per world. Travel fills it first; only
what overflows at the transition-facing end reaches the navigation accumulator, which is
unchanged. Zoom never decays.**

```
wheel / pinch  ->  zoomBand  --absorbed-->  state.zoomDepth  -1..+1   (persistent)
                      |                          |
                      |                          +-> earth  zoomPose -> orbit radius
                      |                          +-> murcia zoomPose -> distance + elevation
                      +--overflow, transition end only--> navigationGesture -> warp
```

Five parts, none of which stands without the others:

1. **`app/navigation/zoomBand.ts` is a pure normalised band**, in the house style of
   `navigationGesture.ts`: no DOM, no three, `push(signedPx)` returns the overflow. At the
   **away** end it clamps and returns zero — there is no world out there, so pushing harder does
   nothing. At the **transition-facing** end it clamps and returns the remainder, which feeds
   the existing accumulator untouched.
2. **Which end faces the transition differs per world, and that is the whole asymmetry.** Earth
   commits at full zoom-**in**; Murcia commits at full zoom-**out**, because the return is an
   ascent (ADR 006). Depth `+1` always means *toward the other world*, in both worlds, so
   nothing downstream needs to know which one it is in.
3. **The two stages are fed in opposite orders by direction.** Toward the other world: band
   first, spill into the accumulator. Away from it: **drain the accumulator first**, and only
   then give the zoom back. One continuous track, retraced backwards. Fed the other way round,
   a viewer who had banked half a commit and changed their mind would watch the camera pull out
   while an invisible total sat nearly full, and the next nudge would warp from a pose that no
   longer looked like the edge of anything — `adr/009`'s complaint, reintroduced a layer up.
4. **Zoom writes a POSE, never a scale.** In Murcia it goes through
   `MurciaExperience.applyRigPose`, not `CameraRig.distanceScale`. `CameraFlight` keeps its
   single writer and a district flight dollies to a fraction of *wherever the viewer is*, so the
   two compose multiplicatively instead of fighting over one number. On Earth it writes
   `orbit.radius`, which the rig already eases (`lerpK: 3`), so the smoothing is free.
5. **The commit stage keeps every guarantee `adr/009` built.** The accumulator, its decay, its
   spring, the cooldown, the momentum latch and the four-state machine are untouched. Only its
   input changed, and its distance: `commitDistancePx` moves 900 → 300, which the file's own
   comment had already declared safe to tune.

## Why "hold, then push" rather than a threshold on the zoom itself

The alternative — commit as soon as the zoom reaches its end — was rejected. It makes the last
notch of an ordinary zoom into a world change, which is precisely the accident §15 was written
about, and it leaves no way to *sit* at full zoom.

Instead the camera **pins at the limit** and the accumulator counts a further 300px of pushing
against it. That has a property worth stating, because it looks like a bug from the outside and
is not: during the commit stage the indicator drains on release **and the world does not move.**
The retreat is something the viewer reads, not something they watch happen to the scene. Every
reversible-scrub property the earlier model had is now carried by the zoom, which does not
reverse itself; and every deliberateness property is carried by the accumulator, which does.

The total journey is deliberately unchanged at **900px** — 600 of band plus 300 of push. That is
not tidiness: `pinchGain` scales a full opening of the hand against "one whole gesture", and the
e2e suite states gestures in pixels of travel. Both stay true across the change because the sum
did not move.

## Murcia's far end is a measurement, and the result was not the expected one

Rest (195 units at 30°) already reaches ~573 units across a 700-unit skirt, so zooming out
cannot simply pull back. It uses the **rise-as-it-recedes** arc — distance grows while the pitch
steepens, and steepening shrinks the ground footprint faster than the extra distance grows it
(ADR 006). `checks/footprint.ts` was extended to sweep the real `computeGroundFootprint` across
zoom depth **and** flight scale together, and the arc was measured rather than chosen:
**280 units at 52°**, with 400 at 55° still proving safe — so the number to raise if the zoom
reads as timid on hardware is `zoomFarDistance`, and the harness is the gate.

The measurement produced a result worth recording, because the obvious assertion is wrong:
**the worst footprint case is at rest, at depth 0.** Both halves of the band buy margin back —
inward by shortening the distance, outward by steepening the pitch — so the reach is not
monotonic across the band and a check written to assert that it is will fail. The harness
asserts two monotone sweeps out of rest instead, one per half.

Zooming **in** keeps the resting pitch and only shortens the distance; flying in shrinks the
footprint, so it has nothing to pay for. Its floor is `zoomNearScale: 0.7` — deliberately the
same number as the district-flight floor rather than a second opinion about it, so there is one
measured "as close as the city goes" and the two cannot drift apart.

Earth's ends were not free either. **Inward, 0.63x** is `earthRadiusScale` at the cut: the warp
dollies from wherever the camera *is*, bottoming at 0.25, so a commit from full zoom-in passes
2.21 units from a planet of radius 2. Deeper and the camera would be inside the planet before
the flash closed. **Outward, 11/7** is `zoomMax: 11 * R` — the far end of the band `adr/009`
retired, brought back unchanged, because it was tuned against this globe and the globe has not
changed. `checks/space-backdrop.ts` puts the nearest star at 153 units, so the shell still
encloses the camera.

## The warp had to be re-based on the zoom pose

This is the part that had no equivalent before, because before, a commit could only ever start
from rest. Committing from a zoomed camera into a cinematic whose targets are absolute config
numbers **snaps** on its first frame.

Earth was already safe: it multiplies `camera.position.length()` and captures its anchor from
the live camera, so the warp is relative to wherever the zoom left it and there is no absolute
target to arrive at. Murcia was not: `applyRigPose` resolved its base from `resolveCameraPose()`
every frame. It now resolves the **zoom** pose first and applies the warp on top, behind a
single pose writer.

That in turn moved the departure. Murcia's departing warp was 210 units at 50°, which is *inward
of* the 280 the viewer can now park at — so the cinematic's first frame would have travelled
backwards toward the city. It is now **330 at 62°**: the same arc, one step further along it,
still elevation-dominant so the footprint keeps shrinking past the band's edge.
`checks/warp-transition.ts` §7 asserts the join from every depth in the band, not merely from
the ends.

## Consequences

- **`adr/009`'s "the skirt's 700 units become slack" is reversed.** It was widened from 600 to
  pay for zoom-out, `adr/009` declared the margin free, and the zoom-out has now spent it again.
  The worst case leaves **+59.2 units** of skirt. Do not narrow it, and do not treat
  `check:footprint` as a formality.

- **The scrub is deleted, not disabled.** `earth/camera/scrubPose.ts`, `SCRUB_CEILING`,
  `SCRUB_EASE` and `scrubProgress()` are gone, and `useExperienceTransition` no longer exposes
  `scrub`. The whole cinematic is available to a commit again, because nothing else is using its
  first third.

- **`useExperienceTransition` gains `onCut`, and it exists for exactly one job.** The zoom depth
  must reset at the frame the worlds swap — the one frame that is fully black. Resetting it when
  the gesture commits would pull the departing world back to rest *in front of* the cinematic,
  in plain view; resetting it after the warp would put the same jump on the first frame of the
  new world.

- **Order of operations became load-bearing in `InteractionLayer`.** `rig.setZoomDepth` runs
  before `rig.activate()` and outside the cinematic guard. Activation seeds the whole rig from
  `overviewPosition`, and the zoom is what decides how long that vector is; set afterwards, a
  viewer returning from Murcia would be seeded at the radius they left and then eased out to
  rest in view of it.

- **A satellite close-up returns to the viewer's zoom, not to `overviewRadius`.**
  `overviewPosition` is rebuilt at the zoom radius on every activation. On every natural path the
  two are equal — a world is always entered at rest — and this is what keeps them equal if that
  ever stops being true, instead of quietly teleporting the camera on a handoff.

- **Murcia recomputes its navigable bounds on zoom change**, as it already did on yaw. Distance
  is a footprint input again, which is the consequence `DECISIONS.md` §20 recorded and
  `adr/009` inverted.

- **The pinch classifier now claims on ABSOLUTE growth.** Both directions are a control, so
  "the wrong way" is no longer a refusal — it is the far half of the band, and it cancels the
  orbit or the pan like any other claimed gesture. Murcia's rotate still wins ties, unchanged.

- **The per-event cap moved from `navigationGesture` to the point where the two stages are fed**,
  and this was a real defect for as long as it did not. `maxEventTravelPx` exists so one absurd
  wheel event cannot navigate; with a band in front of the accumulator, an uncapped 100,000px
  flick saturated the entire zoom band *and* overflowed by 99,400px, which the accumulator then
  clamped into a full 120px push. One notch threw the camera to the end of its travel and banked
  40% of a warp. The guarantee is now stated over the whole journey.

- **`DECISIONS.md` §29 is amended again.** The hint taught "scroll to travel"; it now teaches
  the two stages. It also retires on **any accepted travel** rather than on the accumulator's
  rising edge — since the first 600px of every gesture never reach the accumulator, a viewer
  could otherwise zoom half way across the band while the hint was still explaining how.

- **The accessible control still commits outright, from any zoom state.** It bypasses the band
  entirely. A button is not a slider, and making a keyboard user press it fifteen times to cross
  a zoom they cannot see would be ceremony rather than parity.

- **Every zoom constant except the two measured ones is a STARTING POINT, not a judgement.**
  `towardTravelPx`, `awayTravelPx` and the 600/300 split have not been driven on hardware by
  anyone. `zoomFarDistance` / `zoomFarElevationDegrees` are measured and may only be moved
  through `check:footprint`.

## How you would know it broke

- `check:footprint` fails — the zoom or a flight composed with it out-reaches the skirt. This is
  the gate that decides Murcia's far end; a failure here is never a tuning question.
- `check:warp` §7 fails "the departure continues the zoom-out rather than reversing it" — the
  departure pose has fallen back inside the band, and every commit from a zoomed camera now
  starts by moving the wrong way.
- The world visibly returns to rest while the navigation indicator drains. The zoom is decaying,
  which means travel is reaching the band that should be reaching the accumulator.
- A single wheel notch moves the camera a long way. The per-event cap is back inside
  `navigationGesture` and the band is seeing raw deltas.
- Returning from Murcia to Earth eases outward for a second on arrival. `setZoomDepth` has moved
  after `activate()`, or the reset has moved off the cut.
- Zooming out in Murcia and then clicking a district flies *outward*. The flight is multiplying
  the configured distance rather than the zoomed one, which means zoom has gone back to writing
  `distanceScale`.
