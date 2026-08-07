# Migration Log

Per-phase record required by `docs/plans/000-migration-plan.md` ("Execution Rules").
Format: Goal / Files / Implementation / Behavioural changes / Verification / Problems / Risks.

---

## P0 — Establish the clean application shell

**Goal.** A buildable unified shell carrying Earth's build constraints and Murcia's
regression harness, before either experience is restructured.

**Files.** Whole-repo scaffold. `package.json`, `package-lock.json`, `tsconfig.json`,
`vite.config.ts`, `index.html`, `vercel.json`, `.gitignore`, `scripts/`, `public/`,
`src/` (Earth, verbatim), `src/experiences/murcia/` (Murcia modules, verbatim),
`checks/`, `docs/adr/001-*`, `docs/earth/DECISIONS.md`, `docs/murcia/*`.

**Implementation.**

- Scaffolded from `starting-animation` rather than from scratch: it carries the hardest
  constraint in the project — the two-Rollup-entry intro build, the head-prepend script
  injection, the zero-import assertion on the intro chunk, and `simulate-intro.mjs`.
  Recreating that from a blank Vite template would have been the riskiest possible start.
- Copied Murcia's source under `src/experiences/murcia/` and its `checks/` harness at P0
  rather than at P4, so the 77 assertions gate **every** phase, not just the port.
  `main.ts` was dropped (module-scope side effects; replaced by `MurciaExperience` in P4).
  Check imports rewritten `../src/` → `../src/experiences/murcia/`.
- Merged dependencies onto **three 0.174** (R3F 9's peer), adding `stats.js`.
- Restored `starting-animation`'s `package-lock.json` so every other version stays exactly
  as validated (see Problems).

**Behavioural changes.** None intended. Earth is untouched; Murcia is not yet wired to
anything.

**Verification.**

| Gate | Result |
|---|---|
| `npm run check:navigation` | **25/25 pass** |
| `npm run check:district` | **52/52 pass** |
| `npx tsc --noEmit` | clean (1 error found and fixed, below) |
| `npm run test:intro` | all cases pass |
| `npm run build` | succeeds; chunk budgets **ok — intro 12 005 B (5 388 B gz), app entry 298 833 B (100 642 B gz)** |

**The three 0.171 → 0.174 bump is empirically verified, not merely inspected.** All 77
Murcia assertions pass on the new version, including the ones that encode real historical
bugs (translation/yaw sign, rig-ownership snap-back, frame-rate independence,
canvas-relative framing, material clone-and-restore).

Emitted chunk hashes — `index-7AV2VSNh.js`, `intro-Cijs8iTI.js`, `SceneCanvas-CBQbYOnj.js`,
`KTX2Loader-K_BAc2bA.js` — are **identical to the source project's**, which is direct
evidence Earth came across byte-for-byte.

**Problems discovered.**

1. **Lockfile drift.** Installing from `package.json` ranges alone resolved
   `vite-plugin-glsl` to 1.6.1, which peer-requires `esbuild >= 0.25` and conflicts with
   Earth's pinned `esbuild 0.21.5`. Fixed by restoring Earth's `package-lock.json`
   (`vite-plugin-glsl` 1.3.3, `vite` 5.4.21, `three` 0.174.0) so only `stats.js` was added.
2. **`noImplicitOverride`** (adopted from Murcia's tsconfig) flagged one genuine miss in
   Earth: `OrbitCurve.getPoint` overrides `THREE.Curve.getPoint` without the modifier.
   Fixed in `src/orbit-system/orbitUtils.ts:24`.

**Deviations from the approved plan.**

- **Vite 5, not Vite 6.** The plan said unify on 6. Earth's `vite.config.ts` contains the
  two fragile custom plugins (`introEntry`, `assertChunkBudgets`) validated only against
  Vite 5, and Murcia needs nothing from Vite 6 beyond `build.target`/`sourcemap`, both
  available on 5. Bumping the bundler is a separate change with its own verification, and
  mixing it into the migration violates the "preserve behaviour first" rule. **Debt:** bump
  Vite in an isolated step where the chunk assertions verify it.

**Remaining risks / debt.**

- **`noUncheckedIndexedAccess` is currently off.** Murcia was written under it; Earth was
  not. Enabling it repo-wide produces 36 errors, all in Earth — 16 of them in
  `intro-draw/introDraw.ts`, which lives under a build-enforced 16 KB budget with ~4 KB
  headroom, so adding guards there spends a real constraint. The flag changes no emit, so
  Murcia's runtime is unaffected by its absence. **Restore repo-wide in the
  post-integration pass**, not during migration (`ENGINEERING_PRINCIPLES` §19, §21).
- No ESLint exists in either source project. `npm run lint` is deliberately **not**
  defined rather than stubbed — `ENGINEERING_PRINCIPLES` §37, do not invent a gate that
  does not exist. `npm run check` runs the gates that are real.
- `src/experiences/murcia/app/CityPrototype.ts` and `core/createRenderer.ts` are carried
  over but unreferenced. Kept deliberately so P4 is a diff against working code rather than
  a rewrite; both dissolve in P4.
- Murcia's `styles/main.css` is present but not imported — it is globally hostile
  (`*`, `html, body, #app`, a bare `canvas` rule) and must be scoped in P4 before use.

---

## P1 — Migrate Earth

**Goal.** Earth running in the unified repo with behaviour preserved.

**Implementation.** Satisfied by P0's scaffold: Earth was copied verbatim and the emitted
chunk hashes matched the source project's exactly. The structural relocation into
`src/experiences/earth/` was **deliberately deferred to P3**, where an `EarthExperience`
module with `activate()`/`deactivate()` gives it a reason to exist. Moving files now would
be churn without a motivating need (`ENGINEERING_PRINCIPLES` §7, §21).

**Verification.** Build green, budgets green, all runtime assets serve 200 from the dev
server (`/earth/*.jpg`, `/models/*.glb`, `/textures/*.ktx2`, `/draco/*`, `/libs/basis/*`).

**Also verified.** Earth's and Murcia's `public/draco/*` are byte-identical (md5), so the
two experiences can share one `/draco/` — this de-risks P4's decoder-path fix.

---

## P2 — Single render pipeline

**Goal.** One `WebGLRenderer`, one frame loop, one render authority. Fold the corner
logo's second renderer into it.

**Files.** Added `src/graphics/RenderPipeline.tsx`, `src/components/CornerLogoLayer.tsx`.
Removed `src/components/MotionBlurPass.tsx`, `src/hooks/useCornerLogo.ts`. Modified
`src/corner-logo/createCornerLogo.ts`, `src/components/SceneCanvas.tsx`, `src/App.tsx`,
`src/styles.css`, `vite.config.ts`.

**Implementation.**

- `RenderPipeline` replaces `MotionBlurPass` as the sole `useFrame` priority-1 render
  authority. Per frame: `composer.render()` for the main scene, then the corner logo as an
  overlay pass with `autoClear = false` and an explicit `clearDepth()`.
- `createCornerLogo` no longer creates a renderer, a canvas, a rAF loop or a resize
  listener. It now takes the shared renderer, and exposes `scene`, `camera`, `update`,
  `setSize`, `isDrawable`. Its `reset()` no longer calls `renderer.clear()` — that would
  wipe the shared framebuffer.
- The logo moved **inside** the Canvas (`CornerLogoLayer`) because the shared renderer is
  only reachable there. Its refs stay owned by `App`, which needs `reset()`/`snapToCorner()`
  for replay and seek, so they are threaded down like `orbitSystemRef` already was.

**Verified assumptions** (read against three 0.174 / R3F 9.6, not assumed):

- `EffectComposer` sets `renderToScreen` on the last enabled pass, so `OutputPass` resolves
  to the default framebuffer before the overlay pass draws.
- R3F's `<Canvas>` default is `dpr = [1, 2]` — identical to the logo's old explicit
  `Math.min(window.devicePixelRatio, 2)`. No resolution change.
- Tone mapping is applied once per scene, not twice: three gates it on
  `currentRenderTarget === null`, so the composer's targets stay linear and the logo's own
  in-shader ACES/sRGB applies only on its direct-to-canvas draw.

**Behavioural changes (deliberate).**

1. **One WebGL context instead of two.** `grep` confirms the only remaining
   `new WebGLRenderer` in `src/` is Murcia's unwired `createRenderer.ts` (dissolves in P4).
2. **The logo's GPU warm-up now shares Earth's context.** Still required — its
   `MeshStandardMaterial` programs derive from *its* lights and defines. Comment updated;
   the old one claimed the main canvas's warm-up "does nothing for us", which is no longer
   the reason it exists.
3. **Z-order regression, accepted and documented.** The logo composites at z 10 instead of
   z 30, so the CSS2D geo-tag layer (z 15) now paints above it where they overlap. The logo
   idles top-left and the tags sit on the globe, so overlap is unlikely — **but this is
   visual and unverified.** See Problems.

**Problems discovered.**

- **The refactor silently changed the chunk graph.** three.js had been hoisted into a
  shared chunk only because the corner logo's dynamic import was rooted at the app entry
  while the scene's was rooted at `LazyScene` — two consumers forced the split. Moving the
  logo inside the Canvas left one consumer and Rollup inlined all 800 KB of three into the
  `SceneCanvas` chunk (1 009 679 B). Caught by reading the emitted output, not by any
  assertion. Fixed with an explicit `manualChunks` for three, restoring the validated graph
  and giving the vendor chunk an honest name (`three-*` rather than `KTX2Loader-*`, which
  had been named after whichever module seeded it).

**Verification.**

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run test:intro` | all cases pass |
| `npm run check:navigation` | 25/25 |
| `npm run check:district` | 52/52 |
| `npm run build` | budgets ok — intro 12 005 B, app entry 298 138 B |

Emitted chunks: `three` 814 218 B · `SceneCanvas` 194 254 B · entry 298 282 B ·
`createCornerLogo` 3 573 B · `intro` 12 005 B.

**NOT verified — outstanding.** The frame-by-frame visual comparison this phase most needs
has **not** been done: the Chrome extension is not connected in this session, so the swap
crossover, the logo's flight and idle, and the geo-tag/logo overlap have not been seen.
Every automated gate passes, but they cannot catch a compositing regression.
**This is the gate on P2 being genuinely complete.**

**Remaining risks.**

- Corner-logo z-order vs geo tags (above).
- The logo's load now starts when `SceneCanvas` mounts rather than 2 rAFs after `App`
  mounts. Both were always behind the same three chunk, so the change is small, but
  `logo:assets` is a *required* boot-manifest entry, so it does shift readiness slightly.

---

## P3 — Experience lifecycle + input gating

**Goal.** Make Earth stop doing per-frame work and consuming input when it is not the
showing experience, without unmounting it — so P4 can add Murcia alongside it.

**Files.** Added `src/app/experience.ts`, `docs/adr/003-experience-lifecycle.md`.
Modified `App.tsx`, `SceneCanvas.tsx`, `CameraController.tsx`, `InteractionLayer.tsx`,
`GeoMarkersLayer.tsx`, `EarthScene.tsx`, `Starfield.tsx`, `SpaceBackdrop.tsx`,
`OrbitSystemLayer.tsx`, `AuditCameraShift.tsx`.

**Implementation.** `ExperienceId` in React state on `App`, threaded to each layer as an
`active` prop. Every gate is an early return — **frozen, not reset** — so a return resumes
the pose, phase, orbit clock and spin the viewer left. See ADR 003 for the full contract.

**Two findings that made this much smaller than planned.**

1. **No listeners need detaching.** The plan assumed Earth's window-level listeners with
   capture-phase `stopPropagation` would have to be torn down on deactivate. Reading every
   handler shows they all go inert on the existing `rig.deactivate()` /
   `focus.setEnabled(false)` calls: the rig's handlers short-circuit on `!active` or on
   `orbit.isDragging` (which `deactivate()` clears via `endDrag()`), its wheel listener is
   `{ passive: true }`, and there is no `stopPropagation` in the module at all. Satellite
   focus only swallows Escape while a satellite is *selected*, and `setEnabled(false)`
   deselects first. Detaching was rejected outright: rebuilding the rig reseeds it from
   `EARTH_REST` and would snap the camera on return.
2. **`CameraController` must keep running while inactive.** It is the single DOM writer for
   the warp overlay, which is exactly what P6's transition flash rides on. Gating its whole
   `useFrame` would have planted a latent bug in P6. Only the camera writes are gated;
   `applyOverlay()` still runs.

**Behavioural changes.** None reachable. `activeExperience` has no setter until P6, so it
is always `'earth'` and every new gate is dead code today. This phase is
behaviour-preserving *by construction*, which is the strongest verification available for
it.

**One DOM change worth noting.** `GeoMarkersLayer` now hides its CSS2D layer when inactive.
That layer is DOM at z-index 15, above the canvas — without this it would float Earth's
labels over Murcia. Hidden rather than unmounted so the `CSS2DObject` bindings survive.

**Verification.**

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run build` | budgets ok — intro 12 005 B, app entry 298 181 B |
| `npm run check:navigation` | 25/25 |
| `npm run check:district` | 52/52 |

**Remaining risks.** The gates are unexercised until P6 wires the setter. The freeze/resume
contract (orbit clock, camera pose, GSAP master parked at `site`) is therefore asserted by
design but not yet observed.
