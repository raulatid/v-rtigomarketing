# Website Performance & Optimization — Audit

**Date:** 2026-08-27 · **Against:** working tree at `2f7d082` + uncommitted changes
**Brief:** `audits/website-performance-and-optimization.md`

**Second pass in this lineage, written as a delta against
`reports/website-performance-and-optimization-2026-08-20.md`.** That report remains accurate for
everything this one does not restate; where the two disagree, this one wins and says so. §7
revalidates every finding it raised, and §7.1 corrects two of its numbers.

Seven days separate the two passes and a lot moved in them: the Sanity content pipeline replaced
WordPress, the satellites gained a hologram and an emitter cone, touch navigation gained a pinch,
the sky-cubemap prototype landed behind a URL gate, and Murcia's districts became one service per
building (uncommitted). Three of those changed the numbers materially.

**Measurement conditions apply to every figure below unless a row says otherwise:**

| | |
|---|---|
| Build | `npm run content:build` then `VITE_VERCEL_ENV=production npx vite build`. Verified production by its markers: `robots.txt` 104 B with `Allow:`, `sitemap.xml` emitted, no `noindex` in `index.html`, none of the `/debug` console's UI strings in any chunk. |
| Content | Sanity `qxpcrdaw/development` — 6 case studies, 5 services, 1 district, 2 legal docs, 2 blog posts. **The content is an input to several numbers here** (see P1-E); a different dataset gives different GPU memory. |
| Server | local `vite preview` on `:4173`. **HTTP/1.1, gzip, no brotli, no CDN, ~0 ms RTT.** |
| Client | Chromium 1.62.1 (Playwright), **headed, real GPU**: ANGLE / AMD Radeon RX 5500 XT / Direct3D11. |
| Viewport | 1440×900 CSS at DPR 1 unless stated. Mobile rows are an emulated Pixel 7 (412×839 CSS, DPR 2.625) — **Chromium on a desktop GPU, never a phone**. |
| Cache | cold on every load run (fresh browser context per run). |
| Repeats | load metrics are the median of **5** runs local, **3** per throttled profile. Frame metrics are the median of 700–2 500 frames; the sustained run is 30 samples over 5 minutes. |
| Labels | every figure is tagged **production** (built artefact), **synthetic** (emulated device/network), **real-device** (this desktop's actual GPU) or **inferred** (arithmetic, not observed). |

**Instrumentation.** The page was measured from outside, exactly as in the first pass: a Playwright
init-script installs `PerformanceObserver`s, wraps `requestAnimationFrame` to time each frame's
callbacks, and wraps the WebGL context to count draw calls, primitives, framebuffer binds, texture
and renderbuffer allocations, programs and buffers. Shader-link cost is measured by wrapping
`linkProgram`, `getProgramInfoLog` and `getProgramParameter`. **No source file was modified for this
audit, and none of this instrumentation ships.** GPU time is a 1×1 `readPixels` at each frame
boundary with vsync unlocked — it blocks until the GPU has drained the previous frame, so the block
*is* that frame's GPU cost.

**Two instrumentation corrections are folded into the memory numbers below**, stated so they are not
mistaken for measurements. BC7 (`COMPRESSED_RGBA_BPTC_UNORM`) allocations are counted at 4 bytes/px
by the census, which over-counts the two KTX2 textures by 4 MiB each; **every texture total here is
corrected by −8 MiB**. Depth renderbuffers are counted at 3 bytes/px for `DEPTH_COMPONENT24`.

**One measurement-window correction of my own, up front.** Unlocking vsync to measure GPU time makes
the page render at 200–1 200 fps. Per-frame costs are still per-frame costs and transfer directly.
The *sustained* run (§2.6) is therefore a much harsher thermal test than the shipping 60 Hz case,
not a gentler one — which is the right direction for a soak test, but it is not "five minutes of the
real thing".

---

## 1. Performance Executive Summary

**The site is still network-bound on load, and it is no longer idle on the desktop it renders on.**
That second half is the change of shape since 2026-08-20.

**Network-bound — still dominant.** A cold wide load now transfers **5.69 MB across 31 requests**
(was 5.27 MB / 22). On Slow 4G with a 4× CPU throttle the scene becomes ready at **28.9 s** and the
intro hands over at **29.4 s** — about a second worse than the first pass, entirely explained by the
extra 420 KB. The two findings that made it worse than it needs to be are both **unfixed and
byte-identical**: the mobile Earth textures are still encoded above the desktop set they replace
(P1-C, prior P1-1), and 2.60 MB of explicitly not-required assets still share the connection with
the files that gate readiness (P1-D, prior P1-2). The priority evidence is new and it is worse than
the first pass could see: **the required Earth textures are fetched at `Low` priority and the
not-required city model, Draco and Basis decoders at `High`.**

**GPU-bound — not yet, but the Earth route stopped being free.** The resting Earth scene now costs
**135 draw calls and 378 714 triangles per frame**, against 14 draws and ~19 k triangles at the
moment the intro hands over. **Six copies of a 15-mesh, 58 626-triangle satellite model account for
~87 of those draws and ~352 k of those triangles** (P1-A) — 93 % of the scene's geometry, for
objects about 30 px across in the overview. It costs **2.7 ms of GPU and 0.8 ms of CPU** here, which
is comfortable; it is the number that will decide what happens on a phone, and it grew 7× in draw
calls and 20× in triangles in seven days without anyone counting it. Murcia is heavier still at
**1 857 750 triangles per frame** and *cheaper* at **2.0 ms**, because it takes the direct route and
pays for no post-processing. Geometry is not the limiting factor anywhere in this application, and
this pass validated that rather than assuming it.

**CPU-bound — a new, visible problem after handover.** Load-time long tasks rose from 711 ms to
**975 ms** (median, local), with a **238 ms** single task against the 200 ms budget the first pass
proposed. Two mechanisms account for most of it, and they are different. **373 ms is synchronous
texture upload** inside `gpu:warmup` — owned, deliberate, and directly proportional to the texture
sizes P1-C would shrink. **412 ms is the GPU driver linking shader programs**, in stalls of up to
**79.6 ms**, and **186 ms of that lands *after* the intro has handed over** — at ~5.2 s and again at
~11.4 s, while the visitor is watching a scene that looks finished. The largest single stall in the
whole session is the **new hologram shader, 79.6 ms at 11.4 s** (P1-B). An A/B proved that the
obvious remedy — `renderer.debug.checkShaderErrors = false` — **does not work**: it relocates the
stall from `getProgramInfoLog` to `getProgramParameter` and leaves total long-task time unchanged.
The real cause is that three's warm-up compiles the wrong program variant for the composer route.

**Memory-bound — the largest structural change, and it is now content-driven.** Total texture
residency is **246 MiB at DPR 1** and **446 MiB at DPR 2** on a 1440×900 viewport; on the phone-shaped
viewport it is **130 MiB**, against the 90 MB budget the first pass proposed. The post-processing
chain is **59 % of desktop residency at DPR 2 and 52 % on the phone path**, against a proposed
ceiling of 25 %. And a genuinely new property: **the brand atlases are now two textures, not one,
they cost 24 MiB, and their size is a function of how many case studies the client publishes** —
`ceil(n/2)` rows of 2048×512 plus 1024×512. Twelve case studies would cost 48 MiB. Nothing budgets
this, and it is reachable from the CMS without a deploy (P1-E).

**Architecture-induced duplicate work — unchanged, plus one new instance.** The decoder pools are
still exactly two, and **still never released**: 6 workers created, **0 terminated**, across a full
session including four Earth↔Murcia round trips (P2-G, prior P2-5). New: the `three` chunk carries
**39 745 B of Zstandard decoder** that `KTX2Loader` pulls in and this project never uses, on top of
the 584 KB Basis transcoder it downloads to decode 174 KB of texture (P2-H). And the app entry
carries **19 018 B of GSAP `CSSPlugin`** while every tween in the codebase targets a plain JavaScript
object (P2-I).

**No leaks, no drift, no retry storms.** Four round trips left textures, programs and buffers exactly
constant. Five minutes of continuous rendering showed no frame-time drift and no heap trend. Every
asset-failure case — required, optional, decoder, CMS media, sky — produced exactly one attempt per
URL and the documented fallback. CLS is 0 in every configuration.

---

## 2. Baseline Metrics

### 2.1 Load — median of repeated cold loads · production build · synthetic network

| Metric | Local wide (n=5) | Local narrow (n=3) | Fast 4G + 4× CPU (n=3) | Slow 4G + 4× CPU (n=3) | Slow 4G narrow (n=3) |
|---|---|---|---|---|---|
| First Contentful Paint | 108 ms | 108 ms | 484 ms | 796 ms | 828 ms |
| Largest Contentful Paint | 732 ms | 724 ms | 2 704 ms | 10 188 ms | 7 364 ms |
| Intro's first drawn frame | 93 ms | 93 ms | 423 ms | 740 ms | 772 ms |
| **Scene usable (`vertigo:scene-ready`)** | **1 372 ms** | **1 112 ms** | **6 101 ms** | **28 858 ms** | **22 922 ms** |
| **Handover (`vertigo:intro-complete`)** | **3 039 ms** | **3 035 ms** | **6 830 ms** | **29 403 ms** | **23 471 ms** |
| Long tasks (count / total / max) | 8 / 975 ms / 238 ms | 5 / 557 ms / 261 ms | 15 / 2 565 ms / 406 ms | 17 / 2 755 ms / 442 ms | 17 / 1 968 ms / 292 ms |
| Cumulative Layout Shift | 0 | 0 | 0 | 0 | 0 |
| Requests / transferred | 31 / 5.69 MB | 31 / 4.86 MB | 31 / 5.69 MB | 31 / 5.69 MB | 31 / 4.86 MB |

Throttling profiles are unchanged from the first pass: Fast 4G = 9 Mbit/s, 60 ms RTT; Slow 4G =
1.6 Mbit/s, 150 ms RTT; both via CDP, both with a 4× CPU throttle. TTFB is ~0 on localhost and is
omitted rather than reported as a meaningless 4 ms.

The request count rose 22 → 31 without nine new files appearing: **six of the nine are the decoder
blob workers**, which this pass counts and the first pass did not. The three genuinely new requests
are `assets/SceneCanvas-*.css` and **two CMS-mirrored brand logos under `/logos/`** (114 858 B), which
did not exist before the Sanity migration.

`scene-ready` is taken as the **first** occurrence of the mark. That distinction is not pedantry —
see P2-K, where the mark fires up to 60 times in one load and last-wins reads it 1.2 s late.

**Deltas against 2026-08-20**, same conditions, same harness shape: transfer +420 KB wide / +390 KB
narrow; scene-ready −162 ms wide (noise, and partly the corrected mark); long tasks **+264 ms**;
LCP −108 ms. **Label: production, synthetic network.**

### 2.2 Bundle — production build, measured on the emitted files

| Chunk | Raw | gzip | brotli | Δ raw vs 2026-08-20 |
|---|---|---|---|---|
| `assets/three-*.js` | 820 894 | 220 310 | 179 622 | +27 |
| `assets/index-*.js` (app entry) | 317 614 | 106 634 | 92 593 | **+6 714** |
| `assets/SceneCanvas-*.js` | 243 443 | 81 376 | 71 282 | **+28 254** |
| `assets/MurciaExperience-*.js` | 77 076 | 24 840 | 21 738 | +1 201 |
| `assets/index-*.css` | 25 411 | 5 634 | 4 968 | +286 |
| `assets/intro-*.js` (boot entry) | 14 057 | 6 225 | 5 449 | 0 |
| `index.html` | 8 070 | 2 988 | 2 360 | — |
| `assets/SceneCanvas-*.css` | 7 542 | 2 104 | 1 809 | +844 |
| `assets/createCornerLogo-*.js` | 3 797 | 1 884 | 1 752 | +2 |
| `assets/disposal-*.js` | 398 | 252 | 228 | 0 |
| **Total JS** | **1 477 279** | **441 521** | **372 664** | **+36 198** |

Brotli is what Vercel will serve and is **15.6 % smaller than the gzip these runs measured**, so the
throttled figures in §2.1 are pessimistic by roughly that much on the ~1.5 MB text half of the
payload. **Label: production.**

**Where the bytes are**, attributed module-by-module from a source-mapped build of the same commit
(the map was built to a scratch directory; nothing was written into the repository):

| Chunk | Module | Raw bytes | Share |
|---|---|---|---|
| app entry | `react-dom` | 179 516 | 57.0 % |
| app entry | **`gsap/gsap-core` + `gsap/CSSPlugin`** | **70 710** | **22.4 %** |
| app entry | `react` + `scheduler` | 11 405 | 3.6 % |
| app entry | everything else (the whole DOM UI layer) | ~53 000 | 17 % |
| SceneCanvas | `@react-three/fiber` | 149 269 | 62.1 % |
| SceneCanvas | **`createHoloPanel.ts` + `createEmitterCone.ts`** | **23 558** | **9.8 %** |
| SceneCanvas | generated `caseStudies` | 5 038 | 2.1 % |
| SceneCanvas | sky-cubemap prototype (`SkyShellCube` + shader + gates) | 3 263 | 1.4 % |
| three | `three/build` | 686 301 | 84.0 % |
| three | `three/examples/jsm` | 130 555 | 16.0 % |
| Murcia | `stats.js` + `DebugOverlay` + `MurciaDebugTools` | 6 396 | 8.3 % |

The **SceneCanvas chunk's +28 KB is the hologram**: `createHoloPanel` and `createEmitterCone`
together are 23 558 B, which is 84 % of the chunk's growth. That chunk gates readiness
(`chunk:scene` is required) and has no build budget.

Inside `three/examples`, the ten largest modules are `GLTFLoader` (44 633), **`zstddec.module.js`
(39 745)**, `KTX2Loader` (12 459), `UnrealBloomPass` (7 990), `DRACOLoader` (6 185),
`ktx-parse` (4 717), `EffectComposer` (2 583), `OutputPass` (2 128), `OutputShader` (1 423) and
`AfterimagePass` (1 395). The Zstandard decoder exists for KTX2 files with
`supercompressionScheme=2`; both of this project's KTX2 files are BasisLZ (scheme 1). See P2-H.

Tree-shaking and splitting still work. `three` is isolated and asserted, the intro entry imports
nothing and is asserted, `blogPosts` (modelled but not rendered) is **absent from every chunk**, and
the React `/debug` console still folds away — none of its UI strings appear anywhere. What does not
fold is covered in P3-10.

### 2.3 Static assets — dimensions, transfer, GPU cost

| Asset | On disk | Dimensions | GPU resident | Change since 2026-08-20 |
|---|---|---|---|---|
| `earth/specularClouds.jpg` | 1 692 384 | 4096×2048 | 42.67 MiB | — |
| `models/city-prototype.glb` | 1 286 596 | **222 meshes / 131 926 tris / 1 079 nodes** | see §2.4 | **+41 432 B, +22 245 tris** |
| `earth/specularClouds-narrow.jpg` | 1 318 743 | 2048×1024 | 10.67 MiB | — (unchanged, see P1-C) |
| `libs/basis/basis_transcoder.wasm` | 527 333 | — | — | — |
| `draco/draco_decoder.js` | 512 465 | — | **never requested** | — |
| `earth/day.jpg` | 473 093 | 4096×2048 | 42.67 MiB | — |
| `models/satellite.glb` | 269 928 | **15 meshes / 58 626 tris** | — | — (but now drawn 6×) |
| `earth/night.jpg` | 267 061 | 4096×2048 | 42.67 MiB | — |
| `earth/day-narrow.jpg` | 255 766 | 2048×1024 | 10.67 MiB | — |
| `textures/sky-panorama.webp` | 217 166 | 4096×2048 | fallback only | **−61 884 B** |
| `models/city-backdrop.glb` | 206 604 | 36 meshes / 630 tris, instanced | — | — |
| `draco/draco_decoder.wasm` | 192 420 | — | — | — |
| `textures/sky-panorama.avif` | 188 787 | 4096×2048 | 32.0 MiB (**not mipped**) | −5 855 B |
| `textures/satellite_Baked.ktx2` | 150 820 | 1024×1024 BC7 | 1.33 MiB | — |
| `earth/night-narrow.jpg` | 126 618 | 2048×1024 | 10.67 MiB | — |
| `logos/…-1300x650.png` | 86 791 | 1300×650 | drawn into the atlas | **new** |
| `textures/sky-panorama-narrow.avif` | 82 088 | 2048×1024 | 8.0 MiB | +440 B |
| `logos/…-512x512.png` | 27 429 | 512×512 | drawn into the atlas | **new** |
| `textures/logoBake.ktx2` | 23 102 | 1024×1024 BC7 | 1.33 MiB | — |
| `models/model.glb` | 20 364 | 2 meshes / 5 860 tris | — | — |
| **brand logo atlas** (generated) | — | **2048×1536** | **16.0 MiB** | — |
| **brand isotype atlas** (generated) | — | **1024×1536** | **8.0 MiB** | **new** |

`public/` is **629 MB on disk**, of which **621 MB is `public/proto-sky/`** — the sky-cubemap
prototype's face sets, which are git-ignored and therefore never reach a Vercel deployment. The
deployable half of `public/` is **8.0 MB**. See P3-14 for the one way that distinction can be lost.

### 2.4 Frame cost — real-device (this desktop GPU), vsync unlocked, GPU-synchronised

| Route / moment | GPU ms (med / p95) | CPU ms (med / p95) | Draw calls | Triangles | FBO binds |
|---|---|---|---|---|---|
| Earth, at handover (satellites not yet revealed) | 1.4 / — | 0.5 / — | **14** | ~19 000 | 15 |
| **Earth, at rest (satellites deployed)** | **2.7 / 3.9** | **0.8 / 1.1** | **135** | **378 714** | **15** |
| Earth, at rest, pointer over the globe | 2.9 / 4.1 | 0.8 / 1.1 | 135 | 378 714 | 15 |
| **Murcia (direct route, no composer)** | **2.0 / 5.4** | **0.9 / 1.4** | **176** | **1 857 750** | **0** |
| Murcia, pointer sweeping buildings | 3.2 / 5.5 | 1.0 / 1.3 | 176 | 1 857 750 | 0 |
| Earth at rest, phone-shaped viewport | 3.0 / — | 0.9 / — | **121** | **322 728** | 15 |

Programs: 36 at Earth, 43 once Murcia has loaded. 29 live textures, 689 buffers.

**The wide/narrow pair is the arithmetic that identifies the cost.** The phone-shaped viewport draws
**14 fewer calls and 55 986 fewer triangles** than the desktop one, which is exactly one satellite
leaving the frustum. Six satellites at ~14 draws and ~58.6 k triangles each is ~87 draws and
~352 k triangles — **93 % of the Earth route's geometry and 64 % of its draw calls.**

### 2.5 Device pixel ratio sweep — 1440×900 CSS viewport, corrected for the BC7 over-count

| DPR requested | Drawing buffer | GPU ms/frame (rest) | Render targets | Depth renderbuffers | Content textures | **Total** | Post share |
|---|---|---|---|---|---|---|---|
| 1 | 1440×900 | 2.8 | 48.6 MiB | 18.2 MiB | 186.8 MiB | **253.6 MiB** | 26 % |
| 1.25 | 1800×1125 | 3.0 | 76.0 MiB | 28.5 MiB | 186.8 MiB | **291.2 MiB** | 36 % |
| 1.5 | 2160×1350 | 4.0 | 109.4 MiB | 41.0 MiB | 186.8 MiB | **337.2 MiB** | 45 % |
| 2 | 2880×1800 | 3.4 | 194.4 MiB | 72.9 MiB | 186.8 MiB | **454.1 MiB** | 59 % |
| 3 | **2880×1800 (capped)** | 3.5 | 194.4 MiB | 72.9 MiB | 186.8 MiB | **454.1 MiB** | 59 % |
| 2.625 (Pixel 7) | 824×1678 | 3.0 | 51.9 MiB | 19.4 MiB | 66.8 MiB | **138.1 MiB** | 52 % |

Totals in this table are as the census counts them, *before* the −8 MiB BC7 correction; applying it
gives **246 MiB at DPR 1**, **446 MiB at DPR 2** and **130 MiB on the phone path**. The DPR 1→2 GPU
cost is **+0.6 ms** for **+201 MiB** of framebuffer memory, which is the same trade the first pass
measured and the same conclusion: **the DPR decision is a memory decision, not a frame-rate one.**

**The `dpr={[1, 2]}` cap works** — requesting 3 produces the same 2880×1800 buffer as requesting 2,
verified on desktop and on the emulated phone (DPR 2.625 → 824×1678, exactly 2×). **Label:
real-device for the GPU column, production for the memory columns.**

### 2.6 Steady state and sustained runtime — 5 minutes, 30 samples, vsync unlocked

Frame cost was flat from the first sample to the last: **GPU 2.8–3.0 ms median at every one of the
30 samples**, p95 3.8–4.2 ms throughout, worst single frame 7.8 ms. CPU 0.8–1.2 ms. JS heap
oscillated between **29.1 and 54.0 MiB** in a clean sawtooth with **no trend** (32.0 MiB at t+0,
39.1 MiB at t+290 s). The heap band is wider than the first pass measured (27.8–32.7 MiB); it is
allocation churn against GC, not growth.

DOM at rest: **197 elements on Earth, 193 in Murcia, 1 canvas, 5 district labels**. **0 layouts per
second and 0 ms of layout time in both experiences.** Style recalculation is 244/s on Earth and
182/s in Murcia — one per rendered frame, costing 44–66 ms per 5 s of wall clock (~1 % of the main
thread). **Label: real-device.**

### 2.7 Where the main thread goes during load — CPU profile, 200 µs sampling

Sampled over a full load plus 7 s of rest, wide viewport, local network:

| Self time | Call | Attributed to |
|---|---|---|
| 373 ms | `texSubImage2D` | `gl.initTexture` from `EarthScene.tsx:120` (283 ms, the three 4096×2048 Earth maps) and `SkyShell.tsx:241` (90 ms, the panorama) |
| 273 ms | `getProgramInfoLog` | three's `WebGLProgram` first-use check, inside `renderBufferDirect` |
| 92 ms | `getExtension` | `KTX2Loader.detectSupport` |
| 475 ms | `(program)` | V8 parse/compile of the chunks |
| 48 ms | `introDraw` | the opening drawing — the one thing on the main thread that is meant to be there |

Non-idle main-thread time over the ~10 s window was ~2.0 s. Source positions were recovered through
the source map of the same build. **Label: real-device.**

---

## 3. Performance Findings

### P0 — Severe

**None.** Nothing measured crashes, hangs, leaks or degrades over time.

---

### P1 — High impact

#### P1-A · The Earth's resting scene costs 135 draw calls and 379 k triangles, and 93 % of the geometry is six copies of one satellite model — NEW

**Evidence.** Draw calls and primitives counted at the WebGL call level, per frame, at two moments
of the same session:

| Moment | Draw calls | Triangles | GPU ms |
|---|---|---|---|
| Handover (`vertigo:intro-complete` + 2.5 s, satellites not yet revealed) | **14** | ~19 000 | 1.4 |
| At rest (handover + 14 s, all six satellites deployed) | **135** | **378 714** | 2.7 |
| At rest, phone-shaped viewport (five satellites in frustum) | 121 | 322 728 | 3.0 |

`satellite.glb` parses to **15 meshes / 58 626 triangles**, and `createOrbitSystem` builds one per
case study. The wide/narrow difference — 14 draws and 55 986 triangles — is one satellite leaving the
frustum, which identifies the per-satellite cost directly rather than by division.

**Measurement.** ~87 of 135 draw calls and ~352 k of 379 k triangles are satellite models. The
remainder is 6 orbit lines, 6 orbit heads, 6 hit meshes, 6 hologram quads, 6 emitter cones, the
connectivity cloud, the Earth, its atmosphere, the sky shell, the starfield, the galaxy band, the
corner logo, and ~13 fullscreen passes of bloom and output.

**Relevant files.** `public/models/satellite.glb`, `src/experiences/earth/orbit/createSatellite.ts`,
`src/experiences/earth/orbit/createOrbitSystem.ts`,
`src/experiences/earth/orbit/orbitAssignments.ts` (six presets).

**Root cause.** Not a defect — it is what happens when a detailed model is instanced once per case
study and the count went from "a badge" to "six full models with a hologram each". Nobody counted
it, because the first pass's Earth row was measured at the moment the intro hands over, before the
satellites exist (see §7.1). The model is authored at 58.6 k triangles and is drawn at ~30 px across
in the overview and at close-up framing only for one satellite at a time.

**User impact.** None observed on this desktop GPU: 2.7 ms is ~16 % of a 60 Hz budget. The impact is
entirely on hardware not measured here — a tile-based mobile GPU pays for 379 k triangles and 135
state changes very differently, and this is now the single largest unvalidated risk on the mobile
path along with the memory in P1-F.

**Proposed direction.** In rough order of ratio: (1) **decimate or LOD the satellite model** — 58.6 k
triangles buys nothing at 30 px, and the close-up needs one satellite at full detail, not six;
(2) **merge the 15 meshes into one** where materials allow, which removes ~75 of the 135 draw calls
on its own; (3) confirm whether the six hit meshes (`colorWrite: false`, drawn every frame) can be
raycast-only objects excluded from rendering. None of these is a visual change if the decimation is
chosen against the close-up framing rather than the overview.

**Complexity.** (1) is an asset pipeline change plus a visual check at the close-up; (2) is a
Blender-side merge governed by `docs/murcia/blender-export-contract.md`'s sibling for this asset;
(3) is local to `createSatellite.ts`.
**Expected benefit.** Up to ~75 draw calls and ~300 k triangles per frame. **No measurable
frame-time change is expected on this desktop** — the benefit is entirely for mobile and is
unproven until a phone measures it.
**Confidence.** **High** on the measurement and the attribution; **low** on the benefit, which is
the honest answer when the cost is 2.7 ms on the only GPU available.

---

#### P1-B · 412 ms of shader linking blocks the main thread, and 186 ms of it lands after handover — NEW

**Evidence.** `linkProgram`, `getProgramInfoLog` and `getProgramParameter` wrapped and timed across a
full session. `linkProgram` itself costs **0.5 ms total** (the driver links asynchronously);
**`getProgramInfoLog` costs 412 ms**, because it blocks until the link completes. Programs identified
by the uniform names in their attached shader sources:

| At | Stall | Program |
|---|---|---|
| 0.62–0.71 s | 9 × ~9 ms | the post-processing chain (bloom mips, `OutputShader`) |
| 1.60–1.70 s | 27 + 37 + 27 ms | textured GLB materials (`USE_MAP`, tone-mapped) |
| 3.09 s | 6 ms | `uOpacity` |
| **5.17–5.25 s** | **39 + 13 + 15 + 12 = 78 ms** | **`uSkyBrightness` (sky shell), `uAtmosphere uCloud` (Earth), `uTwinkleAmount` (starfield), `uAtmosphere` (atmosphere)** |
| **11.31–11.45 s** | **5 + 24 + 28 + 79.6 = 137 ms** | **`uDeploy uSpread uOpacity` (emitter cone) and `uDeploy uBrandColor uOpacity uField uRail uQuadScale` (the hologram)** |

Those two clusters correspond exactly to the two largest long tasks after handover in §2.1's wide
profile (87 ms at 5.19 s, 131 ms at 11.31 s).

**Measurement.** 412 ms total; **79.6 ms in one call**, 11.4 s into the session, for the hologram
material added on 2026-08-26/27.

**The obvious remedy was tested and does not work.** An interleaved A/B, one full load each arm, with
`getProgramInfoLog` stubbed to return `''` — which is exactly what
`renderer.debug.checkShaderErrors = false` produces:

| Arm | Blocking time | Long tasks | Stalls > 50 ms after handover |
|---|---|---|---|
| As shipped | `getProgramInfoLog` **417.8 ms** | 10 / **1 019 ms** | 5 190 ms:87, 11 313 ms:131 |
| Info-log skipped | `getProgramParameter` **353 ms** | 10 / **1 003 ms** | 5 200 ms:82, 11 323 ms:128 |

**The stall moves from the error check to the uniform-location fetch and the total does not change.**
Recording this is the point: disabling `checkShaderErrors` is the standard advice for exactly this
profile shape, it would have been an easy change to make, and it would have bought nothing.

**Root cause.** Three's `WebGLRenderer.compile()` prepares materials with `scene.traverse` — so
invisible objects *are* covered, and the comments in `OrbitSystemLayer.tsx:56`,
`createSatellite.ts:166` and `SpaceBackdrop.tsx:121` are right about that. What they do not account
for is **which program variant gets compiled**. In `three@0.174.0`,
`WebGLPrograms.getParameters` sets `outputColorSpace` to `renderer.outputColorSpace` when no render
target is bound and to `LinearSRGBColorSpace` when one is
(`node_modules/three/build/three.module.js:6954`); `outputColorSpace` is part of the program cache
key (`:7172`); and a material whose recorded colour space differs from the current one triggers
`needsProgramChange` (`:16208`). **`EarthScene`'s `compileAsync` runs outside the frame loop with no
render target bound, so it warms the sRGB-output variant of every material — and the Earth route
draws every one of them into `EffectComposer`'s HalfFloat render target, which needs the linear
variant.** The warm-up compiles programs the composer route then discards. That the Earth, sky,
starfield and atmosphere shaders re-link at 5.2 s, having been explicitly warmed at ~1.5 s, is the
observable consequence.

**User impact.** Two visible hitches on a scene that looks finished: ~87 ms at about five seconds
and ~131 ms at about eleven. At 60 Hz those are five and eight dropped frames, during the satellite
entrance and the resting orbit — the two moments the composition is asking to be looked at.

**Proposed direction.** Bind the composer's render target around the warm-up, so the variant that is
compiled is the variant that is drawn:
`gl.setRenderTarget(composerTarget)` → `await gl.compileAsync(scene, camera)` → `gl.setRenderTarget(null)`.
That needs the composer to exist before `gpu:warmup` runs, which is an ordering change in
`SceneCanvas`/`RenderPipeline` rather than a new mechanism. **Verify by re-running the same
instrumentation and checking that the 5.2 s and 11.4 s clusters disappear** — if they do not, the
hypothesis is wrong and the next candidate is that the hologram material is simply created after the
warm-up window.

**Complexity.** Moderate. The change is small; the ordering it depends on is not, and
`RenderPipeline` currently owns the composer while `EarthScene` owns the warm-up.
**Expected benefit.** Up to ~186 ms of post-handover main-thread stall, and a `gpu:warmup` step that
warms what is actually drawn. On a phone, where shader linking is slower, proportionally more.
**Confidence.** **High** that 412 ms of link stalls exist and where they land; **high** that
`checkShaderErrors` is not the fix, because that was measured; **medium** on the colour-space
mechanism, which is read from three's source and consistent with the timings but not yet proven by
the fix working.

---

#### P1-C · The mobile Earth textures are still encoded above the desktop set they replace — UNFIXED (prior P1-1)

**Evidence.** The three narrow files are **byte-identical** to the ones the first pass measured
(same sizes, same 2026-08-14 mtimes), and `scripts/prepare-earth-textures.mjs` still reads
`const QUALITY = 90`. Nothing about this finding has changed, so its measurement stands as written:
the narrow set has **one quarter the pixels and is only 30 % smaller** (1.70 MB vs 2.43 MB), and
`specularClouds-narrow.jpg` carries **3.1× the bit rate per pixel** of the 4096×2048 file it
substitutes for.

**Measurement, updated to today's payload.** The narrow load is **4.86 MB**; re-encoding the set at
the wide set's rate predicts **609 KB instead of 1 702 KB**, taking the mobile visit to **~3.77 MB**.
On the measured Slow 4G narrow load (22.9 s to scene-ready) that is **≈5.5 s**.

**Relevant files.** `scripts/prepare-earth-textures.mjs`, `public/earth/*-narrow.jpg`, `index.html`.

**Root cause, user impact, proposed direction, complexity.** Unchanged from
`reports/website-performance-and-optimization-2026-08-20.md` §P1-1, which states them correctly and
in full. This entry exists to record that the finding was not acted on and still holds exactly.

**Confidence.** **High.** It is the same three files.

---

#### P1-D · The priority order is inverted: required assets are fetched Low, not-required assets High — UNFIXED and sharpened (prior P1-2)

**Evidence.** The first pass established the contention. This pass read Chrome's own
`initialPriority` for every request, which it could not:

| Asset | Bytes | Priority | Required for readiness? |
|---|---|---|---|
| `earth/specularClouds.jpg` | 1 692 708 | **Low** | **yes** |
| `earth/day.jpg` | 473 415 | **Low** | **yes** |
| `earth/night.jpg` | 267 383 | **Low** | **yes** |
| `textures/sky-panorama.avif` | 189 109 | **Low** | **yes** |
| `assets/three-*.js` | 220 853 | High | **yes** |
| `assets/SceneCanvas-*.js` | 81 799 | High | **yes** |
| `models/city-prototype.glb` | 1 286 875 | **High** | no |
| `libs/basis/basis_transcoder.wasm` | 527 609 | **High** | no |
| `draco/draco_decoder.wasm` | 192 696 | **High** | no |
| `textures/satellite_Baked.ktx2` | 151 090 | **High** | no |
| `models/satellite.glb` | 270 257 | Low | no |
| `logos/*.png` | 114 858 | Low | no |

**Measurement.** Required ≈ **3.10 MB**, not-required ≈ **2.60 MB** (up from 2.24 MB, because the
city model grew and the CMS logos are new). **2.16 MB of the not-required set is fetched at `High`
priority; 2.62 MB of the required set is fetched at `Low`.**

**Root cause.** Two correct local decisions that were never reconciled. `index.html` demotes the
Earth preloads to `fetchpriority="low"` deliberately and for a good documented reason — they must
not out-rank the app chunk. Meanwhile the city, the decoders and the satellite bake are fetched by
three's `FileLoader` over XHR, which Chrome defaults to `High`. Neither side is wrong on its own;
together they invert the intended order. **The first pass's inference that HTTP/2 on Vercel will make
this worse than the local HTTP/1.1 measurement still stands and is still untested.**

**User impact.** Up to ~11 s of additional wait before anything is on screen on the slowest
connections. Invisible on fast links.

**Proposed direction.** Unchanged from the first pass, with one addition the priority column makes
obvious: the demotion of the Earth preloads to `Low` was aimed at the *app chunk*, and it is now
paying for the *city model* too. Whatever gates or re-prioritises the JS-initiated fetches should be
paired with re-examining whether the required textures still need to be `Low` once the not-required
set is out of their way.

**Complexity.** Low-to-moderate. **Expected benefit.** Up to ~40 % off time-to-scene on Slow 4G.
**Confidence.** **High** on the contention and the priorities, which are measured; **medium** on the
projection.

---

#### P1-E · GPU texture memory now scales with the number of published case studies — NEW

**Evidence.** `createBrandAtlas` is called twice — once for `isotype`, once for `logo`
(`createOrbitSystem.ts:85-86`) — and each sizes its canvas as `COLUMNS × cell.width` by
`ceil(plates.length / COLUMNS) × cell.height`, with `COLUMNS = 2`, an isotype cell of 512×512 and a
logo cell of 1024×512. With today's six case studies that is three rows:

| Atlas | Dimensions | GPU resident (mipped, sRGB8_ALPHA8) |
|---|---|---|
| logo | 2048×1536 | **16.0 MiB** |
| isotype | 1024×1536 | **8.0 MiB** |
| | | **24.0 MiB total** |

Both were observed in the allocation census as `texStorage2D` calls at exactly those dimensions, on
desktop and on the phone-shaped viewport alike — **the atlases are not viewport-derived, unlike the
Earth maps and the sky.**

**Measurement.** 24.0 MiB, which is **18 % of the 130 MiB phone-path residency** and larger than any
single content texture on that path (the narrow Earth maps are 10.67 MiB each). The scaling law is
**+8 MiB per two additional case studies** (one more row: 2048×512 mipped = 5.33 MiB, plus
1024×512 = 2.67 MiB). Twelve case studies would cost **48 MiB**; twenty would cost **80 MiB**, more
than the entire proposed phone budget.

**Relevant files.** `src/experiences/earth/orbit/createBrandAtlas.ts:84` (`CELL`), `:36` (`COLUMNS`),
`:371-372` (canvas sizing), `src/experiences/earth/orbit/createOrbitSystem.ts:85-89`.

**Root cause.** Three separate correct decisions compounding. The atlas was sized for the case-panel
close-up, where the artwork is the most magnified thing on screen — a defensible reason for 1024×512
cells, argued in the file. The second atlas arrived on 2026-08-25 with "satellites rest on the
isotype and unfold into the logo on selection", which is a design improvement. And the grid is sized
from the plate list rather than a fixed 2×3, which is correct — it is what stops a seventh case
study sharing a cell. Nothing here is a mistake; the consequence is that **a marketing site's GPU
memory is now editable from a CMS**, and the first pass's already-breached phone budget gets 8 MiB
worse every time the client publishes two more case studies.

**User impact.** On desktop, none observed. On iOS, where a tab is terminated for its total
footprint, this is the one growth path that does not require a deploy — the failure would appear
after a content edit, with no code change to correlate it against.

**Proposed direction.** Three separable levers: (1) **size the cells from the viewport** the way the
Earth maps and the sky already are — the isotype is seen at ~30 px in the overview and the lockup at
the close-up, and a phone's close-up is a third of a desktop's; (2) **cap the atlas and page it** if
the case count is ever expected to grow past a handful, so the ceiling is a constant rather than a
content field; (3) at minimum, **assert the atlas dimensions in `checks/`** so the build says what
publishing the seventh case study costs. (3) is the one that should happen regardless of the others,
because the value of a content-driven site is that publishing does not need an engineer, and that is
only true if publishing cannot silently cross a hardware limit.

**Complexity.** (3) low — it is a harness in a directory full of them. (1) low in code, but the
target resolution needs a look at a real badge at 390 px. (2) moderate.
**Expected benefit.** Up to ~18 MiB on the phone path today, and a bounded number instead of an
unbounded one.
**Confidence.** **High** on the measurement and the scaling law, both read directly from the code and
confirmed in the allocation census; **medium** on the specific target resolution.

---

#### P1-F · The post-processing chain is 59 % of GPU texture memory at DPR 2 and 52 % on the phone path — REVALIDATED (prior P1-3)

**Evidence.** §2.5. The first pass's conclusion holds and the numbers have moved with the content:
the post chain costs **66.8 MiB at DPR 1**, **267.3 MiB at DPR 2**, and **71.3 MiB on the
phone-shaped viewport** — where it is more than the entire Earth texture trio (32 MiB).

**Measurement, corrected against the first pass.** The 15 offscreen targets are `EffectComposer`'s
read/write pair, `AfterimagePass`'s comp/old pair (all four full resolution, 8 bytes/px HalfFloat),
and `UnrealBloomPass`'s bright target plus five horizontal and five vertical mips, together with one
`DEPTH_COMPONENT24` renderbuffer each. Growth is exactly DPR² in both columns.

**The afterimage half of the first pass's finding stands unchanged**: the pass is correctly disabled
outside the ~1.6 s warp, and `EffectComposer` still holds its two full-resolution targets resident
for the entire session — **79.1 MiB at DPR 2, 21.1 MiB on the phone path, for a pass that runs 1.6
seconds per transition.**

**Relevant files.** `src/graphics/RenderPipeline.tsx:110-144` (composer construction), `:146-149`
(`setSize`/`setPixelRatio`), `src/components/SceneCanvas.tsx` (`dpr={[1, 2]}`, `antialias: true`).

**Proposed direction.** Unchanged: allocate the afterimage targets on demand; make the DPR cap
capability-derived on a memory signal rather than a frame-time one. The third lever the first pass
proposed — reconsidering `antialias: true` — should be dropped from the roadmap on this pass's
evidence: see §7.1, where the multisample memory it was aimed at turns out not to be allocated by
this application at all.

**Complexity.** Moderate and local for the afterimage; moderate plus a policy decision for DPR.
**Expected benefit.** Up to ~79 MiB (desktop DPR 2) / ~21 MiB (phone) from the afterimage targets;
up to ~200 MiB from a DPR policy on constrained devices. No frame-time change expected.
**Confidence.** **High** on the measurements; **high** that the afterimage change is safe.

---

### P2 — Moderate

#### P2-G · The decoder pools are still never released — UNFIXED (prior P2-5)

**Evidence.** `Worker` constructor instrumented across a full session including four Earth↔Murcia
round trips: **6 workers created from exactly 2 distinct blob URLs (4 Draco + 2 Basis), 0
terminated** — at handover, after the round trips, and at end of session. Identical to the first
pass.

**Root cause.** Unchanged and re-confirmed in source: `MurciaExperience` acquires both loaders in its
constructor (`:192`) and releases them only in `dispose()` (`:773`), which never runs because both
experiences stay mounted for the application's lifetime (ADR 001/003). The reference count cannot
reach zero. `createAssetLoader.ts:64-68` releases both together and is correct about why; it is the
call site that never fires.

**Proposed direction, complexity, benefit.** Unchanged from the first pass §P2-5: release when the
*load* completes rather than when the *experience* is destroyed. Verify with the same census —
`terminated` should reach 6.
**Confidence.** **High** — measured twice, seven days apart, with the same result.

---

#### P2-H · 641 KB of KTX2 machinery ships to decode 174 KB of texture — UNFIXED and larger than measured (prior P2-4)

**Evidence.** The first pass counted the 584 KB of Basis transcoder fetched over the wire. The
source-mapped bundle attribution adds the JavaScript half, which is inside the **eagerly-loaded
`three` chunk**:

| Component | Bytes | Where |
|---|---|---|
| `libs/basis/basis_transcoder.wasm` | 527 333 | fetched at ~0.89 s |
| `libs/basis/basis_transcoder.js` | 57 529 | fetched at ~0.89 s |
| `three/examples/jsm/libs/zstddec.module.js` | **39 745** | inside `assets/three-*.js` |
| `three/examples/jsm/loaders/KTX2Loader.js` | 12 459 | inside `assets/three-*.js` |
| `three/examples/jsm/libs/ktx-parse.module.js` | 4 717 | inside `assets/three-*.js` |
| **Total** | **641 783** | to decode **173 922 B** of texture |

**Measurement.** A ratio of **3.7:1**. The Zstandard decoder is the part worth naming separately: it
exists for KTX2 files with `supercompressionScheme=2`, and **both of this project's KTX2 files are
BasisLZ (scheme 1)**, so it is 39 745 B of raw JavaScript — ~4.9 % of the `three` chunk — that can
never execute. It is also the one item here that costs bytes on the **required** path, since
`three` gates `chunk:scene`.

**Proposed direction.** Unchanged from the first pass: decide against the asset roadmap, not against
today's two files. What this pass adds is that the fixed cost is 641 KB rather than 584 KB, and that
57 KB of it is in the chunk that gates readiness. If the roadmap says the city's trim sheets arrive
as KTX2, all of this amortises and the answer is "keep it". If it does not, dropping `KTX2Loader`
removes the transcoder, the zstd decoder and two of the six resident workers in one change.

**Complexity.** Low if dropping; nil if the roadmap answers it.
**Confidence.** **High** on the measurement; **low** on the recommendation until the asset roadmap is
known. That is the same answer as the first pass, and it has now been open for a week.

---

#### P2-I · 19 018 B of GSAP `CSSPlugin` is in the app entry, and nothing in the codebase animates a DOM property — NEW

**Evidence.** Source-mapped attribution of `assets/index-*.js`: `gsap/gsap-core.js` 51 692 B and
`gsap/CSSPlugin.js` 19 018 B, together **22.4 % of the 317 614 B entry chunk**. Every GSAP call site
in the repository was read: `useMasterTimeline.ts` and `useExperienceTransition.ts` are the only two
modules that import GSAP, and every tween target is a plain object literal —
`{ progress: from }` (`useExperienceTransition.ts:169`), `{ value: 1 }`, `{ progress: 0 }`,
`{ progress: 0 }` (`useMasterTimeline.ts:102/117/147`) — or `{}` used purely as a duration spacer.
There is no `gsap.set` on an element, no selector string, and no DOM target anywhere.

**Measurement.** 19 018 B raw / ~6 KB gzipped of the entry chunk, which is at **95.6 % of the
332 000 B budget that fails the build**. Dropping it takes the entry to ~298 600 B, or 89.9 %.

**Relevant files.** `src/experiences/earth/timeline/useMasterTimeline.ts:2`,
`src/app/useExperienceTransition.ts:2`, `vite.config.ts` (`ENTRY_BUDGET_BYTES`).

**Root cause.** `import gsap from 'gsap'` pulls the package's convenience bundle, which registers
`CSSPlugin` so that `gsap.to('.thing', { x: 100 })` works out of the box. This project animates
numbers and reads them in `onUpdate`; the DOM plugin has never had anything to do.

**User impact.** ~6 KB gzipped on the critical path, and 19 KB of the headroom in the one budget that
can fail a build.

**Proposed direction.** Import from `gsap/gsap-core` instead. `gsap.timeline`, `gsap.context` and
`ctx.revert()` — everything these two files use — are all in the core. The change is two import
lines. **Verify by building and reading the budget line the build prints**, and by running the
existing `checks/navigation-feel` and `e2e/boot.spec.ts`, which are what actually assert the
timelines still behave.

**Complexity.** Trivial, with a real regression surface: if anything ever *does* want to tween a DOM
property, it will fail silently rather than loudly. A comment at the import saying so is part of the
change.
**Expected benefit.** 19 018 B raw / ~6 KB gzipped off the entry, and 5.7 points of budget headroom.
**Confidence.** **High** — the attribution is from the source map and every call site was read.

---

#### P2-J · Load-time long tasks rose 37 %, and 373 ms of the total is synchronous texture upload — NEW

**Evidence.** §2.1 and §2.7. Long tasks during a local wide load: **8 tasks / 975 ms**, worst
**238 ms**, against the first pass's 7 / 711 ms with a worst of 152 ms. The CPU profile attributes
**373 ms of `texSubImage2D`** to `gl.initTexture` — 283 ms from `EarthScene.tsx:120` (the three
4096×2048 maps) and 90 ms from `SkyShell.tsx:241` (the 4096×2048 panorama).

**Measurement.** The 200 ms single-task budget the first pass proposed is **breached locally**
(238 ms) and comfortably breached under a 4× CPU throttle (442 ms).

**Root cause.** Two things, and only one is a problem. The texture upload is **deliberate** — it is
what `gpu:warmup` exists to do, the drawing owns the pause, and moving it would move a stall into
the frame after the cut. It is included here because it is the largest single item and because it
scales directly with the texture dimensions P1-C would reduce: a narrow set at the wide set's
encoding does not change the pixel count, but a smaller *panorama* or a viewport-derived atlas
(P1-E) would. The genuinely new cost is P1-B's shader linking, which is not deliberate.

**Proposed direction.** Treat P1-B and P1-E as the actionable half of this finding and leave
`gpu:warmup` alone. What is worth adding independently is a **budget assertion**: the first pass
proposed "no single task > 200 ms" and nothing enforces it, which is why a 57 % regression in the
worst task went unnoticed for a week.

**Complexity.** Low for the assertion, if it is attached to the existing e2e run rather than built as
new machinery.
**Expected benefit.** Regression detection, not user-facing time.
**Confidence.** **High** on the numbers; **high** that the upload half is correct as designed.

---

#### P2-K · `vertigo:scene-ready` is marked up to 60 times per load, so anything that reads it reads the wrong number — NEW

**Evidence.** `performance.getEntriesByName('vertigo:scene-ready')` on a Slow 4G narrow load returned
**52 entries**, from 23 016 ms to 24 108 ms. On a fast local load it returns **1**. The mark is
emitted from `boot.ts:108-112`, inside a `bootState.subscribe` callback that fires on *every*
notification and re-marks whenever readiness is still `'ready'` — so every progress report from a
not-required resource that is still downloading after readiness adds another mark.

**Measurement.** On the profile where it matters most — a slow connection, where the city model is
still arriving when the scene becomes ready — the last mark lands **1 092 ms after the first**, and
**after `vertigo:intro-complete`**. A consumer taking the last entry therefore records the intro
completing *before* the scene was ready, which is the one thing the boot contract exists to
guarantee cannot happen.

**Relevant files.** `src/intro-draw/boot.ts:107-112`. The adjacent `intro-visible` mark already has
exactly the right guard — a `sawVisible` boolean at `:83-88` — so this is an inconsistency within one
function rather than a missing idea.

**Root cause.** `readiness()` is a latched state, not an edge. Subscribing to a state and marking on
every notification marks the state, not the transition.

**User impact.** None on the running site — nothing in the application reads the mark. The impact is
on measurement: a RUM tool, a `performance.measure`, a synthetic monitor or the next audit will all
read a time that is up to a second late, and only on slow connections, which is precisely where the
number matters. **This pass's own first measurement run had the bug and had to be repeated**; §2.1's
numbers are from the corrected run.

**Proposed direction.** Latch it, the way `intro-visible` already is. One boolean.

**Complexity.** Trivial.
**Expected benefit.** A boot metric that means what it says.
**Confidence.** **High** — 52 entries were enumerated directly.

---

#### P2-L · `alpha: false` still does not reach the WebGL context — UNFIXED (prior P2-7)

**Evidence.** Context attributes read back from the live renderer this pass:
`{alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true,
preserveDrawingBuffer: false, powerPreference: "high-performance",
failIfMajorPerformanceCaveat: false}`. The requested `alpha: false` is applied in-engine only;
`three@0.174.0` builds its context attributes with a hardcoded `alpha: true`.

The comment at `src/components/SceneCanvas.tsx:121-126` still states the mechanism it no longer
delivers — *"costs a per-frame composite of the WebGL layer against the page, which iOS cannot
elide"* — and that mechanism is decided by the context attribute three overrides.

**Proposed direction.** Unchanged from the first pass: keep `alpha: false` (it is what makes
`setClearColor(0x050507, 1)` correct), and correct the comment so nobody re-derives a saving that is
not there.
**Complexity.** Trivial. **Confidence.** **High** that the attribute is overridden — read from the
live context.

---

#### P2-M · The SceneCanvas chunk grew 13 % in a week, gates readiness, and has no budget — NEW (extends prior P2-8)

**Evidence.** `assets/SceneCanvas-*.js` is **243 443 B raw / 81 376 B gzip**, up from 215 189 B —
**+28 254 B in seven days**, and **3 443 B over the 240 000 B budget the first pass proposed** for it.
84 % of the growth is `createHoloPanel.ts` (16 535 B) and `createEmitterCone.ts` (7 023 B).

`vite.config.ts` asserts two budgets — the 16 000 B intro entry and the 332 000 B app entry — and
both did their job this week: the app entry budget fired at 322 853 B on 2026-08-26 and was raised
to 332 000 B **with a written record of what was added and a check that three had not leaked**,
which is exactly the convention the file asks for. The entry is now at **95.6 %**, healthier than the
97.1 % the first pass measured.

**Measurement.** The chunk with no ceiling is the one that grew, and it is on the required path
(`chunk:scene`). At the current rate it is the next thing to surprise someone.

**Proposed direction.** Give `SceneCanvas` a budget in the same mechanism, set from today's measured
size with deliberate headroom. §4 proposes 260 000 B. Also correct `buildFlags.ts:13`, which says the
entry is at "~96 %" — true today by coincidence after the budget was raised, and the comment
explicitly asks to be re-measured rather than trusted.

**Complexity.** Low — the assertion helper already exists and takes a named chunk.
**Expected benefit.** Build reliability, not user-facing performance.
**Confidence.** **High.**

---

### P3 — Minor

| # | Finding | Evidence | Direction | Status |
|---|---|---|---|---|
| P3-9 | `draco/draco_decoder.js` (512 465 B) is deployed and never requested — every browser takes the WASM path. Confirmed absent from all 31 requests in every run this pass. | waterfall | Keep only if a no-WASM fallback is a stated requirement. Deploy weight only, no user bytes. | **Unfixed** (prior P3-9) |
| P3-10 | Murcia's debug surface still ships to production: `stats.js` (1 826 B), `debug/DebugOverlay.ts` (2 436 B) and `debug/MurciaDebugTools.ts` (2 134 B) — **6 396 B** in the production Murcia chunk, confirmed by `showPanel`, `debug-overlay` and `boundsHelper` all appearing in the built file. **New this pass:** the sky-cubemap prototype now ships the same way — `SkyShellCube.tsx` (1 580 B), `shellCube.frag.glsl` (1 173 B), `protoSky.ts` (331 B), `protoHolo.ts` (103 B), **3 263 B** in the *readiness-gating* SceneCanvas chunk, with `/proto-sky/` and `posx` present as string literals. The React `/debug` console still folds correctly. | source-map attribution + string search in the built chunks | Same fold, applied to both: a compile-time `DEBUG_TOOLS_ENABLED` guard with a dynamic `import()` rather than a runtime call after a static import. The runtime guard is why Rollup cannot shake either. | **Unfixed and grown** (prior P3-10) |
| P3-11 | Unversioned static assets get `max-age=86400, stale-while-revalidate=604800`; only `/assets/*` is `immutable`. **New:** `/logos/` was correctly added to the cached path list, and Sanity's filenames already carry a content hash (`<hash>-1300x650.png`) — so these are the one unversioned group that is *provably* immutable and is not marked as such. | `vercel.json` | Content-hash the remaining large static assets and promote the hashed ones to `immutable`. The 24 h rule is right for genuinely unversioned names; the CMS media are not that. | **Unfixed** (prior P3-11) |
| P3-12 | `anisotropy = 8` on the three Earth maps, `4` on both brand atlases. Real per-fragment bandwidth on a tile-based GPU; not measurable on this hardware. | source | Belongs to the device profile. | **Still open** (prior P3-12, since 2026-08-14) |
| P3-13 | Comment drift on load-bearing numbers. `bootState.ts:61` still calls the city "a 456KB Draco parse"; it is **1 286 596 B** today, 2.8× the stated figure. `buildFlags.ts:13` says "~96 %" of the entry budget, which is accidentally right (95.6 %) after the budget was raised for a different reason. `SceneCanvas.tsx:121-126` still states the alpha mechanism P2-L disproves. **New:** `OrbitSystemLayer.tsx:61` says the atlas raster is "2048×1536" — there are now two, 2048×1536 and 1024×1536. | source vs. measurement | Update all four. These are the numbers the next change will be reasoned from. | **Unfixed and grown** (prior P3-13) |
| P3-14 | `dist/` is **631 MB** after a production build, because `vite build` copies all of `public/` and `public/proto-sky/` is 621 MB of prototype cubemap faces. **This is not a production problem:** `/public/proto-sky/` is git-ignored, Vercel builds from Git, and the deployable half of `public/` is 8.0 MB. It has two local costs and one hazard. Cost: every `npm run e2e` (which runs `vite build` first) writes 621 MB. Hazard: a CLI `vercel deploy` from a working copy uploads local files rather than Git contents, and would carry all of it. | `du`, `.gitignore`, build output | Nothing is broken. Worth one line in the deploy documentation saying that this project must be deployed from Git, and worth knowing before someone debugs a slow local build. | **New** |

---

## 4. What was measured and found *not* to be a problem

The brief asks repeatedly not to optimize theoretical bottlenecks. These were each tested this pass
and each came back negative. They are recorded so the next pass does not spend the time again — and
in two cases, so that a plausible optimization does not get implemented.

| Hypothesis | Test | Result |
|---|---|---|
| **`renderer.debug.checkShaderErrors = false` removes the shader stalls** | Interleaved A/B, full load each arm, `getProgramInfoLog` stubbed | **No.** The stall moves to `getProgramParameter` (417.8 → 353 ms) and total long-task time is unchanged (1 019 → 1 003 ms). The post-handover hitches at 5.2 s and 11.4 s survive in both arms. **Do not implement this.** |
| Geometry is a limiting factor | Per-frame primitive counting on both routes | **No.** Murcia draws **1 857 750 triangles per frame at 2.0 ms** — more triangles than Earth by 5× and *cheaper*, because it takes the direct route. Triangle count is not what costs anything here; framebuffer work is. |
| The per-frame `getBoundingClientRect()` in Murcia's label positioning forces layout | CDP Performance metrics across 5 s of Murcia with the pointer sweeping buildings | **No.** **0 layouts and 0 ms of layout time.** `DistrictLabel.setPosition` writes `transform` only, so nothing dirties layout for the read to force. The comment at `districtLabel.ts:50` is correct. |
| The DOM is expensive | CDP Performance metrics, both experiences | **No.** 197 elements on Earth, 193 in Murcia, 1 canvas. Style recalculation is one per rendered frame at 44–66 ms per 5 s (~1 % of the thread). |
| Repeated Earth↔Murcia transitions leak | 4 round trips with a full GPU-resource census after each | **No.** Textures **29**, programs **43**, buffers **706**, texture bytes **255 204 448** — every one of them identical after each of the four trips. |
| Prolonged runtime degrades | 5 minutes, 30 samples, vsync unlocked | **No.** GPU 2.8–3.0 ms median at every sample; CPU 0.8–1.2 ms; heap oscillating 29–54 MiB with no trend. |
| Failed assets cause retry storms | Six blocking cases: required Earth JPEGs, optional city GLB, Draco, Basis, CMS logos, the whole sky | **No, and every documented fallback fired.** Every blocked URL was requested **exactly once**. Required → clean `fatal` in **814 ms** naming `earth:textures: failed to load /earth/day.jpg`. Optional city → `ready`, site usable. Draco → `ready`, satellites absent with a named error. Basis → `ready`, satellites untextured with a named warning. CMS logo → `ready`, drawn plate kept, brand named in the warning. Sky → falls back AVIF → WebP, and with both blocked still reaches `ready`, exactly as `bootState.ts` documents. |
| Fonts delay first paint | Source and waterfall | **No `@font-face`, no web font requests, zero font bytes** — unchanged. (`styles.css` asks for `'Inter', system-ui`; `murcia.css` asks for `-apple-system…`. That is a typography consistency question, not a performance one.) |
| Preloads are wasted | Waterfall initiator types, wide and narrow | **No.** Exactly one Earth/sky resolution set is fetched per viewport, every preload was used, no duplicate downloads. |
| The blog content ships | String search for `BLOG_POSTS` across all chunks | **No.** Modelled but unrendered content is tree-shaken out of every chunk. |
| Background tabs keep rendering | Second tab foregrounded for 6 s | **Not verified, again.** Headed Playwright did not flip `document.hidden` (it read `false` throughout), so this measured 1 233 rAF/s of a *visible* tab. The app's four `visibilitychange` guards are verified in source only. Unchanged limitation from the first pass. |

---

## 5. Performance Budget Proposal

Two budgets exist and fail the build (`vite.config.ts`). That mechanism proved itself this week — the
app entry assertion fired at 322 853 B and forced a deliberate, documented decision instead of a
silent 3 % growth. This proposal extends it rather than inventing a parallel system.

| Budget | Proposed | Measured today | Status vs. 2026-08-20 |
|---|---|---|---|
| Intro entry (raw) | 16 000 B *(existing)* | 14 057 B | unchanged |
| App entry (raw) | 332 000 B *(existing, raised deliberately)* | 317 614 B (95.6 %) | **improved** — was 97.1 % |
| **SceneCanvas chunk (raw)** | **260 000 B** *(new — the readiness-gating chunk, and the only one with no ceiling)* | 243 443 B | **breaches the first pass's proposed 240 000 B** |
| **Required boot payload, wide** | **2.8 MB** | ~3.10 MB **over** | worse — was ~3.03 MB |
| **Required boot payload, narrow** | **1.4 MB** | ~2.26 MB **over** | roughly unchanged; P1-C alone brings it to ~1.2 MB |
| **Total first-visit transfer, narrow** | **3.0 MB** | 4.86 MB **over** | worse — was 4.47 MB |
| **Texture residency, phone-shaped viewport** | **90 MB** | 130 MiB **over** | worse — the second brand atlas is 8 MiB of it |
| **Brand atlas residency, total** | **12 MiB, and constant in the case-study count** *(new)* | 24.0 MiB, **+8 MiB per two case studies** | **new breach** — see P1-E |
| **Render-target memory** | **≤ 25 % of texture residency** | 52 % (phone), 59 % (desktop DPR 2) | worse |
| **Draw calls per frame** | **200** | **135** (Earth) / 176 (Murcia) | Earth was 14–20; the headroom halved in a week |
| **Triangles per frame** | **2 000 000** *(raised from 900 k — Murcia measurably exceeded it at 2.0 ms, so the old number described a limit that does not exist)* | 379 k (Earth) / **1 858 k** (Murcia) | Murcia was 704 k |
| **GPU ms/frame, desktop reference** | **8 ms** | 2.7 (Earth) / 2.0 (Murcia) | Earth was 1.7 |
| **Long tasks during load** | **no single task > 200 ms** | **238 ms local, 442 ms at 4× CPU** **over** | **new breach** — was 152 ms |
| **Post-handover main-thread stalls** | **none over 50 ms** *(new)* | **87 ms at ~5.2 s, 131 ms at ~11.4 s** **over** | **new breach** — see P1-B |
| **DPR cap** | **2, and capability-derived below that** | 2, constant | unchanged |
| **CLS** | **0** | 0 | unchanged |

Six budgets are breached and **every one of them is either bytes on the wire, GPU memory, or
main-thread stalls. None is a frame-time budget.** That was the first pass's conclusion for two of
those three categories; the third — main-thread stalls after handover — is new, and it is the only
one a visitor on good hardware and a good connection can actually see.

---

## 6. Device Quality Strategy

The first pass's answer was: **yes, a centralized model, but a small one, and for memory rather than
for frame rate.** Everything measured this pass supports that and nothing changes its shape. DPR 1→2
still costs **+0.6 ms and +201 MiB**. The cap still has the right owner in `SceneCanvas` and still
needs to become a function rather than a constant. It should be decided once, at boot, from
capability signals (`navigator.deviceMemory`, `hardwareConcurrency`, the framebuffer pixel count the
viewport implies) and never from user-agent brand. It must not change at runtime, because resizing
the composer at DPR 2 reallocates ~194 MiB and that is a memory spike introduced to solve a
frame-rate problem that does not exist.

**One thing to add to its scope, and one to remove.**

**Add: the brand atlas dimensions.** P1-E makes the atlas the only content-driven entry in the
texture budget and it is currently viewport-independent — a phone allocates the same 24 MiB as a
5K desktop. It is generated at runtime, so its resolution is a free parameter in exactly the way the
Earth maps' is not. If a quality model exists at all, this is the second number it should own.

**Remove: `antialias`.** The first pass listed reconsidering `antialias: true` at high DPR as a lever
worth up to 97 MB. §7.1 shows that memory is not allocated by this application, so the lever does not
exist. Dropping it from the roadmap is the right response to the measurement.

---

## 7. Revalidation of the 2026-08-20 findings

Every finding the first pass raised, checked against the build measured today.

| Finding | Verdict |
|---|---|
| **P1-1** — the narrow Earth set is encoded above the wide set | **Unfixed, byte-identical.** `QUALITY = 90` unchanged; the three files still carry their 2026-08-14 mtimes and exact sizes. Now P1-C. |
| **P1-2** — not-required assets compete with the readiness path | **Unfixed and worse.** The not-required set grew from 2.24 MB to 2.60 MB, and this pass shows **2.16 MB of it is fetched at `High` priority while 2.62 MB of the required set is fetched at `Low`.** Now P1-D. |
| **P1-3** — the post chain costs more GPU memory than the content | **Holds, with corrected arithmetic.** 66.8 MiB at DPR 1, 267.3 MiB at DPR 2, 71.3 MiB on the phone path. The afterimage targets are still allocated for the whole session for a pass that runs 1.6 s per warp. Now P1-F. **One component of it was wrong — see §7.1.** |
| **P2-4** — 584 KB of Basis transcoder for 174 KB of texture | **Unfixed, and the true figure is 641 KB** once the KTX2/zstd/ktx-parse JavaScript in the `three` chunk is counted. Now P2-H. |
| **P2-5** — the decoder pools can never be released | **Unfixed.** 6 created, 0 terminated, measured again across four round trips. Now P2-G. |
| **P2-6** — the brand atlas is the largest single texture on the mobile path | **Unfixed and materially worse.** There are now **two** atlases totalling 24.0 MiB, and the size scales with the case-study count. Promoted to P1-E. |
| **P2-7** — `alpha: false` does not reach the context in three ≥ r163 | **Unfixed.** Read back from the live context again: `alpha: true`. The comment still states the disproved mechanism. Now P2-L. |
| **P2-8** — the app entry is at 97.1 % of its budget | **Acted on, correctly.** The assertion fired at 322 853 B on 2026-08-26 and the budget was raised to 332 000 B with a written record of what was added and a check that three had not leaked — the convention the file asks for. The entry is now at 95.6 %. The second half of the finding — *give SceneCanvas a budget too* — was **not** acted on, and that chunk grew 13 % in the same week. Now P2-M. |
| **P3-9** — `draco_decoder.js` is deployed and never requested | **Unfixed.** Absent from all 31 requests in every run. |
| **P3-10** — Murcia's debug surface ships | **Unfixed, and the sky prototype now ships the same way** — 3 263 B of it in the readiness-gating chunk. |
| **P3-11** — only `/assets/*` is `immutable` | **Unfixed.** `/logos/` was added to the 24 h group; its filenames already carry a content hash and could be `immutable`. |
| **P3-12** — `anisotropy = 8` | **Still open.** Not measurable on this hardware; open since 2026-08-14. |
| **P3-13** — comment drift | **Unfixed and grown.** `bootState.ts:61` is now wrong by 2.8×, and `OrbitSystemLayer.tsx:61` describes one atlas where there are two. |
| **No P0s; no leaks; no retry storms; DPR cap works; CLS 0; no web fonts; no wasted preloads** | **All hold**, re-measured. |
| **Frame time is not the problem** | **Holds for average frame time** — 2.0–2.7 ms GPU on both routes, no drift over five minutes. **Does not hold for frame-time spikes:** two stalls over 85 ms land after handover (P1-B), which the first pass did not look for. |

### 7.1 Two corrections to the 2026-08-20 numbers

Both are measurement corrections, not regressions, and both matter because a roadmap item was built
on one of them.

**1. This application allocates no multisampled renderbuffers.** The first pass reported "MSAA
renderbuffers" of 24.3 MB at DPR 1 and 97.2 MB at DPR 2, and proposed reconsidering `antialias: true`
to reclaim them. Instrumenting `renderbufferStorageMultisample` directly returns **zero calls** in
every configuration measured — desktop DPR 1 through 3 and the phone-shaped viewport. The 16
renderbuffers this application allocates are all single-sample `DEPTH_COMPONENT24` depth attachments
for the composer's render targets (18.2 MiB at DPR 1, 72.9 MiB at DPR 2), and they are required
whether or not antialiasing is on. `EffectComposer` builds its targets with no `samples`, which
`RenderPipeline.tsx:70-76` states correctly; the canvas-level `antialias: true` affects the **default
drawing buffer**, whose multisample storage is allocated by the driver and is not observable from
JavaScript at all. The first pass's own note that those figures were "approximate" and assumed
"4 bytes/px per sample" is consistent with their having been inferred rather than counted.
**Consequence: the ~97 MB that P1-3's third lever proposed to reclaim is not there, and that lever is
withdrawn in §6.**

**2. The first pass's Earth frame row measured the pre-satellite scene.** It reported the Earth route
at 18–20 draw calls and ~19 100 triangles. This pass measures **14 draws and ~19 000 triangles at the
moment the intro hands over**, and **135 draws and 378 714 triangles once the satellites have
deployed**, in the same session fourteen seconds apart. The first pass's number is a correct
measurement of a moment that lasts a few seconds; the resting scene is what a visitor looks at. Some
of the 7× difference in P1-A is therefore a measurement-window correction rather than a regression —
but not all of it: the hologram and emitter cone are two new draws per satellite that did not exist
on 2026-08-20, and the satellite models were always going to be 87 draws whenever anyone counted
them at the right moment.

---

## 8. Optimization Roadmap

Ranked by Impact × Confidence ÷ Complexity.

### Immediate wins — high confidence, low risk

1. **P1-C · Re-encode the narrow Earth set at the wide set's quality.** ~1.09 MB per mobile visit,
   ~5.5 s on Slow 4G, from one constant in an existing script. **Open for a week; it is still the
   largest single byte win in the audit and the cheapest to make.** Needs one visual check at 390 px.
2. **P2-I · Import `gsap/gsap-core` instead of `gsap`.** 19 018 B off the entry chunk — two import
   lines, and the entry is the chunk with the budget.
3. **P2-G · Release the decoder pools when the load finishes, not when the experience is destroyed.**
   Six worker threads and ~0.7 MB of WASM modules, from moving one call. Verifiable with the same
   census: `terminated` should reach 6.
4. **P2-K · Latch the `scene-ready` mark.** One boolean, and it fixes the number every future
   measurement of this site will be based on.
5. **P1-E (3) · Assert the brand atlas dimensions in `checks/`.** It does not fix the memory, but it
   makes the cost of publishing the seventh case study visible at build time instead of on a phone.
6. **P3-13 + P2-L · Correct the four drifted comments.** Free, and they are the numbers the next
   change will be reasoned from.

### Structural optimizations — require architectural work

7. **P1-B · Warm the program variant the composer actually draws.** ~186 ms of post-handover stall,
   including the 79.6 ms hologram link. Small change, real ordering constraint between `SceneCanvas`,
   `RenderPipeline` and `EarthScene`. **Verify by re-running the shader instrumentation** — the
   5.2 s and 11.4 s clusters should disappear.
8. **P1-D · Prioritise or defer the non-required boot fetches.** Still the largest win on slow
   connections (up to ~40 % off time-to-scene), still must preserve ADR 004's guarantee that the warp
   never waits, and still more urgent than the local measurement suggests because HTTP/2 on Vercel
   removes the connection limit that accidentally protects the first batch here.
9. **P1-A · Decimate or merge the satellite model.** Up to ~75 draw calls and ~300 k triangles off
   every Earth frame. **Do this for the mobile path, not for this desktop's 2.7 ms** — and be honest
   that the benefit is unproven until a phone measures it.
10. **P1-F (1) · Allocate the afterimage render targets on demand.** ~79 MiB at DPR 2, ~21 MiB on the
    phone path, for a pass that runs 1.6 s per transition. Local to `RenderPipeline.tsx`.
11. **P1-E (1) · Size the brand atlases from the viewport.** Up to ~18 MiB on the phone path, and it
    turns the content-driven growth into a bounded one.
12. **P1-F (2) + §6 · Make the DPR cap capability-derived.** Small in code; needs the policy in §6
    agreed and owned.
13. **P2-M · Give `SceneCanvas` a chunk budget** at 260 000 B, and **P2-J · assert the 200 ms
    long-task ceiling** in the existing e2e run. Neither is user-facing; both are why this week's
    regressions were found by an audit rather than by the build.
14. **P3-11 · Promote the content-hashed CMS media to `immutable`.** Nothing for first visits;
    everything for returning ones.

### Experimental — measure before adopting

15. **P2-H · Drop the KTX2 path, or commit to it.** 641 KB of machinery for 174 KB of texture, 57 KB
    of it in the chunk that gates readiness. **The answer depends entirely on whether the city's trim
    sheets arrive as KTX2, and that question has now been open for a week.** Answering it is cheaper
    than either implementation.
16. **P3-10 · Move Murcia's debug surface and the sky prototype behind dynamic imports.** ~9.7 KB and
    a principle — but the 3 263 B in the readiness-gating chunk is the half that is actually on the
    critical path.
17. **P1-C (second half) · Split or re-format `specularClouds`.** Still 3.6× `day.jpg` at identical
    dimensions because it packs two data channels into one lossy RGB image. Potentially larger than
    the re-encode, still entirely unproven.

### Explicitly withdrawn

- **`renderer.debug.checkShaderErrors = false`.** Measured; it relocates the stall and saves nothing.
  §4.
- **Reconsidering `antialias: true` for its memory** (first pass, P1-3 lever 3). The multisample
  memory it targeted is not allocated by this application. §7.1. If it is revisited it must be on
  image-quality grounds for the city, not on a memory number.

### Physical-device validation — cannot be proven in this environment

Everything below was either unmeasurable here or measured on hardware that does not represent the
target. None of it should be acted on from this report alone.

- **All GPU timings on mobile**, and specifically **P1-A**. Every frame-time number here comes from a
  discrete desktop GPU where 135 draw calls and 379 k triangles cost 2.7 ms. A tile-based mobile GPU
  is the entire question, and the emulated Pixel 7 rows are byte counts and texture arithmetic only.
- **The 130 MiB phone-path residency against iOS's per-tab budget.** Still the single most important
  unvalidated number in this lineage, and it went up rather than down since the first pass said so.
- **Thermal and sustained behaviour on a phone.** The 5-minute run was on hardware that never came
  close to its limit. It proves the absence of a leak, not the absence of throttling.
- **iOS Safari specifically.** WebKit is not installed on this machine (`playwright.config.ts` states
  this as a limitation, not an oversight). The KTX2 transcode path, `compileAsync`, and P1-B's
  shader-link stalls are all places Safari is most likely to differ, and probably to differ for the
  worse.
- **Background-tab rendering.** Headed Playwright still does not flip `document.hidden`; the app's
  guards are verified in source only, in both passes.
- **P3-12 · `anisotropy = 8`.** A tile-based GPU question, open since 2026-08-14.
- **P2-L's iOS composite cost.** The alpha finding is confirmed in code; its consequence is not.
- **Real CDN delivery.** Brotli (15.6 % smaller than the measured gzip on text), HTTP/2 multiplexing
  and the `vercel.json` cache headers were all audited statically. `vite preview` serves none of them.

---

## 9. Reproducing this

Nothing in this audit modified the repository. The measurements come from a production build served
by `vite preview` and driven by Playwright scripts held outside the tree, which read the app's own
instrumentation (`window.__vertigoBootDebug`, the four `vertigo:*` performance marks) plus wrappers
installed at page level.

To reproduce the baseline: `npm run content:build`, then build with `VITE_VERCEL_ENV=production`,
confirm the production markers (`robots.txt` at 104 B, `sitemap.xml` present, no `noindex`), serve
with `npm run preview`, and load `http://localhost:4173/` while polling
`window.__vertigoBootDebug.state()` for `'ready'`. **Take the FIRST `vertigo:scene-ready` entry, not
the last** — see P2-K, and take it from `performance.getEntriesByName`, not from a
`PerformanceObserver` that overwrites. Throttling is CDP `Network.emulateNetworkConditions` and
`Emulation.setCPUThrottlingRate`; the profiles are named in §2.1. GPU cost requires launching
Chromium with `--disable-gpu-vsync --disable-frame-rate-limit` and a 1×1 `readPixels` at each frame
boundary. **Frame samples must be taken at least ten seconds after handover**, or they measure the
pre-satellite scene rather than the resting one — that is what §7.1's second correction is about.

Bundle attribution comes from a second build with `--sourcemap` into a scratch directory outside the
repository, with each generated byte-span assigned to its original module through the map. Shader
stalls come from wrapping `linkProgram`, `getProgramInfoLog` and `getProgramParameter` and
identifying programs by the uniform names in their attached shader sources.

Re-measure rather than inheriting these numbers. That is what this file is for.
