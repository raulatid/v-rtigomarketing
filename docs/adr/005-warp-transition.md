# ADR 005 — The Earth ⇄ Murcia Warp

Status: **Accepted** — 2026-08-07, **amended 2026-09-04 by `adr/014`**
Amends: ADR 001 (Murcia's composer bypass), for the duration of a transition only

> **Amended by `adr/014-zoom-is-a-position-the-viewer-owns.md`: the warp starts from the
> viewer's pose, not from rest.** A commit can now come from anywhere in a persistent zoom
> band, and a cinematic whose targets are absolute config numbers would snap on its first
> frame. Earth needed nothing — it multiplies `camera.position.length()` and anchors on the
> live camera, so it was already relative. Murcia's `applyRigPose` now resolves the zoom pose
> first and applies the warp on top of it, and its departure moved to 330 @ 62° so that it
> continues the viewer's ascent rather than reversing back into the city.
>
> One progress value still means one thing, and it now means only the committed cinematic:
> `adr/009`'s reversible scrub of this ADR's first third is deleted, so `transitionProgress`
> makes exactly one monotonic pass through the cut again, which is what `transitionLeg` and
> `dollyAmount` always assumed.

## Context

The transition shipped in P6 was a concealment device and nothing more: a linear fade to
black, a hard cut, a fade back. The design concept was always the **warp** — the same
language as the intro's starfield→Earth substitution — reshaped as a dolly-in / dolly-out.

## Decision

Reuse the intro's warp machinery rather than inventing a second motion vocabulary. One
progress value, `state.transitionProgress`, read through the same three curves with the
same nested widths (`ENGINEERING_PRINCIPLES` §16):

| Curve | Drives | Width |
|---|---|---|
| `cinematicTravel(p, 1.7)` | dolly position / distance | full |
| `cinematicSpeed(p, 0.5, 0.34)` | FOV surge + motion blur | ±0.34 |
| `narrowPeak(p, 0.5, 0.17)` | the flash | ±0.17 |

The transition hook publishes the progress and fires the swap. **It drives no camera.**
Each experience reads the progress and moves its own camera, so Earth and Murcia still know
nothing about each other (`ARCHITECTURE` §13).

## The constraint that determined the shape

**Murcia's camera may never pull back past distance 165.** Ground reach grows ≈1.33 world
units per unit of distance, and the measured worst-case terrain-skirt margin is **+50 units
at 5120×1440** (16:9 has +229, portrait +306). Distance ≈200 therefore puts the plate edge
on screen for ultrawide viewers, silently, with nothing wrong on a normal monitor.
`PROJECT_MEMORY`, *The number that can hurt you*, records that exact regression happening
once already, and carries the floor that follows: FOV is likewise fixed, because at fov 50
the effective pitch drops through the ~28° point at which the bounds maths degenerates.

Dollying **in** is safe only down to ≈60; below that the fixed `lookAtHeight` tilts the
camera up and the footprint widens again.

So the arrival cannot come from far away. It must start close and pull back — which is
exactly the requested dolly-out, arrived at by constraint rather than by taste.

`checks/warp-transition.ts` asserts the envelope against the real curve module over a
2000-sample sweep. Nothing else in the codebase guards it, and it is not the kind of thing
care alone protects.

## Camera ownership during the warp

`InteractionLayer` stops calling `rig.update()` while a transition plays. It deliberately
does **not** deactivate the rig: `activate()` reseeds from the overview pose, so toggling
would discard the pose the dolly departs from. Not calling `update()` freezes the rig with
its state intact — the same seam the audit panel already relies on.

`CameraController` then becomes the sole camera writer, ahead of its `site` bail.

- **Departing**, the anchor is the live camera position, so the dolly works from whatever
  orbit position the viewer dragged to.
- **Arriving**, the anchor is `EARTH_REST` — deterministic, not captured, because the rig
  was deactivated on the way out and will reseed to exactly that pose when it takes the
  camera back. Landing anywhere else would snap.

Murcia takes **no** external control. The dolly owns `distance`; `DragPanController` owns
focus and yaw; `setFocus`/`setYaw` re-apply whatever pose the dolly set, so the two compose.
Taking `beginExternalControl()` would have collided with `setActive(true)` firing at the
cut — that flag is shared with every district flight.

## The composer amendment

ADR 001 has Murcia bypassing the `EffectComposer` because its render targets carry no MSAA
and the city is all hard building edges. **During a warp that trade inverts**: the frame is
smeared and moving fast, so aliasing is invisible, and the blur is most of what makes the
motion read as motion. `DECISIONS.md` §26.7 is explicit that a warp needs geometry for the
blur to act on — a city is ideal.

So Murcia borrows the composer for the ~1.6s of a transition and goes straight back to the
canvas afterwards. `RenderPass.scene`/`.camera` are plain public fields (verified in
three@0.174), so pointing the pass at Murcia and back costs nothing.

## The flash

Full black, unlike the intro's 0.22. That flash conceals a substitution between two similar
dark scenes; this one conceals a jump between black space and a pale grey sky. But it is
shaped by `narrowPeak` rather than a linear ramp, so it still spikes and recovers like a
flicker instead of reading as a dissolve.

## Reduced motion

The flash and the cut still play — concealing a jump is not a motion effect. The dolly and
the FOV surge are skipped.

## Consequences

- Earth's FOV is animated during the warp. Nothing else owns FOV at `site`, so there is no
  contention, but the bell must return to `normalFov` at both ends or the site is left
  permanently wide. Asserted.
- A slow device stretches the transition rather than skipping through it: GSAP's
  `lagSmoothing` clamps the per-tick delta to 33ms once a frame exceeds 500ms. Observed
  under software WebGL, where a 1.6s warp took tens of seconds. Correct behaviour — it
  protects against jumps — but worth knowing before profiling on a weak machine.
