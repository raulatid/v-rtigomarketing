# PROJECT MEMORY

Durable context for the Murcia city exploration prototype: what this is, what was
decided and why, what the asset actually contains, and what will bite you again.

Written 2026-08-05. Keep it current — it exists so none of this has to be
re-derived.

Companion documents:

- `docs/plans/001-city-exploration-prototype-first-take.md` — original plan.
- `docs/plans/002-improvements-navigation-camera-terrain.md` — the active plan,
  including **Amendment A** (multi-environment context) and **Appendix A**
  (Phase 1 audit results).
- `docs/blender-export-contract.md` — what the runtime reads out of the GLB and
  what must be true in the .blend. Read before any re-export.
- `docs/thoughts/plan-revision-services-interaction.md` — the review that shaped
  the district interaction (§8b).

---

## 1. What this project is

A Vite + TypeScript + three.js (r171) prototype of a navigable 3D city
(Murcia), for Vertigo Marketing.

**It is not standalone.** It becomes **one of two environments** inside a larger
application, reached from the other by a warp-like transition. The runtime model
is fixed by the wider project:

- **One** `WebGLRenderer`
- **One** canvas
- **One** `THREE.Scene`
- Two **environments** inside that Scene, one active at a time

The immediate goal is to get *this* environment right in isolation, then migrate
and combine.

### Terminology (used consistently in code and docs)

- **Environment** — a user-facing place. A product concept.
- **Scene** — `THREE.Scene`. There is exactly one, owned by the app shell.

Never use "scene" to mean "environment". The ambiguity is dangerous here.

---

## 2. Architectural decisions

### 2.1 Transition trigger: button, not scroll — *decided, not implemented*

Recorded so navigation work does not foreclose it.

- **Touch has no `wheel` event.** Single-finger drag is committed to navigation
  and pinch is disabled, so a button must exist regardless. Scroll could only
  ever be a desktop-only alias for it.
- Mouse wheel and trackpad produce incomparable event streams (discrete notches
  vs. a continuous stream with post-release momentum).
- An accidental scroll would warp the user to another environment.
- The page is `overflow: hidden` with a full-viewport canvas — nothing signals
  that scroll does anything, so an affordance must be drawn anyway.
- A `<button>` gets keyboard access, focus and an accessible name for free.

**Consequences already in the code:** wheel is actively `preventDefault`ed, not
merely unbound.

**When it is built:** keep the transition input-agnostic — a module exposing
`play()` and a playing/idle state, knowing nothing about what invoked it. Do
**not** later layer a discrete scroll trigger on top of the button; that keeps
the accidental-trigger risk and adds nothing. A scroll-driven warp, if ever
wanted, should be continuous scrubbing, which is a different and much larger
feature.

### 2.2 Shell vs. environment ownership

**The app shell owns** (one each, application lifetime): renderer, canvas, the
single Scene, camera and camera rig, render loop, resize handling, Scene-level
state, the environment registry.

**An environment owns** (one per environment): its content root, its asset
loading, its camera pose config, its navigation bounds, its terrain transition,
its own disposal.

**Hard rule:** no module reaches for a global renderer, Scene, camera or config.
Every dependency arrives through the constructor. This already holds throughout
`src/`, so extracting the shell later is a move rather than a rewrite.

### 2.3 Scene-level state is contested

With one Scene these are global to both environments and must be shell-owned,
environment-supplied:

- **`scene.background`** — each environment wants its own; the warp will
  interpolate between them.
- **`scene.fog`** — affects **every material in the Scene**. During a crossfade
  both environment roots may be present, so the outgoing environment's fog would
  apply to the incoming one.
- **Lights** — keep the light **count and types identical** across environments
  and vary only position, colour and intensity. Changing the count invalidates
  every material's shader program and forces a full recompile — a stall at
  exactly the moment of the warp. Parameters can then be animated through the
  transition for free.

`createScene` implements this: one rig, created once, with `applySceneState()`
taking environment data.

### 2.4 Environment lifecycle — *designed, not implemented*

Three budgets behave differently and must not be conflated:

| State | In Scene graph | CPU RAM | VRAM | Per-frame |
|---|---|---|---|---|
| `unloaded` | no | — | — | — |
| `loading` | no | growing | — | — |
| `cached` | no | full | **none** | none |
| `warmed` | no | full | full | none |
| `active` | **yes** | full | full | full |

- **Detach from the graph; do not rely on `visible = false`.** Removing the root
  also excludes it from raycasts, `Box3.setFromObject`, and traversals.
- **`cached` genuinely costs no VRAM** — three.js uploads geometry buffers and
  textures lazily, on first render. A loaded-but-never-rendered environment is
  CPU typed arrays only. This matches the requirement exactly.
- **But it defers the cost to the worst moment.** The first frame after
  activation performs the whole shader compile and buffer upload synchronously —
  a hitch during the warp. Hence the separate `warmed` state.
- **Warming:** `renderer.compileAsync(root, camera, scene)` on a still-detached
  root covers shader programs and textures. *Verify the signature against the
  pinned three version before relying on it.* It does **not** upload geometry
  attribute buffers — those go up on first real draw. If measurement shows a
  geometry hitch, the remaining option is one off-screen render to a tiny render
  target. Measure first; for this environment (456 KB Draco) it is likely
  negligible.
- **Warming costs VRAM**, so it is a scheduling decision, not a default.
- **Peak usage is both environments live at once**, during the transition.

### 2.5 Per-environment configuration

The original `prototypeConfig.ts` exported a single mutable module-level object
mutated in place by `applyQueryOverrides`. That does not survive two
environments. Now split into:

- `src/config/appConfig.ts` — renderer, debug, query overrides, Draco path.
  `applyQueryOverrides` returns a **new** object.
- `src/config/environmentConfig.ts` — types.
- `src/config/murciaConfig.ts` — this environment's values.

### 2.6 Shared loader infrastructure

`src/assets/createAssetLoader.ts` owns the `GLTFLoader` + `DRACOLoader`, created
once and disposed once. The previous code created and disposed the Draco worker
pool per load.

---

## 3. Asset facts (audited from the GLB directly)

`public/models/city-prototype.glb` — 456 KB, Draco + `EXT_mesh_gpu_instancing`,
Blender glTF I/O v5.1.20. 294 nodes, 111 meshes, 957 GPU-instanced buildings.

```
Model bounds  X [-438.2, -86.4]   Z [120.5, 473.3]   Y [-1.15, 54.7]
Terrain plate `Plane.013`         identical to the model bounds
Plate size    351.8 x 352.8       top surface flat at world Y = 1.41
Representative building ~13 units   tallest landmark `Plane.019` = 45
Scale         1 unit ~ 1 metre
```

### Five facts that keep mattering

1. **The GLB contains zero materials and zero textures.** Every mesh falls back
   to `GLTFLoader`'s default — a *single shared* `MeshStandardMaterial`
   instance across all 111 meshes. **Always clone before modifying**, or you
   change the entire city. The scene currently renders monochrome.
2. **No node carries `extras`**, so `userData.interactive` is never set,
   `InteractionProbe.collectFrom()` returns 0, and click-to-inspect is a silent
   no-op. It is implemented but untestable against this asset.
3. **None of the five Blender contract names exist** — `CITY_VISUAL`,
   `TERRAIN_VISUAL`, `TERRAIN_COLLIDER`, `NAVIGATION_BOUNDARY`, `PLAYER_SPAWN`.
   Real names are `Plane.013`, `parque.007`, `Edificios_Procedurales`.
4. **The terrain plate is not a rectangle.** 134 vertices / 88 triangles — a
   low-poly irregular polygon. It does *not* fill its own bounding box. Local
   POSITION Y spans −2.55 → 0 with node translation +1.41, so it is a slab whose
   top face sits at world Y 1.41.
5. **`Plane.018`** is a 351 × 69 strip at world Y −1.15 → 0.01 spanning Z
   291–360 — almost certainly the river, in a channel cut through the plate.

---

## 4. Bugs found (and the lessons)

### 4.1 `GLTFLoader` silently renames every Blender node — *the big one*

`GLTFLoader` passes every node name through `PropertyBinding.sanitizeNodeName`,
which **strips the reserved characters `[ ] . : /`**:

```
"Plane.013"  ->  "Plane013"
"parque.001" ->  "parque001"
```

So `getObjectByName('Plane.013')` returned `undefined`. The terrain was never
found, the skirt was never built, `visualBounds` fell back to `contentBounds`,
and the viewport-footprint insets then collapsed the navigable area to
**41 × 110 — 3.6% of the plate**. Symptom: "only a really small place is
navigable".

This affects every `.001`-suffixed name Blender produces, so it would have
recurred for the second environment.

**Fix:** `findTerrainPlate` in `loadCity.ts` tries, in order — the configured
name, the sanitized name, `userData.name` (which preserves the original), and
finally a heuristic: the largest non-instanced mesh whose vertical extent is
under 20% of its span. The chosen path is reported as `terrainSource`.

**Lesson that generalises:** name-based lookup into a GLB is not reliable.
Prefer measurement and heuristics; always report which path was taken.

### 4.2 Silent degradation is worse than failure

The 3.6% outcome had *no error*. Now: if the plate cannot be found at all,
footprint insets are **disabled** and navigation uses the configured area, with
a `console.error` stating the edge will be visible. A `[navigation] bounds`
console group logs terrain source, plate, configured, visual, footprint reach,
effective bounds and the navigable percentage, warning below 50%.

### 4.3 Hardcoded world coordinates drift

Navigation bounds were hardcoded from audited constants. Now
`deriveBoundsFromTerrain: true` measures the plate's real `Box3` at load; the
constants are a last-resort fallback only.

### 4.4 `renderer.setSize(w, h, false)` vs. inline styles

`createRenderer`'s initial `setSize` writes **inline** width/height, which beats
the stylesheet. Passing `updateStyle=false` on resize left the canvas pinned at
its first size while the drawing buffer changed — and made
`getBoundingClientRect()` lie to the drag controller's pointer projection. Now
always `true`.

### 4.5 Raycast height sampling fell into a trench

The skirt originally sampled its join height by raycasting down at its inner
ring. Where the plate did not reach (see 3.4) the ray missed and fell back to
`box.min.y` — **2.5 units below the surface**, widening the visible gap. Removed
entirely: the skirt now joins the collar's flat outer edge, so the height is
known rather than sampled.

### 4.6 Lifecycle leaks in the original code

Pointer listeners registered anonymously and never removed; `DebugOverlay`'s
`keydown` never removed; `dispose()` never traversed the model to release
geometries/materials. Invisible with one environment; a per-transition leak with
two. All fixed.

### 4.7 Rotation sign: reasoning about the wrong motion

The first implementation of drag-to-rotate had the sign inverted, and the
reasoning that produced it is worth recording because it is seductive:

> Raising the azimuth moves the camera toward +X, i.e. to its own right. A
> camera moving right makes the world appear to move left. So to carry the
> ground right with the cursor, azimuth must *decrease*.

Every sentence is true and the conclusion is wrong, because this is an **orbit,
not a slide**. The camera also turns to keep looking at the focus, and that
rotation dominates for anything at or beyond the focus. Raising the azimuth
swings the camera's forward vector toward −X, so a point that was straight ahead
ends up further right in frame. Drag right therefore *increases* yaw.

**Lesson:** for orbital motion, do not reason from the camera's translation.
Project a fixed world point to screen before and after and look at which way it
went — which is what `checks/navigation-feel.ts` §3 now does on every run.

### 4.8 Momentum survived a pointer held still

Velocity was sampled only in `pointermove`. A pointer held motionless produces
no events, so it kept whatever speed it last had: press, sweep, **pause**,
release — and the view flung on a gesture that had ended at a standstill. Present
in the original translation-only code too; it only became obvious once the
inertia time constant doubled.

Fixed with an explicit bleed in `update()`: after `POINTER_STILL_GRACE` (50 ms)
without a move, velocities decay with a 50 ms time constant. A genuine drag
resamples every frame and never decays.

**Now unreachable at the shipped settings** — with `inertiaTimeConstant: 0`
there is no coast for a stale velocity to feed. The bleed is kept anyway, and §8
of the harness still exercises it *with momentum re-enabled*, because
`?inertia=` makes that path reachable at runtime. Deleting it as dead code would
be easy and rediscovering the bug would not be.

---

## 5. The central geometric constraint

The far edge of the visible ground sits at:

```
d_far = cameraHeight / tan(elevation − fov/2)
```

which **diverges** as elevation drops. For the 352-unit plate at FOV 35°, 16:9:

| Elevation | Height | Navigable Z | Navigable X |
|---|---|---|---|
| 40° | 45 | 273 | 230 |
| 35° | 70 | 185 | 103 |
| 30° | 45 | 191 | 124 |
| 30° | 70 | 101 | 60 |
| 25° | 45 | 60 | ~30 |

Three consequences:

1. **Below ~28° elevation the strict "never reveal the edge" rule collapses.**
   The far frustum edge overshoots the plate and effective bounds go negative.
   Hence `maxGroundDistance` clamping in `viewportFootprint.ts` — the "corner
   ray misses the ground" case is normal, not exceptional.

   **But the clamp is a safety net, not a working part.** If it fires at the
   configured pose, the footprint is being *under*-reported and the bounds maths
   believes the view is smaller than it is. At distance 165 it was firing on
   ultrawide in ordinary use; see §7. Treat a `clampedRays` flag at the shipped
   pose as a bug, not as the mechanism working.
2. **Lowering camera height recovers navigable area better than raising the
   angle.** 30°/h=45 gives both a better look and twice the area of 30°/h=70.
3. **Raising `lookAtHeight` tilts the camera up and widens the footprint.** It
   lowers the *effective* pitch below the rig's elevation, which costs skirt
   margin. This is the trade to watch when adjusting the view.

### The strategy this produced

Strict edge-hiding at the desired pose would have left ~19% of the map
navigable. Instead: **the skirt hides the edge, so the bounds follow content.**
The plan's phase order was revised accordingly — camera pose → transition →
bounds, because bounds depend on both.

Result: **the whole model is navigable** on every tested aspect **and at every
azimuth**, with the footprint term never binding. Verified by sweep, not
assumed — the azimuth term did not exist when this strategy was chosen.

---

## 6. Terrain edge treatment

Two parts, both in `src/environment/`.

**Collar** (`createTerrainTransition.ts` + `meshBoundary.ts`) — the exact
difference between the plate's real outline and its bounding rectangle,
triangulated with `ShapeUtils.triangulateShape` using the outline as a hole.
Opaque, cloned material. Fixes the background-coloured band that showed through
the gap. Heights interpolate from the plate's real edge height to the plate top.

`meshBoundary.ts` extracts boundary loops by welding vertices **by position**
first — a GLB splits vertices wherever normals or UVs differ, so raw index
comparison reports every seam as a boundary and the outline never closes.

**Skirt** — a rectangular fade continuing outward from the bounding rectangle.

### Decisions inside it

- **Fade alpha to zero rather than matching the background colour.** The
  renderer uses `ACESFilmicToneMapping`, but `scene.background` is written as an
  untone-mapped clear colour — a mesh authored to the background value renders
  visibly darker. Alpha is not tone-mapped, so the problem disappears.
- **Nothing is coplanar with the plate.** The collar sits `verticalOffset` below
  the top and tucks `innerOverlap` under the outline.
- **The fade is rectangular, not coastline-following.** Offsetting a concave
  outline outward self-intersects wherever a feature is narrower than the
  offset, and the skirt reaches 600 units on a 352-unit plate — nearly twice the
  plate itself. If the silhouette turns out to matter visually, the fix is a
  *bounded* offset — follow the outline for ~40 units, then blend to the
  rectangle — with a self-intersection guard.
- **Being a plate-aligned rectangle is what makes yaw expensive.** The viewport
  footprint turns; the skirt does not. That mismatch is most of the reason the
  width had to reach 600 (§7).
- **`fadeEndFraction` decouples gradient width from geometry width.** The skirt
  must reach far enough to stay out of frame; a gradient that wide would wash
  the horizon.

---

## 7. Current tuned values and why

All in `src/config/murciaConfig.ts`.

### Camera

| Value | Setting | Reasoning |
|---|---|---|
| `fov` | 35 | Mid-range of the 30–40 band. Proximity comes from distance, not a wide FOV. |
| `elevationDegrees` | 30 | Clearly less isometric than the original 44.2°, above the ~28° floor where bounds degenerate. |
| `distance` | 165 | Height 83 vs 13-unit buildings. Raised in stages: 90 (~84% of plate width), 110 (~97%), now 165. **Each step spends skirt margin — see *Terrain transition* below.** |
| `lookAtHeight` | 5.85 (0.45 × building) | Raised from 0.2× after "looking at the ground too much". Effective pitch ~27.3°. |
| `azimuthDegrees` | 0 | *Starting* azimuth only. The user yaws freely from here; `CameraRig` keeps that yaw separate so a resize re-resolving the pose cannot discard it. |

Was originally: FOV 60, distance 551, elevation 44.2°, derived from the bounding
sphere — the "isometric strategy game" look this work set out to replace.

### Navigation

`deriveBoundsFromTerrain: true`, `boundsInset: 0` (whole model navigable),
`dragThresholdPx: 6`, `groundPlaneHeight: 1`, `edgeSafetyMargin: 8`,
`maxGroundDistance: 800`.

`maxGroundDistance` was 500. At distance 165 on an ultrawide the corner rays
genuinely reach ~550, so the clamp fired in a *normal* case rather than the
near-horizon one it exists for — and it under-reported the footprint, which is
the unsafe direction: −37 measured where the truth was −170. Keep it above the
real worst-case corner reach.

### Controls — one gesture, both axes

    drag ↕   move forward / backward along the view direction
    drag ↔   rotate the rig horizontally about the focus, freely, 360°
    left button, right button, one finger — all identical

No gizmo, no modifier, no button. With nothing else available a single pointer
has to carry both, so each screen axis owns one. **The cost is that strafing is
gone** — there is no sideways pan. Free yaw pays for it: turn toward a place,
then advance.

Vertical rotation does not exist, and is absent rather than clamped: elevation
stays at the configured pose, so the Appendix A analysis the navigable area
depends on continues to hold.

Forward motion is solved against the ground, not from pixels, then scaled by
`translationGain` (0.5). Solving against the ground is what keeps sensitivity
consistent across the screen — a pixel near the horizon covers far more ground
than one near the bottom edge. The gain is the only sensitivity knob the axis
has; at 1 the grabbed point stays exactly under the cursor, and that fidelity
was spent on weight. Yaw is pixels→degrees normalized by viewport width. A
*turntable* solve
— yaw from the angle the grabbed point sweeps about the focus — was tried on
paper and rejected: its radius varies ~10× between the top and bottom of the
screen at this elevation, so sensitivity would depend on where the drag started.

### Drag feel — **weight is in the drag, not in a coast**

> **These exact values are signed off. 2026-08-06, first pass, no retuning
> needed.** The user drove the build and reported it as the feel they were
> after. This is the only part of the prototype with that status: every other
> number here is reasoned or measured, and this one was *judged*.
>
> Treat them as a fixed point. They are not a starting guess, and they are not
> independent of each other — see the note on the latency argument below.
> Changing any of them needs the same kind of justification that set them: a
> person driving the build and saying it feels wrong. A numeric argument is not
> sufficient grounds, because no number here can see what was being judged.

| | during drag | after release | inertia | min | max |
|---|---|---|---|---|---|
| translation | 0.09 | 0.08 | **0** | 1.5 | 260 u/s |
| yaw | 0.09 | 0.08 | **0** | 1.5 | 90 °/s |

Both use `velocityBlend: 0.25`; `translationGain: 0.5`;
`degreesPerViewportWidth: 120`.

**This reverses the previous design, recorded here because its reasoning is
sound and was still wrong.** It ran 0.05 / 0.30 / 1.1 s with no gain and 180°,
on the argument that positional lag during a drag reads as latency rather than
mass — the grabbed ground slides out from under the cursor — so weight belonged
in the settle and the coast.

Tested by hand (2026-08-06), that produced the two complaints that prompted this
change: the view **kept moving after the pointer stopped**, which reads as a loss
of control rather than as mass; and with no gain on a 1:1 ground solve the camera
covered far too much ground per pixel from 83 units up, which felt quick and
light. The latency argument also turns out to be conditional — it holds only
while the ground is *expected* to stay under the cursor, and a gain of 0.5 has
already given that up. That is what makes the longer 0.09 tracking constant
affordable, and it is where the smoothness now comes from.

Momentum is disabled by configuration, not deleted. `inertiaTimeConstant: 0` is
honoured by guards already present in `updateYaw` and `updateTranslation`, so
`?inertia=` turns it back on for comparison. `minInertiaSpeed` and
`maxInertiaSpeed` are inert while it is 0.

**Some travel after release is unavoidable and is not inertia.** Smoothing leaves
the focus behind its target during a drag, so releasing has a catch-up to finish.
It is bounded by `dragSpeed × smoothingTimeConstant` and decays from the moment
of release, where momentum was bounded by `dragSpeed × inertiaTimeConstant`
instead. On the same sweep: **8.7 units, 95% of it inside 0.25 s**, against
**139 units over 3.4 s** before. §6 of the harness asserts that bound rather
than a magic number — the first attempt asserted "travel < 1 unit" and failed
against correct code.

Reference given: **chartogne-taillet.com** — as *concept, not goal*. The site is
fully JS-rendered so no values could be read from it.

If a future change *does* have grounds to retune — a different camera pose, or
the second environment wanting its own feel — the order is: too fast →
`translationGain` / `degreesPerViewportWidth`; not smooth enough →
`smoothingTimeConstant`; drifting after release → `releaseTimeConstant`. All are
live as query parameters, so it is a browser session and not a rebuild cycle —
see *Live tuning* below. Record the outcome here either way, including "tried
and went back", which is the entry this section was missing the first time.

Behaviours worth preserving: grabbing mid-motion stops it; a tap never coasts;
**a gesture that ends at a standstill releases at a standstill** (see §4.8); the
drag re-anchors when the 6px threshold is crossed so the first frame does not
jump; smoothing is frame-rate independent via `1 − exp(−dt/τ)`.

### Live tuning

`src/config/environmentQueryOverrides.ts` — `?dragGain=` `?yawDeg=` `?smooth=`
`?release=` `?inertia=`, applied in the `CityPrototype` constructor after the
`?model=` override so the two compose. Separate from `appConfig`'s overrides
because these are environment-scoped rather than shell-scoped, and would have to
be applied per environment once there are two.

They exist because feel is a judgement no harness can make and an edit-rebuild
cycle is too slow to converge on one. **A tuning tool, not configuration** — a
settled value belongs in `murciaConfig.ts` with its reasoning.

### Terrain transition

`width: 600`, `fadeEndFraction: 0.25` (~150 units of visible gradient),
`loops: 10`, `segmentsPerSide: 12`, `fadeExponent: 1.6`, `innerOverlap: 0.5`,
`verticalOffset: 0.05`.

Width is sized so that with `boundsInset: 0` — focus reaching the plate
corners — the footprint lands inside the skirt at **5120×1440**, the binding
case, **at every azimuth**. Two things drove it up from 380:

- **distance 110 → 165** spent the whole margin. At 110 the worst corner had
  40 units; at 165 it was **−89** — the plate edge was already on screen for
  ultrawide users before any rotation work started.
- **free yaw** costs a further 50–85 units on wide viewports, because the
  frustum footprint turns against a skirt that is a plate-aligned rectangle.
  Portrait barely notices (−4 to −6), its footprint being near-symmetric.

Measured worst margins at 600 (`checks/` harness, 1° sweep): ultrawide **+50**,
16:9 **+229**, portrait **+306**. Navigable area stays **100% of the plate at
every azimuth on every viewport** — the footprint term never binds.

`fadeEndFraction` fell 0.4 → 0.25 in step, holding the visible gradient at ~150
units against the old 152. That is exactly what decoupling gradient from
geometry is for: the skirt must *reach* 600 units, but a 240-unit gradient would
wash the horizon.

---

## 8. Verification approach

The Chrome extension has never been connected, so **no assistant-side visual
verification has happened at any point** — all visual QA has been the user's.
Everything below is numeric. It is good at signs, magnitudes and geometry, and
says nothing about whether the result looks or feels right.

**The division of labour that worked**, and is worth repeating for anything
judged rather than measured: the numeric side proves the mechanism (sign,
bound, magnitude, no-regression), the query parameters put the judgement in the
user's hands directly, and the outcome comes back here as a decision. The drag
feel went from "reasoned defaults, unvalidated" to signed off in one pass that
way (§7). The failure mode it replaced was a long round-trip of the assistant
guessing at a feel it cannot perceive — which is how the rejected momentum
design survived as long as it did.

Everything numeric was verified by bundling the **real TypeScript modules** with
esbuild for Node and running harnesses against them. This caught real problems
and is the recommended method:

```
npx esbuild check.tmp.ts --bundle --platform=node --format=esm \
  --outfile=check.tmp.mjs && node check.tmp.mjs
```

One harness has been kept rather than discarded: **`npm run check:navigation`**
(`checks/navigation-feel.ts`). It drives the real `DragPanController` and
`CameraRig` through synthetic pointer sequences against a stub DOM element —
25 assertions covering translation sign and ground fidelity, axis isolation,
rotation direction, 360° accumulation, forward-relative-to-heading, the release
behaviour, bounds, and the standstill-release rule. It found both bugs in §4.7
and §4.8, and a third when inertia was removed: with the momentum branch no
longer running, nothing cleared the recorded velocity on release, so
`isSettling` would have stayed true for the rest of the session
(`settleReleaseVelocity` now drops it per axis). Run it after touching anything
in `src/navigation/` or `src/camera/`.

Verified this way: footprint and effective bounds across five viewports; the
safety net at extreme aspects and low elevations; skirt geometry (winding, alpha
range, vertex counts, `color` attribute `itemSize=4` for `USE_COLOR_ALPHA`);
boundary extraction on unindexed geometry; collar gap coverage (100% on an
irregular plate, river hole correctly left open); the rectangle regression; and
the full azimuth sweep behind the §7 skirt width.

**Two habits that made these harnesses trustworthy**, both worth repeating:

- *Cross-check the measurement against the shipped function.* The azimuth sweep
  computed corner ground hits itself (it needs the points, not just the reaches)
  and asserted its own axis-aligned extents matched `computeGroundFootprint` to
  0.00 units. Without that it could have been measuring something adjacent.
- *Validate against a recorded number.* The sweep independently reproduced this
  document's "40 units at 5120×1440, distance 110" before being trusted on any
  new configuration.

**Watch for the harness testing itself.** Three of the first failures were the
test's fault, not the code's: a 960 px pointer move delivered in a single 16 ms
sample (a 60,000 px/s flick) asserted to produce no coast, and a weight
comparison that drove into the navigable boundary and so compared walls rather
than momentum — the *heavier* setting hit the wall sooner and read as travelling
less. A failing assertion is a question, not a verdict.

**Caveat learned the hard way:** the first harness constructed plate bounds
*directly* rather than resolving them by name, so it validated the maths and
never the lookup — which is exactly where bug 4.1 lived. **Harnesses must
exercise the real resolution path, not a convenient stand-in.**

Note the meshes set `raycast = () => {}` so they never intercept object picking;
a probe must restore it to measure coverage.

---

## 8b. District interaction (added 2026-08-07)

The first interactive content in the prototype: a district that highlights on
hover, flies the camera to itself on click, and opens a services panel.

### The asset does not contain the district

The Blender collection is called `edificios_servicios`. **It does not exist in
the GLB.** All 294 node names were dumped to confirm it: the glTF exporter
flattens collections and only object names survive. This is §10.14 and it is the
fact the whole design had to route around.

`resolveDistrict` (`src/interaction/resolveDistrict.ts`) therefore resolves in
layers, reporting which one fired — the same discipline `findTerrainPlate` uses,
for the same reason:

```
userData.district === tag   ->  'tag'    the production mechanism
configured node names       ->  'name'   all three spellings (§4.1)
world XZ rectangle          ->  'rect'   development only, gated + loud
                            ->  'not-found'  feature left entirely inert
```

**Stand-in today:** `blog_edificios` + `blog_edificios.001`, a real non-instanced
cluster at X [-381, -299] Z [156, 212]. When the objects carry
`district = "servicios"` the tag path wins automatically and no code changes.
The Blender side is written up in `docs/blender-export-contract.md`.

`allowSpatialFallback` is a field on the binding, **not** `import.meta.env.DEV`.
Nothing in `src/` reads `import.meta.env`, and `checks/` bundles these modules
for Node with esbuild where it does not exist — reading it inside the resolver
would have broken the harness that tests the resolver.

### Exclusive camera ownership — the defect worth remembering

The first design suspended *pointer input* during a flight. That is not enough,
and the reason is §10.16: `DragPanController.update()` writes the rig
unconditionally. A flight would move the rig and the controller would ease it
back toward its stale drag targets on the same frame, every frame.

The fix is a lifecycle, not a filter: `beginExternalControl()` makes `update()`
return **before** touching the rig; `endExternalControl({adoptRigState:true})`
reads focus and yaw back off the rig into the controller's current *and* target
state. Section 2 of `checks/district-flight.ts` asserts both, and also asserts
that *without* adoption the view snaps back 37.8 units — so the guard is
demonstrably load-bearing rather than decorative.

Cancellation uses a **capture-phase** `pointerdown` listener on the canvas. It
runs before the controller's own constructor-registered handler, so the press
that stops the flight is also the press that starts the drag — no synthetic
re-dispatch, and no dead first gesture. Its `pointerup` is suppressed (§10.17).

### The flight moves focus and yaw only

Distance, elevation and FOV are untouched, so the ground footprint is unchanged
and everything in §5, §6 and §7 still holds with no re-measurement. This was a
deliberate scoping decision, not an oversight — §10.6 makes a pose change a
much larger job.

Yaw uses the shortest signed delta added to the rig's unbounded yaw, so 350° → 10°
travels +20° and a wound-up 730° stays wound up. The flight integrates
`elapsed / duration` through an ease-in-out curve rather than the project's usual
`1 - exp(-dt/τ)`: it needs a defined endpoint, and frame-rate independence then
holds by construction (verified identical at 30/60/120 fps, spread 0.0).

*Desired* and *feasible* focus are kept separate. The destination is never
rewritten by a frame that happened to be clamped, so a trajectory grazing the
navigable edge still arrives exactly where it was aimed.

### Framing around the panel

The district must not land behind the UI. The offset is computed as: centre of
the unobstructed region → NDC → raycast to the navigation plane → point P →
focus = target + (target − P).

That is **exact, not approximate**. Moving the focus by d moves the camera by d,
so the point under a given NDC moves by exactly d; the round trip verifies to
1e-4 on every viewport including 5120×1440 and an offset canvas.

Two things that are easy to get wrong and are now asserted:

- **Measure from real DOM rects**, not the breakpoint, and relative to the
  *canvas* rect rather than the viewport — neither "the canvas fills the window"
  nor "the panel is flush with its edge" survives the app-shell extraction.
- **Never mutate the live rig to take the measurement.** `computeFramedFocus`
  builds a detached `CameraRig` on a throwaway camera. Pointing the real rig at
  the destination would jump the camera for a frame and fire `onYawChanged` →
  `recomputeBounds()` as a side effect.

The panel is measured with `offsetLeft/Top/Width/Height`, not
`getBoundingClientRect()` — see §10.18, which cost a real bug during
implementation.

### Look: emissive, not lights, and no halo

There is no post-processing in this project, so emissive makes a surface read as
self-illuminated; it does **not** bloom into the air. The ground marker supplies
the spread. Dynamic lights are ruled out separately by §10.4.

Materials are cloned **by original identity** (`Map<original, clone>`), not one
clone for all — that would work only while the GLB ships zero materials, and the
texturing work will end that. Originals are recorded and restored before the
clones are disposed (§10.19). Authored emissive is scaled, never overwritten, so
the future `districtPart = "emission"` strips keep their modelled look.

Idle intensity is deliberately **non-zero**, because there is no hover on touch.

### Mobile is not a smaller desktop

At 30° elevation the screen's vertical axis maps to *distance*: the bottom of
frame is near foreground, the top is the far city. A bottom sheet therefore
covers the cheapest part of the image, where a side panel on a narrow screen
would cover the city. Two stops (~40% / ~85%); the camera frames for the peek
stop and **does not** re-frame when the sheet expands — at 85% the user has
chosen content over scene, and chasing the remaining strip reads as instability.

**Buildings are not small touch targets**, contrary to the assumption that
usually drives a picking proxy. Measured at the shipped pose, scale at the focus
plane is ~8.7 px/unit at 1440×900 and ~8.1 px/unit at 390×844, so a 13-unit
building is ~105 px wide. The proxy exists for two other reasons: the marker is
the affordance and must itself be clickable, and the gaps between buildings
should not be dead space.

Accessibility is carried by the projected label, which is a real `<button>`: a
raycast cannot be tabbed to or activated by Enter.

### The panel content (extended 2026-08-07, same day)

The panel now carries real copy: a `summary` (one sentence, sized to survive the
40% mobile peek stop), a longer `intro`, and five services as **single-open
accordion sections**, the first open on arrival. All-collapsed reads as a menu
rather than as content, and several open at once loses the reader's place in a
380px column.

`src/content/districts.ts` holds `DistrictService { id, title, body }`. The `id`
wires `aria-controls` to the region, so duplicates would point two headers at one
panel — invisible unless you use a screen reader, hence asserted.

**Height animates with `grid-template-rows: 0fr → 1fr`, not `max-height`.**
`max-height` needs a number bigger than any real body; whatever it is, the
visible motion finishes early and the transition spends the remainder doing
nothing, because the easing applies to the guess rather than to the content. The
`fr` track animates to genuine `auto`. It needs an inner wrapper with
`min-height: 0` — grid items default to `min-height: auto` and refuse to shrink
below their content, which would hold the section open at `0fr`.

**Two ordering traps, both hit during implementation:**

- `.reveal` and `.district-service-region` are both single-class selectors, so
  whichever is declared last wins the `transition` shorthand outright. With
  `.reveal` last the accordion silently stopped animating its height. The
  utility now precedes the components, and `checks/` verifies the order in the
  *built* CSS rather than the source.
- `buildSections()` opens section 0, which routed through the same path as a tap
  — including the mobile auto-expand. On a phone the sheet jumped to 85% the
  instant the panel opened and the peek stop was never seen. `setOpenSection`
  now takes `fromUser`, and only a gesture raises the sheet or scrolls.

**Opening a section does not re-frame the camera**, and this is deliberate rather
than an omission: the desktop dock is fixed-width and full-height and the mobile
sheet's height is set by its stop, so section height changes only inside the
scrolling body. `getObstructionRect()` returns the same rectangle. The mobile
auto-expand does not re-frame either, consistent with the existing rule above.

### Verification

`npm run check:district` — 52 assertions over the real modules. Unlike
`check:navigation` it sets a non-zero exit code, so it can actually fail a build.
`npm run check:navigation` still passes 25/25 unchanged; **no drag-feel value was
touched.**

The accordion itself is DOM and CSS behaviour and there is no jsdom here. A
hand-rolled DOM shim was deliberately *not* written: it would have tested the
shim, which is the stand-in trap §8 exists to warn about. What is asserted is the
content shape and the built CSS cascade order; the interaction is the user's to
judge.

Still unjudged by human eyes: everything visual. The Chrome extension remains
unconnected, so §8 continues to hold — no assistant-side visual verification has
happened at any point.

---

## 9. Where things stand

**Done** — revised plan steps 2–6: config split, drag-only navigation with
weight, camera rig and pose, terrain collar + skirt, navigation bounds with
footprint insets, plus dead-code removal and disposal.

**Added after the plan** (2026-08-05): free 360° horizontal rotation on the same
drag gesture, the two-phase weight model, and the skirt resize that both
required — see §7 for all three.

**Revised after the first hands-on test** (2026-08-06): the weight model was
replaced. Inertia removed, input geared down, feel exposed as query parameters —
§7 *Drag feel* and *Live tuning*. Nothing about the camera pose, bounds or skirt
changed, so the §7 measurements still stand.

**Navigation feel is now settled** (2026-08-06, same day): the replacement was
driven by the user and accepted as-is, first pass, with none of the query
parameters needing to move. Drag navigation is the first part of this prototype
to be *finished* rather than plausible. Everything else visual — the composition,
the monochrome look, the rectangular fade — is still unjudged (§9).

**Added 2026-08-07** — the district interaction: resolver, highlight with ground
marker and picking proxy, camera flight with panel-aware framing, desktop panel /
mobile peek sheet, and the `DistrictInteraction` state machine. See §8b. This is
the first *content* in the prototype; everything before it was navigation.

**Removed** — `InputController`, `PlayerController`, `GroundResolver`,
`MapCameraController`, `NavigationBoundary`, `NavigationDebugView`,
`prototypeConfig` (the abandoned first-person stack, ~600 lines).

**Remaining** — plan steps 7–13: optional fog, app-shell extraction, the
environment lifecycle from §2.4, obsolete-code sweep, migration-readiness check,
final documentation.

### Open questions

**Closed 2026-08-06** — kept here because both were open long enough to shape the
code, and a reader finding the old wording elsewhere should see they were settled:

- ~~The drag feel is unvalidated by human hands.~~ **Validated, and the original
  design rejected.** Inertia removed, input geared down, accepted first pass.
  §7 *Drag feel*.
- ~~Whether 180° per viewport width is the right rotation sensitivity.~~ **No —
  120°.** Judged in the same pass.

Still open:

- **Whether losing strafe is acceptable.** Free yaw was chosen over sideways
  panning because one gesture cannot carry three axes. If it turns out to
  matter, the fallback is dominant-axis locking at drag start — modal, and worse
  in every other respect. *Note this survived the feel review* — the gesture was
  driven at length without strafe being raised, which is weak evidence for it,
  not a decision.
- `initialFocus` is the plate centre — chosen arithmetically, never validated
  visually. The plan asks for a deliberate composition. Note it now also
  determines the starting *heading*.
- Whether the rectangular fade reads correctly, or the coastline needs following
  (§6).
- The GLB has no materials; the monochrome look has not been confirmed as
  intended.
- ~~Interactive objects need `extras` in the Blender export before selection can
  be tested.~~ **Worked around, not closed** (2026-08-07). `resolveDistrict`
  resolves by node name against a stand-in cluster so the interaction is
  testable now; the `extras` tag remains the production mechanism and the
  district is still a placeholder until the re-export lands. See §8b.
- **The whole district interaction is visually unjudged.** Marker legibility,
  glow strength, flight duration, approach yaw and the panel timing are all
  reasoned or measured, none judged — the same status the drag feel had before
  it was driven by hand and rewritten. Expect the numbers in
  `defaultDistrictHighlightConfig` and `CameraFlight` to move.
- `approachYawDegrees: -35` for the services district was chosen to keep the
  river strip out of the composition. That is a guess about framing, not a
  measurement.
- **The service copy is placeholder**, written to give the layout realistic text
  lengths. It is marked as such in `src/content/districts.ts`.
- **Language is inconsistent and undecided**: the district label is Spanish
  (`Servicios`), the body copy is English. Inherited rather than chosen; settle
  it before anyone outside the team sees it.

### Migration readiness checklist

1. No module reaches for a global renderer, Scene, camera or config.
2. Content lives under a single root that can be added to and removed from the
   Scene.
3. Camera pose, bounds and transition parameters are environment configuration.
4. `background`, `fog` and lighting are supplied as data.
5. The environment exposes `load()` / `activate()` / `deactivate()` /
   `dispose()` with §2.4 semantics.
6. Repeated activate/deactivate shows no growth in listeners, geometries,
   textures or programs (`renderer.info`).

Items 1–4 hold today. 5 and 6 are the remaining work.

---

## 10. Things that will bite you again

1. **Blender node names lose `[ ] . : /` in three.js.** Never trust
   `getObjectByName` against a GLB.
2. **All meshes share one material instance** while the GLB ships no materials.
   Clone before touching anything.
3. **`scene.fog` is global** and will leak across environments during a
   crossfade.
4. **Changing the light count** recompiles every shader — a stall at the worst
   moment.
5. **The plate is not a rectangle** and does not fill its bounding box.
6. **Lowering the camera, pulling it back, or raising `lookAtHeight` widens the
   ground footprint** and spends skirt margin. Re-run `checks/` and re-check
   `terrainTransition.width` after *any* camera change. Going 110 → 165 silently
   put the plate edge on screen for ultrawide users.
7. **Ultrawide is the binding aspect** for skirt coverage, not desktop.
8. **The footprint is azimuth-dependent**, so with free yaw the navigable bounds
   change every frame of a rotation. `DragPanController` fires `onYawChanged`
   for this. Anything that assumed a fixed azimuth — including any *analysis* —
   needs re-checking across a full sweep, not at azimuth 0.
9. **Bounds must clamp the drag target, never the rendered focus.** Snapping the
   focus was harmless when bounds only changed on resize; with yaw it would jerk
   on every frame of a turn.
10. **`CameraRig.setPose` is called on every resize.** User yaw is deliberately
    stored outside the pose so it survives that. Do not fold it back in.
11. **Silent degradation** — anything that can fail to find an object must log
    loudly and degrade to something *usable*, never to a technically-valid
    sliver. `maxGroundDistance` clamping is the same trap in numeric form: it
    under-reports the footprint, so a value set too low hides an edge that is
    actually visible.
12. **The drag feel numbers are hand-validated and signed off** (§7). They are
    the only judged values in the project. Do not "improve" them from reasoning,
    and do not treat a camera-pose change as licence to adjust them silently —
    `translationGain` interacts with the pose, so if distance or elevation moves,
    say so and let a person re-judge it.
13. **A failing assertion is a question, not a verdict.** Three of the first
    harness failures were the test's fault, and so were the first three after
    inertia was removed: they asserted zero post-release travel when the correct
    behaviour is a bounded catch-up. Check what the number *should* be before
    changing the code to satisfy it. *(Happened again in the district work: an
    assertion that an exact half turn yields +180 failed against a formula whose
    range is [−180, 180). The formula was right; the assertion had been written
    from prose rather than from the formula.)*
14. **Blender collection names are not exported.** The glTF exporter flattens
    collections — only object names become nodes. A collection can never be a
    runtime contract. Use custom properties, which land in `extras` and then in
    `userData`. See `docs/blender-export-contract.md`.
15. **The raycaster reads `layers`, never `visible`.** In the pinned r171,
    `intersect()` tests `object.layers.test(raycaster.layers)` and never looks at
    `object.visible` (`three.core.js:34655`). An object hidden with
    `visible = false` is still picked. A picking proxy is controlled by layers or
    not at all.
16. **`DragPanController.update()` is an unconditional rig writer.** It calls
    `rig.setFocus`/`rig.setYaw` whenever its stored targets differ from the rig,
    so anything else that moves the rig will be fought frame by frame. Gating
    pointer input does *not* stop it — use `beginExternalControl()` /
    `endExternalControl({adoptRigState:true})`.
17. **A tap that cancels something still fires `pointerup`.** The click guard
    tests only the drag threshold, so a sub-threshold "tap to cancel" falls
    straight through into selection. Suppress the cancelling pointer's own
    pointerup, and clear the suppression on `pointercancel` too.
18. **`getBoundingClientRect()` reports the *transformed* box.** Measuring a
    panel for camera framing at the moment it opens returns its off-screen entry
    position, and the framing offset comes out as zero. Use `offsetLeft/Top/
    Width/Height`, which are layout values and ignore transforms.
19. **Cloned materials must be un-assigned before they are disposed**, or the
    mesh keeps a dangling reference across a remount — and `disposeLoadedCity`
    frees the clone while never reaching the original it was written to free.
