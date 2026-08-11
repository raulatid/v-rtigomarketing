# Project Memory

Durable context for the VertigoSEO web experience: what this is, what exists, the numbers
that keep mattering, and what will bite you again.

It exists so none of this has to be re-derived. Keep it current.

Last updated: 2026-08-11 · §2, §9, §10, §11 (23–36), §12 and §13 updated against the working
tree, post-`b418b5f`. The Vercel readiness re-audit is folded into §9, §10 and §12.

> **Scope.** Facts and traps. The *reasoning* behind binding decisions lives in
> `DECISIONS.md` and `adr/`; the *history* of how the code got here lives in
> `integration/00-migration-log.md`. When something here stops being true, change it — this
> file is worthless the moment it is stale, and its predecessors in the two source
> prototypes both rotted in exactly that way (`murcia-test/README.md` still describes a
> first-person controller that was deleted).

> **This is the only project memory.** The Murcia prototype kept a second one at
> `murcia/PROJECT_MEMORY.md`; on 2026-08-07 everything in it still true of the shipping code
> was folded in here and the file was deleted. Two documents with the same name made every
> bare `PROJECT_MEMORY §N` citation ambiguous — and the numbers scattered through `src/` all
> pointed at the *other* one. **Cite sections by title, never by number**, so a citation
> survives the next edit.

| | |
|---|---|
| 1 | [What this is](#1-what-this-is) |
| 2 | [Stack and commands](#2-stack-and-commands) |
| 3 | [How a frame works](#3-how-a-frame-works) |
| 4 | [Loading](#4-loading) |
| 5 | [The number that can hurt you](#5-the-number-that-can-hurt-you) |
| 6 | [Murcia's terrain edge](#6-murcias-terrain-edge) |
| 7 | [Murcia's navigation](#7-murcias-navigation) |
| 8 | [Murcia's district interaction](#8-murcias-district-interaction) |
| 9 | [Numbers worth knowing](#9-numbers-worth-knowing) |
| 10 | [How this repo verifies things](#10-how-this-repo-verifies-things) |
| 11 | [Things that will bite you again](#11-things-that-will-bite-you-again) |
| 12 | [State of the work](#12-state-of-the-work) |
| 13 | [Map of the code](#13-map-of-the-code) |

---

## 1. What this is

A single-page marketing experience for Vertigo, built as **two WebGL worlds inside one
application**:

- **Earth** — the intro (an isotype drawn stroke by stroke while the site loads), then the
  landing page itself: a globe with six orbiting satellites carrying case studies, clickable
  geo markers, a case panel and a lead-capture audit form.
- **Murcia** — a navigable 3D city: drag to pan and turn, click a lit district to fly to it
  and open its services panel.

You travel between them through a warp. Clicking the marker on **Spain** takes you to
Murcia; a button brings you back.

Converged from two working prototypes, both of which still exist and should be treated as
read-only reference:
`../starting-animation` (Earth) and `../murcia-test` (Murcia).

### Terminology

- **Experience** — a user-facing world. Earth and Murcia. A product concept.
- **Scene** — a `THREE.Scene`. There are exactly two, one owned by each experience.

Murcia's own docs say **environment** where this repo says **experience**; they mean the
same thing. What matters is that neither word is ever used to mean `THREE.Scene`.

---

## 2. Stack and commands

React 19 · `@react-three/fiber` 9.6 · **three 0.174** · gsap 3.12 · Vite 5 ·
TypeScript 5.6 · `vite-plugin-glsl` · stats.js

```
npm run dev            # dev server
npm run build          # tsc -b + intro simulation + vite build (budgets asserted)
npm run preview        # serve dist/
npm run check          # typecheck + all five harnesses  ← run this
npm run check:warp     # 32 assertions — the camera envelope and the footprint sweep
npm run check:navigation   # 25 assertions — drag feel, signs, bounds
npm run check:district     # 52 assertions — flights, framing, materials
npm run check:space        # 28 assertions — the star shell bound, clumping, the band
npm run test:intro     # the loading playhead, ~28 cases
```

There is **no ESLint and no test runner**. `npm run check` is the whole gate, deliberately —
a stubbed `lint` script would be a gate that does not exist.

---

## 3. How a frame works

One canvas. One `WebGLRenderer` (R3F's). One frame loop (R3F's).

```
useFrame priority 0   every simulation layer — cameras, rigs, orbits, Murcia's update()
useFrame priority 1   RenderPipeline  ← the ONLY thing that renders
useFrame priority 2   GeoMarkersLayer — CSS2D labels, after the camera is final
```

`RenderPipeline` per frame, unconditionally:

1. The active experience — Earth through the `EffectComposer`; Murcia direct (for MSAA), or
   through the composer while a warp plays (for the blur).
2. The corner logo, as an overlay pass with `autoClear = false` and an explicit
   `clearDepth()`.

**An early return in that callback is a blank canvas, not a missing effect.**

### Layer stack (z-index)

```
10  scene canvas (incl. the corner-logo overlay pass)
15  geo tags (CSS2D)
16  Murcia UI host (.murcia-ui)
20  the SVG intro drawing
35  case panel
40  warp overlay (the flash)
45  experience switch
```

`.murcia-ui` is full-viewport but `pointer-events: none`, with children opting back in.
Without that it would kill canvas drag for **both** experiences.

---

## 4. Loading

Three numbers, deliberately never derived from each other:

| | |
|---|---|
| **visual progress** | where the drawing is |
| **measured progress** | what has actually downloaded |
| **readiness** | whether the scene can be shown at all |

The boot manifest (`intro-draw/bootState.ts`) weights each resource and marks it required or
not. Required entries gate readiness; the rest only move the drawing.

```
chunk:scene       20  required
earth:textures    30  required
gpu:warmup        15  required
logo:assets       10  required
orbits:build      10  required
satellite:assets  15  not required
murcia:model      10  not required   ← prefetched during the intro
```

**The trap this design exists for:** with no measured progress, the autonomous curve still
carries the outline to the pre-ready limit and holds it there. The drawing can look nearly
finished while nothing has downloaded. Anything that reports to the user must read
**measured progress and readiness**, never the playhead. Observed: `visual=0.815` at
`measured=0.361`.

Captions (Spanish, in `intro-draw/introDraw.ts`): `Cargando experiencia` →
`Estamos preparándolo todo` (measured ≥ 0.5) → `Casi listo` (**readiness ready only**), with
`Esto está tardando más de lo habitual` past the notice threshold and
`No se pudo cargar la experiencia` on a hard failure.

### Warming is two operations, not one

Three uploads lazily, on first render, so a loaded-but-never-drawn world costs **no VRAM** —
CPU typed arrays only. That is exactly the requirement, and it defers the whole cost to the
worst possible moment: the first frame after activation would do the shader compile and the
buffer upload synchronously, mid-warp.

`compileAsync(scene, camera)` covers shader programs and textures. It does **not** upload
geometry attribute buffers. So `MurciaExperience.warm()` follows it with **one render into a
1×1 render target** — the smallest draw that still walks the whole visible graph, into a
target rather than the canvas because Earth is still on screen. 957 GPU-instanced buildings
arriving on the transition frame is the hitch this exists to avoid. See `adr/004`.

---

## 5. The number that can hurt you

**Murcia's camera must never reach further across the ground than it does at rest.**

The far edge of the visible ground sits at

```
d_far = cameraHeight / tan(effectivePitch − fov/2)
```

which **diverges** as the pitch drops. That divergence is the whole problem: small pose
changes produce enormous footprint changes, in a direction nothing on screen reveals.

For a long time the constraint was written down as *distance ≤ 165*, which is the same
statement only while elevation is held at 30°. Since ADR 006 the warp's departing leg rises,
and the proxy stops being sound in both directions: **180 @ 50° is safe, 200 @ 30° is not.**
Reason about the footprint, never about the distance alone.

Ground reach grows ≈**1.33 world units per unit of distance** *at a fixed elevation*. The
terrain skirt is sized for distance 165 at 30°, and the measured worst-case margin is:

| Viewport | Margin |
|---|---|
| 5120×1440 (ultrawide) | **+50 units** ← binding |
| 16:9 | +229 |
| Portrait | +306 |

So distance ≈200 puts the plate edge on screen **for ultrawide viewers only**, silently,
with nothing visibly wrong on a normal monitor. This has already shipped once: going
110 → 165 raised the ultrawide worst corner from +40 to **−89** — the plate edge was on
screen before any rotation work started, and nobody saw it.

Closer is **not** always safer either. Below ≈60 the fixed `lookAtHeight` (5.85) tilts the
camera up relative to the rig, the effective pitch collapses through the ~28° floor where
the bounds maths degenerates, and the footprint widens again. Below ≈23 the top frustum edge
crosses the horizon and the footprint is reported as the `maxGroundDistance` 800 clamp.

Two further consequences of the divergence, worth having in mind before touching the pose:

- **Lowering the camera recovers navigable area better than raising the angle.** At FOV 35,
  16:9: 30°/height 45 gives navigable Z 191 × X 124; 30°/height 70 gives 101 × 60.
- **Raising `lookAtHeight` tilts the camera up and widens the footprint**, because it lowers
  the *effective* pitch below the rig's elevation. That is the trade to watch when adjusting
  the view for looks.

The warp runs **165 → 75 → 165** arriving, and **165 @ 30° → 180 @ 50° → back** departing.
The rise is what pays for the recession: 180 @ 50° reaches ~227 against rest's ~478.

`npm run check:warp` asserts the real property rather than the proxy — §6 of that harness
runs the actual `computeGroundFootprint` over the actual `applyPoseToCamera` at 201 progress
samples × 24 azimuths × 4 aspects including 5120×1440 (19 296 poses), and fails on any
over-reach or any `clampedRays`. The per-leg distance bounds are kept as a cheap first line
of defence. **Nothing else guards this**, and this is the only check in the repo that
computes a footprint at all.

Any *resting* camera change — distance, elevation, `lookAtHeight`, FOV — still invalidates
the skirt margin itself and requires re-running the azimuth sweep, because §6 compares
against rest and would happily approve a pose that out-reaches the skirt as long as rest
out-reaches it too. It is a much larger job than it looks.

---

## 6. Murcia's terrain edge

The strict version of "never reveal the plate edge" would have left ~19% of the map
navigable at the pose that actually looks right. So the rule was inverted: **the skirt hides
the edge, and the bounds follow the content.** `boundsInset: 0` — the whole model is
navigable, at every azimuth, on every tested viewport, with the footprint term never
binding.

Two pieces, both in `experiences/murcia/environment/`.

**Collar** (`createTerrainTransition.ts` + `meshBoundary.ts`) — the exact difference between
the plate's real outline and its bounding rectangle, triangulated with
`ShapeUtils.triangulateShape` using the outline as a hole. Opaque, cloned material. It fixes
the background-coloured band that showed through the gap. Heights interpolate from the
plate's real edge height to the plate top.

`meshBoundary.ts` extracts boundary loops by welding vertices **by position** first. A GLB
splits vertices wherever normals or UVs differ, so raw index comparison reports every seam
as a boundary and the outline never closes.

**Skirt** — a rectangular fade continuing outward from the bounding rectangle.
`width: 600`, `fadeEndFraction: 0.25` (~150 units of visible gradient), `loops: 10`,
`segmentsPerSide: 12`, `fadeExponent: 1.6`, `innerOverlap: 0.5`, `verticalOffset: 0.05`.

### Decisions inside it

- **Fade alpha to zero rather than matching the background colour.** The renderer uses
  `ACESFilmicToneMapping`, but `scene.background` is written as an untone-mapped clear
  colour, so a mesh authored to the background value renders visibly darker. Alpha is not
  tone-mapped, and the problem disappears.
- **Nothing is coplanar with the plate.** The collar sits `verticalOffset` below the top and
  tucks `innerOverlap` under the outline.
- **The fade is rectangular, not coastline-following.** Offsetting a concave outline outward
  self-intersects wherever a feature is narrower than the offset, and the skirt reaches 600
  units on a 352-unit plate — nearly twice the plate itself. If the silhouette turns out to
  matter visually, the fix is a *bounded* offset — follow the outline for ~40 units, then
  blend to the rectangle — with a self-intersection guard.
- **Being a plate-aligned rectangle is what makes yaw expensive.** The viewport footprint
  turns; the skirt does not.
- **`fadeEndFraction` decouples gradient width from geometry width.** The skirt must *reach*
  far enough to stay out of frame; a gradient that wide would wash the horizon.

### Why the width is 600

Sized so that with `boundsInset: 0` — focus reaching the plate corners — the footprint lands
inside the skirt at **5120×1440**, the binding case, **at every azimuth**. Two things drove
it up from 380:

- **distance 110 → 165** spent the whole margin (see §5).
- **free yaw** costs a further 50–85 units on wide viewports, because the frustum footprint
  turns against a plate-aligned rectangle. Portrait barely notices (−4 to −6), its footprint
  being near-symmetric.

`fadeEndFraction` fell 0.4 → 0.25 in step, holding the visible gradient at ~150 units
against the old 152.

---

## 7. Murcia's navigation

### One gesture, both axes

```
drag ↕   move forward / backward along the view direction
drag ↔   rotate the rig horizontally about the focus, freely, 360°
left button, right button, one finger — all identical
```

No gizmo, no modifier, no button. With nothing else available a single pointer has to carry
both, so each screen axis owns one. **The cost is that strafing is gone** — there is no
sideways pan. Free yaw pays for it: turn toward a place, then advance.

Vertical rotation does not exist, and is absent rather than clamped: elevation stays at the
configured pose, so the footprint analysis §5 and §6 depend on continues to hold.

Forward motion is solved against the ground, not from pixels, then scaled by
`translationGain` (0.5). Solving against the ground is what keeps sensitivity consistent
across the screen — a pixel near the horizon covers far more ground than one near the bottom
edge. The gain is the only sensitivity knob the axis has; at 1 the grabbed point stays
exactly under the cursor, and that fidelity was spent on weight. Yaw is pixels→degrees
normalized by viewport width. A *turntable* solve — yaw from the angle the grabbed point
sweeps about the focus — was tried on paper and rejected: its radius varies ~10× between the
top and bottom of the screen at this elevation, so sensitivity would depend on where the
drag started.

### Drag feel — the only judged numbers in the project

> **These exact values are signed off. 2026-08-06, first pass, no retuning needed.** The
> user drove the build and reported it as the feel they were after. Every other number in
> this repo is reasoned or measured; this one was *judged*.
>
> Treat them as a fixed point. They are not a starting guess, and they are not independent
> of each other. Changing any of them needs the same kind of justification that set them: a
> person driving the build and saying it feels wrong. **A numeric argument is not sufficient
> grounds**, because no number here can see what was being judged.

| | during drag | after release | inertia | min | max |
|---|---|---|---|---|---|
| translation | 0.09 | 0.08 | **0** | 1.5 | 260 u/s |
| yaw | 0.09 | 0.08 | **0** | 1.5 | 90 °/s |

Both use `velocityBlend: 0.25`; `translationGain: 0.5`; `degreesPerViewportWidth: 120`.

**This reverses the previous design, recorded because its reasoning is sound and was still
wrong.** It ran 0.05 / 0.30 / 1.1 s with no gain and 180°, on the argument that positional
lag during a drag reads as latency rather than mass — the grabbed ground slides out from
under the cursor — so weight belonged in the settle and the coast.

Tested by hand, that produced the two complaints that prompted the change: the view **kept
moving after the pointer stopped**, which reads as a loss of control rather than as mass;
and with no gain on a 1:1 ground solve the camera covered far too much ground per pixel from
83 units up, which felt quick and light. The latency argument also turns out to be
conditional — it holds only while the ground is *expected* to stay under the cursor, and a
gain of 0.5 has already given that up. That is what makes the longer 0.09 tracking constant
affordable, and it is where the smoothness now comes from.

Momentum is disabled by configuration, not deleted. `inertiaTimeConstant: 0` is honoured by
guards in `updateYaw` and `updateTranslation`, so `?inertia=` turns it back on for
comparison. `minInertiaSpeed` and `maxInertiaSpeed` are inert while it is 0.

**Some travel after release is unavoidable and is not inertia.** Smoothing leaves the focus
behind its target during a drag, so releasing has a catch-up to finish. It is bounded by
`dragSpeed × smoothingTimeConstant` and decays from the moment of release, where momentum
was bounded by `dragSpeed × inertiaTimeConstant` instead. On the same sweep: **8.7 units,
95% of it inside 0.25 s**, against **139 units over 3.4 s** before. §6 of
`checks/navigation-feel.ts` asserts that bound rather than a magic number — the first
attempt asserted "travel < 1 unit" and failed against correct code.

### Momentum must not survive a pointer held still

Velocity was originally sampled only in `pointermove`. A pointer held motionless produces no
events, so it kept whatever speed it last had: press, sweep, **pause**, release — and the
view flung on a gesture that had ended at a standstill.

Fixed with an explicit bleed in `update()`: after `POINTER_STILL_GRACE` (50 ms) without a
move, velocities decay with a 50 ms time constant. A genuine drag resamples every frame and
never decays.

**Unreachable at the shipped settings** — with `inertiaTimeConstant: 0` there is no coast
for a stale velocity to feed. The bleed is kept anyway, and §8 of the harness still
exercises it *with momentum re-enabled*, because `?inertia=` makes that path reachable at
runtime. Deleting it as dead code would be easy and rediscovering the bug would not be.

Behaviours worth preserving: grabbing mid-motion stops it; a tap never coasts; **a gesture
that ends at a standstill releases at a standstill**; the drag re-anchors when the 6 px
threshold is crossed so the first frame does not jump; smoothing is frame-rate independent
via `1 − exp(−dt/τ)`.

### Live tuning

`experiences/murcia/config/environmentQueryOverrides.ts` — `?dragGain=` `?yawDeg=`
`?smooth=` `?release=` `?inertia=`, applied by `MurciaExperience` after the `?model=`
override so the two compose. Separate from `appConfig`'s overrides because these are
experience-scoped rather than shell-scoped.

They exist because feel is a judgement no harness can make and an edit-rebuild cycle is too
slow to converge on one. **A tuning tool, not configuration** — a settled value belongs in
`murciaConfig.ts` with its reasoning.

If a future change *does* have grounds to retune, the order is: too fast →
`translationGain` / `degreesPerViewportWidth`; not smooth enough → `smoothingTimeConstant`;
drifting after release → `releaseTimeConstant`. All are live as query parameters, so it is a
browser session and not a rebuild cycle. Record the outcome here either way, including
"tried and went back", which is the entry this section was missing the first time.

Reference given: **chartogne-taillet.com** — as *concept, not goal*. The site is fully
JS-rendered so no values could be read from it.

---

## 8. Murcia's district interaction

A district highlights on hover, flies the camera to itself on click, and opens a services
panel. It is the first *content* in Murcia; everything before it was navigation.

### The asset does not contain the district

The Blender collection is called `edificios_servicios`. **It does not exist in the GLB.**
All 294 node names were dumped to confirm it: the glTF exporter flattens collections and
only object names survive.

`resolveDistrict` (`experiences/murcia/interaction/resolveDistrict.ts`) therefore resolves in
layers, reporting which one fired — the same discipline `findTerrainPlate` uses, for the same
reason:

```
userData.district === tag   ->  'tag'    the production mechanism
configured node names       ->  'name'   all three spellings
world XZ rectangle          ->  'rect'   development only, gated + loud
                            ->  'not-found'  feature left entirely inert
```

**Stand-in today:** `blog_edificios` + `blog_edificios.001`, a real non-instanced cluster at
X [−381, −299] Z [156, 212]. When the objects carry `district = "servicios"` the tag path
wins automatically and no code changes. The Blender side is `murcia/blender-export-contract.md`.

`allowSpatialFallback` is a field on the binding, **not** `import.meta.env.DEV`. Nothing in
`src/` reads `import.meta.env`, and `checks/` bundles these modules for Node with esbuild
where it does not exist — reading it inside the resolver would have broken the harness that
tests the resolver.

### Exclusive camera ownership

The first design suspended *pointer input* during a flight. That is not enough:
`DragPanController.update()` writes the rig unconditionally, so a flight would move the rig
and the controller would ease it back toward its stale drag targets on the same frame, every
frame.

The fix is a lifecycle, not a filter. `beginExternalControl()` makes `update()` return
**before** touching the rig; `endExternalControl({ adoptRigState: true })` reads focus and
yaw back off the rig into the controller's current *and* target state. §2 of
`checks/district-flight.ts` asserts both, and also asserts that *without* adoption the view
snaps back 37.8 units — so the guard is demonstrably load-bearing rather than decorative.

Cancellation uses a **capture-phase** `pointerdown` listener on the canvas. It runs before
the controller's own constructor-registered handler, so the press that stops the flight is
also the press that starts the drag — no synthetic re-dispatch, no dead first gesture. Its
`pointerup` is suppressed.

### The flight moves focus and yaw only

Distance, elevation and FOV are untouched, so the ground footprint is unchanged and
everything in §5 and §6 holds with no re-measurement. A deliberate scoping decision, not an
oversight — §5 makes a pose change a much larger job.

Yaw uses the shortest signed delta added to the rig's unbounded yaw, so 350° → 10° travels
+20° and a wound-up 730° stays wound up. The flight integrates `elapsed / duration` through
an ease-in-out curve rather than the project's usual `1 − exp(−dt/τ)`: it needs a defined
endpoint, and frame-rate independence then holds by construction (verified identical at
30/60/120 fps, spread 0.0).

*Desired* and *feasible* focus are kept separate. The destination is never rewritten by a
frame that happened to be clamped, so a trajectory grazing the navigable edge still arrives
exactly where it was aimed.

### Framing around the panel

The district must not land behind the UI. The offset is computed as: centre of the
unobstructed region → NDC → raycast to the navigation plane → point P →
`focus = target + (target − P)`.

That is **exact, not approximate**. Moving the focus by d moves the camera by d, so the
point under a given NDC moves by exactly d; the round trip verifies to 1e-4 on every
viewport including 5120×1440 and an offset canvas.

Two things that are easy to get wrong and are now asserted:

- **Measure from real DOM rects**, not the breakpoint, and relative to the *canvas* rect
  rather than the viewport.
- **Never mutate the live rig to take the measurement.** `computeFramedFocus` builds a
  detached `CameraRig` on a throwaway camera. Pointing the real rig at the destination would
  jump the camera for a frame and fire `onYawChanged` → `recomputeBounds()` as a side effect.

The panel is measured with `offsetLeft/Top/Width/Height`, not `getBoundingClientRect()`.

### Look: emissive, not lights, and no halo

Murcia has no post-processing outside a warp, so emissive makes a surface read as
self-illuminated; it does **not** bloom into the air. The ground marker supplies the spread.
Dynamic lights are ruled out separately by the light-count recompile.

Materials are cloned **by original identity** (`Map<original, clone>`), not one clone for
all — that would work only while the GLB ships zero materials, and the texturing work will
end that. Originals are recorded and restored before the clones are disposed. Authored
emissive is scaled, never overwritten, so future `districtPart = "emission"` strips keep
their modelled look.

Idle intensity is deliberately **non-zero**, because there is no hover on touch.

### Mobile is not a smaller desktop

At 30° elevation the screen's vertical axis maps to *distance*: the bottom of frame is near
foreground, the top is the far city. A bottom sheet therefore covers the cheapest part of the
image, where a side panel on a narrow screen would cover the city. Two stops (~40% / ~85%);
the camera frames for the peek stop and **does not** re-frame when the sheet expands — at 85%
the user has chosen content over scene, and chasing the remaining strip reads as instability.

**Buildings are not small touch targets**, contrary to the assumption that usually drives a
picking proxy. Measured at the shipped pose, scale at the focus plane is ~8.7 px/unit at
1440×900 and ~8.1 px/unit at 390×844, so a 13-unit building is ~105 px wide. The proxy exists
for two other reasons: the marker is the affordance and must itself be clickable, and the
gaps between buildings should not be dead space.

Accessibility is carried by the projected label, which is a real `<button>`: a raycast cannot
be tabbed to or activated by Enter.

### The panel

A `summary` (one sentence, sized to survive the 40% mobile peek stop), a longer `intro`, and
five services as **single-open accordion sections**, the first open on arrival. All-collapsed
reads as a menu rather than as content, and several open at once loses the reader's place in
a 380 px column.

`experiences/murcia/content/districts.ts` holds `DistrictService { id, title, body }`. The
`id` wires `aria-controls` to the region, so duplicates would point two headers at one panel
— invisible unless you use a screen reader, hence asserted.

**Height animates with `grid-template-rows: 0fr → 1fr`, not `max-height`.** `max-height`
needs a number bigger than any real body; whatever it is, the visible motion finishes early
and the transition spends the remainder doing nothing, because the easing applies to the
guess rather than to the content. The `fr` track animates to genuine `auto`. It needs an
inner wrapper with `min-height: 0` — grid items default to `min-height: auto` and refuse to
shrink below their content, which would hold the section open at `0fr`.

Two ordering traps, both hit during implementation:

- `.reveal` and `.district-service-region` are both single-class selectors, so whichever is
  declared last wins the `transition` shorthand outright. With `.reveal` last the accordion
  silently stopped animating its height. The utility now precedes the components, and
  `checks/` verifies the order in the *built* CSS rather than the source.
- `buildSections()` opens section 0, which routed through the same path as a tap — including
  the mobile auto-expand. On a phone the sheet jumped to 85% the instant the panel opened and
  the peek stop was never seen. `setOpenSection` now takes `fromUser`, and only a gesture
  raises the sheet or scrolls.

**Opening a section does not re-frame the camera**, deliberately: the desktop dock is
fixed-width and full-height and the mobile sheet's height is set by its stop, so section
height changes only inside the scrolling body. `getObstructionRect()` returns the same
rectangle.

---

## 9. Numbers worth knowing

**Murcia camera:** fov 35 · elevation 30° · azimuth 0° · distance 165 · `lookAtHeight` 5.85 ·
near 1 · far 1200 · camera height 82.5. Effective pitch ≈27.3°, because `lookAtHeight` is a
constant rather than a fraction of distance. Azimuth 0 is a *starting* value only; the user
yaws freely and `CameraRig` keeps that yaw outside the pose.

Originally FOV 60, distance 551, elevation 44.2°, derived from the bounding sphere — the
"isometric strategy game" look the navigation work set out to replace.

**Murcia navigation:** `deriveBoundsFromTerrain: true` · `boundsInset: 0` ·
`dragThresholdPx: 6` · `groundPlaneHeight: 1` · `edgeSafetyMargin: 8` ·
`maxGroundDistance: 800`. `maxGroundDistance` was 500; at distance 165 on an ultrawide the
corner rays genuinely reach ~550, so the clamp fired in a *normal* case rather than the
near-horizon one it exists for — and it under-reported the footprint, which is the unsafe
direction: −37 measured where the truth was −170.

**Murcia plate:** X [−438.2, −86.4] · Z [120.5, 473.3] · 351.8 × 352.8 · top surface at
Y 1.41. Model bounds coincide with the plate exactly. Skirt width 600,
`fadeEndFraction` 0.25.

The plate is **not a rectangle**: 134 vertices / 88 triangles, a low-poly irregular polygon
that does not fill its own bounding box. Local POSITION Y spans −2.55 → 0 with node
translation +1.41, so it is a slab whose top face sits at world Y 1.41. `Plane.018` is a
351 × 69 strip at world Y −1.15 → 0.01 spanning Z 291–360 — almost certainly the river, in a
channel cut through the plate, and the reason the services district approaches at
`approachYawDegrees: −35`.

**The GLB** (`/models/city-prototype.glb`, 456 KB, Draco + `EXT_mesh_gpu_instancing`,
Blender glTF I/O v5.1.20): 294 nodes · 111 meshes · 957 GPU-instanced buildings · **0
materials · 0 textures · 0 `extras`**. Representative building ~13 units, tallest landmark
`Plane.019` at 45. Scale is 1 unit ≈ 1 metre. All meshes share one default
`MeshStandardMaterial` — always clone before modifying. And with no `extras`, districts
resolve by **node name**, not by tag. The city currently renders monochrome as a result.

> ⚠️ **Those numbers describe the committed GLB. The working tree currently holds a different
> one** (measured 2026-08-11): **1 245 164 B · 1 070 nodes · 257 meshes**, against 455 616 B ·
> 294 · 111 at `HEAD`. Still Draco, still `EXT_mesh_gpu_instancing`, still 0 materials and —
> importantly — **still 0 `extras`**, so the re-export did not close the district-tagging gap.
> It is uncommitted and its provenance is unknown; it was already in the tree when the
> readiness re-audit began. It sits on the intro's prefetch path, so +790 KB competes with the
> 2.43 MB of Earth textures. **Verify which file you are measuring before trusting either set
> of numbers, and update this paragraph when the asset is settled.** Audit `ASSET-2`.

**Tap tolerances — two numbers, per pointer type, and they must stay two.** Camera rig:
`dragClickThreshold` 4 px (mouse/pen) · `touchDragClickThreshold` 12 px. Geo markers:
`CLICK_SLOP_PX` 5 · `TOUCH_CLICK_SLOP_PX` 12. A physical click barely moves a cursor; a finger
wanders 5–15 px between contact and release. Collapsing these back to one value re-breaks
touch even with the raycast correct (§11.23).

**Brand atlas:** one 2048×1536 `CanvasTexture`, 2 columns × 3 rows of **1024×512** cells,
sRGB, mipmapped, `ClampToEdgeWrapping`, anisotropy 4. Cell aspect is **2:1 and coupled to
`ORBIT_CONFIG.panel` 0.28 × 0.14** — change one without the other and every plate stretches.
Cell resolution is set by the case-panel close-up at `closeUp.distance` 0.55R, not the
overview. Hard cap of 6 plates; `cellUv` clamps past it. Logo artwork is specified at
1600×800 WebP with alpha, contain-fitted into a 896×400 box (`PAD_X` 64, `PAD_Y` 56) — the
atlas owns the padding, so files must be trimmed tight (`earth/logo-spec.md`).

**Earth rotation is 0.035 rad/s — a full turn takes ~180 s.** Worth knowing before writing any
test that waits for a specific place to face the camera: Murcia is on the near side for well
under half of that, and a 60 s poll will simply miss it.

**The space backdrop** (`src/space/`, `earth/DECISIONS.md` — *the backdrop becomes a galaxy*).
Two independent non-occlusion guarantees, and they work differently:

| | Stars | Nebula |
|---|---|---|
| Kept off the Earth by | **geometry** — a shell enclosing the camera | **render order** — opaque at `renderOrder -1000` |
| So the radius is | load-bearing: 180 ±15%, min 153 against `zoomMax` 22 | free: 1000, anything inside the far plane |

2600 stars in **one** draw call. Clustering is 36 knots · spread 0.09 · share 0.6 · strength
0.6, and it is **angular only** — perturb the direction, renormalise, then apply the radius.
Magnitude is continuous: `rand ** 2.6` mapped to 0.7–3.4 px with brightness 0.35–1.0. Only
stars ≥ 2.2 px twinkle (~20% of them), amplitude 0.15, alpha not `gl_PointSize`.

Galactic band: **tilt 22°, width 0.22**, shared by the stars and the nebula — that agreement
is the design. Nebula brightness 0.14 · dust density 0.55 · **noise domain 8.0** (§11.32).
Seeds are fixed: stars `20260811`, nebula `137.24`.

Cubemap: **1024 per face, RGBA8, no mipmaps = 25.2 MB VRAM**, baked one face per frame during
P0. Zero download bytes, and the cubemap is the seam if an authored sky is ever wanted.

Clumping is measured, not asserted by eye: coefficient of variation of nearest-neighbour
angular distance is **0.020 for `fibonacciSpherePoints` and 0.651 for the shipped field**.
That spiral is a *maximally even* distribution, which is why the old sky read as combed.
`fibonacciSphere.ts` is untouched — `createConnectivityCloud` still wants exactly that.

**Warp:** duration 1.6 s · cut at 0.5 · Earth FOV 45→74 · Earth radius ×0.25 at the cut ·
Murcia arriving 165→75 · Murcia departing 165→180 while rising 30°→50° · flash reaches full
black. The two legs are not mirror images (ADR 006).

**Build budgets** (asserted; the build fails, it does not warn):

```
intro entry   13 325 B / 16 000 B   ← must have LITERALLY ZERO imports
app entry    302 381 B / 320 000 B  ← ~17.6 KB headroom
```

Emitted chunks: `three` 814 KB · `SceneCanvas` 211 KB · entry 302 KB ·
`MurciaExperience` 70 KB · `createCornerLogo` 3.7 KB · `intro` 13 KB.

Both numbers moved since the 2026-08-07 reading (12 996 / 300 787) and the growth is shared
between the touch, logo and backdrop work — do not attribute it to any one of them. **The
intro figure is not the backdrop's doing**, which was checked rather than assumed: the built
intro chunk contains zero galaxy symbols. `introConfig.ts` does carry a *value* import of
`space/galaxyBand`, so the band defaults have one source of truth; that is safe only because
the boot entry never reaches `introConfig`. §11.1 still governs everything under
`intro-draw/`, and the nebula itself adds **no** download bytes at all, being generated on the
GPU.

---

## 10. How this repo verifies things

**Everything the harnesses do is numeric**: good at signs, magnitudes and geometry, silent on
whether the result looks or feels right.

**Assistant-side visual verification began on 2026-08-11** and is now the expectation for
anything visual. Not the Chrome extension, which has still never been connected — Playwright
against the dev server. Two forms, both worth copying:

- **Screenshots read back by the assistant** (the galaxy backdrop). `npx --no-install
  playwright screenshot --browser chromium --viewport-size "1600,900" --wait-for-timeout
  22000 http://localhost:5173/ out.png`. The timeout is simply longer than the intro.
- **Emulated devices driven against a control** (touch picking) — 460 taps on the pre-fix
  code producing no response, then the same script passing after. A verification with no
  negative control cannot tell "fixed" from "never broken".

**This is not optional for visual work, and the galaxy is the evidence.** Three defects
survived both design review and code review and were caught only by looking: noise frequency
producing fog (§11.32), dust lanes crazing the whole sky, and a smooth analytic band reading
as a searchlight beam. All three were *invisible* to 28 passing numeric assertions, because
each assertion was true. Numbers prove the mechanism; only a picture judges the result.

Playwright's bundled Chromium is already installed here, but the Playwright **MCP** is
configured for the `chrome` channel and fails with "Chromium distribution 'chrome' is not
found". Chrome is not installed on this machine; Edge is. Use the CLI, which is what the
command above does, rather than installing a browser.

**Judgement is still the user's.** Screenshots catch defects — fog, crazing, a beam. They do
not settle whether a thing looks *good*, and the division of labour below is unchanged.

**The division of labour that worked**, and is worth repeating for anything judged rather
than measured: the numeric side proves the mechanism (sign, bound, magnitude,
no-regression), query parameters put the judgement in the user's hands directly, and the
outcome comes back into this document as a decision. The drag feel went from "reasoned
defaults, unvalidated" to signed off in one pass that way (§7). The failure mode it replaced
was a long round-trip of the assistant guessing at a feel it cannot perceive — which is how
the rejected momentum design survived as long as it did.

Everything numeric is verified by bundling the **real TypeScript modules** with esbuild for
Node and running a harness against them. Never a reimplementation, never a convenient
stand-in.

Four rules these harnesses earned the hard way:

- **Exercise the real resolution path.** The first navigation harness constructed plate
  bounds *directly* rather than resolving them by name, so it validated the maths and never
  the lookup — which is exactly where the worst bug in the project lived.
- **Cross-check the measurement against the shipped function.** The azimuth sweep computes
  corner ground hits itself (it needs the points, not just the reaches) and asserts its own
  axis-aligned extents match `computeGroundFootprint` to 0.00 units. Without that it could
  have been measuring something adjacent.
- **Validate against a recorded number.** The sweep independently reproduced this document's
  "+40 units at 5120×1440, distance 110" before being trusted on any new configuration.
- **A failing assertion is a question, not a verdict.** Several of the first failures were
  the test's fault: a 960 px pointer move delivered in a single 16 ms sample (a 60 000 px/s
  flick) asserted to produce no coast; a weight comparison that drove into the navigable
  boundary and so compared walls rather than momentum, where the *heavier* setting hit the
  wall sooner and read as travelling less.

**A gap worth knowing about:** `check:district` and `check:warp` set a non-zero exit code;
`check:navigation` does not. Because `npm run check` chains with `&&`, a navigation-feel
failure prints and passes. Read its output rather than trusting the exit status.

### What the deploy path actually runs — which is not this

**`npm run check` is the gate, and nothing runs it.** `npm run build` is
`tsc -b && node scripts/simulate-intro.mjs && vite build`, so Vercel runs the typecheck and
the intro simulation and **none of the other five harnesses** — 137 assertions covering the
warp envelope, navigation, districts and the star shell. There is no CI: no `.github/`, no
workflow, no `buildCommand` override in `vercel.json`. A regression in any of them builds
cleanly and deploys.

This is worth sitting with, because it contradicts `DECISIONS.md` §12 ("guard behaviour on the
artifact, not on review") and because the harnesses are the only tests that exist. Two ways to
close it, and the trade-off is real: CI keeps deploys fast and gives Preview a pass/fail
signal, while folding `check` into `build` cannot be bypassed but puts a *tuning-sensitive*
harness on the deploy path — `check:space` was seen failing at ratio 1.107 against a 1.15
threshold while `spaceConfig.ts` was mid-edit, then passing 5/5 once it settled. A gate that
can fail for reasons unrelated to the change is a bad gate. Unresolved; audit `VER-1`.

### Verifying the production build, not the dev server

Three things that only the production path can tell you, all verified on 2026-08-11:

- **The SEO branch is environment-gated and had never been executed.** Every build until then
  ran the development path, which emits `Disallow: /` and `noindex`. Exercise the real one
  locally with
  `VERCEL_ENV=production VERCEL_PROJECT_PRODUCTION_URL=example.com npm run build`, then read
  `dist/robots.txt`, `dist/sitemap.xml` and the `canonical`/`og:url` tags. Production also
  drops the `/debug` console, so the entry chunk comes out ~5.4 KB smaller — if it does not,
  the flag did not take.
- **The build is deterministic.** Two clean builds produce byte-identical chunk hashes. When
  checking that, fingerprint `src/` before and after: this repo has had two agents in it at
  once, and a "non-deterministic build" is far more likely to be a file that changed underneath
  you.
- **Failure paths need `vite preview` plus request blocking**, not reasoning. Playwright
  `page.route('**/earth/*.jpg', r => r.abort())` and read
  `window.__vertigoIntro.boot.readiness()` / `.pending()`. Confirmed: a required asset gives
  `fatal` and the Spanish caption, an optional one leaves `ready`, and blocking `model.glb` —
  the 20 KB file that once trapped every visitor — now lands `ready` with progress 1.

Note the city meshes set `raycast = () => {}` so they never intercept object picking; a probe
must restore it to measure coverage.

---

## 11. Things that will bite you again

1. **The intro entry must import nothing.** It is a separate Rollup input whose script tag
   is injected head-prepend, because Vite concatenates every module script in a document
   into one chunk. One stray value import — even something that looks like a type — pulls
   three.js back in and fails the build. That assertion has already caught it once.
2. **GLTFLoader strips `[ ] . : /` from node names.** `Plane.013` becomes `Plane013`, so
   `getObjectByName('Plane.013')` returns `undefined`. This once left the terrain plate
   unfound, the skirt unbuilt, `visualBounds` falling back to `contentBounds`, and the
   navigable area collapsed to **41 × 110 — 3.6% of the plate**, with no error of any kind.
   Never trust name lookup into a GLB; prefer measurement and heuristics, and always report
   which path was taken (`findTerrainPlate` exposes `terrainSource`).
3. **Blender collection names are not exported.** The glTF exporter flattens collections —
   only object names become nodes. A collection can never be a runtime contract. Use custom
   properties, which land in `extras` and then in `userData`. See
   `murcia/blender-export-contract.md`.
4. **Silent degradation is worse than failure.** Anything that can fail to find an object
   must log loudly and degrade to something *usable*, never to a technically-valid sliver.
   `maxGroundDistance` clamping is the same trap in numeric form: it under-reports the
   footprint, so a value set too low hides an edge that is actually visible.
5. **Hardcoded world coordinates drift** the moment the model is re-exported. Measure at
   load and keep the constants as a last-resort fallback — which is what
   `deriveBoundsFromTerrain: true` is for. The district resolver's `fallbackRect` is a
   development crutch for the same reason, and is gated behind `allowSpatialFallback`.
6. **All meshes share one material instance** while the GLB ships no materials. Clone before
   touching anything, and clone **by original identity** so the mapping survives the
   texturing work. Un-assign a clone before disposing it, or the mesh keeps a dangling
   reference across a remount.
7. **Changing the light count recompiles every shader** — a stall at exactly the moment of a
   warp. Keep the count and types identical across experiences and vary only position,
   colour and intensity; those can then animate through a transition for free. This is why
   the district highlight is emissive rather than a dynamic light.
8. **`rig.getPose()` returns `murciaConfig.camera` by identity.** Mutating it corrupts the
   config for the rest of the session. Always build a fresh pose object.
9. **`DragPanController.update()` is an unconditional rig writer.** It calls
   `rig.setFocus`/`rig.setYaw` whenever its stored targets differ from the rig, so anything
   else that moves the rig will be fought frame by frame. Gating pointer input does not stop
   it. Use `beginExternalControl()` / `endExternalControl({ adoptRigState: true })` — and
   note `externalControl` is a plain boolean shared with `setActive` and every district
   flight, so sequencing matters.
10. **The focus rig's `activate()` is destructive.** It reseeds from the overview pose. To
    suspend it without losing the viewer's position, stop calling `update()`; never toggle
    activation.
11. **`setViewport()` re-resolves Murcia's pose on every resize**, and `CameraRig.setPose`
    with it. Anything animating the pose must compose with that or a resize will snap it
    back. User yaw is deliberately stored outside the pose so it survives; do not fold it in.
12. **Bounds must clamp the drag target, never the rendered focus.** Snapping the focus was
    harmless when bounds only changed on resize; with free yaw it would jerk on every frame
    of a turn.
13. **Murcia's ground footprint is azimuth-dependent.** With free yaw the navigable bounds
    change every frame of a rotation, so any analysis at a fixed azimuth is invalid —
    including any *analysis*, not just any test. `DragPanController` fires `onYawChanged` for
    this.
14. **Ultrawide is the binding aspect** for skirt coverage, not desktop. Lowering the camera,
    pulling it back, or raising `lookAtHeight` widens the footprint and spends skirt margin;
    re-run `check:warp` and re-check `terrainTransition.width` after *any* camera change. See
    §5, which exists entirely for this.
15. **The drag feel numbers are hand-validated and signed off** (§7). They are the only judged
    values in the project. Do not "improve" them from reasoning, and do not treat a
    camera-pose change as licence to adjust them silently — `translationGain` interacts with
    the pose, so if distance or elevation moves, say so and let a person re-judge it.
16. **The raycaster reads `object.layers`, never `object.visible`.** An object hidden with
    `visible = false` is still picked. Murcia's picking proxies depend on this
    (`INTERACTION_LAYER = 1`); Earth must not use layer 1. A picking proxy is controlled by
    layers or not at all.
17. **A tap that cancels something still fires `pointerup`.** The click guard tests only the
    drag threshold, so a sub-threshold "tap to cancel" falls straight through into selection.
    Suppress the cancelling pointer's own `pointerup`, and clear the suppression on
    `pointercancel` too.
18. **`getBoundingClientRect()` reports the *transformed* box.** Measuring a panel for camera
    framing at the moment it opens returns its off-screen entry position, and the framing
    offset comes out as zero. Use `offsetLeft/Top/Width/Height`, which are layout values and
    ignore transforms.
19. **Both experiences' input listeners share one canvas.** Earth's satellite focus and geo
    markers listen on `window`; Murcia's controllers listen on the canvas. Everything must be
    gated on which experience is active, or the inactive one silently accumulates state.
20. **Murcia's stylesheet was globally hostile** and is now scoped to `.murcia-ui`. Its
    declaration order is load-bearing: `.reveal` must stay declared before
    `.district-service-region`, or the accordion silently stops animating.
21. **GSAP's `lagSmoothing`** clamps the per-tick delta to 33 ms once a frame exceeds 500 ms.
    On slow hardware a 1.6 s warp stretches over tens of seconds. Correct behaviour, but it
    invalidates any wall-clock-driven test and will mislead you when profiling.
22. **Kill stale dev servers.** Three accumulated across sessions here, and the one being
    viewed served a stale module graph producing a `ReferenceError` that looked exactly like
    a circular import. It cost real time twice. Check the port before debugging a phantom.
23. **A tap produces no `pointermove`, so any hover computed from one does not exist.**
    `pointerdown → pointerup → click`, and nothing in between. This kept the *entire* site
    mouse-only until 2026-08-11: two handlers acted on a stored hover, and on touch it was
    permanently `null`, so nothing responded and nothing errored. Raycast from the event's
    own `clientX/clientY` — `DECISIONS.md` §17. The corollary is the second half of the bug:
    **a finger wanders 5–15 px between contact and release**, so a 4–5 px drag threshold
    rejects most real taps. Tolerances are per pointer type or they are wrong for one of them.
24. **`(hover: none)` is a device class you must design for, not a fallback.** Anything
    revealed only on hover is invisible forever on a phone. Both answers in this repo pair
    the persistent label with a *limb/on-screen* class so it cannot advertise something
    unpickable (`districtLabel.ts`, `.geo-tag--destination.is-near`). And a label made
    visible must also be made activatable — it sits offset from the hit target, so a visible
    control that ignores taps is worse than no control.
25. **Emulating touch needs a real device profile.** A Playwright context with `hasTouch:
    true` still reports `hover: hover`, so every `(hover: none)` rule stays inert and a touch
    bug looks fixed when it is not. Use `devices['Pixel 7']`.
26. **Geometry and material passed to R3F as *props* are never disposed.** R3F disposes only
    objects it created; `THREE.Points` has no `dispose()` and prop-attached resources are not
    walked. So a `useMemo`'d geometry leaks on unmount *and* on every memo rebuild — which
    the debug sliders do per drag tick. Dispose them in an effect cleanup keyed to the memo.
27. **`EffectComposer.dispose()` does not walk its passes.** It releases its own two render
    targets and `copyPass`, nothing else. `AfterimagePass` alone owns two more full-screen
    render targets, two materials and two fullscreen quads. Retain every pass and dispose it
    yourself — a pass constructed inline in `addPass()` is unreachable and cannot be freed.
28. **A rejected promise stays cached.** `templatePromise` in `createSatellite` memoises the
    satellite GLB; a single transient 404 was replayed to every satellite for the rest of the
    session and survived a full orbit-system rebuild. Clear the cache in a `.catch` so the
    next attempt can actually retry.
29. **Async loads must be cancellable against teardown, and StrictMode makes that the normal
    path.** React 19 runs mount → cleanup → mount, so in dev *every* load lands after a
    dispose at least once. A callback with no `disposed` guard attaches geometry to a disposed
    scene, calls `compileAsync` on a dead object, and reports readiness for something that no
    longer exists. Guard the callback, not just the dynamic `import()`.
30. **Fixed-length coupling between two arrays is a site-down bug, not a missing item.**
    `createOrbitSystem` walked `ORBIT_PRESETS` (6) and indexed `SATELLITES[index]`; one fewer
    case study threw, and `OrbitSystemLayer` converts a throw into a **fatal** boot state. So
    deleting a case study would have refused to load the whole site. `noUncheckedIndexedAccess`
    being off is why `tsc` cannot see this class of bug (§12).
31. **`CubeCamera` does not orient its six face cameras in the constructor.** It leaves
    `coordinateSystem` null and only points them in `updateCoordinateSystem()`, which it calls
    lazily from `update()`. Borrowing the cameras — the right move, since a hand-rolled
    face-basis table is the most error-prone part of baking a cubemap — means bypassing
    `update()`, and then **all six still look down −Z and every face bakes the same image**.
    Call `updateCoordinateSystem()` yourself, from `renderer.coordinateSystem`. The general
    class: three initialises lazily inside its convenience methods, so taking the parts
    without the method takes them uninitialised.
32. **In a procedural sky shader the domain scalar is the *only* thing setting feature size.**
    The input is a unit vector, so `dir * k` fixes how many noise lattice cells span the whole
    sky. At `k = 2.4` that is about eight — features ~23° wide, two of which fill a 45° FOV,
    and it renders as fog no matter how many octaves are stacked on top. Octaves add detail
    *below* the base frequency; they cannot rescue one that is too low. 8.0 is the working
    value, and this is invisible to every numeric assertion.
33. **Perturbing a position destroys a geometric invariant; perturbing a direction does not.**
    The star shell's non-occlusion guarantee is that every point lies on a sphere enclosing
    the camera. Clustering by offsetting final positions in 3D breaks it for *a handful* of
    stars at *some* orbit angles — the intermittent kind no screenshot reliably catches.
    Perturb the direction and renormalise, then apply the radius, and the guarantee holds by
    construction. Assert the radius bound across the full parameter space, not at defaults.
34. **`scene.background` is not tone-mapped, so anything authored to match it is wrong.** It
    is written as a clear colour and skips `ACESFilmicToneMapping` entirely, while every mesh
    beside it does not. This has now bitten twice, in opposite directions: Murcia's skirt had
    to fade to *alpha* rather than to the background value (§6), and the nebula had to be an
    opaque **mesh** rather than a background so it passes through the composer's `OutputPass`
    like the Earth does. Related, and equally quiet: a raw `ShaderMaterial` gets no output
    conversion appended, so omitting `#include <colorspace_fragment>` fails as "looks a bit
    dark" rather than as an error.
35. **A diagnostic can sit in a production code path for months and only start firing when an
    unrelated asset changes.** `InteractionProbe` returns `void` and its only effect is a
    `console.info` of node metadata; it was called from Murcia's `pointerup` on every click,
    gated on `active` and drag state but **not** on `DEBUG_TOOLS_ENABLED`. It emitted nothing
    only because the GLB carries no `extras`, so its cache was empty — and the planned Blender
    re-export exists precisely to add those. "Currently silent" is not "gated"; check what a
    thing would do once the data it keys on arrives. Now gated (audit `DBG-1`).
36. **The console is not silent on load in production**, and the check that would have caught
    it is written down in `DECISIONS.md` §16. Three `console.warn` groups naming internal
    Blender nodes fire on every visit — from `cityDistrictBindings` and
    `createTerrainTransition` — because Murcia is *prefetched during the intro*, so they reach
    visitors who never enter the city. The general trap is that second one: anything
    prefetched runs its diagnostics for everybody, not just for the people who use it (audit
    `LOG-1`, open).

---

## 12. State of the work

**Done.** Both experiences migrated and running in one app. Single renderer, verified as one
canvas. Reversible Earth ⇄ Murcia warp with the dolly, prefetch and GPU warm. Globe marker
as the entry point. Spanish throughout. Murcia's drag navigation, terrain edge, navigation
bounds and district interaction all came across unmodified and their 77 behavioural
assertions still pass.

**Verified in a browser**, not merely asserted: one canvas across three round trips; Murcia
renders with terrain, districts and highlight; Earth restores with correct FOV and no
residual dolly; Murcia's camera returns to exactly `distance 165 / height 82.5` after a warp;
zero console errors; the caption sequence under throttling.

**Touch and pen work (2026-08-11).** Until then the site responded to a mouse and nothing
else — see §11.23 and `DECISIONS.md` §17. Verified against a control, not just after the
fact: 460 emulated taps across the whole globe produced no response on the pre-fix code; the
first tap selects a satellite after it. Also confirmed on an emulated Pixel that the Murcia
tag is visible without hover and that tapping the label enters the city, on both the dev
server and the production build. Mouse behaviour is unchanged by construction — picking at
the click's coordinates and picking at the hover position are the same point on a mouse.

**Real client logos are wired (2026-08-11).** `CaseStudy.logo` was declared, documented and
never read by anything; it now drives the brand atlas. Still `null` on all six, so nothing
visible changed — the pipe works, the artwork is a content decision (`DECISIONS.md` §18,
`earth/logo-spec.md`).

**The Vercel readiness audit was re-run (2026-08-11)** —
`audits/production-readiness-vercel-2026-08-11.md`, a delta against the 2026-08-07 pass, which
is left intact as the record of that one. Status unchanged in shape: **ready to deploy, not
ready to publish**, and the publish blockers are still content rather than engineering.

What it settled that had never been checked: **the production SEO branch had never once been
executed** — every build until then ran the development path — and it is correct; the build is
byte-for-byte deterministic; `npm ci` from the lockfile alone succeeds; and all three
documented failure classes behave as designed *on the production build* (§10). It also found
that the harnesses are not on the deploy path, that there is no observability at all, and the
GLB discrepancy in §9 — all three now in Known debt below.

Two things it fixed: a diagnostic wired into Murcia's production click path (§11.35) and a
`.gitkeep` that shipped with prose in it. Two it deliberately did not: gating the load-time
console warnings (§11.36) and reverting the GLB.

**One verification gap is worth repeating: only Chromium has ever been tested.** WebKit and
Firefox are not installed here, and Safari on iOS is where the KTX2 transcoder and
`compileAsync` are most likely to differ. That is the largest remaining unknown, and no code
change can close it.

**A leak-and-crash pass landed with it.** Undisposed composer passes and prop-attached
geometry; loads outliving teardown; a promise cache that remembered rejections; degenerate-
input crashes in the charts and the sphere sampler; and the fixed-length array coupling in
§11.30. All behaviour-neutral. The traps are recorded in §11 (23–30) because each is a class
of bug, not a one-off.

**The backdrop is a galaxy (2026-08-11).** The resting scene's stars were "equal in form,
colour and distance" — all three literally true, and the first structurally so, since
`PointsMaterial` has no per-point size and magnitude was faked with three `Points` objects.
Now one draw call with continuous magnitude and stellar colour, clumped along a galactic
band, over a procedural nebula baked to a cubemap during P0 for **zero download bytes**.
Numbers in §9, reasoning in `earth/DECISIONS.md`, six new sliders on `/debug`.

**Visually verified, and that mattered more than usual**: three defects passed both design
and code review and were caught only by reading back screenshots (§10, §11.32). It is the
first feature in this project the assistant has judged against pixels rather than handing to
the user unseen. Whether it looks *right* is still the user's call.

**Not verified.** The warp **at frame rate**. Software WebGL runs the city at ~2 fps and
`lagSmoothing` then distorts every mid-transition frame, so how the motion actually *feels*
is unjudged. The timings in `app/warpTransition.ts` are reasoned and endpoint-asserted but
tuned blind — they need a person on real hardware.

### Known debt

| | Why it is deliberate |
|---|---|
| **Vite pinned at 5** | The two custom build plugins are validated only against 5. A bundler bump deserves its own verification pass, not a ride-along inside a migration. |
| **`noUncheckedIndexedAccess` off** | Murcia was written under it, Earth was not. Enabling it repo-wide produces 36 errors, 16 of them inside the 16 KB intro budget. Restore in a dedicated pass. |
| **Placeholder content** | Case studies and geo-marker metrics are invented. `data/caseStudies.ts` says so at the top. The API seam is `SATELLITES` in `orbitConfig.ts`. The *logo* half of that seam is now implemented — `logo` is a URL the atlas actually loads — but every value is still `null`, deliberately: real trademarks beside invented results read as endorsement. |
| **No keyboard path into the 3D** | Touch and pen work as of 2026-08-11, but satellites and the Murcia marker are still raycast-only. The geo tags are divs with no role or tabindex. `A11Y-1` in the readiness audit is narrowed, not closed, and closing it means real markup — the `districtLabel.ts` button pattern applied to the globe. |
| **`orbitId` and `label` are unread** | `caseStudies.ts` declares both; the satellite↔orbit pairing is *positional*. They agree today only because both arrays are in the same order. The comments now say so. Resolving by `orbitId` is the honest fix once content is fetched and can arrive in any order — a behaviour change, so it was not done silently. |
| **District resolves by node name** | The GLB carries no `extras`. Fix is in Blender — see `murcia/blender-export-contract.md` — not in code. |
| **Two KTX2 loaders** | `createSatellite` and `createCornerLogo` each build one; three warns. Harmless, worth consolidating. |
| **Corner logo z-order** | Composites at z 10, so geo tags at z 15 can paint over it. Accepted in `adr/002`; unlikely in practice, never observed. |
| **`check:navigation` cannot fail a build** | It prints failures but leaves the exit code at 0. See §10. |
| **The harnesses are not on the deploy path** | `npm run build` runs the typecheck and the intro sim only; the other five harnesses run only when a human types `npm run check`, and there is no CI. Not deliberate — unresolved, because the fix is a choice between CI and a slower, tuning-sensitive build gate. §10, audit `VER-1`. |
| **No analytics, no error reporting** | Production failures will be completely invisible after launch. The instrumentation already exists (`bootState.fatalReason()`, `pending()`, `readiness()`); what is missing is a sink. Audit `OBS-1`. |
| **The city GLB in the working tree ≠ the committed one** | ~3× the nodes and +790 KB, uncommitted, still without `extras`. Needs an owner's decision before it ships. §9, audit `ASSET-2`. |

### Open questions

Closed, kept here because each was open long enough to shape the code:

- ~~The drag feel is unvalidated by human hands.~~ **Validated 2026-08-06, and the original
  design rejected.** §7.
- ~~Whether 180° per viewport width is the right rotation sensitivity.~~ **No — 120°.**
- ~~The district copy is English while its label is Spanish.~~ **Settled: Spanish**, per
  `DECISIONS.md` §11.
- ~~Interactive objects need `extras` before selection can be tested.~~ **Worked around, not
  closed.** `resolveDistrict` resolves by node name against a stand-in cluster, so the
  interaction is testable now; the `extras` tag remains the production mechanism and the
  district is still a placeholder until the re-export lands.

Still open:

- **The whole district interaction is visually unjudged.** Marker legibility, glow strength,
  flight duration, approach yaw and panel timing are all reasoned or measured, none judged —
  the same status the drag feel had before it was driven by hand and rewritten. Expect the
  numbers in `defaultDistrictHighlightConfig` and `CameraFlight` to move.
- **`approachYawDegrees: −35`** was chosen to keep the river strip out of the composition.
  That is a guess about framing, not a measurement.
- **`initialFocus` is the plate centre**, chosen arithmetically. It also determines Murcia's
  opening heading, and neither has been judged as a composition.
- **Whether the rectangular fade reads correctly**, or the coastline needs following (§6).
- **The monochrome look has not been confirmed as intended.** The GLB has no materials.
- **Whether losing strafe is acceptable.** Free yaw was chosen over sideways panning because
  one gesture cannot carry three axes. If it turns out to matter, the fallback is
  dominant-axis locking at drag start — modal, and worse in every other respect. It survived
  the feel review without being raised, which is weak evidence for it, not a decision.
- **The service copy is placeholder**, written to give the layout realistic text lengths. It
  is marked as such in `experiences/murcia/content/districts.ts`.

---

## 13. Map of the code

```
src/
├── main.tsx, App.tsx          application shell and orchestration
├── app/                       experience identity, transition, warp curves
├── graphics/RenderPipeline    the single render authority
├── intro-draw/                the loading drawing — STANDALONE, imports nothing
├── components/                R3F layers, and the adapters into each experience
├── corner-logo/               3D logo, drawn as an overlay pass
├── orbit-system/              satellites, orbits, geo markers
├── interaction/               Earth's focus rig and satellite selection
├── space/                     the backdrop — band, star field, nebula bake
├── experiences/murcia/        the city — its own Scene, camera, rig, UI
├── shaders/, utils/, loading/, data/
checks/                        the behavioural harnesses
scripts/simulate-intro.mjs     runs on every build
```

Inside `experiences/murcia/`: `config/` (pose, feel, skirt, query overrides) · `camera/`
(rig, flight, framing, warp pose) · `navigation/` (drag controller, bounds, viewport
footprint) · `environment/` (collar, skirt, boundary extraction) · `interaction/` (district
resolve, highlight, state machine) · `assets/` (loader, city load, node names) · `scene/`
(district bindings) · `content/` (copy) · `ui/` · `styles/`.

**No module reaches for a global renderer, Scene, camera or config.** Every dependency
arrives through a constructor. That property is what made Murcia's migration a move rather
than a rewrite, and it is worth preserving for the same reason.

`src/space/` splits the same way and for the same reason: `galaxyBand.ts`, `spaceConfig.ts`
and `starDistribution.ts` are pure and Node-safe so `check:space` drives the real modules,
while anything touching `.glsl` or a renderer (`starShader.ts`, `bakeNebulaCubemap.ts`) stays
out of that path. **`bandDensity` has a deliberate twin in `shaders/nebula/bake.frag.glsl`** —
kept to one line so the duplication cannot hide a discrepancy, with the axis and width passed
in as uniforms so only the gaussian is duplicated. Change one, change the other.

`app/warpTransition.ts` is deliberately free of three, React and the DOM, so `checks/` can
drive the real curves rather than a reimplementation. Keep it that way. It holds the
envelope and the Earth leg only — Murcia's pose mapping lives in
`experiences/murcia/camera/warpPose.ts`, because nothing under `experiences/` may import
upward from `app/`, and because how a city may be approached or left is a property of its
terrain skirt (ADR 006). `check:warp` imports from both, plus the real `applyPoseToCamera`
and `computeGroundFootprint`.
