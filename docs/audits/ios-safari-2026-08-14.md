# iOS / Safari Compatibility & Stability — Audit

**Date:** 2026-08-14 · **Against:** working tree at `3b37f87`
**Brief:** `audits/ios-safari-compability-stability.md`
**Companion:** `audits/mobile-responsiveness-2026-08-14.md` — responsive-layout defects live
there, per the brief's instruction not to conflate the two.

---

## 1. Release assessment

**Contains significant iOS risks. Not safe to publish to iOS without remediation and physical
device validation.**

The evidence for that classification is two findings that compound:

- **There is no WebGL context-loss handling of any kind.** Verified: zero occurrences of
  `webglcontextlost`, `webglcontextrestored`, `loseContext` or `forceContextLoss` anywhere in
  `src/` or `index.html`. `SceneErrorBoundary` cannot help — a lost context is a DOM event, not
  a React throw — so the tree stays mounted, `markFatal` never fires, and the visitor gets a
  **permanently blank canvas with no message and no way to recover but a manual reload**.
  Nothing calls `preventDefault()`, so the browser is never even asked to restore.
- **The GPU working set is roughly 280 MB and nothing is ever released.** ~226 MB of texture
  memory, ~53 MB of HalfFloat render targets, plus the MSAA default framebuffer. By deliberate
  architecture (ADR 001/003) both experiences stay resident for the whole session, so entering
  Murcia adds the city *on top of* a fully-loaded Earth. Peak equals steady state.

Separately, the second makes the first likely. iOS Safari drops WebGL contexts under memory
pressure, on backgrounding, and when another tab wants the GPU. At this working set, on a 3–4 GB
iPhone, context loss is not an edge case — it is the expected outcome of a long session, and the
application's response to it is a blank screen.

**What is genuinely good, and should not be disturbed:** the loader/warm-up architecture is
careful and iOS-appropriate — one texture upload per frame with a yielded frame between them
(`EarthScene.tsx:87-99`, avoiding a measured 326 ms stall), `compileAsync` plus a 1×1 render to
force attribute buffers (`MurciaExperience.ts:217-229`), a placeholder `DataTexture` so no
driver-default sampler is ever bound (`SkyShell.tsx:101-105`). Disposal is unusually thorough,
including the `EffectComposer.dispose()` gap that does not walk its passes
(`RenderPipeline.tsx:122-138`). `detectSupport(renderer)` is correctly called on both
`KTX2Loader`s. There are no `#extension` directives, no `dFdx`/`fwidth`, no `onBeforeCompile`
patches and no GLSL3 assumptions — the shader surface is unusually portable.

### Confidence tiering

The brief requires this distinction and it is load-bearing here.

- **Verified** — established by reading source and running greps in this working tree, or by
  reading the installed dependency. Everything about *what the code does* is in this tier.
- **Strongly inferred** — the mechanism is established by implementation evidence plus platform
  behaviour, but the failure has not been reproduced. Everything about *what iOS does with it*
  is in this tier.
- **Requires device validation** — cannot be settled without an iPhone.

**No part of this audit was run on iOS, WebKit, or any Safari.** `PROJECT_MEMORY` §12 and the
2026-08-11 readiness audit both record that only Chromium has ever been tested; that is
unchanged. Nothing below claims otherwise.

---

## 2. Compatibility findings

### P0 — Release blockers

---

#### I1 · WebGL context loss is not handled, and the failure is a silent permanent blank

**Confidence:** mechanism **verified**; iOS trigger frequency **requires device validation**.

**Evidence.** Grep over `src/**` and `index.html` for
`webglcontextlost|webglcontextrestored|loseContext|forceContextLoss`: **zero hits.**

`SceneErrorBoundary.tsx:31-48` is the only failure surface below the canvas. It catches React
render/commit throws and calls `loadProgress.markFatal('chunk:scene', …)`. Its own docstring
(`:14-19`) claims coverage it does not have:

> a refused WebGL context on an old device, a driver reset, a bad frame in a scene component

A driver reset *is* context loss, and it is precisely the case this class cannot see.

**iOS/WebKit mechanism.** WebKit dispatches `webglcontextlost` on the canvas element. three's
renderer sets `_isContextLost` and every subsequent `render()` becomes a silent no-op. React
never re-renders, no promise rejects, nothing throws. Restoration is only attempted if the
handler calls `preventDefault()` — with no handler at all, the context is gone for the life of
the page.

**Affected.** iOS Safari under memory pressure, on tab backgrounding, when a second WebGL page
competes, and after GPU resets. Also Android Chrome and desktop, but iOS is where it is
routine.

**User impact.** A black canvas. The loading drawing has already handed over, so there is no
caption, no error, no reload prompt — nothing distinguishes it from a site that has simply
stopped. The visitor's only recourse is to reload, and nothing tells them to.

**Prior record.** This is not new. `production-readiness-vercel.md:174` listed it as evidence
for `P0-2` in the 2026-08-07 audit — *"no `webglcontextlost` handling, no try/catch around R3F
renderer creation"* — and the remediation at `:180-184` added **only** the WebGL2 availability
probe and the error boundary. Context loss *after* creation was identified and left open, and
has been open since.

**Direction.** Detect it, request restoration, and route it into the failure surface that
already exists. `RenderPipeline` is the right owner: `DECISIONS.md` §2 makes it the only module
that renders anything, so it is already the module that knows the context matters.
`loadProgress.markFatal` already drives the Spanish `No se pudo cargar la experiencia`.

**Do not build a restoration system in this pass.** The brief says to determine current
behaviour first, and `ENGINEERING_PRINCIPLES` §37/§38 are explicit that a fallback state must
only exist if it is actually implemented. Real recovery means re-uploading ~226 MB of textures
and recompiling every program, all of which currently happens once inside effects keyed on
load. That is its own project. Converting a silent permanent blank into a stated failure is the
entire win here, and it is a large one.

**Complexity.** Low for the honest version. **Local**, though the recovery version would be
architectural.

---

#### I2 · ~280 MB of GPU memory, resident for the whole session, never released

**Confidence:** the numbers are **verified** by arithmetic on the shipped assets and the code
that uploads them; iOS termination behaviour at that budget is **strongly inferred** and
**requires device validation** to bound.

**Evidence — texture memory.**

| Texture | Dimensions | Mips | Resident |
|---|---|---|---|
| `day.jpg` | 4096 × 2048 RGBA8, anisotropy 8 | yes | 44.7 MB |
| `night.jpg` | 4096 × 2048 RGBA8, anisotropy 8 | yes | 44.7 MB |
| `specularClouds.jpg` | 4096 × 2048 RGBA8, anisotropy 8 | yes | 44.7 MB |
| *(all three, ≤ 767 px, as of the remediation)* | *2048 × 1024* | *yes* | *11.2 MB each* |
| sky panorama, wide | 6144 × 3072 RGBA8 | **no** | **75.5 MB** |
| brand atlas | 2048 × 1536 `CanvasTexture` | yes | 16.8 MB |
| glow / circle / district gradient | 128², 64², 256² | — | ~0.35 MB |
| **Total (viewport > 767 px)** | | | **≈ 226 MB** |
| *Total (viewport ≤ 767 px, narrow panorama at 18.9 MB)* | | | *≈ 170 MB* |
| *…and after the remediation below, with the narrow Earth set* | | | ***≈ 70 MB*** |

Uploads at `EarthScene.tsx:52-67` (`anisotropy = 8` on all three) and `SkyShell.tsx:167`.
The atlas is `createBrandAtlas.ts:214-246` — 2048 × 1536, mipmapped, anisotropy 4.

**Evidence — render targets.** `RenderPipeline.tsx:81-115` builds four passes owning **15
persistent offscreen targets**, all `HalfFloatType` (8 bytes/px), all scaled by
`composer.setPixelRatio(gl.getPixelRatio())` at `:119`:

- `EffectComposer` read/write: 2 × full resolution
- `AfterimagePass` comp/old: 2 × full resolution
- `UnrealBloomPass`: bright + 5 horizontal + 5 vertical mip targets

At a 390×844 CSS viewport and DPR 2 (786 × 1688 = 1.33 Mpx) that is ≈ 21 MB + 21 MB + 10 MB ≈
**53 MB**, plus the multisampled default framebuffer and depth from `antialias: true`.

**Evidence — nothing is freed.** `src/app/experience.ts` is a type alias, eleven lines, whose
comment states the design: *"Both experiences stay mounted for the application's lifetime —
nothing is created or destroyed at a transition (ADR 001, ADR 003)."*
`useExperienceTransition.ts:47-56` disposes only the GSAP timeline. This is correct per
`DECISIONS.md` §4, which names the price — *"Peak VRAM holds both worlds. Accepted and
bounded."* — and bounds it against a desktop budget.

**iOS/WebKit mechanism.** iOS Safari terminates tabs under memory pressure rather than paging,
and GPU allocations count against the per-tab budget. A 3 GB iPhone gives a tab materially less
than its nominal RAM. The failure presents as the page reloading itself, or as a lost WebGL
context — which is I1.

**User impact.** On the good path, a slow reload mid-session. On the bad path, I1's blank
screen. Both after the visitor has already waited through a 5 MB load.

**What is *not* the problem, so it is not attacked:** the loading peak. The brief asks whether
peak exceeds steady state, and here it does not — the warm-up is genuinely well built, and
nothing is transient. That is the finding: **there is no peak to shave, only a floor to lower.**

**Direction.** The floor is dominated by the three Earth maps at 134 MB combined. At a 390 px
CSS viewport rendering at DPR 2, a 4096-wide equirectangular map on a sphere covering a
fraction of an 786 px-wide framebuffer is oversampled by roughly an order of magnitude.
2048×1024 variants take the trio from 134 MB to ~34 MB — **the single largest available win,
about 100 MB** — and the precedent is already in the repo: the sky panorama ships a narrow
variant selected at the same 767 px breakpoint, preloaded with a `media` attribute so only one
is ever fetched (`index.html:91-108`, `SkyShell.tsx:58-62`, `spaceConfig.ts:103-106`).

Secondary: `anisotropy: 8` on three 4096² maps is real per-fragment bandwidth on a tile-based
GPU, for a sphere rarely viewed at grazing angles.

This *is* a visual change on mobile and should be stated as one rather than slipped in.

**Complexity.** Moderate — a new script, three new assets, a media-gated preload pair and a
selection read. **Local**, following an established pattern.

---

### P1 — Major

---

#### I3 · `AfterimagePass` runs two full-resolution passes every frame, forever, to compute a no-op

**Confidence: verified.**

**Evidence.** `RenderPipeline.tsx:146-158`:

```ts
const amount = settings.motionBlur <= 0.001 ? 0 : settings.motionBlur
const damp = amount === 0 ? 0 : settings.afterimageDampMax * amount
const uniform = afterimagePass.uniforms?.['damp']
if (uniform) uniform.value = damp

// Disabled rather than zeroed at 0: EffectComposer skips a disabled pass
// entirely, so this is what actually reclaims the ~10 fullscreen passes.
bloomPass.enabled = settings.bloomStrength > 0
```

The comment states the principle exactly — and it is applied to bloom, not to the pass three
lines above it. `afterimagePass.enabled` is never assigned anywhere. Motion blur is non-zero
only during a ~1.6 s warp, so for essentially the entire session the pass runs a full-screen
comp plus a full-screen copy to produce an image identical to its input.

**iOS mechanism.** Two full-resolution fragment passes at 1.33 Mpx each, plus their two 21 MB
HalfFloat targets. On a tile-based deferred GPU each is a full framebuffer store and load.

**User impact.** Frame time and thermal headroom spent on nothing. The frame budget on a phone
is where this shows.

**Direction.** `afterimagePass.enabled = damp > 0`, mirroring the line above. Note the bloom
comment's own caveat — `OutputPass` is always enabled, so toggling an intermediate pass cannot
change which pass renders to screen.

**Complexity.** Trivial. **Local.** No image change.

*Related, and deliberately not actioned:* the bloom `enabled` reclamation never fires either,
because `bloomStrength` is the constant `0.55` (`introConfig.ts:162`) and `PROJECT_MEMORY` §9
records `strength 0` as the deliberate performance escape hatch. Bloom is the shipped look
(`DECISIONS.md` §19) and disabling it is an art decision, not an optimisation.

---

#### I4 · The renderer is configured entirely by R3F's defaults, and the DPR cap has no owner

**Confidence: verified.**

**Evidence.** `SceneCanvas.tsx:81-85` is the whole renderer configuration:

```tsx
<Canvas
  className="scene-canvas"
  camera={{ fov: config.normalFov, near: 0.1, far: 5000, position: [0, 0, 200] }}
  gl={{ antialias: true }}
>
```

Resolved against the installed R3F 9.6
(`node_modules/@react-three/fiber/dist/events-b389eeca.esm.js:15598-15620`): `dpr = [1, 2]`,
`frameloop: 'always'`, `powerPreference: 'high-performance'`, and — because `glConfig` is
spread *over* the defaults — **`alpha: true` survives.**

`grep` for `setPixelRatio|devicePixelRatio|powerPreference` across `src/`: only
`RenderPipeline.tsx:119`, which *reads* `gl.getPixelRatio()`.

**The cap used to be owned, and the ownership was dropped rather than moved.**
`appConfig.ts:13-16`:

```ts
// Renderer settings used to live here (pixel-ratio cap, antialias, shadows).
// They belong to whoever creates the WebGLRenderer, and that is now the
// application's R3F Canvas (ADR 001), so they were removed rather than left
// as options that silently do nothing.
```

The reasoning is right and the second half never happened: the settings were removed from
Murcia and never reinstated at the Canvas. The site is capped at 2× **by a library default**,
which no ADR mentions and no assertion protects. A dependency bump could change it silently.

**iOS mechanism.** `alpha: true` on a fully opaque scene (`SkyShell` is `transparent: false` at
`renderOrder -1000`; `index.html:48-52` already paints `#050507` behind the canvas) forces the
compositor to blend the WebGL layer against the page every frame — work iOS cannot elide, and
a wider default framebuffer format. `frameloop: 'always'` renders the entire post chain at 60 fps
on a resting scene whose only motion is a globe spin.

**User impact.** Battery and heat, and on sustained sessions the thermal throttling that
follows. Not a correctness bug.

**Direction.** Make the configuration explicit at the owner: `alpha: false`, and an explicit
`dpr={[1, 2]}` that restores the ownership `appConfig.ts:13-16` describes. Neither changes the
image. A *quality tier* — adaptive DPR under load via R3F's `performance` API — is a larger and
more interesting change that should be driven by a real device profile, not by this audit.

**Complexity.** Trivial for the explicit configuration. **Local.**

---

#### I5 · Unbounded `gl_PointSize` in the warp tunnel

**Confidence:** the magnitude is **verified**; the iOS clamp ceiling and its visual consequence
**require device validation**.

**Evidence.** `warpStarShader.ts:48`:

```glsl
gl_PointSize = uSizeScale / max(-mvPosition.z, 0.001);
```

with `uSizeScale = worldSize * pixelRatio * cssHeight * 0.5` (`:88-94`), fed from
`Starfield.tsx:62-66` with `STAR_SIZE = 0.9`. On a 390×844 iPhone at DPR 2 that is
`0.9 × 2 × 844 × 0.5 ≈ 760`. The stars occupy a 300×300×500 box the camera flies *through*
(`Starfield.tsx:19`), so `-mvPosition.z` genuinely approaches zero: at a view distance of 1 the
requested point size is **~760 px**, and at the `0.001` guard floor, ~760 000.

The existing comment (`:45-47`) anticipates the infinity case and not the clamp case:

> guarded because a point exactly on the camera plane would otherwise produce an infinite
> gl_PointSize, which some drivers turn into a full-screen quad rather than nothing

Nothing in the repo queries `gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)`.

**iOS/WebKit mechanism.** Point size is clamped to the driver's `ALIASED_POINT_SIZE_RANGE`
upper bound, which on A-series GPUs is far below 760. Two consequences: the near-field streak
the warp depends on **flattens**, because every close star renders at the same clamped size; and
each clamped sprite still rasterises its full clamped area with `AdditiveBlending`,
`depthWrite: false` and a `discard` (`warpStarShader.ts:76-78`, `pointSprite.ts:31`) — 2000 of
them (`introConfig.ts:136`), during the same 1.6 s the composer is running the afterimage smear
at full damp. That is the heaviest GPU moment in the application, on the platform least able to
absorb it.

**User impact.** The warp — the site's signature transition — likely reads differently on iOS
than it was authored to, and does so at the moment of peak load. `PROJECT_MEMORY` §12 already
records that the warp **at frame rate** has never been judged on real hardware.

**Direction.** Clamp in the shader against a uniform seeded from the queried range, so the
behaviour is defined and identical everywhere rather than driver-dependent. This protects the
effect; it does not degrade it.

**Complexity.** Low. **Local.**

---

#### I6 · Five decoder instances, up to twenty workers, ~1.6 MB of duplicated WASM — all during the intro

**Confidence: verified** by source; the iOS main-thread cost is **strongly inferred**.

**Evidence.** No shared loader registry exists. Each of these builds its own:

| Loader | Where | Path |
|---|---|---|
| `DRACOLoader` + `GLTFLoader` | `createAssetLoader.ts:18-22` | `/draco/` |
| `DRACOLoader` + `GLTFLoader` | `loadLogoAssets.ts:75-78` | `/draco/` |
| `DRACOLoader` + `GLTFLoader` | `createSatellite.ts:68-71` | `/draco/` (hardcoded) |
| `KTX2Loader` | `loadLogoAssets.ts:72-74` | `/libs/basis/` |
| `KTX2Loader` | `createSatellite.ts:42` | `/libs/basis/` |

`setWorkerLimit` is never called on either loader type — zero grep hits. three's default is 4,
so the worst case is 20 workers, each instantiating a WASM module: 192 KB Draco × 3 pools +
527 KB Basis × 2 pools ≈ **1.6 MB of duplicated WASM heap**. All three GLBs point at the same
byte-identical decoder, so one instance would serve all of them.

They all spin up during the intro — the corner logo, the satellites and the city all load in
P0 — concurrently with 209 MB of texture uploads.

**iOS mechanism.** WASM instantiation is main-thread-blocking per worker, and every worker's
heap counts against the tab's budget at the exact moment texture memory is peaking.

**Prior record.** `PROJECT_MEMORY` *Known debt* lists "**Two KTX2 loaders** — `createSatellite`
and `createCornerLogo` each build one; three warns. Harmless, worth consolidating." The Draco
half — three instances — and the worker-count arithmetic are new. "Harmless" was assessed
against a desktop.

**Direction.** One shared `DRACOLoader` and one `KTX2Loader` with explicit worker limits.
`createAssetLoader.ts:10-16` already makes the argument for Murcia and does not generalise it:

> The Draco decoder runs a worker pool. Creating and disposing it per load … would spin a pool
> up and tear it down again for every environment

**Architecturally this needs care.** `ARCHITECTURE.md` §17 forbids `graphics → earth|murcia`,
and §15-16 set the bar for a shared module: one coherent responsibility, compatible lifecycles,
hides real complexity. Decoder configuration meets it — it is listed by name at §15 as a
typical shared candidate. The correct shape is a small module under `graphics/` owning decoder
paths, worker limits and `detectSupport`, consumed by all three call sites — the definition of
`ENGINEERING_PRINCIPLES` §6, "pull complexity downward". A shared *lifetime* also raises a
disposal question the current per-load pools answer trivially, and that question is the real
work in this item.

**Complexity.** Moderate, and the only P1 with an architectural decision in it. **Architectural
in shape, local in reach.**

---

#### I7 · The Earth's rotation integrates an unclamped delta

**Confidence: verified.**

**Evidence.** `EarthScene.tsx:190-200`:

```tsx
useFrame((_, delta) => {
  if (!active) return
  ...
  spinRef.current.rotation.y += delta * EARTH_CONFIG.rotationSpeed
})
```

`frameDelta.ts:19-32` exists for exactly this and states the policy, naming the backgrounded-tab
case. It is applied at `RenderPipeline.tsx:190`, `MurciaLayer.tsx:193`,
`SpaceBackdrop.tsx:103`, `OrbitSystemLayer.tsx:78` and `InteractionLayer.tsx:111`. R3F does not
clamp on its own (`events-b389eeca.esm.js:16043`: `let delta = state.clock.getDelta()`).

This is the one integrator that skipped it, and it is the most visible one in the scene.

**iOS mechanism.** iOS suspends background pages aggressively. On return, the first `getDelta()`
covers the whole suspended interval.

**User impact.** Returning to the tab jumps the globe by `hidden_seconds × 0.035 rad/s` in a
single frame. At `PROJECT_MEMORY` §9's rotation rate a two-minute absence is most of a full
turn — the destination marker that `EarthScene.tsx:142-147` deliberately spins into view can be
rotated straight back out of it.

**Direction.** Route it through `clampFrameDelta`.

**Complexity.** Trivial. **Local.**

---

#### I8 · Backgrounding during a warp can skip the substitution callback

**Confidence:** mechanism **verified**; iOS timing **strongly inferred**.

**Evidence.** `useMasterTimeline.ts:233-242` guards the *intro* timeline, and its comment
(`:230-232`) states precisely why:

> GSAP would otherwise fast forward on return and skip the crossover's substitution callback

`useExperienceTransition.ts:73-107` has the identical structure — a `tl.call(() => onSwapRef.current(to))`
at the midpoint (`:97`), which *is* a substitution callback, and it is the hard cut between the
two worlds (`DECISIONS.md` §6, "nothing ever cross-fades"). It has **no** `visibilitychange`
guard.

Separately: `pagehide`, `pageshow`, `freeze` and `resume` have **zero occurrences** anywhere in
`src/`. On iOS, `pagehide` is what fires for bfcache, and a page restored from bfcache with a
dead GL context has no notification path at all — which is I1 again, by a second route.

**User impact.** Background the tab mid-warp and return to a state where the swap did not run:
the wrong world drawn, or the overlay left up. Bounded by the 1.6 s window, so it is unlikely —
but the identical hazard was considered serious enough to guard 30 lines away.

**Direction.** Apply the same guard. Consider `pagehide`/`pageshow` alongside I1 rather than
separately, since they share a handler and a failure mode.

**Complexity.** Trivial. **Local.**

---

### P2 — Moderate

**I9 · Six `backdrop-filter` declarations with no `-webkit-` prefix.** `styles.css:75, 349,
1206`; `murcia.css:103, 136, 159`. Safari accepted the unprefixed property only from 18.0, so
iOS 15–17 loses the blur entirely. **P2 rather than P1 because the degradation is legible**:
every one of those elements also carries an alpha background plate (`styles.css:72, 347, 1202`;
`murcia.css:98, 131, 156`), so text stays readable — the design intent is lost, not the
content. Same class: `appearance: none` on `.audit-select` (`styles.css:890`) with no
`-webkit-appearance`, which below Safari 15.4 restores native select chrome that collides with
the `::after` chevron at `:904-915`.

**I10 · `viewport-fit=cover` is absent, voiding all five safe-area declarations.**
`index.html:8` is `width=device-width, initial-scale=1.0`. Without `viewport-fit=cover`, every
`env(safe-area-inset-*)` resolves to `0px` — so `styles.css:734, 735, 1008, 1012` and
`murcia.css:323` are currently dead code that reads as handled. Elements with no inset handling
at all: `#controls-hint` at `bottom: 16px` (under the home indicator),
`.experience-switch--back`, `.audit-trigger`, `.district-panel-close`.

**Sequencing matters here and is why this is not a one-line fix:** adding `viewport-fit=cover`
*changes the layout viewport* to include the unsafe regions. Adding it alone moves content
under the notch. It must land together with the padding that consumes the insets, and the
brief's instruction applies — do not add safe-area padding mechanically, decide which elements
need it.

**I11 · Fill-rate structure.** `SkyShell` is a `frustumCulled={false}` sphere at
`renderOrder -1000` whose fragment shader runs `atan` + `asin` + `pow(vec3)` + a hash per pixel
(`shell.frag.glsl:13-17, 30-33, 53, 68`), painting the entire framebuffer first and then being
almost entirely overdrawn. Holo panels are `THREE.DoubleSide` (`createHoloPanel.ts:176`) for a
billboard that always faces the camera, doubling their fragment cost to solve a winding
problem. And `antialias: true` allocates a multisampled default framebuffer that the composer
route — which Earth always takes — discards, since `EffectComposer`'s targets carry no
`samples` (documented at `RenderPipeline.tsx:62-68`); it cannot simply be turned off, because
Murcia's direct route is the one consumer that needs it.

### P3 — Minor

**I12.** `spaceConfig.ts:113` describes the panorama as `6144x2048`; it is 6144×**3072** (the
same comment's 75.5 MB figure is correct, which is how the discrepancy is resolvable).
`createCircleTexture` (`orbitUtils.ts:68-80`) sets no `colorSpace`, unlike its sibling at
`:58`. `webglSupport.ts:22` abandons its probe context without `loseContext()` — on a platform
with a hard live-context limit, worth being tidy about. `shell.frag.glsl:1` declares
`precision highp float;` redundantly with three's injected prelude.

### Corrections

Two claims raised during this audit were investigated and are **false**. Recorded so they are
not rediscovered:

- **The renderer does not run at DPR 3 on iPhones.** No `dpr` prop is passed, but R3F's default
  is `dpr = [1, 2]` — `events-b389eeca.esm.js:15604`, and already in `PROJECT_MEMORY` §11.38.
  The cap exists. I4 is about its *ownership*, not its absence.
- **Resize handling is not missing.** `murcia/core/resize.ts` is type-only and `src/` contains
  no `ResizeObserver`, but R3F's `react-use-measure` installs one on the container and also
  listens for `resize` and `orientationchange`. Orientation changes propagate correctly to the
  camera aspect, the composer size and Murcia's bounds.

---

## 3. iOS resource budget

Per visitor, wide viewport, on the WASM decoder path.

| | Cost | Note |
|---|---|---|
| **Framebuffer** | 786 × 1688 = 1.33 Mpx at DPR 2 | capped by R3F's default, not by us (I4) |
| **Render targets** | ≈ 53 MB across 15 HalfFloat targets | scales with DPR² |
| **MSAA + depth** | ≈ 25–35 MB | discarded on the Earth route (I11) |
| **Texture memory** | **≈ 226 MB** (170 MB narrow) | 134 MB of it the three Earth maps |
| **Full-screen passes/frame** | ≥ 3 at full res, ~13 reduced | 2 of the full-res ones are a no-op (I3) |
| **Network** | ≈ 5.2 MB assets (5.06 MB narrow) + ~1.2 MB JS | 163 KB is the entire mobile saving |
| **WASM / workers** | ≈ 1.6 MB across up to 20 workers | all during the intro (I6) |
| **GLB** | 1.19 MB city + 270 KB satellite + 20 KB logo | city prefetched during the intro |

**The largest realistic risks, in order.**

1. **Texture memory.** 226 MB resident, never released, both worlds held simultaneously by
   design. The 100 MB available from Earth texture variants is the one large, safe reduction.
2. **Context loss following from it** — I1's blank screen is the visible form of I2.
3. **The warp**, which stacks 2000 additive over-sized points onto a full-damp afterimage smear
   at the exact moment of the world swap (I5).
4. **The intro**, which lands 209 MB of uploads, 5.2 MB of downloads and up to 20 WASM workers
   inside roughly five seconds.

**Not a risk, and worth recording as such:** the loading *peak*. It equals steady state, because
the warm-up is well built and nothing transient is allocated.

---

## 4. Required physical device tests

None of the below is closable by emulation. Emulated mobile Playwright projects are being added
for regression coverage, and are Chromium — **they do not test WebKit and must not be cited as
though they do.**

**Matrix — capability classes, not generations:**

| Device | Why |
|---|---|
| Recent high-end iPhone (15/16 Pro class) | DPR 3, best case; establishes the ceiling |
| Several-generation-old iPhone (11/12, ideally 3 GB) | the memory-termination case — the one that matters most |
| iPad (any recent, + Split View) | resizable viewport, larger framebuffer, tablet layout |

**Protocol.**

1. **Cold load** on cellular, cache empty. Time to first paint of the drawing, time to ready.
   Confirm the captions escalate honestly and that the narrow sky variant is the one fetched.
2. **Boot in landscape**, and separately rotate during the intro.
3. **Main interactions:** tap a satellite (case panel), tap the Spain marker (enter Murcia), tap
   a district, one-finger pan, two-finger rotate, pinch. Every one against the M1/M2 fixes.
4. **Repeated camera transitions** — ten Earth ⇄ Murcia round trips, watching for growth in
   memory and for the warp's visual behaviour (I5: do near-field stars streak or flatten?).
5. **Portrait ↔ landscape** with a district panel open, and with the case panel open.
6. **Browser chrome collapse/expand** while scrolling and with a panel open — the `dvh` sheet
   against the `offsetHeight`-measured obstruction rect.
7. **Background / foreground**, at 10 s, 2 min and 10 min. Check for a rotation jump (I7), a
   skipped warp swap (I8), and whether the context survived.
8. **Sustained activity** — five minutes of continuous navigation. Watch for thermal throttling
   and for the tab reloading itself.
9. **Deliberate memory pressure** — open several heavy tabs, return. Does the page reload, or
   go blank? A blank screen with no message is I1 reproduced.
10. **Return navigation** — navigate away to another site, come back (bfcache path).
11. **Slow network** — throttled, confirming the slow caption is readable at 375 px (M7).

Record which tier each result moves: *strongly inferred* → *verified*, or → *refuted*.

---

## 5. Remediation plan

In the brief's priority order: crash/context-loss, memory, rendering, touch, viewport, DPR,
lifecycle, polish.

1. **I1** — context-loss detection routed into the existing fatal state. No restoration system.
2. **I2** — narrow Earth texture variants. ~100 MB, the largest single win. Confirm the quality
   target with the owner first; it is a visible change on mobile.
3. **I3** — `afterimagePass.enabled = damp > 0`.
4. **I4** — `alpha: false` and an explicit `dpr`, restoring the ownership `appConfig.ts:13-16`
   describes.
5. **I7, I8** — delta clamp and the warp visibility guard, together with `pagehide`/`pageshow`
   alongside I1.
6. **I5** — clamp `gl_PointSize` against the queried range.
7. **I6** — consolidate the decoders. The one item with an architectural decision; if the
   disposal question grows, it becomes its own change.
8. **Deferred to a following pass:** I9 (`-webkit-backdrop-filter`), I10 (`viewport-fit` **with**
   its safe-area padding, as one change), I11 (fill-rate structure — needs a device profile
   first, per `ENGINEERING_PRINCIPLES` §28), I12 (polish).

**Constraints on all of the above.** The app entry chunk sits at 302 381 B against a
**320 000 B budget that fails the build**; the intro chunk at 13 325 B against 16 000 B. No
`userAgent` branching — every fix above is either capability-detected or breakpoint-driven.
And nothing here touches a camera pose: `PROJECT_MEMORY` §5 makes that a much larger job than
it looks.

---

## 6. Remediation status — 2026-08-14, same day

P0 and P1 were implemented in the same pass as this audit.

| # | Status | What shipped |
|---|---|---|
| I1 | **Fixed** | `graphics/contextLoss.ts` observes `webglcontextlost`, calls `preventDefault()` so restoration is at least requested, and reports through `RenderPipeline` to the application, which latches `markFatal` **and** renders a Spanish notice with a reload action. Two surfaces because the timing decides which is on screen: before handover the drawing's own loop reads readiness, after handover that loop has stopped. **No restoration system**, by design — see the module header. Asserted in `e2e/mobile.spec.ts` by driving a real `WEBGL_lose_context.loseContext()`. |
| I2 | **Fixed** | 2048×1024 variants of the three Earth maps, media-gated at the same 767 px the sky already uses. **134 MB → 34 MB** of texture memory on a phone, and ~714 KB less on the wire. Verified on emulated devices that exactly one set is fetched per viewport — no double download — and read back visually at 390 px, where the globe is indistinguishable from the 4096 original. `scripts/prepare-earth-textures.mjs`, run by hand like the sky's. |
| I3 | **Fixed** | `afterimagePass.enabled = damp > 0`, mirroring the bloom line above it. Two full-resolution passes per frame reclaimed for the entire session outside the ~1.6 s warp. No image change — the desktop screenshot baselines are unchanged. |
| I4 | **Fixed** | `alpha: false`, an explicit `dpr={[1, 2]}`, and `gl.setClearColor(0x050507, 1)`. The clear colour is *required by* `alpha: false`, not incidental to it: three's default is pure black and would have changed the intro's backdrop from `#050507` for the seconds before the sky arrives. The DPR value is the same one R3F defaulted to, so no pixels move — what changed is that the cap has an owner again, per `appConfig.ts:13-16`. |
| I5 | **Fixed** | `gl_PointSize` clamped against `uMaxSize`, seeded once from the driver's real `ALIASED_POINT_SIZE_RANGE`. Capability detection, read once — a static limit does not belong in a per-frame path. |
| I6 | **Fixed** | One `DRACOLoader` and one `KTX2Loader` for the application, in `graphics/decoders.ts`, reference-counted. Five pools become at most two, and the count keeps the old property that nothing is retained once loading finishes — a plain singleton would have traded the loading peak for permanent residency. Worker limits deliberately untouched: that is a device-profile question. |
| I7 | **Fixed** | `EarthScene`'s rotation now goes through `clampFrameDelta`. |
| I8 | **Fixed** | `visibilitychange` guard on the warp timeline, matching `useMasterTimeline`. `pagehide`/`pageshow` were **not** added — the bfcache path leads back to I1, and a page restored with a dead context now gets the notice rather than silence. |
| I9 | **Fixed** (was P2) | `-webkit-backdrop-filter` on all six sites, `-webkit-appearance` on the select. One line each, done because the files were already open. |
| I10, I11, I12 | **Open** | `viewport-fit=cover` must land together with the safe-area padding it enables, not before it. I11 needs a device profile first (PRINCIPLES §28). |

**What this does not change.** The release assessment above still stands as
written for anything that needs a device. Every fix here was verified on
Chromium — two emulated mobile Playwright projects were added and the config
says plainly that they are not WebKit. **No part of this has been run on iOS.**
The physical test protocol in §4 is unchanged and is what would move these
findings from *strongly inferred* to *verified*.

The largest remaining risk is now the one arithmetic cannot settle. On a phone
the GPU working set is roughly **70 MB of textures plus ~53 MB of render
targets**, against ~170 MB and ~53 MB before — so the texture half more than
halved and the render-target half did not move, because it scales with DPR and
viewport rather than with any asset. Whether the remainder is inside the budget
of a 3 GB iPhone under real conditions is a device question. If it is not, I1 is
what the visitor sees, and that is now a sentence rather than a blank screen.
