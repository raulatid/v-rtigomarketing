# ADR 006 — The return is an ascent

Status: **Accepted** — 2026-08-07, **extended 2026-09-04 by `adr/014`**
Amends: ADR 005 (the symmetric dolly, and "the number that can hurt you" as a *distance*)

> **Extended, not reversed, by `adr/014-zoom-is-a-position-the-viewer-owns.md`.** The ascent is
> no longer only the cinematic's — the viewer drives the first part of it. Murcia's zoom-out is
> the same rise-as-it-recedes shape, measured against the same `computeGroundFootprint` by the
> same harness, and the departing warp now **continues** that arc from wherever the viewer left
> it (rest 195 @ 30° → zoom 280 @ 52° → departure 330 @ 62°) instead of starting from rest.
>
> Everything this ADR decided holds and is now load-bearing in a second place: extra distance
> must be paid for with extra elevation, or the plate edge comes into frame. The footprint —
> not the distance — is still the number that can hurt you. What `adr/014` added is that the
> viewer can now PARK anywhere along the arc, so every pose on it has to be safe, not merely the
> endpoints of a cinematic that always finishes.

## Context

ADR 005 built the warp on one envelope, `dollyAmount(p)`, that served both worlds: the world
being left always rushed **in** (0 → 1), the world being entered always pulled **out**
(1 → 0). That is one mapping too few. It encodes *"a transition is always a plunge"*, and a
plunge is only what happens in one direction.

Going Earth → Murcia it is right. Going **Murcia → Earth it is a concept error**: clicking
*Volver a la Tierra* drove the camera **forward, into the city**, and then cut to a globe.
Murcia is *inside* the Earth. Leaving it has to recede.

Only one leg was wrong. Earth's two legs were already correct in both directions by
coincidence of symmetry — ×1 → ×0.25 is a plunge into the globe, ×0.25 → ×1 is the planet
shrinking away as you back off. It is Murcia's *departing* leg that had the wrong sign.

## Why it could not just be inverted

Because ADR 005's constraint is real: **Murcia's ground footprint may not grow**. The terrain
skirt is 600 units wide because that is what a camera at 165 / 30° needs at every azimuth on
a 5120×1440 viewport, and the margin there is only **+50 units** (16:9 has +229, portrait
+306). Reach grows ≈1.33 units per unit of distance, so `165 → 255` puts the plate edge on
screen for ultrawide viewers only, silently, with nothing wrong on the machine the change
was made on. `PROJECT_MEMORY`, *The number that can hurt you*, records that shipping once
already.

Nor can FOV do it. Widening the FOV is the same problem by another route; narrowing it
magnifies, which is the wrong direction entirely.

Both of the obvious ways to make the city look smaller widen the ground footprint. That is
the whole difficulty, and it is why ADR 005 concluded the arrival had to be a dolly-out.

## Decision

**Leaving Murcia rises.** Driven by the same envelope, over the departing leg:

| | rest | at the cut |
|---|---|---|
| `elevationDegrees` | 30 | **50** |
| `distance` | 165 | **180** |

Far ground reach goes as `cameraHeight / tan(pitch − fov/2)`:

```
rest    165 @ 30°  →  height  82.5 · effective pitch ~27.3°  →  ~478
depart  180 @ 50°  →  height 137.9 · effective pitch ~48.8°  →  ~227
```

Steepening the pitch shrinks the footprint far faster than +15 distance grows it. So the
departure pose reaches **less far than the pose the skirt was measured for**, and it moves
*away* from the ~28° floor where the bounds maths degenerates rather than toward it. The
recession is bought with elevation, not paid for out of the margin.

It is also the right picture: rising off a city and watching it drop away is what leaving a
place *inside* a planet looks like, a moment before that planet appears.

Unchanged: the flash, the cut at 0.5, the blur, Earth's FOV surge, Earth's two legs, and
Murcia's **arrival** — which still starts close and settles back, for exactly the reason
ADR 005 gave. The two legs are no longer mirror images, and were never entitled to be.

## The envelope is a footprint, not a distance

ADR 005 wrote the constraint down as a number — *distance ≤ 165* — and
`checks/warp-transition.ts` asserted that number. It was always a **proxy** for the thing
that actually matters, and the moment elevation entered the picture the proxy stopped being
sound in either direction: 180 @ 50° is safe, 200 @ 30° is not, and no distance bound can
tell them apart.

So the guard now asserts the real property, against the real maths:

> **No warp pose may reach further across the ground than the resting pose does.**

`checks/warp-transition.ts` §6 runs the actual `computeGroundFootprint` over the actual
`applyPoseToCamera`, at 201 progress samples × 24 azimuths × 4 aspect ratios including
5120×1440 — 19 296 poses — and also fails on any `clampedRays`, since a frustum corner that
misses the ground plane is a degenerate pose rather than the mechanism working. Verified
fail-first: a departure of 260 @ 31° reports **+154.8 units** of over-reach at 21:9.

This is the first check in the repo to execute `computeGroundFootprint`. The 600-unit skirt
was sized by a one-off manual measurement that lived only in `PROJECT_MEMORY`. The distance
bounds are kept as a cheap first line of defence, now per-leg, but they no longer carry the
argument.

To make that possible, the pose → camera placement moved out of `CameraRig.applyPose` into
`camera/applyPoseToCamera.ts`, so the check drives the same placement the frame does.

## Where the mapping lives

In `src/experiences/murcia/camera/warpPose.ts`, **not** in `src/app/warpTransition.ts`.

The transition hands down an amount and a role; what a city does with them is the city's
business — the same reasoning that already put `warpCloseDistance` in the environment config
("how close you can get to THIS city is a property of its pose and its terrain skirt").
Putting it in the shell would also have meant `src/experiences/` importing upward from
`src/app/`, which would have been the only such import in the tree (`ARCHITECTURE` §13).

`WARP_TRANSITION` keeps mirrored constants purely so the envelope can be asserted; the
environment config is what drives the frame, and the mirrors are asserted equal to it.

## Consequences

- `setDollyProgress(amount)` became `setWarpPose(amount, departing)`. "Dolly" was the wrong
  word for the departing leg once it stopped being one.
- Murcia's warp now writes **elevation** as well as distance, so the return-to-rest assertion
  has to cover both: a residual tilt would persist for the session exactly as a residual
  distance would.
- `setPose` recomputes no bounds, and `setFocus` / `setYaw` / `DragPanController` never
  re-derive the pose from config, so nothing fights the animated elevation. Effective bounds
  stay as computed at the resting pose — tighter than the risen pose needs, which is the safe
  direction.
- Reduced motion is unchanged: the flash and the cut still play, the ascent is skipped.
- `applyPoseToCamera` now ends with `updateMatrixWorld(true)`. `lookAt` writes the rotation,
  not the world matrix, so anything reading the camera before the renderer's next update —
  `Raycaster.setFromCamera` inside `computeGroundFootprint`, `Vector3.project` — sees the
  *previous* pose, and the first read sees the identity. Caught while tracing the departure:
  rest reported two different framings at p=0 and p=1 for the same pose. Redundant during a
  normal frame, and it also removes a one-frame lag in `recomputeBounds`.

## Measured, leaving Murcia

Screen height of a 13-unit building standing at the focus, at 16:9, through the real
placement:

```
  p     distance   elev   camera height   building on screen
 0.00     165.0    30.0        82.5            11.25%
 0.25     169.6    36.2       100.1            10.27%
 0.50     180.0    50.0       137.9             7.79%   ← the cut
```

The camera rises 55 units and the city shrinks by a third, monotonically, before the flash
takes the frame. That is the recession the old departure had backwards.
