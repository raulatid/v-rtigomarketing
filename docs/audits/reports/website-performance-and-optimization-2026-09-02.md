# Website Performance & Optimization — Audit

**Date:** 2026-09-02 · **Against:** working tree at `528dd42` + 5 uncommitted files
**Brief:** `audits/website-performance-and-optimization.md`

**Third pass in this lineage, written as a delta against
`reports/website-performance-and-optimization-2026-08-27.md`.** That report remains accurate for
everything this one does not restate; where the two disagree, this one wins and says so. §7
revalidates every finding it raised.

Six days separate the two passes, and the working tree moved more between them than between the
first two: the blog became a second HTML document with its own fonts (adr/013), Murcia's services
district became a projected display with four new shader programs, the rio water shader landed, the
city gained a trim sheet, the chunk-budget mechanism was rebuilt around `/`'s whole initial closure
instead of one chunk, and **the sky panorama was replaced by hand on 2026-08-31**. That last change
is the subject of this pass's only P0.

**Four of the 2026-08-27 findings were acted on and are closed** (§7). Two of them — the narrow Earth
re-encode and loading the city after handover — took **9.7 s off time-to-scene on a Slow 4G phone
profile**, the largest single improvement this lineage has recorded. The regressions are all in the
other direction: GPU memory and main-thread stalls.

**Measurement conditions apply to every figure below unless a row says otherwise:**

| | |
|---|---|
| Build | `npm run content:build`, then `VITE_VERCEL_ENV=production npx vite build`. Verified production by its markers on every batch: `robots.txt` 104 B with `Allow:`, `sitemap.xml` emitted, no `noindex` in `index.html`, no `debug-overlay` string in the app entry chunk. Served chunk hash re-checked before and after each batch (`assets/index-BZOFPp-a.js`). |
| Content | Sanity `qxpcrdaw/development` — 6 case studies, 5 services, 1 district, 2 legal docs, 2 blog posts. **The content is an input to several numbers here** (P1-F, and the blog chunk); a different dataset gives different GPU memory. |
| Server | local `vite preview` on `:4173`. **HTTP/1.1, gzip, no brotli, no CDN, ~0 ms RTT.** |
| Client | Chromium 1.62.1 (Playwright), **headed, real GPU**: this desktop's discrete GPU, `MAX_TEXTURE_SIZE` **16384**. |
| Viewport | 1440×900 CSS at DPR 1 unless stated. Narrow rows are 412×839 CSS at DPR 2.625 with touch — **Chromium on a desktop GPU, never a phone**. |
| Cache | cold on every load run (fresh browser context per run). |
| Repeats | load metrics are the median of **5** runs local wide, **3** per other profile. Frame metrics are the median of 430–770 frames; the sustained run is 30 samples over 4.5 minutes. The sky A/B is 3 interleaved pairs. |
| Labels | every figure is tagged **production** (built artefact), **synthetic** (emulated device/network), **real-device** (this desktop's actual GPU) or **inferred** (arithmetic, not observed). |

**Instrumentation.** Measured from outside, the same shape as both earlier passes: a Playwright
init-script installs `PerformanceObserver`s, wraps `requestAnimationFrame` to time each frame's
callbacks, and wraps the WebGL context to count draw calls, primitives, framebuffer binds, texture
and renderbuffer allocations and programs. **This pass wraps `texImage2D` as well as
`texStorage2D`**, which the second pass did not — three allocates ordinary textures with
`texStorage2D` and render-target colour attachments with `texImage2D`, so the earlier census had to
infer the render-target half. It is counted directly here, and it agrees with the earlier inference
exactly (§7.1). GPU time is a 1×1 `readPixels` at each frame boundary with vsync unlocked. **No
source file was modified for this audit, and none of this instrumentation ships**; the harness lives
in `node_modules/.cache/`, outside the repository.

**Two measurement caveats, stated up front.**

1. **BC7 is counted at 1 byte/px here, not 4.** The second pass counted `COMPRESSED_RGBA_BPTC_UNORM`
   at 4 bytes/px and applied a −8 MiB correction in prose. This pass counts it correctly at
   allocation time, so **no correction is applied to any number below** and the totals are directly
   comparable to the second pass's *corrected* figures.
2. **A parallel session rebuilt `dist/` without `VITE_VERCEL_ENV` in the middle of this audit.** It
   was caught by the marker check, the affected batch was discarded and re-run, and the production
   build was re-established and re-verified. Every number below is from a build whose production
   markers were confirmed. This is recorded because it is the failure mode the marker check exists
   to catch, and it caught it.

---

## 1. Performance Executive Summary

**The dominant bottleneck has changed. It is no longer the network — it is one texture.**

**Memory-bound, and this is the headline.** Total GPU texture residency on a 1440×900 desktop at
DPR 1 is now **433.7 MiB**, against 246 MiB six days ago. **190.7 MiB of it — 44 % of everything —
is the sky panorama, because the shipped file is 10000×5000.** The prepare script that is supposed
to produce that asset emits 4096×2048 and 2048×1024 and would have refused this source; the file on
disk was not produced by it. Every comment in the codebase that states this texture's cost says
"33.6 MB", in five places. It is 5.7× that (P0-A).

**CPU-bound, and it is the same texture.** Load-time long tasks rose from 975 ms to **1 363 ms**
with a **657 ms** worst task, and the CPU profile attributes **1 058 ms of self time to
`texSubImage2D`** (was 373 ms). An interleaved A/B that blocks only the panorama, three pairs, is
unambiguous: **scene-ready 2 325 → 1 667 ms, long tasks 1 439 → 804 ms, worst single task 696 →
167 ms.** One asset is ~635 ms of the main-thread budget on a machine with zero network latency and
a discrete GPU.

**And on a phone that texture is not loaded at all, because its filename is broken.** The narrow
variants on disk are `sky-panorama - narrow.avif` / `.webp` — with spaces — while `spaceConfig.ts`
and the `<link rel="preload">` in `index.html` both ask for `sky-panorama-narrow.avif`. Every
viewport under 768 px requests both variants, fails both, logs `[sky] no panorama variant loaded`,
and renders no backdrop. Measured on 8 narrow loads across two harnesses: **8 of 8**. The trap is
that the obvious fix is a rename, and a rename would put the 10000×5000 file on the phone path and
take its residency from 151.4 MiB to **~342 MiB** (P1-B).

**Network-bound — materially better, for the first time in this lineage.** A cold narrow load now
transfers **3.99 MB over 29 requests** (was 4.86 MB), and **Slow 4G narrow reaches scene-ready at
13.2 s against 22.9 s** — 9.7 s faster. Two closed findings did that: the narrow Earth maps were
re-encoded (prior P1-C, closed) and the city model now starts downloading **after**
`intro-complete` rather than through it, which the waterfall confirms directly (city starts at
3 868 ms, handover at 3 861 ms). The wide load is 5.88 MB / 28 requests, ~190 KB heavier than
before, entirely the sky. What did not change is the priority order: **2.84 MB of required assets
are still fetched `Low`, and 899 KB of not-required assets are still fetched `High` before
handover.** On a phone the not-required set is now **1.8× the size of the required one** (P1-D).

**GPU-bound — still not, on this hardware, but two routes moved.** Earth at rest is unchanged at
**135 draw calls and 380 461 triangles**, still ~93 % six copies of one satellite model (P1-E,
unfixed). Murcia at rest **doubled, from 2.0 to 4.3 ms**, at the same 176 draws and 1.85 M
triangles — the new work is fragment cost (the rio water shader, the terrain transition, the trim
sheet), not geometry. Both are comfortable at 60 Hz here and both are unproven anywhere else.

**Architecture-induced duplicate work — one closed, three open.** The GSAP `CSSPlugin` is gone
(prior P2-I closed, −19 KB), but `gsap-core` is still **49.4 % of the app entry chunk**. The decoder
pools are still **6 workers created, 0 terminated** across four round trips (P2-K). The Zstandard
decoder is still **39 745 B of the readiness-gating `three` chunk** and still cannot execute (P2-L).
And a new one: **the Murcia trim sheet is a 19 007 B PNG that costs 21.3 MiB of VRAM** — a 1 177:1
expansion — and stays resident on the Earth route (P2-I).

**The mechanism finding.** Nothing in `checks/` reads a static asset's dimensions or byte size — the
only harness that opens a file in `public/` is `city-asset.ts`, and it opens the city GLB. And the
one e2e test named *"narrow viewport uses the small panorama without banding"* **passes today with
the small panorama entirely absent** (verified: the test is green while the same viewport logs
`no panorama variant loaded`). Both of this pass's top two findings shipped through a build gate and
a visual gate that were looking somewhere else (P2-N).

**No leaks, no drift, no retry storms, and an excellent blog.** Four Earth↔Murcia round trips left
textures at 34, programs at 51 and workers at 6 — identical after each. 4.5 minutes of continuous
rendering with vsync unlocked showed GPU median 3.0 → 2.8 ms and a heap oscillating 31–49 MiB with
no trend. CLS is 0 everywhere. And the blog, measured for the first time, is the best-performing
surface in the project: **FCP 148–220 ms, LCP 284–332 ms, zero long tasks, no WebGL, 87 DOM nodes,
3 MiB heap, 9 requests** — a genuinely clean second document (§2.8).

---

## 2. Baseline Metrics

### 2.1 Load — median of repeated cold loads · production build · synthetic network

| Metric | Local wide (n=5) | Local narrow (n=3) | Fast 4G + 4× CPU (n=3) | Slow 4G + 4× CPU (n=3) | Slow 4G narrow (n=3) |
|---|---|---|---|---|---|
| First Contentful Paint | 172 ms | 168 ms | 524 ms | 796 ms | 800 ms |
| Largest Contentful Paint | 848 ms | 872 ms | 2 964 ms | 12 108 ms | 5 928 ms |
| Intro's first drawn frame | 128 ms | 122 ms | 392 ms | 739 ms | 767 ms |
| **Scene usable (`vertigo:scene-ready`)** | **2 144 ms** | **1 221 ms** | **6 089 ms** | **23 054 ms** | **13 200 ms** |
| **Handover (`vertigo:intro-complete`)** | **3 633 ms** | **3 054 ms** | **6 823 ms** | **23 604 ms** | **13 747 ms** |
| Long tasks (count / total / max) | **8 / 1 363 ms / 657 ms** | 6 / 512 ms / 153 ms | 18 / 5 237 ms / 1 536 ms | 14 / 3 278 ms / 1 050 ms | 13 / 2 131 ms / 292 ms |
| Post-handover tasks > 50 ms | 2–3 (to 289 ms) | 2–3 (to 289 ms) | 2–6 (to 499 ms) | 3–5 (to 431 ms) | 3–4 (to 382 ms) |
| Cumulative Layout Shift | 0 | 0 | 0 | 0 | 0 |
| `scene-ready` marks per load | **1** | **1** | **1** | **1** | **1** |
| Requests / transferred | 28 / 5.88 MB | 29 / 3.99 MB | 28 / 5.88 MB | 28 / 5.88 MB | 29 / 3.98 MB |

Throttling profiles are unchanged from both earlier passes: Fast 4G = 9 Mbit/s, 60 ms RTT; Slow 4G =
1.6 Mbit/s, 150 ms RTT; both via CDP, both with a 4× CPU throttle. TTFB is ~0 on localhost and is
omitted rather than reported as a meaningless number.

**Deltas against 2026-08-27**, same conditions, same harness shape:

| | 08-27 | 09-02 | Δ |
|---|---|---|---|
| Scene-ready, local wide | 1 372 ms | 2 144 ms | **+772 ms** |
| Scene-ready, **Slow 4G narrow** | 22 922 ms | **13 200 ms** | **−9 722 ms** |
| Scene-ready, Slow 4G wide | 28 858 ms | **23 054 ms** | **−5 804 ms** |
| Long tasks, local wide | 8 / 975 / 238 | 8 / **1 363** / **657** | **+40 % / +176 %** |
| Long tasks, Fast 4G | 15 / 2 565 / 406 | 18 / **5 237** / **1 536** | **+104 % / +278 %** |
| Transfer, narrow | 4.86 MB | **3.99 MB** | **−870 KB** |
| Transfer, wide | 5.69 MB | 5.88 MB | +190 KB |

The slow-network improvement and the local regression have the same two causes pulling in opposite
directions: the narrow Earth set lost 886 KB and the city left the pre-handover window (both good,
both dominant when bandwidth is the constraint), while the sky gained 158.7 MiB of upload (bad, and
dominant when bandwidth is not). §3 P0-A isolates the second with an A/B.

**The `scene-ready` mark is now emitted exactly once per load in every profile**, including Slow 4G
narrow where the second pass counted 52. Prior P2-K is closed. **Label: production, synthetic
network.**

### 2.2 Bundle — production build, measured on the emitted files

The budget mechanism was rebuilt on 2026-08-31 and the chunk graph changed shape with it, so a
row-by-row delta against the second pass would be misleading; the reason is in `vite.config.ts:28-100`
and it is correct. What a visitor downloads is the comparable number, and it is the last row.

| Chunk | Raw | gzip | brotli |
|---|---|---|---|
| `assets/three-*.js` | 820 912 | 219 694 | 179 463 |
| `assets/SceneCanvas-*.js` | 244 462 | 81 562 | 71 578 |
| `assets/useRoute-*.js` *(React + the router)* | 196 958 | 61 498 | 53 025 |
| `assets/MurciaExperience-*.js` | 118 911 | 40 030 | 34 529 |
| `assets/index-*.js` (app entry) | 104 273 | 38 546 | 34 290 |
| `assets/index-*.css` | 25 479 | 5 632 | 4 975 |
| `assets/BlogRoute-*.js` | 15 771 | 5 351 | 4 714 |
| `assets/intro-*.js` (boot entry) | 14 071 | 6 229 | 5 464 |
| `assets/BlogRoute-*.css` | 13 166 | 2 820 | 2 441 |
| `index.html` | 8 252 | 3 016 | 2 394 |
| `blog.html` / `blog/<slug>/index.html` | 5 255 / 6 140–6 146 | 2 363 / 2 649 | 1 846 / ~2 080 |
| `assets/createCornerLogo-*.js` | 3 823 | 1 899 | 1 768 |
| `assets/SceneCanvas-*.css` | 2 625 | 1 026 | 864 |
| `assets/blog-*.js` / `assets/disposal-*.js` | 581 / 398 | 385 / 252 | 320 / 228 |
| **Initial JS closure of `/`** | **1 518 972** | — | **384 807** |

The last row is the build's own assertion, printed on every build: **1 518 972 B over 9 requests,
against a budget of 1 600 000 B / 10 requests — 94.9 % of bytes and 90 % of requests.** Brotli is
what Vercel will serve and is **15.6 % smaller than the gzip these runs measured**, so the throttled
rows in §2.1 are pessimistic by roughly that much on the text half of the payload. **Label:
production.**

**Where the bytes are**, attributed byte-span-by-byte-span through the source map of a
`--sourcemap` build of the same commit, emitted to a scratch directory outside the repository and
deleted afterwards:

| Chunk | Module | Raw bytes | Share |
|---|---|---|---|
| app entry | **`gsap/gsap-core.js`** | **51 508** | **49.4 %** |
| app entry | `AuditSection.tsx` | 7 582 | 7.3 % |
| app entry | `createNavigationInput.ts` | 6 259 | 6.0 % |
| app entry | everything else (the whole DOM UI layer) | ~38 900 | 37 % |
| useRoute | `react-dom` + `react` + `scheduler` | 190 308 | 96.6 % |
| SceneCanvas | `@react-three/fiber` | 147 585 | 60.4 % |
| SceneCanvas | `createHoloPanel.ts` + `createEmitterCone.ts` | 24 000 | 9.8 % |
| SceneCanvas | generated `caseStudies` | 5 038 | 2.1 % |
| SceneCanvas | **sky-cubemap prototype** (`SkyShellCube` + shader + gates) | **3 299** | **1.4 %** |
| three | `three/build` (core + module) | 690 127 | 84.1 % |
| three | `GLTFLoader` | 44 633 | 5.4 % |
| three | **`zstddec.module.js`** | **39 745** | **4.8 %** |
| three | `KTX2Loader` + `ktx-parse` | 17 177 | 2.1 % |
| three | `UnrealBloomPass` + `EffectComposer` + `OutputPass` + `OutputShader` + `AfterimagePass` | 15 702 | 1.9 % |
| Murcia | the four new district/water fragment shaders (GLSL) | 15 857 | 13.3 % |
| Murcia | **`debug/` + `stats.js`** | **6 431** | **5.4 %** |
| BlogRoute | `BlogRoute.tsx` | 9 040 | 57.3 % |
| BlogRoute | generated `blogPosts` | 3 127 | 19.8 % |

Adding `blog.html` as a second HTML entry gave Rollup two consumers for React and hoisted it into
the shared `useRoute` chunk — which is why the app entry fell from 317 KB to 104 KB in one commit
without a visitor downloading a byte less. `vite.config.ts:41-46` says exactly this, and the budget
was moved to the whole closure because of it. That is the right call and it is why this section has
no delta column.

Tree-shaking and splitting still work: `three` is isolated and structurally asserted, the intro entry
imports nothing and is asserted, and the React `/debug` console still folds away (`debug-overlay`
appears in no chunk of a production build). What does not fold is P3-11.

### 2.3 Static assets — dimensions, transfer, GPU cost

| Asset | On disk | Dimensions | bits/px | GPU resident | Change since 2026-08-27 |
|---|---|---|---|---|---|
| `earth/specularClouds.jpg` | 1 692 384 | 4096×2048 | 1.614 | 42.67 MiB | — |
| `models/city-prototype.glb` | 1 336 280 | Draco, 16 instanced nodes / 6 926 instances | — | see §2.4 | **+49 684 B** |
| `libs/basis/basis_transcoder.wasm` | 527 333 | — | — | — | — |
| `draco/draco_decoder.js` | 512 465 | — | — | **never requested** | — |
| `earth/day.jpg` | 473 093 | 4096×2048 | 0.451 | 42.67 MiB | — |
| **`textures/sky-panorama.webp`** | **426 968** | **10000×5000** | 0.068 | fallback only | **+209 802 B, 11.9× the pixels** |
| **`textures/sky-panorama.avif`** | **294 470** | **10000×5000** | 0.047 | **190.73 MiB** (not mipped) | **+105 683 B, +158.7 MiB** |
| **`textures/sky-panorama - narrow.avif`** | **294 470** | **10000×5000** | 0.047 | **never loads — see P1-B** | **renamed, +212 382 B** |
| **`textures/sky-panorama - narrow.webp`** | **426 968** | **10000×5000** | 0.068 | **never loads** | **renamed, +338 966 B** |
| `models/satellite.glb` | 269 928 | 15 meshes / 58 626 tris | — | — | — (still drawn 6×) |
| `earth/night.jpg` | 267 061 | 4096×2048 | 0.255 | 42.67 MiB | — |
| `models/city-backdrop.glb` | 206 604 | 36 meshes / 630 tris, instanced | — | — | — |
| `draco/draco_decoder.wasm` | 192 420 | — | — | — | — |
| `textures/satellite_Baked.ktx2` | 150 820 | 1024×1024 BC7 | — | 1.33 MiB | — |
| `fonts/source-serif-4-latin-italic.woff2` | 130 188 | — | — | — | **new** |
| `fonts/source-serif-4-latin.woff2` | 122 360 | — | — | — | **new** |
| `earth/day-narrow.jpg` | **123 878** | 2048×1024 | 0.473 | 10.67 MiB | **−131 888 B** |
| `fonts/source-serif-4-latin-ext-italic.woff2` | 110 324 | — | — | — | **new** |
| `fonts/source-serif-4-latin-ext.woff2` | 100 872 | — | — | — | **new** |
| `logos/…-1300x650.png` | 86 791 | 1300×650 | — | drawn into the atlas | — |
| `fonts/inter-latin-ext.woff2` | 85 068 | — | — | — | **new** |
| `earth/specularClouds-narrow.jpg` | **634 226** | 2048×1024 | **2.419** | 10.67 MiB | **−684 517 B** |
| `earth/night-narrow.jpg` | **57 370** | 2048×1024 | 0.219 | 10.67 MiB | **−69 248 B** |
| `fonts/inter-latin.woff2` | 48 256 | — | — | — | **new** |
| `logos/…-512x512.png` | 27 429 | 512×512 | — | drawn into the atlas | — |
| `textures/logoBake.ktx2` | 23 102 | 1024×1024 BC7 | — | 1.33 MiB | — |
| `models/model.glb` | 20 364 | 2 meshes / 5 860 tris | — | — | — |
| **`textures/murcia/murcia-basecolor.png`** | **19 007** | **2048×2048** | 0.036 | **21.33 MiB** (mipped) | **new** |
| `og-default.png` | 3 830 | 1200×630 | — | — | **new** |
| **brand logo atlas** (generated) | — | 2048×1536 | — | 16.00 MiB | — |
| **brand isotype atlas** (generated) | — | 1024×1536 | — | 8.00 MiB | — |

**The Earth narrow set is 815 474 B, down from 1 701 127 B** — the second pass's largest open byte
win, taken. `QUALITY` in `scripts/prepare-earth-textures.mjs` is now `70`; two of the three maps now
sit at or below the wide set's bit rate, and `specularClouds-narrow` is at **1.50×** rather than the
3.1× the second pass measured (P3-9).

`public/` is **636 MB on disk**, of which **621 MB is `public/proto-sky/`** and a further **4.57 MB
is six git-ignored `sky-test-*` candidates**. Both are git-ignored and never reach a Vercel
deployment built from Git. **The deployable half of `public/` — tracked files only — is 8.4 MB**, of
which **721 KB is the two unreachable space-named sky duplicates** (P3-15).

### 2.4 Frame cost — real-device (this desktop GPU), vsync unlocked, GPU-synchronised

| Route / moment | GPU ms (med / p95) | CPU ms (med / p95) | Draw calls | Triangles | FBO binds |
|---|---|---|---|---|---|
| Earth, at handover + 2.5 s (satellites not yet revealed) | 1.8 / 2.9 | 0.3 / 0.5 | **15** | not reliably sampled | 15 |
| **Earth, at rest (handover + 17 s)** | **3.1 / 3.7** | **1.1 / 1.5** | **135** | **380 461** | **15** |
| Earth, at rest, after 4 Murcia round trips | 2.4 / 2.8 | 0.7 / 0.9 | 135 | 380 461 | 15 |
| **Murcia (direct route, no composer)** | **4.3 / 4.9** | **1.2 / 1.5** | **176** | **1 854 046** | **0** |
| Earth at rest, phone-shaped viewport | 2.0 / 2.4 | — | **124** | — | 15 |

Programs: 44 at Earth on a plain load, **51 once Murcia has loaded** (was 43). 34 texture
allocations, 16 renderbuffers.

The at-rest Earth row agrees with the second pass to within 0.5 % on triangles (380 461 vs 378 714),
which cross-validates the two harnesses. **The handover row's triangle count is omitted rather than
published**: this pass's counter attributes `drawArrays(POINTS, …)` to triangles, which the starfield
dominates at that moment and which does not distort the at-rest figure. Draw calls at that moment are
counted directly and are 15.

**Murcia's resting frame doubled in GPU cost — 2.0 → 4.3 ms — at an unchanged 176 draws and 1.85 M
triangles.** The work that arrived in that window is all fragment-side: the rio water shader
(`shaders/rio/fragment.glsl`, 263 lines), the rebuilt terrain transition, and the trim sheet. Draw
calls and geometry are flat, so this is not a geometry regression and geometry simplification would
not address it. **Label: real-device.**

**Not measured, and it should be:** the services district's *display* — four shader programs
(`display`, `fluid`, `beam`, `shell`) and a **1600×3200 canvas texture, 26.0 MiB mipped** — is built
on district entry, which this pass's session never reached. See P2-J.

### 2.5 Device pixel ratio sweep — 1440×900 CSS viewport

| DPR requested | Drawing buffer | GPU ms/frame (sweep A / sweep B) | Render targets | Depth | Content textures | **Total** | Post share |
|---|---|---|---|---|---|---|---|
| 1 | 1440×900 | 3.0 / 2.5 | 48.6 MiB | 18.2 MiB | 366.8 MiB | **433.7 MiB** | 15 % |
| 1.25 | 1800×1125 | 3.5 / 3.9 | 76.0 MiB | 28.5 MiB | 366.8 MiB | **471.3 MiB** | 22 % |
| 1.5 | 2160×1350 | 2.2 / 4.6 | 109.4 MiB | 41.0 MiB | 366.8 MiB | **517.2 MiB** | 29 % |
| 2 | 2880×1800 | 2.4 / 6.0 | 194.4 MiB | 72.9 MiB | 366.8 MiB | **634.2 MiB** | 42 % |
| 3 | **2880×1800 (capped)** | 2.3 / 3.8 | 194.4 MiB | 72.9 MiB | 366.8 MiB | **634.2 MiB** | 42 % |
| 2.625 (phone-shaped) | 824×1678 | 2.4 / 2.0 | 51.9 MiB | 19.4 MiB | 80.1 MiB | **151.4 MiB** | 47 % |

Two independent sweeps were run; both GPU columns are shown because **they disagree by up to 2.4 ms
and the disagreement is the finding.** The DPR 3 row allocates a byte-identical framebuffer to the
DPR 2 row and measured 3.8 ms against 6.0 ms **in the same sweep**. **Per-load GPU-time variance on
this hardware exceeds the DPR effect**, so this pass cannot reproduce the second pass's clean
"+0.6 ms for +201 MiB" and makes no claim of a frame-cost trend with DPR. What both sweeps agree on
completely is the memory column, which is arithmetic: **DPR 1 → 2 costs +200.5 MiB** of framebuffer
memory. The second pass's conclusion therefore stands and is if anything stronger: **the DPR decision
is a memory decision, and this hardware cannot even measure the frame-rate half.**

**The `dpr={[1, 2]}` cap works** — requesting 3 produces the same 2880×1800 buffer, and the
phone-shaped viewport gets exactly 2× (824×1678, not 2.625×). **Label: real-device for the GPU
columns, production for the memory columns.**

**Content textures are 366.8 MiB on desktop and do not vary with DPR**, which is the shape of the
problem this pass found: the sky (190.7), the three Earth maps (128.0), the trim sheet (21.3) and
the two brand atlases (24.0) are **99 % of it**, and only the Earth maps and the sky are supposed to
be viewport-derived. On the phone path, where the Earth maps drop to 32.0 MiB and the sky is absent,
**the trim sheet and the atlases alone are 45.3 MiB of the 80.1 MiB of content texture — 57 %.**

### 2.6 Steady state and sustained runtime — 4.5 minutes, 30 samples, vsync unlocked

Frame cost was flat and slightly *improving* from the first sample to the last: **GPU median 3.0 ms
at samples 1–8 and 2.8 ms from sample 11 onward**, worst single frame 63.8 ms (in the first sample
window, which still contains post-handover shader linking). p95 fell from 10.9–12.7 ms in the first
thirteen samples to 3.6–3.9 ms in the middle and rose to 9.5–9.8 ms at the end — scheduling noise
around a flat median, not a trend. JS heap oscillated between **31.3 and 49.3 MiB** in a clean
sawtooth with no trend (42.6 MiB at t+0, 36.7 MiB at t+270 s). Programs 51, textures 34, workers 6/0
at the end, identical to the start.

DOM at rest on Earth over 5 s: **0 layouts, 0.0 ms of layout time**, 901 style recalculations
(180/s, one per rendered frame at this frame rate) costing **45.7 ms — 0.9 % of the thread**. 364
DOM nodes, 266 event listeners, 1 document, 1 canvas. **Label: real-device.**

### 2.7 Where the main thread goes during load — CPU profile, 200 µs sampling

Sampled over a full load plus 9 s of rest, wide viewport, local network:

| Self time | Call | Attributed to |
|---|---|---|
| **1 058 ms** | **`texSubImage2D`** | **synchronous texture upload — the 10000×5000 panorama and the three 4096×2048 Earth maps** |
| 549 ms | `(program)` | V8 parse/compile of the chunks |
| 547 ms | `getProgramInfoLog` | three's `WebGLProgram` first-use check, which blocks until the driver finishes linking |
| 123 ms | `getExtension` | `KTX2Loader.detectSupport` |
| 49 ms | `introDraw` internals | the opening drawing — the one thing on the main thread that is meant to be there |
| 35 ms | `updateMatrixWorld` | three's scene graph |

Non-idle main-thread time over the ~13 s window was ~3.0 s, against ~2.0 s six days ago. The long
task list from that same run: `83:67, 709:143, 853:164, `**`1073:760`**`, 1961:101, 2062:150,
2218:134, 3988:73, `**`4179:281`**`, 5991:127, 12130:182`. The 760 ms task at 1 073 ms is the
panorama upload; the 281 ms task at 4 179 ms is after `intro-complete` (3 861 ms) and is shader
linking. Source positions recovered through the source map of the same build. **Label: real-device.**

`getProgramInfoLog` self time varied from **61 ms to 547 ms across otherwise identical runs** in this
pass, against a stable 412–418 ms in the second pass. The post-handover *long tasks* it produces were
present in **every** run of every profile, so the stall is real and reproducible; its attribution to
`getProgramInfoLog` specifically is not stable enough this pass to restate the second pass's precise
per-program table. P1-H says so.

### 2.8 The blog — a second document, measured for the first time

`/blog` and `/blog/<slug>` are their own HTML document with their own entry (adr/013). Nothing about
the 3D application is on the page, and it shows.

| | `/blog` wide | `/blog/<slug>` wide | `/blog/<slug>` narrow |
|---|---|---|---|
| First Contentful Paint | 220 ms | 200 ms | 148 ms |
| Largest Contentful Paint | 300 ms | 284 ms | 332 ms |
| Cumulative Layout Shift | 0 | 0 | 0 |
| **Long tasks** | **none** | **none** | **none** |
| Requests / transferred | 9 / 275 545 | 9 / 403 661 | 9 / 478 942 |
| DOM elements / canvases / WebGL context | 86 / 0 / no | 87 / 0 / no | 87 / 0 / no |
| JS heap | 3 MiB | 3 MiB | 3 MiB |
| rAF callbacks in 4 s at rest | **0** | **0** | **0** |

**Fonts are 43 % of the index page's transfer and 75 % of a post's** (301 768 B of 403 661 B wide).
All seven `@font-face` rules carry `font-display: swap` and a `unicode-range` subset, two files are
preloaded, and the rest are correctly left to the browser. The one thing worth naming: on a post,
`source-serif-4-latin-italic.woff2` (130 510 B) is **the single largest file on the page**, is
**not** preloaded, and is discovered at t+74–123 ms once the CSS has resolved. `blog.html:68-70`
argues the italic is "usually unused" — true for the index, not for an article (P3-16).

The Sanity CDN images are sized correctly per viewport (`w=680` at 1440 CSS px / DPR 1, `w=1360` at
412 CSS px / DPR 2.625), which is `sanityImage.ts` doing its job. **Label: production, real-device.**

---

## 3. Performance Findings

### P0 — Severe

#### P0-A · The shipped sky panorama is 10000×5000: 190.7 MiB of GPU memory, 635 ms of main thread, and it did not come from the asset pipeline — NEW

**This is a P0 on the brief's "catastrophic resource behaviour" clause, not its "crash" clause.**
Nothing observed on this hardware crashes. What is catastrophic is the resource behaviour: one
decorative backdrop is **44 % of all GPU texture memory** and **the largest single main-thread item
in the application**, at 5.7× what every comment in the codebase says it costs, with nothing in the
build able to notice.

**Evidence.**

| | Second pass (08-27) | This pass (09-02) |
|---|---|---|
| `textures/sky-panorama.avif` | 188 787 B, **4096×2048** | 294 470 B, **10000×5000** |
| `textures/sky-panorama.webp` | 217 166 B, 4096×2048 | 426 968 B, 10000×5000 |
| GPU resident (SRGB8_ALPHA8, no mips) | **32.0 MiB** | **190.73 MiB** |
| Share of desktop texture residency at DPR 1 | 13 % | **44 %** |

Dimensions were read from the AVIF `ispe` box and the WebP `VP8X` chunk directly; residency was
counted at the `texStorage2D` call (`SRGB8_ALPHA8 10000×5000 L1`) in the live allocation census, on
every wide configuration measured.

**Measurement — an interleaved A/B, three pairs, one full cold load per arm, identical in everything
but a route that aborts `**/textures/sky-panorama.*`:**

| Arm | scene-ready | intro-complete | Long tasks | Worst task |
|---|---|---|---|---|
| **As shipped** | **2 325 ms** | 3 645 ms | 8 / **1 439 ms** | **696 ms** |
| Panorama blocked | 1 667 ms | 3 143 ms | 7 / 804 ms | 167 ms |
| **Difference** | **−658 ms** | −502 ms | **−635 ms** | **−529 ms** |

On localhost the 294 KB download is free, so **essentially all of that is decode and upload**. It
agrees with the CPU profile independently: `texSubImage2D` self time is **1 058 ms**, against 373 ms
six days ago, and the single 760 ms long task at 1 073 ms falls exactly where `SkyShell.tsx:241`
calls `gl.initTexture`.

**Relevant files.** `public/textures/sky-panorama.{avif,webp}`,
`src/experiences/earth/scene/space/spaceConfig.ts:104-129`,
`src/experiences/earth/scene/SkyShell.tsx:55,124,238,241`,
`scripts/prepare-sky-panorama.mjs:275-276,355,733,760-763`.

**Root cause. The file was not produced by the script that is supposed to produce it.**
`prepare-sky-panorama.mjs` defines `WIDTH_WIDE = 4096` and `WIDTH_NARROW = 2048`, emits exactly four
files named `sky-panorama[-narrow].{avif,webp}` (`:733`), and **throws if the source is narrower than
4096** (`:355`). It has no path that produces a 10000×5000 output and no path that produces a name
containing a space. The two commits that shipped this are both titled "change sky panorama image"
(`4e590d0`, `528dd42`, 2026-08-31). The asset was replaced by hand, and every downstream number the
pipeline would have kept honest went stale in the same moment:

- `spaceConfig.ts:124` — *"RGBA8, no mips: 33.6 MB wide, 8.4 MB narrow"* → **190.7 MiB** wide.
- `SkyShell.tsx:55, 124, 238` — *"the 33.6 MB texture"*, three more times.
- `spaceConfig.ts:88-90` — *"AVIF q59 … at 194,642 bytes … held under a 200 KB client budget"* → the
  file is **294 470 B**, 47 % over the budget the comment states, and `AVIF_QUALITY` in the script is
  70, not 59.
- `spaceConfig.ts:127-129` — *"4096 is the ceiling the SOURCE allows — it is a 4096x2048 PNG"* → the
  source is not that.
- `bootState.ts:42` — *"Only 111 KB against the Earth's 2.43 MB, so the weight is small"* → the
  justification for `weight: 5` on `sky:panorama` was written about a file 2.6× smaller.

**User impact.**
*Desktop, measured:* ~658 ms later to a usable scene and a 696 ms freeze during the intro, on a
zero-latency connection with a discrete GPU. On Slow 4G the 294 KB also costs ~1.5 s of a shared
1.6 Mbit link.
*Mobile, not measured, and the reason this is a P0:* `MAX_TEXTURE_SIZE` is 16384 on this desktop, but
many mobile GPUs report **4096 or 8192**. Above that limit three does not fail — it **rescales the
image through a 2D canvas on the main thread** before upload (`three.module.js:10150 resizeImage`).
That is a 50-megapixel `drawImage` on a phone's main thread, on the critical path, for a backdrop.
Below that limit it is 190.7 MiB of a per-tab budget iOS terminates against.

**Proposed direction.** Re-run the asset through its own pipeline:
`node scripts/prepare-sky-panorama.mjs <source>`, which restores 4096×2048 / 2048×1024, the four
correct filenames, the pole convergence `checks/space-backdrop.ts` asserts against, and the AVIF
quality the comments describe. If the new artwork's 10000×5000 detail is genuinely wanted, that is a
conversation about raising `WIDTH_WIDE` **with the memory arithmetic attached** — 6144×3072 is
72 MiB, 8192×4096 is 128 MiB — not something to settle by dropping a file into `public/`. Either way,
**restate the five drifted comments from the number that ships.**

**Complexity.** Low — one script invocation, plus a visual check that the new source survives the
pipeline's pole convergence, plus the comment corrections. The two `e2e/backdrop.spec.ts` baselines
will need regenerating, which is the correct signal that the sky changed.
**Expected benefit.** **−158.7 MiB of GPU memory** (44 % → 8 % of desktop residency), **~635 ms of
load-time main thread**, ~660 ms off time-to-scene locally, ~105 KB on the wire, and the removal of
an unbounded mobile risk.
**Confidence.** **High** on every measurement — dimensions read from the file headers, residency
counted at the allocation call, the load cost isolated by A/B. **Medium** on the mobile `resizeImage`
consequence, which is read from three's source and is correct as a mechanism but has not been
observed on a device with a smaller `MAX_TEXTURE_SIZE`.

---

### P1 — High impact

#### P1-B · The narrow sky variants are named with spaces, so every viewport under 768 px renders no backdrop — and renaming them without re-preparing them would put 190.7 MiB on a phone — NEW

**Evidence.** The files tracked in Git are `public/textures/sky-panorama - narrow.avif` and
`… - narrow.webp`. `spaceConfig.ts:111-112` and `index.html:149-157` both request
`/textures/sky-panorama-narrow.avif` and `-narrow.webp`. Measured on 8 narrow loads across two
harnesses (412×839 DPR 2.625 with touch, ×6; 420×900 DPR 1, ×2), **8 of 8** produced:

```
[sky] /textures/sky-panorama-narrow.avif did not decode, falling back to /textures/sky-panorama-narrow.webp
[sky] no panorama variant loaded, last tried /textures/sky-panorama-narrow.webp
```

At 768 px and 1440 px the same harness is clean and fetches the wide AVIF, which isolates the cause
to the narrow branch rather than to the loader.

**Measurement.** Per narrow visit: **two requests that cannot succeed**, one wasted
`<link rel="preload">`, and **no sky shell at all** — `SkyShell` sets `mesh.visible` only once
`uploaded.current` is true, so the backdrop is the star shell and galaxy band alone. On `vite
preview` the two requests return the SPA fallback (200, 8 252 B of HTML, which then fails to decode);
on Vercel, whose `rewrites` cover only `/debug`, `/blog` and `/blog/:slug`, they are plain 404s.

**Relevant files.** `public/textures/sky-panorama - narrow.{avif,webp}`,
`src/experiences/earth/scene/space/spaceConfig.ts:111-112`, `index.html:149-157`,
`scripts/prepare-sky-panorama.mjs:733`.

**Root cause.** The same hand replacement as P0-A. The prepare script's `emit()` builds the name as
`` `sky-panorama${width === WIDTH_NARROW ? '-narrow' : ''}.${format}` `` — it cannot produce a space.

**User impact.** Every phone and small-window visitor sees a black sky behind the Earth, on a site
whose boot contract goes out of its way to guarantee that nothing pops in late. `bootState.ts:44-49`
is explicit that a missing sky must be survivable rather than fatal, and that contract is working
exactly as designed — which is why this has been shipping since 2026-08-31 without breaking anything
loudly enough to be noticed.

**The trap, and the reason this finding is not "rename two files".** The narrow files are
**byte-identical in size to the wide ones and are also 10000×5000**. Renaming them would make the
narrow branch work and take phone-path residency from the measured **151.4 MiB to ~342 MiB**, which
is the worst outcome available. **P0-A must be fixed first, or with it; this must not be fixed
alone.**

**Proposed direction.** Fix it as part of P0-A, by re-running `prepare-sky-panorama.mjs`, which emits
all four correct names at the correct sizes in one command. Then add the assertion in P2-N so the
next hand-drop fails the build instead of the backdrop.

**Complexity.** Nil on its own; it is a side effect of doing P0-A properly.
**Expected benefit.** The mobile backdrop returns, two dead requests and one dead preload go away,
and the phone path gains a correctly-sized 8 MiB sky instead of a 190.7 MiB one.
**Confidence.** **High.** Reproduced 8/8 across two harnesses and two viewport widths, with the clean
wide case as the control.

---

#### P1-C · Load-time long tasks rose 40 %, the worst single task rose 176 %, and 1 058 ms of it is synchronous texture upload — extends prior P2-J

**Evidence.** §2.1 and §2.7.

| | 08-20 | 08-27 | 09-02 |
|---|---|---|---|
| Long tasks, local wide | 7 / 711 ms / 152 ms | 8 / 975 ms / 238 ms | **8 / 1 363 ms / 657 ms** |
| Long tasks, Fast 4G + 4× CPU | — | 15 / 2 565 ms / 406 ms | **18 / 5 237 ms / 1 536 ms** |
| `texSubImage2D` self time | — | 373 ms | **1 058 ms** |

**Measurement.** The **200 ms single-task budget** the first pass proposed is now breached by
**3.3×** locally and by **7.7×** under a 4× CPU throttle. The **50 ms post-handover budget** the
second pass proposed is breached in **every profile and every run**, up to 499 ms on Fast 4G.

**Root cause, in two parts with different owners.**
The **upload half is P0-A**, and it is not a design defect in `gpu:warmup` — the warm-up exists
precisely to pay this cost inside the drawing, where there is time for it. It became a problem
because the thing being uploaded grew 6×. Fixing P0-A takes `texSubImage2D` back to roughly the
373 ms the second pass measured, which is the number the mechanism was designed around.
The **link half is P1-H**, and it is not deliberate.

**Proposed direction.** Fix P0-A and P1-H; there is no third mechanism here to fix. What is worth
adding independently is the thing the second pass proposed and that did not happen: **assert the
long-task ceiling in the existing e2e run.** Both budgets have now been breached for two consecutive
passes, and both were found by an audit rather than by the build. `e2e/boot.spec.ts` already
installs a `PerformanceObserver` on the intro's frame pacing; a long-task observer beside it is the
same shape of change.

**Complexity.** Low for the assertion.
**Expected benefit.** ~635 ms from P0-A, up to ~280 ms of post-handover stall from P1-H; regression
detection for both.
**Confidence.** **High** on the numbers, which are medians over 5 runs and corroborated
independently by the CPU profile and the A/B.

---

#### P1-D · The priority order is still inverted, but the largest offender left the window — IMPROVED (prior P1-D)

**Evidence.** The waterfall, with CDP's own `initialPriority` and request start times relative to the
first request, local wide:

| Asset | Bytes | Priority | Starts at | Required? |
|---|---|---|---|---|
| `earth/specularClouds.jpg` | 1 692 708 | **Low** | 14 ms | **yes** |
| `earth/day.jpg` | 473 415 | **Low** | 14 ms | **yes** |
| `textures/sky-panorama.avif` | 294 792 | **Low** | 14 ms | **yes** |
| `earth/night.jpg` | 267 383 | **Low** | 14 ms | **yes** |
| `assets/three-*.js` | 220 861 | High | 14 ms | **yes** |
| `models/satellite.glb` | 270 257 | Low | 14 ms | no |
| `textures/satellite_Baked.ktx2` | 151 090 | **High** | 1 003 ms | no |
| `draco/draco_decoder.wasm` | 192 696 | **High** | 1 835 ms | no |
| `libs/basis/basis_transcoder.wasm` | 527 609 | **High** | 2 353 ms | no |
| **`models/city-prototype.glb`** | **1 336 559** | High | **3 868 ms** | no — **after handover (3 861 ms)** |
| `textures/murcia/murcia-basecolor.png` | 19 326 | Low | 3 868 ms | no |

**Measurement.**

| | 08-27 | 09-02 |
|---|---|---|
| Required, wide | 3.10 MB | **3.31 MB** (2.84 MB at `Low`) |
| Not-required, wide | 2.60 MB | 2.57 MB |
| **Not-required competing *before* handover** | 2.60 MB | **1.22 MB** (899 KB at `High`) |
| Not-required, narrow | — | 2.57 MB — **1.8× the 1.42 MB required set** |

**What changed.** `perf(boot): the city loads after the handover, not through it` works, and the
waterfall proves it: the 1.34 MB city model and its trim sheet start 7 ms *after* `intro-complete`.
**That single change is most of the 5.8 s improvement on Slow 4G wide and part of the 9.7 s on Slow
4G narrow.** It is the largest measured win in this lineage.

**What did not.** The remaining 1.22 MB of not-required assets — the satellite bake, both decoders,
the satellite model — still start at 14–2 353 ms, still with **899 KB of them at `High`**, while the
required Earth textures and sky are all still `Low` because `index.html` demotes them so they cannot
out-rank the app chunk. The two decisions are still individually right and jointly inverted. The
second pass's inference that HTTP/2 on Vercel makes this worse than the local HTTP/1.1 measurement
**still stands and is still untested**.

**Root cause.** Unchanged: `index.html`'s deliberate `fetchpriority="low"` on the Earth preloads,
against three's `FileLoader` XHRs which Chrome defaults to `High`.

**User impact.** Up to several seconds before anything is on screen on the slowest connections;
invisible on fast links. Smaller than it was, and now smallest exactly where it used to be largest.

**Proposed direction.** Apply the treatment that worked for the city to the three remaining
`High`-priority not-required fetches. The decoders in particular are only needed by the city, which
now loads after handover — so **the Draco and Basis fetches at 1.8 s and 2.4 s are downloading a
decoder ~1.5 s before the thing it decodes is even requested.** That is a straightforward ordering
fix and it returns 720 KB of `High`-priority bandwidth to the required set. Then re-examine whether
the Earth preloads still need to be `Low` once nothing outranks them.

**Complexity.** Low-to-moderate, and lower than it was: the pattern is already established by the
city change.
**Expected benefit.** Up to ~720 KB of `High`-priority contention removed from the pre-handover
window. **Confidence.** **High** on the priorities and the timings, which are measured; **medium** on
the projection.

---

#### P1-E · The Earth's resting scene is still 135 draw calls and 380 k triangles, 93 % of it six copies of one satellite — UNFIXED (prior P1-A)

**Evidence.** Re-measured at rest, handover + 17 s: **135 draw calls, 380 461 triangles, 3.1 ms GPU,
1.1 ms CPU**, against 135 / 378 714 / 2.7 ms six days ago. `public/models/satellite.glb` is
byte-identical (269 928 B, 2026-08-07 mtime). The phone-shaped viewport draws 124 calls — 11 fewer,
one satellite leaving the frustum, the same arithmetic the second pass used.

**Measurement, unchanged.** ~87 of 135 draw calls and ~352 k of 380 k triangles are satellite models.

**Relevant files.** `public/models/satellite.glb`, `src/experiences/earth/orbit/createSatellite.ts`,
`createOrbitSystem.ts`, `orbitAssignments.ts`.

**Root cause, user impact, proposed direction, complexity.** Unchanged from
`reports/website-performance-and-optimization-2026-08-27.md` §P1-A, which states them correctly and
in full. This entry records that the finding was not acted on and still holds exactly.

**Confidence.** **High** on the measurement; **low** on the benefit, which remains the honest answer
while the only available GPU renders it in 3.1 ms.

---

#### P1-F · GPU texture memory still scales with the number of published case studies, and is now 30 % of the phone path's content textures — UNFIXED (prior P1-E)

**Evidence.** Both atlases were observed again in the allocation census at exactly the predicted
dimensions, on desktop and on the phone-shaped viewport alike — **still viewport-independent**:

| Atlas | Dimensions | GPU resident (mipped, SRGB8_ALPHA8) |
|---|---|---|
| logo | 2048×1536 | **16.00 MiB** |
| isotype | 1024×1536 | **8.00 MiB** |
| | | **24.00 MiB** |

`createBrandAtlas.ts` is unchanged: `COLUMNS = 2`, cells of 1024×512 and 512×512, canvas height
`ceil(plates.length / 2) × cell.height`.

**Measurement, updated.** 24.0 MiB is now **30 % of the 80.1 MiB of content texture on the phone
path** (it was 18 % of 130 MiB), because the Earth maps around it got smaller and the sky vanished.
The scaling law is unchanged at **+8 MiB per two additional case studies**; twelve case studies would
cost 48 MiB, which on today's phone path would be **more than every Earth map combined**.

**Root cause, proposed direction, complexity.** Unchanged from the second pass §P1-E. Its lever (3) —
**assert the atlas dimensions in `checks/`** — is now part of a larger and more urgent version of the
same idea, P2-N: nothing in `checks/` measures any texture at all.

**Confidence.** **High.** Same code, same census, same numbers.

---

#### P1-G · The post-processing chain is 42 % of GPU memory at DPR 2 and 47 % on the phone path — REVALIDATED (prior P1-F)

**Evidence.** §2.5, now counted directly rather than inferred. The chain costs **66.8 MiB at DPR 1,
267.3 MiB at DPR 2, and 71.3 MiB on the phone-shaped viewport** — figures identical to the second
pass's, which is a clean cross-validation of two different instrumentation approaches (§7.1).

The 15 offscreen targets are `EffectComposer`'s read/write pair, `AfterimagePass`'s comp/old pair
(all four full-resolution `RGBA16F`, 8 bytes/px) and `UnrealBloomPass`'s bright target plus five
horizontal and five vertical mips, each with a single-sample `DEPTH_COMPONENT24` renderbuffer.
Growth is exactly DPR² in both columns. **`renderbufferStorageMultisample` is called zero times in
every configuration**, confirming §7.1 of the second pass for a second time.

**The afterimage half stands unchanged**: the pass is correctly disabled outside the ~1.6 s warp, and
`EffectComposer` still holds its two full-resolution targets resident for the whole session —
**79.1 MiB at DPR 2, 21.1 MiB on the phone path, for a pass that runs 1.6 seconds per transition.**

**The share fell from 59 % to 42 % on desktop, and that is not an improvement** — the denominator
grew by 190.7 MiB of sky. In absolute terms the chain costs exactly what it cost.

**Relevant files.** `src/graphics/RenderPipeline.tsx:110-149`, `src/components/SceneCanvas.tsx`
(`dpr={[1, 2]}`, `antialias: true`).

**Proposed direction, complexity, benefit.** Unchanged from the second pass §P1-F: allocate the
afterimage targets on demand; make the DPR cap capability-derived on a memory signal. **Do not
revisit `antialias` for its memory** — that lever was withdrawn on measurement in the second pass and
this pass re-confirms that the multisample memory is not allocated here.
**Confidence.** **High.**

---

#### P1-H · Shader linking still stalls the main thread after handover, in every profile and every run — UNFIXED (prior P1-B)

**Evidence.** Post-handover long tasks over 50 ms, per run, all five profiles:

| Profile | Post-handover stalls, per run (ms) |
|---|---|
| Local wide (n=5) | 155, 289, 100 / 77 / 68, 105 / 58, 107 / 68, 93 |
| Local narrow (n=3) | 79, 289, 54 / 66, 109 / 69, 108 |
| Fast 4G + 4× CPU (n=3) | 81, 292, **499**, 53, 134, 55 / 64, 199, 276 / 140, 204 |
| Slow 4G + 4× CPU (n=3) | 119, 168, 309, 66, **431** / 83, 262, 241 / 86, 190, 185 |
| Slow 4G narrow (n=3) | 67, 121, 273, **382** / 73, 236, 152 / 106, 266, 252 |

**Not one run in seventeen was free of them.** They cluster within a few seconds of
`intro-complete` — the satellite entrance and the resting orbit, which is what the composition is
asking to be looked at.

**Measurement, and a correction to how confidently this can be attributed.** The second pass
attributed 412 ms to `getProgramInfoLog` with a stable per-program table. This pass measures that
same self time at **61 ms to 547 ms across otherwise identical runs**. The *stalls* are perfectly
reproducible; the *attribution* is not stable this pass. Programs rose from 43 to **51 once Murcia
has loaded**, consistent with the four new district shader programs, which is more material for the
driver to link.

**Root cause.** The second pass's colour-space hypothesis — that `EarthScene`'s `compileAsync` runs
with no render target bound and therefore warms the sRGB-output variant of every material, while the
Earth route draws them all into `EffectComposer`'s HalfFloat target and needs the linear variant — is
**neither confirmed nor refuted by this pass**. It remains the best available explanation and it
remains untested, because the test is the fix.

**The remedy that was measured and rejected stays rejected.** `renderer.debug.checkShaderErrors =
false` was A/B'd in the second pass and relocated the stall from `getProgramInfoLog` to
`getProgramParameter` without changing total long-task time. **Do not implement it.**

**Proposed direction.** Unchanged from the second pass §P1-B: bind the composer's render target
around the warm-up, so the variant compiled is the variant drawn. Verify by re-running the same
instrumentation and checking the post-handover cluster disappears — **and given this pass's variance,
verify over at least 5 runs per arm, not one.**

**Complexity.** Moderate; the ordering constraint between `SceneCanvas`, `RenderPipeline` and
`EarthScene` is the hard part, not the change.
**Expected benefit.** Up to ~280 ms of post-handover main-thread stall locally, up to ~500 ms at 4×
CPU. **Confidence.** **High** that the stalls exist, are post-handover, and occur on every run;
**low** on the per-call attribution this pass; **medium** on the colour-space mechanism, unchanged.

---

### P2 — Moderate

#### P2-I · The Murcia trim sheet is a 19 007 B PNG that costs 21.3 MiB of VRAM, and it stays resident on the Earth route — NEW

**Evidence.** `public/textures/murcia/murcia-basecolor.png` is **2048×2048 and 19 007 B — 0.036 bits
per pixel**. It appears in the allocation census as `SRGB8_ALPHA8 2048×2048` with a full mip chain:
**21.33 MiB**. It is fetched at 3 868 ms alongside the city, and is still resident in the census
taken after four Earth↔Murcia round trips.

**Measurement.** A **1 177 : 1** expansion from transfer to GPU residency, and **27 % of the phone
path's 80.1 MiB of content texture** for a texture that is never sampled on the Earth route. For
scale, it costs more GPU memory than two narrow Earth maps.

**Relevant files.** `public/textures/murcia/murcia-basecolor.png`,
`src/experiences/murcia/assets/loadTrimSheet.ts`, `loadCity.ts:342` (`TRIM_ANISOTROPY`).

**Root cause.** Not a mistake — a trim sheet is *supposed* to be one texture shared by the whole
city, and `docs/murcia/blender-export-contract.md` records the decision. What nobody costed is the
consequence of authoring it at 2048² with mipmaps in an uncompressed format: **0.036 bpp means the
image is almost entirely flat colour**, and a flat 2048² atlas is exactly the case where the GPU
format, not the file format, is the whole cost. The file being 19 KB is what makes this invisible —
it looks free on every axis anyone was watching.

**User impact.** None observed on desktop. On the phone path it is a quarter of the content-texture
budget for a texture belonging to an experience the visitor may never open.

**Proposed direction.** Three separable levers. (1) **Check whether 2048² is needed at all** — a
19 KB PNG at that size implies most of it is flat or unused; the answer is in the UV layout the
export contract already documents. (2) **Encode it as KTX2/BC7**, which takes it from 21.33 MiB to
5.33 MiB with mips and is exactly the roadmap question P2-L has been blocked on — **if the trim sheet
ships as KTX2, P2-L answers itself and the 641 KB of KTX2 machinery finally amortises.** (3) Load it
with the city rather than holding it across the Earth route, if disposal on route change is ever
introduced.

**Complexity.** (1) is a look at the atlas; (2) is one asset-pipeline step and is already supported
by `loadTrimSheet.ts`, which branches on `.ktx2`; (3) is a lifecycle change and the largest.
**Expected benefit.** Up to **16 MiB** on every path from (2) alone, and it retires an open roadmap
question.
**Confidence.** **High** on the measurement; **medium** on (1), which needs the UV layout looked at.

---

#### P2-J · Murcia's resting GPU cost doubled, and the district display it now owns has never been measured — NEW

**Evidence.** Murcia at rest, same harness and same session shape as the second pass:

| | 08-27 | 09-02 |
|---|---|---|
| GPU ms (med / p95) | 2.0 / 5.4 | **4.3 / 4.9** |
| Draw calls | 176 | 176 |
| Triangles | 1 857 750 | 1 854 046 |
| FBO binds | 0 | 0 |

**Measurement.** **+115 % GPU time at flat geometry and flat draw calls.** Whatever this is, it is
fragment cost, and geometry simplification would not touch it. What landed in the window is all
fragment-side: `water/shaders/rio/fragment.glsl` (263 lines, 5 392 B in the chunk),
`district/shaders/fluid/fragment.glsl` (252 lines, 4 924 B), the rebuilt
`createTerrainTransition.ts`, and the trim sheet's extra texture fetch per fragment at
`TRIM_ANISOTROPY`.

**The gap.** The services district's *display* is built on district entry
(`MurciaExperience.ts:676`), which the session harness never reached — it measures the city
overview. From source, entering the district allocates **a 1600×3200 `CanvasTexture` at anisotropy 8
(26.0 MiB mipped)**, a label canvas, and four more shader programs. **None of that is in any number
in this report.** It is the largest unmeasured surface in the application.

**Relevant files.** `src/experiences/murcia/water/createRioWater.ts`,
`src/experiences/murcia/environment/createTerrainTransition.ts`,
`src/experiences/murcia/district/display/servicesDisplay.ts:105,123,209-227`,
`src/experiences/murcia/assets/loadCity.ts:342`.

**Proposed direction.** Measure it before optimising anything: extend the session harness to fly into
the services district and take the GPU/draw/allocation census there. **Do not act on this finding
before that measurement exists** — 4.3 ms is 26 % of a 60 Hz budget on a desktop GPU and is not
itself a problem; the question is what the display adds on top, and on what hardware.

**Complexity.** Low for the measurement.
**Expected benefit.** None directly. It closes the largest blind spot in this lineage.
**Confidence.** **High** on the doubling, which is measured; **high** that the display is unmeasured,
which is a fact about this audit.

---

#### P2-K · The decoder pools are still never released — UNFIXED, third pass running (prior P2-G, prior P2-5)

**Evidence.** `Worker` constructor instrumented across a full session including four Earth↔Murcia
round trips: **6 workers created from 2 distinct blob URLs, 0 terminated** — at handover, after each
round trip, and at end of session. Identical in all 17 load runs across all five profiles.

**Root cause.** Unchanged and re-confirmed: `MurciaExperience` acquires both loaders in its
constructor and releases them only in `dispose()`, which never runs because both experiences stay
mounted for the application's lifetime (ADR 001/003). `createAssetLoader.ts` is correct about why it
releases them together; the call site never fires.

**Proposed direction, complexity, benefit.** Unchanged from the first pass §P2-5: release when the
*load* completes rather than when the *experience* is destroyed. Verify with the same census —
`terminated` should reach 6.
**Confidence.** **High** — measured three times, thirteen days apart, with the same result.

---

#### P2-L · 641 KB of KTX2 machinery to decode 174 KB of texture, and 57 KB of it is in the chunk that gates readiness — UNFIXED, and P2-I may finally answer it (prior P2-H)

**Evidence.** Unchanged, re-attributed through the source map of this build:

| Component | Bytes | Where |
|---|---|---|
| `libs/basis/basis_transcoder.wasm` | 527 333 | fetched at 2 353 ms, **`High` priority** |
| `libs/basis/basis_transcoder.js` | 57 529 | fetched at 2 353 ms |
| **`three/examples/jsm/libs/zstddec.module.js`** | **39 745** | inside `assets/three-*.js` — **4.8 % of it** |
| `three/examples/jsm/loaders/KTX2Loader.js` | 12 460 | inside `assets/three-*.js` |
| `three/examples/jsm/libs/ktx-parse.module.js` | 4 717 | inside `assets/three-*.js` |
| **Total** | **641 784** | to decode **173 922 B** of texture |

A ratio of **3.7 : 1**, unchanged. The Zstandard decoder exists for KTX2 files with
`supercompressionScheme=2`; both of this project's KTX2 files are BasisLZ (scheme 1), so it is
39 745 B of raw JavaScript that **can never execute**, inside the chunk that gates `chunk:scene`.
`KTX2Loader.detectSupport` also costs **123 ms of `getExtension`** on the main thread during load
(§2.7), up from 92 ms.

**What is new.** The second pass said the answer depends entirely on whether the city's trim sheets
arrive as KTX2, and that the question had been open a week. **The trim sheet has now arrived — as a
2048² PNG costing 21.3 MiB (P2-I) — and `loadTrimSheet.ts` already branches on `.ktx2`.** The two
findings are now one decision: encode the trim sheet as KTX2/BC7 and both resolve — the machinery
amortises and the trim sheet drops from 21.3 MiB to 5.3 MiB. Ship the trim sheet as PNG and there is
no remaining KTX2 consumer worth 641 KB.

**Proposed direction.** Decide P2-I lever (2) first; this follows from it mechanically.
**Complexity.** Low either way. **Confidence.** **High** on the measurement; the recommendation is
now *conditional on a decision that is finally in front of someone*, rather than on an unknown
roadmap.

---

#### P2-M · `gsap-core` is 49.4 % of the app entry chunk — NEW shape (prior P2-I closed)

**Evidence.** Source-mapped attribution: `gsap/gsap-core.js` is **51 508 B of the 104 273 B app entry
chunk**. `CSSPlugin` is gone — all three GSAP call sites now import `gsap/gsap-core`
(`useMasterTimeline.ts:2`, `useExperienceTransition.ts:2`, and the test), and no `CSSPlugin` string
survives in any chunk. **Prior P2-I is closed and it worked**: the entry lost 19 018 B of
DOM-animation machinery it never used.

What the closure exposes is that the *rest* of GSAP is now half the entry chunk, for what the second
pass established is a small set of uses: `gsap.timeline`, `gsap.context`, `ctx.revert()`, and tweens
whose every target is a plain object literal.

**Measurement.** 51 508 B raw / ~19 KB gzipped, 49.4 % of the entry and ~3.4 % of `/`'s 1.52 MB
initial JS closure.

**Root cause.** Not a defect. `gsap-core` is the smallest supported GSAP entry point; there is no
smaller one.

**Proposed direction.** **Measure the alternative before adopting it, and probably do not adopt it.**
What these two modules use of GSAP is a timeline with labels, nested timelines, eases and a `context`
for React cleanup. That is a real amount of behaviour, `useMasterTimeline` is load-bearing for the
whole intro, and `checks/navigation-feel` and `e2e/boot.spec.ts` are what would have to prove a
replacement equivalent. **19 KB gzipped against that regression surface is not obviously a good
trade**, and it is 3.4 % of the closure the build already budgets. This is recorded so the number is
known, not because it is recommended.

**Complexity.** High, if attempted. **Expected benefit.** ~19 KB gzipped.
**Confidence.** **High** on the attribution; **low** that acting on it is correct.

---

#### P2-N · Nothing in the build measures a static asset, and the one test named for the narrow panorama passes with the panorama absent — NEW

**This is the mechanism finding. P0-A and P1-B did not slip past a gap in the gates; they walked
through the middle of them.**

**Evidence, three parts.**

1. **No harness reads a texture.** Of the nine harnesses in `checks/`, exactly two open a file in
   `public/`: `city-asset.ts` (the city GLB) and `audit-hygiene.ts` (which only checks that cited
   paths are not git-ignored). **No harness reads any image's dimensions or byte size.** Both
   `npm run check:space` (36/36) and `npm run check:asset:contract` (5/5) were run for this audit and
   **pass today** against a 10000×5000 panorama and two unreachable filenames.
2. **`check:space` asserts against an asset property nothing establishes.**
   `checks/space-backdrop.ts:476` compares the cap-blend geometry against `POLE_FADE_START_DEG = 55`
   in `prepare-sky-panorama.mjs` — the pole convergence *that script* applies. The shipped file was
   not produced by that script, so the harness is validating the scene against a property of the
   asset that nothing has established the asset has. It passes, and its passing means less than it
   reads.
3. **The visual gate does not catch it either.** `e2e/backdrop.spec.ts:80`, *"narrow viewport uses
   the small panorama without banding"*, was run against the current build and **passed in 11.1 s**.
   The same 420 px viewport, in the same build, logs `[sky] no panorama variant loaded` and renders
   no shell. The baseline dates from 2026-08-19, when the narrow panorama worked, so this is not a
   re-recorded baseline — the test's `maxDiffPixelRatio: 0.02` with Playwright's default per-pixel
   threshold simply does not resolve a dark nebula disappearing behind a star field.

**Measurement.** Two findings, one of them this pass's only P0, shipped on 2026-08-31 and survived a
full green harness suite and a green visual baseline for two days.

**Relevant files.** `checks/` (all nine), `e2e/backdrop.spec.ts:80-91`,
`scripts/prepare-sky-panorama.mjs`, `vite.config.ts:104-290`.

**Root cause.** The gates in this repository are good and they are all pointed at *code*. The chunk
budgets measure emitted JavaScript. The harnesses measure configuration and geometry. The e2e
baselines measure pixels within a tolerance chosen for a spinning Earth. **Static assets are the one
input with no gate at all** — and they are also the only input a person can change by copying a file
into a directory.

**Proposed direction.** One small harness, `checks/asset-budget.ts`, in the same shape as the eight
beside it. It should assert, from the files on disk:

- **that the four sky files exist at the exact names `spaceConfig.ts` requests** — this alone turns
  P1-B from a two-day silent regression into a failed build;
- **dimensions and byte ceilings** for every texture in the boot payload — sky, the six Earth maps,
  the trim sheet — stated as constants with the GPU arithmetic in a comment, the way
  `vite.config.ts` states its budgets;
- **the generated brand atlas dimensions** (P1-F lever 3, proposed twice and still open);
- **total GPU residency implied by the boot set**, wide and narrow, against the §4 budget.

Each of those is a `statSync` and a header parse. The AVIF `ispe` and WebP `VP8X` readers used for
§2.3 are about thirty lines together and need no dependency.

**Complexity.** Low. It is a harness in a directory full of harnesses, and `npm run check:harnesses`
already has a slot for it.
**Expected benefit.** No user-facing bytes. It is the difference between this pass's P0 being caught
by a build on 2026-08-31 and being caught by an audit on 2026-09-02.
**Confidence.** **High.** Both harnesses were run, the e2e test was run, and all three passed against
the broken state.

---

### P3 — Minor

| # | Finding | Evidence | Direction | Status |
|---|---|---|---|---|
| P3-9 | **The narrow Earth re-encode is done, with one residual.** `QUALITY` is 70 and the set fell from 1 701 127 B to 815 474 B. `day-narrow` is 0.473 bpp against the wide 0.451; `night-narrow` 0.219 against 0.255 — matched or better. **`specularClouds-narrow` is still 2.419 bpp against 1.614, i.e. 1.50×** (was 3.1×). | file headers, §2.3 | The residual is defensible — it is a data map at 4:4:4 chroma, and downscaling raises its per-pixel entropy. Worth one measurement of what q60 costs it visually before calling it finished. | **Largely fixed** (prior P1-C) |
| P3-10 | `draco/draco_decoder.js` (512 465 B) is still deployed and still never requested — absent from all 28 requests in every run of every profile this pass. | waterfall | Unchanged: keep only if a no-WASM fallback is a stated requirement. Deploy weight only, no user bytes. | **Unfixed** (prior P3-9) |
| P3-11 | The debug surfaces still ship. Murcia: `DebugOverlay.ts` 2 463 B, `MurciaDebugTools.ts` 2 142 B, `stats.js` 1 826 B — **6 431 B**, 5.4 % of the Murcia chunk. Sky prototype, in the **readiness-gating** SceneCanvas chunk: `SkyShellCube.tsx` 1 580 B, `shellCube.frag.glsl` 1 236 B, `protoSky.ts` 380 B, `protoHolo.ts` 103 B — **3 299 B**. Plus `debugCameraHook.ts` 76 B. The React `/debug` console still folds correctly. | source-map attribution | Unchanged: a compile-time `DEBUG_TOOLS_ENABLED` guard with a dynamic `import()`. The runtime guard is why Rollup cannot shake either. | **Unfixed, marginally grown** (prior P3-10) |
| P3-12 | **`/fonts/` was added to the cache config correctly** — `public, max-age=31536000, immutable`, and the filenames carry content hashes, so this is right. `/logos/` is still in the 24 h group despite Sanity filenames already carrying a content hash. | `vercel.json` | Promote `/logos/` to `immutable`; it is provably content-addressed. Nothing for first visits, everything for returning ones. | **Half fixed** (prior P3-11) |
| P3-13 | `anisotropy` gained a call site rather than losing one: Earth maps 8, brand atlases 4, trim sheet `TRIM_ANISOTROPY`, display canvas 8, label canvas 4. Real per-fragment bandwidth on a tile-based GPU; still not measurable on this hardware. | source | Belongs to the device profile (§5). Open since 2026-08-14. | **Still open, grown** (prior P3-12) |
| P3-14 | **Comment drift: the four from the second pass are all fixed.** `bootState.ts` now states the argument rather than a byte count, and says why; `SceneCanvas.tsx:159-169` describes the alpha override correctly; `OrbitSystemLayer.tsx:61` says "BOTH brand atlases"; `buildFlags.ts` no longer states a percentage. **Five new ones replaced them, all about the sky** — "33.6 MB" in five places, "q59 / 194,642 bytes / 200 KB budget", "4096 is the ceiling the SOURCE allows", and `bootState.ts:42`'s "Only 111 KB". | source vs. measurement | Correct them as part of P0-A. These are the numbers the next change will be reasoned from, and this is the second consecutive pass to say so. | **Fixed and re-broken** (prior P3-13) |
| P3-15 | `dist/` is **636 MB** after a production build: 621 MB of git-ignored `public/proto-sky/` and **4.57 MB of git-ignored `sky-test-*` candidates**, both correctly excluded from a Git-based deploy. **New:** the two space-named sky files **are** tracked — **721 KB deployed to every visitor and reachable by nothing.** | `du`, `git ls-files`, `.gitignore` | The 621 MB is still not a production problem and still deserves one line in the deploy documentation (this project must be deployed from Git, not by `vercel deploy` from a working copy). The 721 KB goes away with P1-B. | **Unfixed, plus a new tracked item** (prior P3-14) |
| P3-16 | On a blog post, `source-serif-4-latin-italic.woff2` (130 510 B) is the largest file on the page, is not preloaded, and is discovered at t+74–123 ms. `blog.html:68-70` argues the italic is "usually unused" — true of `/blog`, not of an article, where the post body uses it. | §2.8 waterfall | Either preload it on the per-post shells only (the `blogRoutes` plugin already rewrites their heads per post), or accept the swap. `font-display: swap` means this costs a late reflow of italic runs, not a blocked render. Small, and the reasoning in the file is otherwise right. | **New** |
| P3-17 | `alpha: false` still does not reach the WebGL context: read back live again as `{alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: "high-performance"}`. **The comment at `SceneCanvas.tsx:159-169` was corrected and now states this accurately**, which is what the second pass asked for. | live context | Nothing further. Recorded so the next pass does not re-derive a saving that is not there. | **Documented; behaviour unchanged** (prior P2-L, downgraded) |

---

## 4. What was measured and found *not* to be a problem

The brief asks repeatedly not to optimize theoretical bottlenecks. These were each tested this pass
and each came back negative.

| Hypothesis | Test | Result |
|---|---|---|
| **Geometry is a limiting factor** | Per-frame primitive counting on both routes | **No, and more clearly than before.** Murcia's GPU cost **doubled at flat geometry** — 176 draws and ~1.85 M triangles in both passes, 2.0 → 4.3 ms. Triangle count is not what costs anything here. |
| **Repeated Earth↔Murcia transitions leak** | 4 round trips with a full GPU-resource census after each | **No.** Textures **34**, renderbuffers **16**, programs **51**, workers 6/0 — every one identical after each of the four trips, and identical again after 4.5 minutes of rest. |
| **Prolonged runtime degrades** | 4.5 minutes, 30 samples, vsync unlocked | **No.** GPU median 3.0 → 2.8 ms across the run; heap oscillating 31.3–49.3 MiB with no trend; the worst frame of the last 25 samples is well under the first. |
| **The DOM is expensive** | CDP Performance metrics, Earth at rest, 5 s | **No.** **0 layouts, 0.0 ms of layout time.** 364 nodes, 266 listeners, 1 canvas. Style recalculation is one per rendered frame at 45.7 ms per 5 s — 0.9 % of the thread. |
| **The blog document drags the app in** | Full load of `/blog` and `/blog/<slug>`, wide and narrow | **No, emphatically.** No canvas, no WebGL context, no `three` chunk, **zero long tasks**, 87 DOM elements, 3 MiB heap, 0 rAF callbacks in 4 s at rest. adr/013 delivers exactly what it claims. |
| **`scene-ready` is still marked repeatedly** | `getEntriesByName` on 17 loads across 5 profiles | **No — fixed.** Exactly **1** entry per load in every profile, including Slow 4G narrow where the second pass counted 52. |
| **The GSAP `CSSPlugin` still ships** | String search across every chunk + source-map attribution | **No — fixed.** Zero occurrences; all three call sites import `gsap/gsap-core`. |
| **The city still loads through the handover** | Waterfall with CDP request start times | **No — fixed.** `city-prototype.glb` starts at **3 868 ms**, 7 ms after `intro-complete` at 3 861 ms. |
| **The "unused preload" warnings mean assets are downloaded twice** | Request census on Slow 4G, where Chrome logs the warning for all six preloads | **No.** 28 requests and 5.88 MB on Slow 4G — byte-identical to the local run. The warning fires because the app consumes the assets long after `load`, not because anything is fetched twice. It is a symptom of P1-D's contention, not a second defect. |
| **The narrow viewport fetches the wrong resolution** | Request census at 412, 420, 768 and 1440 px | **The breakpoint works; the file does not.** Exactly one resolution set is requested per viewport, the 767 px breakpoint agrees between `index.html`, `styles.css` and `spaceConfig.ts`, and no duplicate downloads occur. The narrow branch then asks for a filename that does not exist (P1-B). |
| **Fonts delay first paint on `/`** | Request census on the root document | **No.** `/` requests **zero font bytes** — the six woff2 files belong to `blog.html` alone, all seven `@font-face` rules carry `font-display: swap` and `unicode-range`, and two are preloaded. |
| **Background tabs keep rendering** | — | **Not verified, third pass running.** Headed Playwright still does not flip `document.hidden`. The application's five `visibilitychange` guards are verified in source only. Unchanged limitation. |
| **`renderer.debug.checkShaderErrors = false` removes the shader stalls** | A/B, second pass | **No.** Not re-tested; the second pass's interleaved A/B stands. **Do not implement this.** |
| **Failed assets cause retry storms** | — | **Not re-tested this pass.** The second pass's six-case matrix (required, optional, decoder, CMS media, sky) found exactly one attempt per URL and the documented fallback in every case, and stands. |

---

## 5. Performance Budget Proposal

Three budgets now exist and fail the build (`vite.config.ts`), and the mechanism was rebuilt this
week to measure `/`'s whole initial closure rather than one chunk. **That was the right change** — it
makes a new lazy chunk joining the initial load visible, which a single-chunk budget could not see,
and it is why prior P2-M (give `SceneCanvas` a budget) is superseded rather than merely unfixed. This
proposal extends the same mechanism and adds the one dimension it has never covered: **static
assets.**

| Budget | Proposed | Measured today | Status vs. 2026-08-27 |
|---|---|---|---|
| Intro entry (raw) | 16 000 B *(existing)* | 14 071 B (88 %) | unchanged |
| App entry (raw) | 160 000 B *(existing, re-scoped)* | 104 273 B (65 %) | **healthier, and now a secondary guard** |
| Blog chunk (raw) | 120 000 B *(existing, new)* | 15 771 B (13 %) | **new, and correctly generous** |
| Initial JS closure of `/` (raw) | 1 600 000 B *(existing, new)* | 1 518 972 B (**94.9 %**) | **new, and the right gate** |
| Initial JS requests on `/` | 10 *(existing, new)* | **9 (90 %)** | **new** |
| **Any single texture, GPU resident** | **48 MiB** *(new)* | **190.7 MiB — the sky** | **new breach, 4.0×** |
| **Texture residency, phone-shaped viewport** | **90 MB** | 151.4 MiB **over** | **worse** — 71.3 MiB of it is the post chain |
| **Texture residency, desktop DPR 1** | **200 MiB** *(new)* | **433.7 MiB over** | **new breach** |
| **Brand atlas residency, total** | **12 MiB, constant in the case-study count** | 24.0 MiB, +8 MiB per two case studies | unchanged breach |
| **Render-target memory** | **≤ 25 % of texture residency** | 42 % (desktop DPR 2), 47 % (phone) | absolute cost unchanged |
| **Required boot payload, wide** | **2.8 MB** | 3.31 MB **over** | worse by the sky's 105 KB |
| **Required boot payload, narrow** | **1.4 MB** | **1.42 MB — effectively met** | **much better** — was ~2.26 MB |
| **Total first-visit transfer, narrow** | **3.0 MB** | 3.99 MB **over** | **better** — was 4.86 MB |
| **Not-required bytes fetched before handover** | **≤ 500 KB** *(new)* | 1.22 MB **over** (899 KB at `High`) | **better** — was 2.60 MB |
| **Draw calls per frame** | **200** | 135 (Earth) / 176 (Murcia) | unchanged |
| **Triangles per frame** | **2 000 000** | 380 k (Earth) / 1 854 k (Murcia) | unchanged |
| **GPU ms/frame, desktop reference** | **8 ms** | 3.1 (Earth) / **4.3** (Murcia) | Murcia **doubled** |
| **Long tasks during load** | **no single task > 200 ms** | **657 ms local, 1 536 ms at 4× CPU** **over** | **much worse** — was 238 / 442 |
| **Post-handover main-thread stalls** | **none over 50 ms** | **289 ms local, 499 ms at 4× CPU**, in 17 of 17 runs | unchanged breach |
| **Blog: LCP** | **1 000 ms** *(new)* | **284–332 ms** | **new, comfortably met** |
| **Blog: long tasks** | **none** *(new)* | **none** | **new, met** |
| **DPR cap** | **2, and capability-derived below that** | 2, constant | unchanged |
| **CLS** | **0** | 0 everywhere | unchanged |

**The single-texture budget is the one to add first**, because it is the only budget in this table
that would have caught P0-A, and because it costs one `statSync` and a header parse (P2-N). 48 MiB is
chosen as roughly one and a half times the largest legitimate texture this application has ever
allocated — a 4096×2048 mipped Earth map at 42.67 MiB — so it admits everything the design currently
wants and refuses everything it does not.

Nine budgets are breached. **Every one of them is GPU memory, main-thread stalls, or not-required
bytes — and after P0-A, four of the nine stop being breached at all.**

---

## 6. Device Quality Strategy

The answer from both earlier passes was **yes, a centralized model, but a small one, and for memory
rather than for frame rate.** Everything measured this pass supports that more strongly, because this
pass could not even measure a frame-rate effect: **DPR 1 → 2 costs +200.5 MiB, and the GPU-time
difference is smaller than this hardware's run-to-run variance** (§2.5).

The cap still has the right owner in `SceneCanvas` and still needs to become a function rather than a
constant. It should be decided once, at boot, from capability signals (`navigator.deviceMemory`,
`hardwareConcurrency`, the framebuffer pixel count the viewport implies) and never from user-agent
brand. It must not change at runtime, because resizing the composer at DPR 2 reallocates ~194 MiB —
a memory spike introduced to solve a frame-rate problem that does not exist.

**Its scope should now be four numbers, not one.** In order of what they cost the phone path today:

1. **DPR**, unchanged — 51.9 MiB of render target on the phone path, DPR² in the cap.
2. **The sky resolution.** P0-A makes this the largest texture in the application by 4×, and the
   narrow variant is *already* a viewport decision (`narrowMaxWidth: 767`) that simply has the wrong
   file behind it. A capability model should own the ladder — 4096 / 2048 / 1024 — rather than a
   single media-query breakpoint.
3. **The brand atlas dimensions** (P1-F). Still the only content-driven entry in the texture budget,
   still viewport-independent, still generated at runtime and therefore still free to parameterise.
4. **The trim sheet's format and size** (P2-I). 21.3 MiB that a phone pays for an experience the
   visitor may never open.

**Nothing to remove.** The second pass withdrew `antialias` on measurement; that withdrawal is
re-confirmed here (`renderbufferStorageMultisample`: zero calls, every configuration) and stands.

**And one thing that is not a quality decision yet:** none of the four numbers above is worth a
runtime tier until the phone measurement in §8 exists. A capability model built on this desktop's
numbers would be tuned against the wrong hardware.

---

## 7. Revalidation of the 2026-08-27 findings

Every finding the second pass raised, checked against the build measured today.

| Finding | Verdict |
|---|---|
| **P1-A** — 135 draws / 379 k triangles, 93 % six satellites | **Unfixed, byte-identical.** 135 / 380 461 / 3.1 ms. `satellite.glb` unchanged since 2026-08-07. Now P1-E. |
| **P1-B** — 412 ms of shader linking, 186 ms after handover | **Unfixed.** Post-handover stalls over 50 ms in **17 of 17 runs**, to 499 ms at 4× CPU. The per-call attribution is less stable this pass (61–547 ms of `getProgramInfoLog` across identical runs) and is stated as such. Now P1-H. |
| **P1-C** — the narrow Earth set is encoded above the wide set | **FIXED.** `QUALITY` 90 → 70; the set fell 1 701 127 → 815 474 B; two of three maps now sit at or below the wide bit rate. **This is most of the 9.7 s improvement on Slow 4G narrow.** One residual at 1.50× on `specularClouds-narrow`, recorded as P3-9. |
| **P1-D** — priority inversion, 2.16 MB not-required at `High` | **Substantially improved, not closed.** The 1.34 MB city model now starts **after** handover, taking the pre-handover not-required set from 2.60 MB to 1.22 MB. 899 KB of it is still `High`, and 2.84 MB of required is still `Low`. Now P1-D. |
| **P1-E** — GPU memory scales with the case-study count | **Unfixed.** Two atlases, 24.0 MiB, still viewport-independent, now **30 %** of the phone path's content textures. Now P1-F. |
| **P1-F** — the post chain is 59 % of GPU memory at DPR 2 | **Holds exactly.** 66.8 MiB at DPR 1, 267.3 MiB at DPR 2, 71.3 MiB on the phone path — **identical to the second pass**, now counted rather than inferred. The share fell to 42 % only because the sky grew the denominator. Now P1-G. |
| **P2-G** — the decoder pools are never released | **Unfixed.** 6 created, 0 terminated, third pass running. Now P2-K. |
| **P2-H** — 641 KB of KTX2 machinery for 174 KB of texture | **Unfixed**, and the roadmap question it was blocked on is now answerable: the trim sheet arrived (P2-I) and `loadTrimSheet.ts` already accepts KTX2. Now P2-L. |
| **P2-I** — 19 018 B of GSAP `CSSPlugin` in the app entry | **FIXED.** Zero `CSSPlugin` in any chunk; all call sites import `gsap/gsap-core`. What remains is `gsap-core` at 49.4 % of the entry, recorded as P2-M with a recommendation **not** to act on it. |
| **P2-J** — long tasks rose 37 %, 373 ms of it texture upload | **Worse.** 8 / 1 363 ms / **657 ms** locally; `texSubImage2D` at **1 058 ms**. The upload half is no longer "deliberate and proportional" — it is P0-A. Now P1-C. |
| **P2-K** — `scene-ready` is marked up to 60 times per load | **FIXED.** Exactly 1 entry per load in 17 runs across 5 profiles, including Slow 4G narrow. |
| **P2-L** — `alpha: false` does not reach the context | **Behaviour unchanged, documentation fixed.** The live context still reports `alpha: true`; `SceneCanvas.tsx:159-169` now says so. Downgraded to P3-17. |
| **P2-M** — `SceneCanvas` has no chunk budget | **Superseded by something better.** The budget was rebuilt around `/`'s whole initial JS closure (1.6 MB / 10 requests), which covers `SceneCanvas` and everything else, and can see a new chunk joining the initial load — which a per-chunk budget could not. |
| **P3-9** — `draco_decoder.js` deployed, never requested | **Unfixed.** Absent from all 28 requests in every run. Now P3-10. |
| **P3-10** — the debug surfaces ship | **Unfixed.** 6 431 B in Murcia, 3 299 B in the readiness-gating chunk. Now P3-11. |
| **P3-11** — only `/assets/*` is `immutable` | **Half fixed.** `/fonts/` was added correctly, with content-hashed names. `/logos/` is still 24 h despite being content-addressed. Now P3-12. |
| **P3-12** — `anisotropy = 8` | **Still open, and grown** to five call sites. Now P3-13. |
| **P3-13** — comment drift on load-bearing numbers | **All four fixed; five new ones, all about the sky.** Now P3-14. |
| **P3-14** — `dist/` is 631 MB | **Unchanged at 636 MB**, plus 4.57 MB of git-ignored sky candidates and **721 KB of tracked, unreachable sky duplicates**. Now P3-15. |
| **No P0s; no leaks; no retry storms; DPR cap works; CLS 0; no wasted preloads** | **All hold except the first.** This pass raises a P0 (P0-A). No leaks across four round trips and 4.5 minutes; the DPR cap works; CLS 0 in every configuration; no duplicate downloads. Retry storms were not re-tested — the second pass's six-case matrix stands. |
| **Frame time is not the problem** | **Holds for Earth, weakens for Murcia.** Earth 3.1 ms; **Murcia doubled to 4.3 ms**. Both comfortable at 60 Hz on this GPU. Frame-time *spikes* remain a problem (P1-H), and the load-time spike got much worse (P1-C). |

### 7.1 One confirmation and one accounting change

**Confirmed rather than corrected: the render-target census.** The second pass inferred render-target
memory because its instrumentation wrapped `texStorage2D` only, and three allocates render-target
colour attachments with `texImage2D`. This pass wraps both and counts them directly. The result —
66.8 MiB at DPR 1, 267.3 MiB at DPR 2, 71.3 MiB on the phone path — **matches the second pass's
inferred figures exactly.** Both passes' finding that this application allocates **zero multisampled
renderbuffers** is confirmed a second time, by direct instrumentation in both.

**Changed: BC7 accounting is now direct.** The second pass counted `COMPRESSED_RGBA_BPTC_UNORM` at
4 bytes/px and subtracted 8 MiB in prose. This pass counts BPTC at its true 1 byte/px at the
allocation call, so **no correction is applied to any figure in this report** and the totals here are
directly comparable to the second pass's corrected numbers (246 MiB → 433.7 MiB at DPR 1;
130 MiB → 151.4 MiB on the phone path).

---

## 8. Optimization Roadmap

Ranked by Impact × Confidence ÷ Complexity.

### Immediate wins — high confidence, low risk

1. **P0-A + P1-B · Re-run `scripts/prepare-sky-panorama.mjs` on the new source.** One command
   restores 4096×2048 / 2048×1024, the four correct filenames, the pole convergence
   `checks/space-backdrop.ts` asserts against, and the AVIF quality the comments describe. **It is
   the largest single win in this audit by every axis at once: −158.7 MiB of GPU memory, ~635 ms of
   load-time main thread, ~660 ms off time-to-scene locally, ~105 KB on the wire, the mobile backdrop
   restored, and an unbounded mobile risk removed.** Regenerate the two `e2e/backdrop.spec.ts`
   baselines afterwards — that failure is the correct signal. **Do not rename the narrow files
   without doing this**; a rename alone takes the phone path from 151.4 MiB to ~342 MiB.
2. **P3-14 · Correct the five drifted sky comments** as part of (1), from the number that ships.
   Free, and they are what the next change will be reasoned from.
3. **P2-N · Add `checks/asset-budget.ts`.** Filenames, dimensions, byte ceilings, the generated atlas
   size, and implied GPU residency. Low complexity, no user-facing bytes, and it is the only proposal
   here that would have prevented (1) from being necessary.
4. **P2-K · Release the decoder pools when the load finishes, not when the experience is destroyed.**
   Six worker threads and ~0.7 MB of WASM, from moving one call. Open for thirteen days across three
   passes. Verify with the same census — `terminated` should reach 6.
5. **P1-D · Move the Draco and Basis decoder fetches behind the handover, with the city.** They are
   currently downloaded at `High` priority ~1.5 s *before* the asset they decode is even requested.
   720 KB of `High`-priority contention, and the pattern is already established by the city change
   that worked.
6. **P1-F (3) · Assert the brand atlas dimensions**, as part of (3). Proposed twice, still open; it
   makes the cost of publishing the seventh case study visible at build time instead of on a phone.

### Structural optimizations — require architectural work

7. **P2-I + P2-L · Decide the trim sheet's format, which decides the KTX2 question.** Encoding
   `murcia-basecolor` as KTX2/BC7 takes it from 21.3 MiB to 5.3 MiB **and** amortises the 641 KB of
   KTX2 machinery that has been unjustified for two weeks. One decision closes two findings.
8. **P1-H · Warm the program variant the composer actually draws.** Up to ~280 ms of post-handover
   stall locally, ~500 ms at 4× CPU, in every run of every profile. Verify over ≥5 runs per arm.
9. **P1-G (1) · Allocate the afterimage render targets on demand.** ~79 MiB at DPR 2, ~21 MiB on the
   phone path, for a pass that runs 1.6 s per transition. Local to `RenderPipeline.tsx`.
10. **P1-E · Decimate or merge the satellite model.** Up to ~75 draw calls and ~300 k triangles off
    every Earth frame. **Do this for the mobile path, not for this desktop's 3.1 ms** — and be honest
    that the benefit stays unproven until a phone measures it.
11. **P1-F (1) · Size the brand atlases from the viewport.** Up to ~18 MiB on the phone path, and it
    turns content-driven growth into a bounded number.
12. **P1-C · Assert the 200 ms long-task ceiling and the 50 ms post-handover ceiling in the existing
    e2e run.** Both have now been breached for two consecutive passes and found by an audit both
    times.
13. **§6 · Make the DPR cap capability-derived**, once the phone measurement exists. Small in code;
    needs the policy agreed and owned.
14. **P3-12 · Promote `/logos/` to `immutable`.** Nothing for first visits; everything for returning
    ones.

### Experimental — measure before adopting

15. **P2-J · Measure the services district display before touching it.** A 1600×3200 canvas texture
    (26.0 MiB), four shader programs and Murcia's doubled fragment cost are the largest unmeasured
    surface in the application. Extend the session harness to fly into the district; do not optimise
    first.
16. **P3-11 · Move the debug surfaces behind dynamic imports.** ~9.7 KB and a principle — the 3 299 B
    in the readiness-gating chunk is the half actually on the critical path.
17. **P3-9 · Re-measure `specularClouds-narrow` at a lower quality.** 1.50× the wide bit rate is
    defensible for a 4:4:4 data map; it may also be free to improve. Small.
18. **P3-16 · Preload the italic serif on post shells only.** ~130 KB discovered ~120 ms late on the
    best-performing page in the project. Genuinely marginal.

### Explicitly withdrawn

- **`renderer.debug.checkShaderErrors = false`.** Measured in the second pass; it relocates the stall
  and saves nothing. §4.
- **Reconsidering `antialias: true` for its memory.** The multisample memory it targeted is not
  allocated by this application — confirmed a second time by direct instrumentation. §7.1.
- **Replacing `gsap-core`.** ~19 KB gzipped against `useMasterTimeline`, the intro's entire
  choreography, and the two harnesses that would have to prove a replacement equivalent. The number
  is recorded in P2-M so nobody has to measure it again; acting on it is not recommended.
- **Geometry simplification in Murcia.** Its GPU cost doubled at *flat* draw calls and *flat*
  triangles. Whatever is being paid for there, it is not geometry.

### Physical-device validation — cannot be proven in this environment

Everything below was either unmeasurable here or measured on hardware that does not represent the
target. None of it should be acted on from this report alone.

- **P0-A on a device with `MAX_TEXTURE_SIZE` below 10000.** This desktop reports 16384 and takes the
  panorama whole. A phone reporting 4096 or 8192 runs three's `resizeImage` — a 50-megapixel canvas
  resample on the main thread, on the critical path. The mechanism is read from
  `three.module.js:10150`; the cost is unknown. **This is the single most important unmeasured number
  in this report**, and it becomes moot the moment (1) is done.
- **The 151.4 MiB phone-path residency against iOS's per-tab budget** — and the ~342 MiB it would
  become if P1-B were fixed alone. Still the most important standing unvalidated number in this
  lineage, and it has risen in every pass.
- **All GPU timings on mobile**, and specifically P1-E and P2-J. Every frame-time figure here comes
  from a discrete desktop GPU. A tile-based mobile GPU is the entire question.
- **Thermal and sustained behaviour on a phone.** The 4.5-minute run was on hardware that never came
  close to its limit. It proves the absence of a leak, not the absence of throttling.
- **iOS Safari specifically.** WebKit is not installed on this machine (`playwright.config.ts` states
  this as a limitation, not an oversight). The KTX2 transcode path, `compileAsync`, P1-H's link
  stalls and P0-A's oversized upload are all places Safari is most likely to differ, and to differ
  for the worse.
- **Background-tab rendering.** Headed Playwright still does not flip `document.hidden`; the
  application's five guards are verified in source only, in all three passes.
- **P3-13 · anisotropy.** A tile-based GPU question, open since 2026-08-14 and now at five call
  sites.
- **Real CDN delivery.** Brotli (15.6 % smaller than the measured gzip on the ~1.6 MB text half),
  HTTP/2 multiplexing, and the `vercel.json` cache headers were all audited statically. `vite
  preview` serves none of them — and HTTP/2 is exactly what removes the connection limit that
  accidentally softens P1-D here.

---

## 9. Reproducing this

Nothing in this audit modified the repository. The measurements come from a production build served
by `vite preview` and driven by Playwright scripts held in `node_modules/.cache/perf-audit/`, outside
the tree, which read the application's own instrumentation (`window.__vertigoBootDebug`,
`window.__vertigoIntro`, the `vertigo:*` performance marks) plus wrappers installed at page level.

To reproduce the baseline: `npm run content:build`, then build with `VITE_VERCEL_ENV=production`,
**and confirm the production markers before and after every measurement batch** (`robots.txt` at
104 B with `Allow:`, `sitemap.xml` present, no `noindex`, no `debug-overlay` string in the app entry,
and the served chunk hash unchanged) — a parallel session rebuilt `dist/` without the production
environment during this pass, and the marker check is what caught it. Serve with `npm run preview`
and load `http://localhost:4173/` while polling `window.__vertigoBootDebug.state()` for `'ready'`.
Throttling is CDP `Network.emulateNetworkConditions` and `Emulation.setCPUThrottlingRate`; the
profiles are named in §2.1. Request priorities come from `Network.requestWillBeSent`'s
`initialPriority`, and request start times from its `timestamp` relative to the first request.

GPU cost requires launching Chromium with `--disable-gpu-vsync --disable-frame-rate-limit` and a 1×1
`readPixels` at each frame boundary. **Frame samples must be taken at least ten seconds after
handover**, or they measure the pre-satellite scene. **Take at least two independent sweeps for any
DPR claim** — this pass's two disagreed by up to 2.4 ms on byte-identical framebuffers, which is why
§2.5 makes no frame-cost claim about DPR.

**The GPU memory census requires wrapping both `texStorage2D` and `texImage2D`**: three allocates
ordinary textures with the first and render-target colour attachments with the second. Count
`COMPRESSED_RGBA_BPTC_UNORM` at 1 byte/px, and count a mip chain whenever `levels > 1`.

Bundle attribution comes from a second build with `--sourcemap` into a scratch directory outside the
repository, deleted afterwards, with each generated byte-span assigned to its original module through
the map. Image dimensions come from the AVIF `ispe` box, the WebP `VP8X`/`VP8L`/`VP8 ` chunk and the
JPEG `SOF` marker, read directly — about thirty lines of Node, no dependency, and the same thirty
lines P2-N proposes moving into `checks/`.

Re-measure rather than inheriting these numbers. That is what this file is for.
