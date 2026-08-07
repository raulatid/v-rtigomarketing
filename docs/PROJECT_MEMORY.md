# Project Memory

Durable context for the VertigoSEO web experience: what this is, what exists, the numbers
that keep mattering, and what will bite you again.

It exists so none of this has to be re-derived. Keep it current.

Last updated: 2026-08-07 · current at commit `85a419a`

> **Scope.** Facts and traps. The *reasoning* behind binding decisions lives in
> `DECISIONS.md` and `adr/`; the *history* of how the code got here lives in
> `integration/00-migration-log.md`. When something here stops being true, change it — this
> file is worthless the moment it is stale, and its predecessors in the two source
> prototypes both rotted in exactly that way (`murcia-test/README.md` still describes a
> first-person controller that was deleted).

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

---

## 2. Stack and commands

React 19 · `@react-three/fiber` 9.6 · **three 0.174** · gsap 3.12 · Vite 5 ·
TypeScript 5.6 · `vite-plugin-glsl` · stats.js

```
npm run dev            # dev server
npm run build          # tsc -b + intro simulation + vite build (budgets asserted)
npm run preview        # serve dist/
npm run check          # typecheck + all four harnesses  ← run this
npm run check:warp     # 23 assertions — the camera-distance envelope
npm run check:navigation   # 25 assertions — drag feel, signs, bounds
npm run check:district     # 52 assertions — flights, framing, materials
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

---

## 5. The number that can hurt you

**Murcia's camera distance must never exceed 165.**

Ground reach grows ≈**1.33 world units per unit of distance**. The terrain skirt is sized
for distance 165, and the measured worst-case margin is:

| Viewport | Margin |
|---|---|
| 5120×1440 (ultrawide) | **+50 units** ← binding |
| 16:9 | +229 |
| Portrait | +306 |

So distance ≈200 puts the plate edge on screen **for ultrawide viewers only**, silently,
with nothing visibly wrong on a normal monitor. `murcia/PROJECT_MEMORY.md` §10.6 records
this happening once already: "Going 110 → 165 silently put the plate edge on screen for
ultrawide users."

Closer is **not** always safer either. Below ≈60 the fixed `lookAtHeight` (5.85) tilts the
camera up relative to the rig, the effective pitch collapses through the ~28° floor where
the bounds maths degenerates, and the footprint widens again. Below ≈23 the top frustum edge
crosses the horizon and the footprint is reported as the `maxGroundDistance` 800 clamp.

The warp dolly runs **165 → 75 → 165**. `npm run check:warp` asserts it never leaves
[60, 165] over a 2000-sample sweep. **Nothing else guards this.**

Any camera change — distance, elevation, `lookAtHeight`, FOV — invalidates the skirt margin
and requires re-running the azimuth sweep. It is a much larger job than it looks.

---

## 6. Numbers worth knowing

**Murcia camera:** fov 35 · elevation 30° · azimuth 0° · distance 165 · `lookAtHeight` 5.85 ·
near 1 · far 1200 · camera height 82.5. Effective pitch ≈27.3°, because `lookAtHeight` is a
constant rather than a fraction of distance.

**Murcia plate:** X [−438.2, −86.4] · Z [120.5, 473.3] · 351.8 × 352.8 · top surface at
Y 1.41. Skirt width 600, `fadeEndFraction` 0.25.

**The GLB** (`/models/city-prototype.glb`, 456 KB, Draco + `EXT_mesh_gpu_instancing`):
294 nodes · 111 meshes · 957 GPU-instanced buildings · **0 materials · 0 textures · 0
`extras`**. All meshes therefore share one default `MeshStandardMaterial` — always clone
before modifying. And with no `extras`, districts resolve by **node name**, not by tag.

**Warp:** duration 1.6s · cut at 0.5 · Earth FOV 45→74 · Earth radius ×0.25 at closest ·
Murcia 165→75 · flash reaches full black.

**Build budgets** (asserted; the build fails, it does not warn):

```
intro entry   12 996 B / 16 000 B   ← must have LITERALLY ZERO imports
app entry    300 787 B / 320 000 B  ← ~19 KB headroom
```

Emitted chunks: `three` 814 KB · `SceneCanvas` 199 KB · entry 301 KB ·
`MurciaExperience` 68 KB · `createCornerLogo` 3.6 KB · `intro` 13 KB.

---

## 7. Things that will bite you again

1. **The intro entry must import nothing.** It is a separate Rollup input whose script tag
   is injected head-prepend, because Vite concatenates every module script in a document
   into one chunk. One stray value import — even something that looks like a type — pulls
   three.js back in and fails the build. That assertion has already caught it once.
2. **`rig.getPose()` returns `murciaConfig.camera` by identity.** Mutating it corrupts the
   config for the rest of the session. Always build a fresh pose object.
3. **`DragPanController.update()` is an unconditional rig writer.** Gating pointer input does
   not stop it. Use `beginExternalControl()` / `endExternalControl({ adoptRigState: true })`
   — and note `externalControl` is a plain boolean shared with `setActive` and every district
   flight, so sequencing matters.
4. **The focus rig's `activate()` is destructive.** It reseeds from the overview pose. To
   suspend it without losing the viewer's position, stop calling `update()`; never toggle
   activation.
5. **`setViewport()` re-resolves Murcia's pose on every resize.** Anything animating the
   pose must compose with it or a resize will snap it back.
6. **The raycaster reads `object.layers`, never `object.visible`.** Murcia's picking proxies
   depend on this (`INTERACTION_LAYER = 1`). Earth must not use layer 1.
7. **GLTFLoader strips `[ ] . : /` from node names.** `Plane.013` becomes `Plane013`. This
   once collapsed the navigable area to 3.6% of the plate.
8. **Murcia's ground footprint is azimuth-dependent.** With free yaw the navigable bounds
   change every frame of a rotation, so any analysis at a fixed azimuth is invalid.
9. **Both experiences' input listeners share one canvas.** Earth's satellite focus and geo
   markers listen on `window`; Murcia's controllers listen on the canvas. Everything must be
   gated on which experience is active, or the inactive one silently accumulates state.
10. **GSAP's `lagSmoothing`** clamps the per-tick delta to 33 ms once a frame exceeds 500 ms.
    On slow hardware a 1.6 s warp stretches over tens of seconds. Correct behaviour, but it
    invalidates any wall-clock-driven test and will mislead you when profiling.
11. **Kill stale dev servers.** Three accumulated across sessions here, and the one being
    viewed served a stale module graph producing a `ReferenceError` that looked exactly like
    a circular import. It cost real time twice. Check the port before debugging a phantom.
12. **Murcia's stylesheet was globally hostile** and is now scoped to `.murcia-ui`. Its
    declaration order is load-bearing: `.reveal` must stay declared before
    `.district-service-region`, or the accordion silently stops animating.

---

## 8. State of the work

**Done.** Both experiences migrated and running in one app. Single renderer, verified as one
canvas. Reversible Earth ⇄ Murcia warp with the dolly, prefetch and GPU warm. Globe marker
as the entry point. Spanish throughout.

**Verified in a browser**, not merely asserted: one canvas across three round trips; Murcia
renders with terrain, districts and highlight; Earth restores with correct FOV and no
residual dolly; Murcia's camera returns to exactly `distance 165 / height 82.5` after a warp;
zero console errors; the caption sequence under throttling.

**Not verified.** The warp **at frame rate**. Software WebGL runs the city at ~2 fps and
`lagSmoothing` then distorts every mid-transition frame, so how the motion actually *feels*
is unjudged. The timings in `app/warpTransition.ts` are reasoned and endpoint-asserted but
tuned blind — they need a person on real hardware.

### Known debt

| | Why it is deliberate |
|---|---|
| **Vite pinned at 5** | The two custom build plugins are validated only against 5. A bundler bump deserves its own verification pass, not a ride-along inside a migration. |
| **`noUncheckedIndexedAccess` off** | Murcia was written under it, Earth was not. Enabling it repo-wide produces 36 errors, 16 of them inside the 16 KB intro budget. Restore in a dedicated pass. |
| **Placeholder content** | Case studies and geo-marker metrics are invented. `data/caseStudies.ts` says so at the top. The API seam is `SATELLITES` in `orbitConfig.ts`. |
| **District resolves by node name** | The GLB carries no `extras`. Fix is in Blender — see `murcia/blender-export-contract.md` — not in code. |
| **Two KTX2 loaders** | `createSatellite` and `createCornerLogo` each build one; three warns. Harmless, worth consolidating. |
| **Corner logo z-order** | Composites at z 10, so geo tags at z 15 can paint over it. Accepted in `adr/002`; unlikely in practice, never observed. |

---

## 9. Map of the code

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
├── experiences/murcia/        the city — its own Scene, camera, rig, UI
├── shaders/, utils/, loading/, data/
checks/                        the behavioural harnesses
scripts/simulate-intro.mjs     runs on every build
```

`app/warpTransition.ts` is deliberately free of three, React and the DOM, so `checks/` can
drive the real curves rather than a reimplementation. Keep it that way.
