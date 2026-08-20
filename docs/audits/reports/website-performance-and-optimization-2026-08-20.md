# Website Performance & Optimization — Audit

**Date:** 2026-08-20 · **Against:** working tree at `a207f2b` + uncommitted changes
**Brief:** `audits/website-performance-and-optimization.md`

**First pass in this lineage.** There is no earlier performance report to delta against — `reports/`
holds seven documents and none of them is a performance audit. What does exist is a large body of
prior performance *work*, recorded in code comments rather than in a report: the intro-chunk
inlining A/B in `vite.config.ts`, the preload-priority argument in `index.html`, the decoder
consolidation in `graphics/decoders.ts`, and the eight-item remediation at the end of
`reports/ios-safari-2026-08-14.md`. Section 7 revalidates every one of those claims and says which
still hold.

**Measurement conditions apply to every number below unless stated otherwise:**

| | |
|---|---|
| Build | `VITE_VERCEL_ENV=production npm run build` — full gate (typecheck, unit suite, six harnesses) passed, then `npx vite build`. Verified production by its markers: `robots.txt` 104 B with `Allow:`, `sitemap.xml` emitted, no `noindex` in `index.html`, and none of the `/debug` tuning console's UI strings in any chunk. |
| Server | local `vite preview` on `:4173`. **HTTP/1.1, gzip, no brotli, no CDN, ~0 ms RTT.** |
| Client | Chromium 1.62.1 (Playwright), **headed, real GPU**: ANGLE / AMD Radeon RX 5500 XT / Direct3D11. |
| Viewport | 1440×900 CSS at DPR 1 unless a row says otherwise. Mobile rows are an emulated Pixel 7 (412×839 CSS, DPR 2.625) — **Chromium on a desktop GPU, never a phone**. |
| Cache | cold on every load run (fresh browser context per run). |
| Repeats | load metrics are the **median of 5** runs local, **3** per throttled profile. Frame metrics are the median of 1 200–5 000 frames. |
| Labels | every figure is tagged **production** (built artefact), **synthetic** (emulated device/network), **real-device** (this desktop's actual GPU) or **inferred** (arithmetic, not observed). |

**Instrumentation.** The page was measured from outside: a Playwright init-script installs
`PerformanceObserver`s, wraps `requestAnimationFrame` to time each frame's callbacks, and wraps the
WebGL context to count draw calls, framebuffer binds, texture allocations, buffers and programs. No
source file was modified for this audit, and none of this instrumentation ships. GPU time is
measured by a 1×1 `readPixels` at each frame boundary with vsync unlocked — it blocks until the GPU
has drained the previous frame, so the block *is* that frame's GPU cost.
`EXT_disjoint_timer_query_webgl2` is advertised by this driver and returns zero from every query,
which is why it is not the source.

**Two instrumentation corrections are folded into the numbers below**, stated so they are not
mistaken for measurements: `texStorage2D` allocations were counted at 4 bytes/px, which
over-counts the two BC7 textures (`logoBake.ktx2`, `satellite_Baked.ktx2`) by 4 MB each; every
texture total here is corrected by −8 MB. MSAA renderbuffer figures assume 4 bytes/px per sample
and are approximate.

---

## 1. Performance Executive Summary

**This site is network-bound on load and idle on the desktop it renders on.** Those two facts set
the whole shape of the roadmap: nothing in the frame loop needs attention, and everything on the
wire does.

**Network-bound — dominant, by a wide margin.** A cold wide-viewport load transfers **5.27 MB
across 22 requests**. On Slow 4G with a 4× CPU throttle, the scene becomes ready at **27.8 s** and
the intro hands over at **28.4 s**. The arithmetic is not subtle: 5.27 MB at 1.6 Mbit/s is ~27 s,
and the measured number is ~27.8 s. Nothing else in this audit changes a user-visible number by
more than a fraction of that.

Two things make it worse than it needs to be, and both are findings rather than consequences of the
design. The mobile texture set is **encoded at a higher JPEG quality than the desktop set it is
supposed to be a cheaper version of** (P1-1) — it has a quarter of the pixels and only 30 % fewer
bytes. And **2.1 MB of assets that are explicitly declared not-required for readiness are fetched
during the intro**, sharing the connection with the single 1.65 MB file that actually gates it
(P1-2).

**GPU-bound — not on this hardware, and probably not on desktop at all.** Steady state on the Earth
route costs **1.7 ms of GPU time and 0.3 ms of CPU per frame** at 1440×900 DPR 1 — about 10 % of a
60 Hz budget. Murcia is heavier at **3.1 ms GPU / 1.0 ms CPU with 158 draw calls and 703 k triangles
per frame**, still comfortable. A five-minute sustained run showed **no frame-time drift and no heap
drift**. Raising DPR from 1 to 2 quadruples the pixels and costs **0.5 ms** — this scene is not
fill-rate bound here.

**Memory-bound — the real GPU risk, and it is bigger than previously recorded.** Total texture
residency is **227.7 MB at DPR 1** and **373.4 MB at DPR 2** on a 1440×900 viewport. The growth is
entirely post-processing: **render targets rise 47 → 188 MB and MSAA renderbuffers 24 → 97 MB**,
both exactly with DPR². At DPR 2 the post chain costs **285 MB — more than every content texture
combined** (P1-3). No prior document counts this; the iOS audit measured the phone-sized case
(≈53 MB) and did not extrapolate. On the emulated phone viewport, measured residency is 111 MB, of
which **~50 MB is render targets and 16 MB is the brand atlas** — the atlas is now the largest
single texture on that path, having been overtaken in importance by nothing since the Earth maps
were halved.

**Architecture-induced duplicate work — small, and mostly already solved.** The 2026-08-14 decoder
consolidation holds where it was aimed: **exactly two worker pools exist, not five**. But its second
property does not hold: **all six workers are still alive at end of session** because Murcia never
unmounts, so the reference count can never reach zero (P2-5). Separately, **584 KB of Basis
transcoder is downloaded to decode 174 KB of texture** (P2-4), and 512 KB of Draco JS fallback is
deployed and never requested (P3-9).

**CPU-bound — no.** The main thread is ~7 % busy in steady state (73 ms of task time per second,
of which 56 ms is script). Load-time long tasks total **711 ms locally and ~2.3 s under a 4× CPU
throttle**, concentrated in the first 2 s. CLS is **0** in every configuration.

---

## 2. Baseline Metrics

### 2.1 Load — median of repeated cold loads · production build · synthetic network

| Metric | Local, no throttle (n=5) | Fast 4G + 4× CPU (n=3) | Slow 4G + 4× CPU (n=3) |
|---|---|---|---|
| TTFB | 4 ms | 4 ms | 4 ms |
| First Contentful Paint | 196 ms | 476 ms | 776 ms |
| Largest Contentful Paint | 840 ms | 2 548 ms | 10 148 ms |
| Intro's first drawn frame (`vertigo:intro-visible`) | 95 ms | 404 ms | 718 ms |
| **Scene usable (`vertigo:scene-ready`)** | **1 534 ms** | **5 661 ms** | **27 841 ms** |
| **Handover to the site (`vertigo:intro-complete`)** | **3 059 ms** | **6 315 ms** | **28 381 ms** |
| Long tasks (count / total) | 7 / 711 ms | 16 / 2 304 ms | 15 / 2 250 ms |
| Cumulative Layout Shift | 0 | 0 | 0 |
| Requests / transferred | 22 / 5.27 MB | 22 / 5.27 MB | 22 / 5.27 MB |

Throttling profiles: Fast 4G = 9 Mbit/s, 60 ms RTT. Slow 4G = 1.6 Mbit/s, 150 ms RTT. Both via CDP.
TTFB is meaningless here (localhost) and is listed only so the next pass can tell a server
regression from a payload regression.

The 3.06 s handover on an unthrottled load is the intro's **designed floor**, not a cost: the
drawing has a minimum duration asserted by `e2e/boot.spec.ts` (> 2.9 s). Time-to-scene-ready is the
number that responds to optimization.

### 2.2 Bundle — production build, measured on the emitted files

| Chunk | Raw | gzip | brotli | Notes |
|---|---|---|---|---|
| `assets/three-*.js` | 820 867 | 220 301 | 179 548 | pinned to its own chunk deliberately |
| `assets/index-*.js` (app entry) | 310 900 | 104 331 | 90 438 | **97.1 % of the 320 000 B budget that fails the build** |
| `assets/SceneCanvas-*.js` | 215 189 | 71 519 | 62 789 | carries the generated CMS content |
| `assets/MurciaExperience-*.js` | 75 875 | 24 531 | 21 529 | includes ~2 KB of `stats.js` |
| `assets/index-*.css` | 25 125 | 5 609 | 4 920 | |
| `assets/intro-*.js` (boot entry) | 14 057 | 6 225 | 5 449 | 87.9 % of its 16 000 B budget; standalone, asserted |
| `assets/SceneCanvas-*.css` | 6 698 | 1 885 | 1 613 | |
| `assets/createCornerLogo-*.js` | 3 795 | 1 881 | 1 748 | |
| `assets/disposal-*.js` | 398 | 252 | 228 | |
| **Total JS** | **1 441 081** | **428 952** | **361 619** | |

Brotli is what Vercel will actually serve and is **15.7 % smaller than the gzip these runs
measured**; the throttled load figures in §2.1 are therefore pessimistic by roughly that much on the
text half of the payload (which is ~1.4 MB of 5.27 MB). **Label: production.**

Tree-shaking and splitting both work. `three` is isolated, the intro entry imports nothing (asserted
at build time), the `/debug` console folds away in production, and the scene, Murcia and corner-logo
chunks are separate. There is no duplicate module and no accidental dev dependency in the entry.

### 2.3 Static assets — dimensions, transfer, decoded and GPU cost

| Asset | On disk | Dimensions | GPU resident |
|---|---|---|---|
| `earth/specularClouds.jpg` | 1 692 384 | 4096×2048 | 42.67 MB (mipped) |
| `earth/specularClouds-narrow.jpg` | 1 318 743 | 2048×1024 | 10.67 MB |
| `models/city-prototype.glb` | 1 245 164 | 257 meshes / 109 681 tris / 1 070 nodes | see §2.4 |
| `libs/basis/basis_transcoder.wasm` | 527 333 | — | — |
| `draco/draco_decoder.js` | 512 465 | — | **never requested** |
| `earth/day.jpg` | 473 093 | 4096×2048 | 42.67 MB |
| `textures/sky-panorama.webp` | 279 050 | 4096×2048 | fallback only |
| `models/satellite.glb` | 269 928 | 15 meshes / 58 626 tris | — |
| `earth/night.jpg` | 267 061 | 4096×2048 | 42.67 MB |
| `earth/day-narrow.jpg` | 255 766 | 2048×1024 | 10.67 MB |
| `models/city-backdrop.glb` | 206 604 | 36 meshes / 630 tris, GPU-instanced | — |
| `textures/sky-panorama.avif` | 194 642 | 4096×2048 | 32.0 MB (**not mipped**) |
| `draco/draco_decoder.wasm` | 192 420 | — | — |
| `textures/satellite_Baked.ktx2` | 150 820 | 1024×1024 BC7 | 1.33 MB |
| `earth/night-narrow.jpg` | 126 618 | 2048×1024 | 10.67 MB |
| `textures/sky-panorama-narrow.avif` | 81 648 | 2048×1024 | 8.0 MB |
| `textures/logoBake.ktx2` | 23 102 | 1024×1024 BC7 | 1.33 MB |
| `models/model.glb` | 20 364 | 2 meshes / 5 860 tris | — |
| brand atlas (generated at runtime) | — | 2048×1536 | **16.0 MB (mipped)** |

`public/` is 7.8 MB on disk; a single visit fetches 5.27 MB of it (wide) or 4.47 MB (narrow),
because the two resolution sets are mutually exclusive. **Label: production.**

### 2.4 Frame cost — real-device (this desktop GPU), vsync unlocked, GPU-synchronised

| Route | GPU ms | CPU ms | Draw calls/frame | FBO binds/frame | Triangles/frame |
|---|---|---|---|---|---|
| Earth (composer + bloom) | **1.6–1.7** | 0.2–0.3 | 18–20 | ~16 | ~19 100 |
| Warp (direct route borrowing the composer) | **3.1** | 1.1 | 157 | 7.3 | 702 968 |
| Murcia (direct route, no composer) | **3.1** | 1.0 | 158 | 1 | 703 511 |

Vsync-locked, all three routes hold a flat 16.7 ms with **zero frames over 20 ms** across 4 000+
sampled frames. Programs: 40 at Earth, 43 after Murcia has loaded. 26 live textures. 532 buffers
(620–630 once the city is built).

### 2.5 Device pixel ratio sweep — 1440×900 CSS viewport

| DPR requested | Drawing buffer | Mpx | GPU ms/frame | Render targets | MSAA renderbuffers | All textures |
|---|---|---|---|---|---|---|
| 1 | 1440×900 | 1.30 | 1.7 | 47.0 MB | 24.3 MB | 227.7 MB |
| 1.25 | 1800×1125 | 2.03 | 2.0 | 73.4 MB | 38.0 MB | 255.1 MB |
| 1.5 | 2160×1350 | 2.92 | 1.9 | 105.7 MB | 54.7 MB | 288.5 MB |
| 2 | 2880×1800 | 5.18 | 2.2 | 187.9 MB | 97.2 MB | 373.4 MB |
| 3 | **2880×1800 (capped)** | 5.18 | 2.3 | 187.9 MB | 97.2 MB | 373.4 MB |

**The `dpr={[1, 2]}` cap works**: requesting 3 produces the same 2880×1800 buffer as requesting 2,
verified on desktop and again on the emulated phone (DPR 2.625 → 824×1678, exactly 2×). **Label:
real-device for the GPU column, production for the memory columns.**

### 2.6 Mobile path — emulated Pixel 7, 412×839 CSS, buffer 824×1678

| | |
|---|---|
| Requests / transferred | 22 / **4.47 MB** (0.80 MB less than wide) |
| Assets fetched | narrow set **only** — no double download |
| Texture residency | **111 MB** total |
| — of which render targets | ~50 MB (4 × 10.55 MB full-res + bloom chain) |
| — brand atlas | 16.0 MB — **the largest single texture on this path** |
| — Earth trio | 32.0 MB |
| — sky panorama | 8.0 MB |
| Scene ready / handover | 1 229 ms / 3 051 ms (local, unthrottled) |

**Label: synthetic.** This is Chromium on a discrete desktop GPU at a phone-shaped viewport. The
byte counts and the texture arithmetic transfer to a real phone; the timings and every GPU figure do
not.

### 2.7 Steady state and sustained runtime — 5 minutes, 30 samples

Frame time **16.7 ms median at every one of the 30 samples**, p95 16.8 ms throughout. JS heap
oscillated between **27.8 and 32.7 MB** with no trend (31.3 MB at t+0, 31.0 MB at t+290 s). DOM:
**185 elements, max depth 12, 356 nodes, 254 listeners, 273 CSS rules, 1 canvas**. Main thread
**73.2 ms of task time per second** (56 ms script), **0 layouts/s and 0 ms layout time**, 59.9 style
recalculations/s — one per frame, from the single always-running CSS animation on `.nav-rail__hint`,
which animates `transform` only and costs no layout. **Label: real-device.**

---

## 3. Performance Findings

### P0 — Severe

**None.** Nothing measured crashes, hangs, leaks, or degrades over time. Blocking a required asset
produces a clean fatal state that names the resource, in 801 ms, with no retry storm; blocking an
optional one leaves the site fully functional. Four Earth↔Murcia round trips produced no growth in
textures (235.7 MB before and after), framebuffers (19), or programs (43).

---

### P1 — High impact

#### P1-1 · The mobile texture set is encoded at a *higher* quality than the desktop set it replaces

**Evidence.** JPEG markers read directly from the shipped files — quantisation table scaled against
the Annex K reference, chroma sampling factors from the SOF marker:

| File | Bytes | Dimensions | Bytes/px | Quality ≈ | Chroma |
|---|---|---|---|---|---|
| `day.jpg` | 473 093 | 4096×2048 | 0.056 | **53** | 4:4:4 |
| `day-narrow.jpg` | 255 766 | 2048×1024 | **0.122** | **84** | 4:2:0 |
| `night.jpg` | 267 061 | 4096×2048 | 0.032 | **55** | 4:4:4 |
| `night-narrow.jpg` | 126 618 | 2048×1024 | **0.060** | **84** | 4:2:0 |
| `specularClouds.jpg` | 1 692 384 | 4096×2048 | 0.202 | **53** | 4:4:4 |
| `specularClouds-narrow.jpg` | 1 318 743 | 2048×1024 | **0.629** | **84** | 4:4:4 |

**Measurement.** The narrow set has **one quarter the pixels** and is only **30 % smaller**
(1.70 MB vs 2.43 MB). `specularClouds-narrow.jpg` carries **3.1× the bit rate per pixel** of the
wide file it substitutes for, and is 78 % of its size.

**Relevant files.** `scripts/prepare-earth-textures.mjs` (`const QUALITY = 90`),
`public/earth/*-narrow.jpg`, `index.html` (the media-gated preload pair).

**Root cause.** The prep script encodes at quality 90; sharp/mozjpeg realises that as an effective
quality of ~84. The wide originals were not produced by this script and sit at ~53. The script's
header defends 90 on the grounds that these maps are "drawn at roughly 1:1 rather than magnified" —
but the wide files, at ~53, are what every desktop visitor already sees on the same sphere at a
*larger* on-screen size. The quality bar the project ships is 53, and the mobile variants were
generated a long way above it without that comparison being made.

**User impact.** Every phone visitor downloads ~1.09 MB more than they need. On Slow 4G that is
**≈5.5 s of the 27.8 s time-to-scene**, on the devices least likely to have a good connection.

**Proposed direction.** Re-encode the narrow set at the wide set's rate. Holding bytes/px constant
predicts day-narrow ≈ 118 KB, night-narrow ≈ 67 KB, specularClouds-narrow ≈ 424 KB — **609 KB for
the set instead of 1 702 KB**. Keep 4:4:4 on `specularClouds` (the shader reads `.rg`; the existing
reasoning is right). Verify by eye at 390 px before landing, since it is a visual change. A second,
larger opportunity sits behind it: `specularClouds` is 3.6× the size of `day.jpg` at identical
dimensions because it packs two unrelated data channels into one lossy RGB image — splitting the
near-binary specular mask from the cloud layer, or moving the pair to AVIF, should beat any JPEG
quality choice.

**Complexity.** Low — one constant, one script re-run, three files. The pipeline exists.
**Expected benefit.** ~1.09 MB per mobile visit (~24 % of the mobile payload).
**Confidence.** **High** for the measurement and the arithmetic; **medium** for "no visible
difference", which needs one look at a phone-sized render before it is claimed.

---

#### P1-2 · 2.1 MB of explicitly not-required assets compete for bandwidth with the one file that gates readiness

**Evidence.** Slow 4G waterfall, timings only, in ms from navigation start:

| Asset | Starts | Ends | KB | Required for readiness? |
|---|---|---|---|---|
| `earth/specularClouds.jpg` | 184 | **26 810** | 1 653 | **yes** |
| `earth/day.jpg` | 184 | 12 997 | 462 | **yes** |
| `earth/night.jpg` | 184 | 8 526 | 261 | **yes** |
| `textures/sky-panorama.avif` | 185 | 8 026 | 190 | **yes** |
| `assets/three-*.js` | 186 | 6 439 | 215 | **yes** |
| `models/satellite.glb` | 184 | 10 711 | 264 | no |
| `models/city-prototype.glb` | 7 561 | 25 793 | 1 216 | no |
| `libs/basis/basis_transcoder.wasm` | 9 388 | 20 087 | 515 | no |
| `draco/draco_decoder.wasm` | 7 602 | 14 548 | 188 | no |
| `textures/satellite_Baked.ktx2` | 7 501 | 11 796 | 148 | no |

Scene ready at **27 841 ms**. `bootState.ts` declares `satellite:assets` and `murcia:model`
`required: false` — they move the drawing's progress bar without gating it.

**Measurement.** Required bytes ≈ **3.03 MB**; not-required-but-concurrent ≈ **2.24 MB**. At the
measured effective throughput, a load carrying only the required set completes in ≈ **16 s** against
the observed 27.8 s.

**Relevant files.** `src/intro-draw/bootState.ts` (the `required` flags), `index.html` (the preload
block, which already gets this right for the Earth textures via `fetchpriority="low"`),
`src/components/MurciaLayer.tsx` and `src/experiences/murcia/assets/*` (the city fetch),
`src/experiences/earth/orbit/createSatellite.ts`, `docs/adr/004-transition-and-prefetch.md`.

**Root cause.** ADR 004 decided the city loads during the intro so the transition never waits on it
— a correct decision about the *transition*. What it did not settle is **priority**: the city,
both decoders and the satellite assets are fetched by JavaScript at default priority, so on a
constrained link they take a share of the pipe from the file that decides when the visitor sees
anything. The `index.html` preloads were already fixed for exactly this reason ("Starting them early
is right; starting them AHEAD of the app is not") — the same argument has not been applied to the
JS-initiated fetches.

Note the local waterfall differs in shape: over HTTP/1.1 Chrome's 6-connection limit *serialises*
the second batch, which accidentally protects the first. **Vercel serves HTTP/2 with no such limit,
so all 22 requests will be multiplexed from the start and the contention will be worse than
measured here, not better.** That is inference, and it is the one place where the local server
flatters the deployment.

**User impact.** Up to ~11 s of additional wait before anything is on screen, on the slowest
connections. On fast connections it is invisible.

**Proposed direction.** Give the not-required fetches an explicit low priority (`fetchpriority`/
`priority` on the underlying requests), or gate them on `bootState.readiness() === 'ready'` and
start them at handover. The transition itself has ~3 s of intro plus however long the visitor spends
on the Earth before gesturing, which is ample for a 1.2 MB model on any connection where this
matters. Whichever is chosen, the property to preserve is ADR 004's: the warp must not wait.

**Complexity.** Low-to-moderate — a priority hint is a one-liner; a readiness gate touches the load
orchestration and needs a test that the warp still never waits.
**Expected benefit.** Up to ~40 % off time-to-scene on Slow 4G; nothing on fast links.
**Confidence.** **High** that the contention exists and is measured; **medium** on the 16 s
projection, which is arithmetic rather than an observed run.

---

#### P1-3 · The post-processing chain costs 285 MB of GPU memory at DPR 2 — more than every content texture combined

**Evidence.** Texture and renderbuffer allocations counted at the WebGL call level across a DPR
sweep at a fixed 1440×900 CSS viewport:

| DPR | Buffer | Render targets (RGBA16F) | MSAA renderbuffers | Post chain total | Content textures | Grand total |
|---|---|---|---|---|---|---|
| 1 | 1440×900 | 47.0 MB | 24.3 MB | **71.3 MB** | ~180 MB | 227.7 MB |
| 2 | 2880×1800 | 187.9 MB | 97.2 MB | **285.1 MB** | ~180 MB | 373.4 MB |

The 15 offscreen targets are `EffectComposer`'s read/write pair, `AfterimagePass`'s comp/old pair
(all four at full resolution, 8 bytes/px `HalfFloatType`), and `UnrealBloomPass`'s bright target plus
five horizontal and five vertical mip targets. Growth is exactly DPR² in both columns.

**Measurement.** 4 × 9.89 MB full-resolution targets at DPR 1, becoming 4 × 39.6 MB at DPR 2, plus a
bloom chain of ~9.5 → ~38 MB, plus multisampled colour and depth from `antialias: true`.

**Relevant files.** `src/graphics/RenderPipeline.tsx:111-140` (composer construction, `setPixelRatio`
at :148), `src/components/SceneCanvas.tsx:86` (`dpr={[1, 2]}`, `antialias: true`),
`src/experiences/murcia/config/appConfig.ts` (where the cap's ownership is argued).

**Root cause.** Not a defect — it is the arithmetic of a full-resolution HDR post chain at DPR 2,
and it has simply never been counted at desktop sizes. `reports/ios-safari-2026-08-14.md` computed
the phone case (≈53 MB across 15 targets) and stopped there. The `AfterimagePass` pair is the one
part that is arguably waste: the pass is correctly **disabled** outside the ~1.6 s warp
(`RenderPipeline.tsx:194`, the I3 remediation), so it does no work — but `EffectComposer` still holds
its two full-resolution targets resident for the entire session. That is **79.2 MB at DPR 2 for a
pass that runs for 1.6 seconds per transition.**

**User impact.** None observed on desktop. On a phone the same chain is ~50 MB against a per-tab
budget that iOS enforces by terminating the tab — the failure mode `reports/ios-safari-2026-08-14.md`
documents as I1/I2.

**Proposed direction.** Three separable levers, in order of ratio:
1. **Allocate the afterimage targets on demand.** They exist for 1.6 s per warp and cost 79 MB at
   DPR 2 for the rest of the session. Sizing them lazily, or dropping the pass and driving the smear
   from the existing composer pair, reclaims the largest single block.
2. **Cap DPR by capability rather than by constant.** The measured GPU cost of DPR 2 over DPR 1 is
   **0.5 ms** on this hardware but **4× the render-target memory**; on a device where memory is the
   binding constraint that is a bad trade, and on this one it is nearly free. This is the
   "capability-derived DPR" the brief asks about, and the evidence says the decision should be made
   on memory, not on frame time.
3. **Reconsider `antialias: true` at high DPR.** 97 MB of multisampled buffers at DPR 2, and on the
   Earth route they deliver nothing — the composer's targets carry no MSAA, so the frame is already
   resolved by the time it reaches the default framebuffer. Only the direct (city) route and the
   corner-logo overlay actually benefit. At DPR 2 the case for MSAA is weak on its own terms.

**Complexity.** (1) moderate and local; (2) moderate — needs a policy and an owner, which
`appConfig.ts` already argues for; (3) low to try, but it is a visual-quality decision about the city
and belongs to whoever owns that look.
**Expected benefit.** Up to ~79 MB (afterimage) plus up to ~140 MB (DPR policy on constrained
devices) of GPU memory. No frame-time change expected on desktop.
**Confidence.** **High** on the measurements; **high** that (1) is safe; **medium** on (3), which
trades image quality and needs a visual review.

---

### P2 — Moderate

#### P2-4 · 584 KB of Basis transcoder is downloaded to decode 174 KB of texture

**Evidence.** Waterfall: `libs/basis/basis_transcoder.wasm` (527 333 B) and `basis_transcoder.js`
(57 529 B) are fetched at ~1.13 s to decode `satellite_Baked.ktx2` (150 820 B) and `logoBake.ktx2`
(23 102 B). **Measurement:** 584 KB of decoder for 174 KB of payload — a ratio of **3.4:1**. Both
KTX2 files are BasisLZ-supercompressed (`supercompressionScheme=1`), 1024×1024, 11 mip levels,
transcoded to BC7 on this GPU (2.7 MB resident for the pair).

**Relevant files.** `src/graphics/decoders.ts` (`BASIS_PATH`, `acquireKtx2Loader`),
`public/libs/basis/*`, `public/textures/*.ktx2`.

**Root cause.** ETC1S/BasisLZ is the right choice when a build has many compressed textures — the
transcoder is amortised. This build has two, totalling 174 KB. The fixed cost was never weighed
against the variable one.

**User impact.** ~584 KB on every first visit, ~3 s of a Slow 4G load, for two textures. Neither
gates readiness (`logo:assets` is required, but the corner logo has a non-KTX2 path when the
transcode fails).

**Proposed direction.** Two options, and the choice depends on where this asset set is heading. If
the texture count stays small: ship the two maps in a conventional format (the logo bake is 23 KB as
KTX2; as a WebP it would be smaller still on the wire, at the cost of ~4 MB more GPU memory each) and
drop the transcoder entirely. If the city's trim sheets are about to arrive as KTX2 — which
`checks/city-asset.ts` implies is planned — the ratio inverts and the transcoder becomes the right
call. **Decide this against the asset roadmap, not against today's two files.**

**Complexity.** Low if dropping; nil if the roadmap answers it.
**Expected benefit.** Up to 584 KB per first visit, and 2 fewer resident workers (see P2-5).
**Confidence.** **High** on the measurement; **low** on the recommendation until the asset roadmap
is known.

#### P2-5 · The decoder pools are reference-counted but can never be released

**Evidence.** `Worker` constructor instrumented across a full session. **6 workers created at
920–925 ms from exactly 2 distinct blob URLs** (4 + 2 — one Draco pool at three's default limit of
4, one Basis pool of 2). After the intro, after handover, and after three Earth↔Murcia round trips:
**live 6, terminated 0.**

**Measurement.** The *first* half of the 2026-08-14 remediation holds exactly as claimed — five pools
became two. The *second* half does not: "the last consumer to finish releases it" never happens.

**Relevant files.** `src/graphics/decoders.ts` (the module header states the intent),
`src/experiences/murcia/assets/createAssetLoader.ts:66`,
`src/experiences/murcia/MurciaExperience.ts:186` and `:723`, `src/app/experience.ts`.

**Root cause.** `MurciaExperience` acquires both loaders in its constructor and releases them only in
`dispose()`. `dispose()` runs only when `MurciaLayer` unmounts — and by ADR 001/ADR 003 both
experiences stay mounted for the application's lifetime. The reference count is therefore pinned at
≥1 for the whole session, `dispose()` never fires, and the workers never terminate. The module header
argues against exactly this outcome: *"A singleton would fix the peak and then hold two worker pools
for the rest of the session, trading a loading spike for permanent residency — a bad trade on a
device where the steady state is already the problem."* The refcount was the mechanism chosen to
avoid it; the ownership model defeats the mechanism.

**User impact.** 6 resident worker threads for the session, each holding a WASM instance (192 KB
Draco module, 527 KB Basis module, plus per-instance heap). Invisible on desktop; on iOS it is
steady-state residency added to the budget that terminates tabs.

**Proposed direction.** Release when the *load* completes rather than when the *experience* is
destroyed. `loadCity` finishes during the intro and the city is loaded once; `MurciaExperience` holds
the loader as a field but has no second consumer of it. Releasing after the initial load — and
re-acquiring if a later load ever needs one, which the refcount already supports — restores the
property the module was written for. Verify with the same worker count: `terminated` should reach 6.

**Complexity.** Low — a release moved from `dispose()` to the end of the load, plus a check that no
later path needs the loader.
**Expected benefit.** 6 threads and ~0.7 MB of WASM modules released a few seconds into the session.
**Confidence.** **High** — the behaviour is measured and the cause is a single traceable call site.

#### P2-6 · The brand atlas is now the largest single texture on the mobile path

**Evidence.** Emulated Pixel 7, corrected census: the 2048×1536 mipped `CanvasTexture` costs
**16.0 MB**, against 10.67 MB for each Earth map and 8.0 MB for the narrow sky panorama.
**Measurement:** 14.4 % of the 111 MB mobile residency, in one generated texture.

**Relevant files.** `src/experiences/earth/orbit/createBrandAtlas.ts:290` (`anisotropy = 4`, mipmaps
on), `src/experiences/earth/orbit/createOrbitSystem.ts:78` (`initTexture`).

**Root cause.** The atlas was sized when the Earth maps were 44.7 MB each and it was a rounding
error. After the 2026-08-14 halving it is the biggest thing on the phone path, and nothing
re-examined it. It is generated at runtime from six brand marks, so its resolution is a free
parameter rather than a source asset.

**User impact.** GPU memory on the platform where GPU memory ends sessions. No frame-time cost
measured.

**Proposed direction.** Size it from the viewport the way the Earth maps and the sky already are —
the badges it feeds are small on a phone. Halving to 1024×768 costs 4.0 MB instead of 16.0 MB.
Check the on-screen size of a satellite badge at 390 px before choosing the number.

**Complexity.** Low — the atlas is generated, so this is a dimension constant and a look.
**Expected benefit.** ~12 MB of GPU memory on mobile.
**Confidence.** **High** on the measurement, **medium** on the specific target resolution, which
needs a visual check.

#### P2-7 · `alpha: false` does not reach the WebGL context in three ≥ r163

**Evidence.** Context attributes read back from the live renderer:
`{alpha: true, depth: true, stencil: false, antialias: true, premultipliedAlpha: true,
preserveDrawingBuffer: false, powerPreference: "high-performance",
failIfMajorPerformanceCaveat: false}`. In `three@0.174.0`, `WebGLRenderer` builds
`contextAttributes` with a hardcoded `alpha: true` and uses the `alpha` *parameter* only to
initialise `WebGLBackground`'s clear behaviour.

**Measurement.** The requested `alpha: false` is applied in-engine; the browser still creates an
alpha-capable drawing buffer.

**Relevant files.** `src/components/SceneCanvas.tsx:94-101` and the comment above it,
`node_modules/three/build/three.module.js` (the `contextAttributes` literal).

**Root cause.** The comment states the mechanism precisely — *"a transparent drawing buffer … costs a
per-frame composite of the WebGL layer against the page, which iOS cannot elide"* — and that
mechanism is decided by the **context attribute**, which three overrides. The reasoning was correct
for older three and is no longer delivered.

**User impact.** Whatever the per-frame composite of an alpha layer costs on iOS, it is still being
paid. Not measurable on this hardware — the desktop compositor cost is below the noise floor here.

**Proposed direction.** This one is mostly about not believing a comment that is no longer true.
Keep `alpha: false` — it is still what makes `setClearColor(0x050507, 1)` correct and the intro's
backdrop right — but correct the comment so nobody re-derives a saving that is not there. If the iOS
composite cost turns out to matter on a real device, the only lever three currently offers is passing
a pre-created context to `WebGLRenderer`, which is a larger change and should not be made on
speculation.

**Complexity.** Trivial for the comment; the real fix is out of scope until a device says it matters.
**Expected benefit.** Accuracy now; unknown on iOS.
**Confidence.** **High** that the attribute is overridden (read from the live context and from
three's source); **inferred** on the iOS cost.

#### P2-8 · The app entry chunk is at 97.1 % of the budget that fails the build

**Evidence.** Build output: `app entry 310720B (104241B gz)` against `ENTRY_BUDGET_BYTES = 320_000`.
**Measurement: 9 280 B of raw headroom, 2.9 %.**

**Relevant files.** `vite.config.ts:23` and `assertChunkBudgets`, `src/app/buildFlags.ts` (whose
comment says "~96 %" — measured today it is 97.1 %, and that comment explicitly asks to be
re-measured rather than trusted).

**Root cause.** The entry carries React, React-DOM, GSAP and the whole DOM UI layer. It is not
carrying CMS content — a distinct check worth recording, because it is the natural assumption:
the generated `CASE_STUDIES` land in the **SceneCanvas** chunk (verified by string search), not the
entry, so publishing case studies does not move the entry toward its limit. It does move
SceneCanvas, which has no budget and is on the readiness path at ~1 278 B of raw source per case
study.

**User impact.** None today. The risk is a build that starts failing on an unrelated UI change, with
9 KB of warning.

**Proposed direction.** Either raise the budget deliberately with a note saying what was added (the
file's own convention), or reclaim room — GSAP is the largest single candidate in that chunk and is
used for timelines that could plausibly live with the scene. Separately, give `SceneCanvas` a budget
too: it is the chunk that grows with content, and it is the one with no ceiling.

**Complexity.** Low for the budget; moderate for reclaiming.
**Expected benefit.** Build reliability, not user-facing performance.
**Confidence.** **High.**

---

### P3 — Minor

| # | Finding | Evidence | Direction | Benefit |
|---|---|---|---|---|
| P3-9 | `draco/draco_decoder.js` (512 465 B) is deployed and never requested — every modern browser takes the WASM path (`draco_wasm_wrapper.js` 58 456 B + `draco_decoder.wasm` 192 420 B). Confirmed absent from all 22 requests in every run. | waterfall | Keep it only if a no-WASM fallback is a stated requirement; otherwise it is 512 KB of deploy weight and one more file behind the 24 h cache rule. | Deploy size only — no user bytes. |
| P3-10 | **Murcia's whole debug surface ships to production**: `stats.js` (1 965 B minified), `debug/DebugOverlay.ts` (4 567 B source) and `debug/MurciaDebugTools.ts` (6 252 B source) are all inside the production `MurciaExperience` chunk. Confirmed by `showPanel`, `debug-overlay` and `boundsHelper` all appearing in the built file. **The React `/debug` tuning console is correctly absent** — its UI strings (`Isometric offset`, `Intro size`) are in no chunk, so the compile-time fold works where it is used. | string search in the built chunks | Same fold, applied here: guard on the compile-time `DEBUG_TOOLS_ENABLED` constant with a dynamic `import()` rather than a runtime `if (!this.enabled) return` after a static import. The runtime guard is why Rollup cannot shake any of it. | Single-digit KB, and the principle that dev tooling does not ship. |
| P3-11 | Unversioned static assets get `max-age=86400, stale-while-revalidate=604800`; only `/assets/*` is `immutable`. So 5.1 MB of the 5.27 MB payload is revalidated daily rather than cached for a year. | `vercel.json` | Content-hash the big static assets (or emit them through `/assets/`) and promote them to `immutable`. The 24 h rule is *correct* for unversioned names — the fix is the names, not the header. | A returning visitor after 24 h currently re-validates everything; with hashing they fetch nothing. **Inferred** — not measurable on `vite preview`. |
| P3-12 | `anisotropy = 8` on all three Earth maps (`EarthScene.tsx:91-93`); `4` on the brand atlas. Flagged as a secondary point in the 2026-08-14 iOS audit and deliberately not attacked. | source | Still open. Real per-fragment bandwidth on a tile-based GPU for a sphere rarely seen at grazing angles. **Not measurable on this hardware** — belongs to the device profile. | Unknown until a phone measures it. |
| P3-13 | Comment drift on two load-bearing numbers: `bootState.ts:61` says the city is "a 456KB Draco parse" (it is 1 245 164 B today), and `buildFlags.ts:13` says the entry is at "~96 %" (97.1 %). | source vs. measurement | Update both. The second one already tells you to re-measure rather than trust it. | Accuracy of the reasoning future changes will lean on. |

---

## 4. What was measured and found *not* to be a problem

The brief asks repeatedly not to optimize theoretical bottlenecks. These were each tested and each
came back negative; they are recorded so the next pass does not spend the time again.

| Hypothesis | Test | Result |
|---|---|---|
| `backdrop-filter` over a live WebGL canvas costs frame time | Interleaved A/B, 3 cycles of as-shipped vs. neutralised, GPU-synchronised | **3.6 ms both** — no attributable difference. A naive single A/B showed 1.0 ms, which the interleaving proved was scene drift: the "restored" sample did not return to baseline. |
| The per-frame hover raycast is expensive | The app's own two states — `createSatelliteFocus.update()` early-returns until the first pointer move, then raycasts every frame whether the pointer moved or not | **0.6 ms CPU/frame in both states.** Negligible over 7 satellites. Re-check if the satellite count grows substantially. |
| Repeated Earth↔Murcia transitions leak | 4 round trips with a full GPU-resource census after each | Textures **235.7 MB constant**, framebuffers **19 constant**, programs **43 constant**, buffers 620→630 (one 10-buffer step, then flat). No leak. |
| Prolonged runtime degrades | 5 minutes, 30 samples | Frame time **16.7 ms at every sample**; heap 27.8–32.7 MB with no trend. |
| Failed assets cause retry storms | Aborted `earth/*.jpg` (required), `city-prototype.glb` (optional), `draco/*` (decoder) | No storms. Required → clean `fatal` in 801 ms naming the resource, 3 attempts = the 3 distinct files, not retries. Optional → boot stays `ready`, site fully usable, 1 attempt. Decoder → `ready`, 2 attempts. The optional-resource contract holds exactly as `bootState.ts` describes it. |
| Background tabs keep rendering | Second tab foregrounded for 6 s | rAF drops to **~4 fps** (browser throttling). Rendering is rAF-driven end to end, and GSAP timelines carry `visibilitychange` pauses in four places. No app-side work continues. *Caveat: headed Playwright did not flip `document.hidden`, so the app's own guards were verified in source, not exercised.* |
| The DOM is expensive | CDP Performance metrics over 10 s of steady state | **0 layouts/s, 0 ms layout time.** 59.9 style recalcs/s, all from one `transform`-only CSS animation (`.nav-rail__hint`, `infinite alternate`). 185 elements, depth 12. Nothing to fix. |
| Fonts delay first paint | Source and waterfall | **No `@font-face`, no web font requests, zero font bytes.** `font-family: 'Inter', system-ui` resolves to a locally-installed Inter or the system stack. That is a typography consistency question, not a performance one. |
| Preloads are wasted | Waterfall initiator types | Every preloaded resource was used. No duplicate downloads, no unused-preload warnings. |

---

## 5. Performance Budget Proposal

Two budgets already exist and fail the build (`vite.config.ts`): intro entry 16 000 B, app entry
320 000 B. That mechanism is the right one and this proposal extends it rather than inventing a
parallel system. Every number is set from a measurement in §2 with deliberate headroom, and each says
what it is protecting.

| Budget | Proposed | Measured today | Protects |
|---|---|---|---|
| Intro entry (raw) | 16 000 B *(existing)* | 14 057 B | The drawing starts before anything else. |
| App entry (raw) | 320 000 B *(existing)* | 310 900 B | three.js must never leak into the entry. |
| **SceneCanvas chunk (raw)** | **240 000 B** | 215 189 B | The readiness-gating chunk, and the one CMS content grows. ~19 case studies of headroom. |
| **Required boot payload, wide** | **2.8 MB** | ~3.03 MB **over** | Time-to-scene. This is the only budget that is already breached, and P1-1 alone brings it inside. |
| **Required boot payload, narrow** | **1.4 MB** | ~2.30 MB **over** | The mobile path. P1-1 brings this to ~1.2 MB. |
| **Total first-visit transfer, narrow** | **3.0 MB** | 4.47 MB **over** | The phone visit end to end. |
| **Texture residency, phone-shaped viewport** | **90 MB** | 111 MB **over** | The iOS tab-termination budget. P1-3 (1) and P2-6 together clear it. |
| **Render-target memory** | **≤ 25 % of texture residency** | 45 % (mobile), 50 % (desktop DPR 2) | Stops the post chain from silently outgrowing the content it post-processes. |
| **Draw calls per frame** | **200** | 20 (Earth) / 158 (Murcia) | Murcia has ~25 % headroom; worth knowing before the city grows. |
| **Triangles per frame** | **900 k** | 19 k (Earth) / 704 k (Murcia) | Same. |
| **GPU ms/frame, desktop reference** | **8 ms** | 1.7 (Earth) / 3.1 (Murcia) | Half of a 60 Hz budget, leaving room for a GPU several tiers below this one. |
| **Long tasks during load** | **no single task > 200 ms** | max 152 ms local, 4× CPU throttled within range | Responsiveness during the intro. |
| **DPR cap** | **2, and capability-derived below that** | 2, constant | See P1-3 (2). |
| **CLS** | **0** | 0 | It is 0 today; a single-view site has no excuse. |

The three "over" rows are the audit's actual conclusion in table form: **every breached budget is a
bytes-on-the-wire or GPU-memory budget, and none is a frame-time budget.**

---

## 6. Device Quality Strategy

The brief asks whether a centralized renderer quality model is needed. **Evidence says yes, but a
small one, and for memory rather than for frame rate.**

What the measurements support:

- **Frame time is not the variable to tier on.** DPR 1 → 2 quadruples pixels for +0.5 ms on this
  GPU. A quality tier that lowers DPR to protect frame rate would be solving a problem that was not
  observed.
- **Memory is.** The same DPR change costs +141 MB of render targets and +73 MB of MSAA. On a
  device where a tab is terminated for its total footprint, that is the decision that matters.
- **The cap already has an owner, and it is the right one.** `SceneCanvas.tsx` holds `dpr={[1, 2]}`
  explicitly, and the comment in `appConfig.ts` records why it belongs to whoever creates the
  renderer. Nothing needs relocating — the constant needs to become a function.

Proposed shape, deliberately minimal:

- **What it controls:** one number — the DPR cap — plus a boolean for whether the afterimage
  targets are allocated eagerly. Nothing else. Bloom resolution, mip count and effect toggles are
  *not* included: no measurement in this audit justifies varying them.
- **Who owns it:** `SceneCanvas`, at renderer creation, reading a single function that lives beside
  it. One decision, one place.
- **When it is decided:** once, at boot, before the canvas is created. Inputs should be capability
  signals — `navigator.deviceMemory`, `navigator.hardwareConcurrency`, the framebuffer pixel count
  the viewport implies — and explicitly **not** user-agent brand sniffing, which the brief rules out
  and which `PROJECT_MEMORY` already rules out for this project.
- **May it change at runtime?** **No.** Resizing the composer at DPR 2 already reallocates 188 MB of
  targets; doing that mid-session in response to a frame-rate sample is a memory spike introduced to
  solve a frame-rate problem that does not exist. A one-time decision is the whole of it.

---

## 7. Revalidation of prior claims

Every performance claim carried in a code comment or an earlier report, checked against the build
measured today. The brief requires that a claim which no longer holds is said so rather than dropped.

| Claim | Source | Verdict |
|---|---|---|
| The intro entry is standalone and under budget | `vite.config.ts` | **Holds.** 14 057 B, no imports, asserted at build time. |
| Linking the intro chunk beats inlining it | `vite.config.ts` A/B, 2026-07 | **Not re-run.** Out of scope without re-introducing the inlined variant; the reasoning (preload scanner + document weight) is sound and unchallenged by anything measured here. |
| three.js stays out of the app entry | `vite.config.ts` | **Holds.** Separate 820 867 B chunk, asserted. |
| The app entry is at "~96 %" of budget | `buildFlags.ts:13` | **Moved.** 97.1 % today. The comment asks to be re-measured; this is that measurement. |
| Exactly one Earth/sky resolution set is fetched per viewport | `index.html` | **Holds.** Verified wide and narrow: 22 requests either way, no duplicates. |
| The 767 px breakpoint matches `EARTH_TEXTURES.narrowMaxWidth` | `index.html` | **Holds** — a mismatch would have shown as a double download, and did not. |
| The `/debug` console is dead code in production | `buildFlags.ts` | **Holds** for the React tuning console — none of its UI strings appear in any chunk. **Does not hold for Murcia's own debug surface**, which guards at runtime and therefore ships. See P3-10. |
| **I1** — WebGL context loss is handled | iOS 2026-08-14 | **Holds** in source (`graphics/contextLoss.ts`, e2e coverage). Not re-exercised here. |
| **I2** — texture memory ~226 MB wide / ~70 MB after the narrow set | iOS 2026-08-14 | **Partly holds, and the mobile figure was optimistic.** Wide measures **227.7 MB** — within 1 % of the estimate. The mobile path measures **111 MB, not ~70 MB**: the estimate counted content textures and listed render targets separately. Also **moved**: the sky panorama is now 4096×2048 / 32 MB, not 6144×3072 / 75.5 MB — it was replaced on 2026-08-19. |
| **I3** — `AfterimagePass` runs two full-resolution no-op passes every frame | iOS 2026-08-14 | **Fixed, and confirmed by measurement.** The pass is disabled at zero damp; the Earth route shows ~16 framebuffer binds/frame, consistent with bloom + output only. **But its two full-resolution render targets are still allocated for the session** — 79.2 MB at DPR 2. The work was reclaimed; the memory was not. See P1-3. |
| **I4** — the DPR cap has no owner | iOS 2026-08-14 | **Fixed and verified.** `dpr={[1, 2]}` is explicit, and the sweep confirms DPR 3 clamps to a 2× buffer on both desktop and the emulated phone. |
| **I6** — five decoder instances, up to twenty workers | iOS 2026-08-14 | **Half fixed.** Two pools, six workers — measured, not assumed. But **zero are ever terminated**; the refcount cannot reach zero. See P2-5. |
| Decoder ownership is centralised in `decoders.ts` | `decoders.ts` | **Holds.** All four consumers route through it; no direct `new DRACOLoader`/`new KTX2Loader` outside the module. |
| `EffectComposer.dispose()` does not walk its passes, so each is disposed explicitly | `RenderPipeline.tsx:153` | **Holds** in source. Not exercised — the pipeline never unmounts in a normal session, which is also why it has never leaked. |
| Both experiences stay mounted; peak VRAM holds both worlds | `DECISIONS.md` §4, ADR 001/003 | **Holds, and is now measured**: 235.7 MB constant across four round trips, no growth, no release. |
| `alpha: false` avoids a per-frame composite | `SceneCanvas.tsx:94` | **No longer holds.** three ≥ r163 always requests `alpha: true` from the context. See P2-7. |
| The city is "a 456KB Draco parse" | `bootState.ts:61` | **No longer holds.** 1 245 164 B today. |
| Murcia and satellite assets never gate the intro | `bootState.ts` | **Holds** — proven by aborting the city GLB: boot still reaches `ready`. But they *do* compete for bandwidth with what does gate it. See P1-2. |

---

## 8. Optimization Roadmap

Ranked by Impact × Confidence ÷ Complexity.

### Immediate wins — high confidence, low risk

1. **P1-1 · Re-encode the narrow Earth set at the wide set's quality.** ~1.09 MB per mobile visit,
   ~5.5 s on Slow 4G, from one constant in an existing script. Needs one visual check at 390 px.
2. **P2-5 · Release the decoder pools when the load finishes, not when the experience is destroyed.**
   Six worker threads and ~0.7 MB of WASM modules, from moving one call. Verifiable by re-running the
   worker census until `terminated` reaches 6.
3. **P3-13 · Correct the two drifted comments** (`bootState.ts:61`, `buildFlags.ts:13`) and
   **P2-7's** comment in `SceneCanvas.tsx`. Free, and they are the numbers the next change will be
   reasoned from.
4. **P3-10 · Move the `stats.js` import behind the compile-time flag.** ~2 KB and a principle.

### Structural optimizations — require architectural work

5. **P1-2 · Prioritise or defer the non-required boot fetches.** The largest single win on slow
   connections (up to ~40 % off time-to-scene) but it touches load orchestration and must preserve
   ADR 004's guarantee that the warp never waits. Worth doing before launch, because HTTP/2 on Vercel
   will make the contention worse than what was measured here.
6. **P1-3 (1) · Allocate the afterimage render targets on demand.** ~79 MB at DPR 2 for a pass that
   runs 1.6 s per transition. Local to `RenderPipeline.tsx`.
7. **P1-3 (2) + §6 · Make the DPR cap capability-derived.** Small in code, but it needs the policy
   in §6 agreed and owned. The evidence for basing it on memory rather than frame time is in §2.5.
8. **P2-8 · Give `SceneCanvas` a chunk budget and decide the app entry's ceiling deliberately.**
   Build reliability, not user performance — but the entry has 9 KB of room and nobody is watching
   the chunk that grows with content.
9. **P3-11 · Content-hash the large static assets so they can be `immutable`.** Nothing for first
   visits; everything for returning ones.

### Experimental — measure before adopting

10. **P2-4 · Drop the Basis transcoder, or commit to it.** 584 KB for 174 KB today. The right answer
    depends entirely on whether the city's trim sheets arrive as KTX2. Do not act on this before
    that is known.
11. **P2-6 · Halve the brand atlas.** ~12 MB on mobile, but the target resolution needs a look at a
    real badge at 390 px.
12. **P1-3 (3) · Reconsider `antialias: true` at high DPR.** 97 MB at DPR 2 that the Earth route
    cannot use. It is a visual decision about the city and belongs to whoever owns that look.
13. **P1-1 (second half) · Split or re-format `specularClouds`.** It is 3.6× `day.jpg` at identical
    dimensions because it packs two data channels into one lossy RGB image. Potentially larger than
    the re-encode, and entirely unproven.

### Physical-device validation — cannot be proven in this environment

Everything below was either unmeasurable here or measured on hardware that does not represent the
target. None of it should be acted on from this report alone.

- **All GPU timings on mobile.** Every frame-time number here comes from a discrete desktop GPU.
  The emulated Pixel 7 rows are byte counts and texture arithmetic only.
- **Thermal and sustained behaviour on a phone.** The 5-minute run was vsync-locked at 60 fps on
  hardware that never came close to its limit. It proves the absence of a leak, not the absence of
  throttling.
- **iOS Safari specifically.** WebKit is not installed on this machine (`playwright.config.ts` states
  this as a limitation, not an oversight), and the KTX2 transcode path and `compileAsync` are exactly
  where Safari is most likely to differ. The 111 MB mobile residency against iOS's per-tab budget is
  the single most important unvalidated number in this document.
- **P3-12 · `anisotropy = 8`.** A tile-based GPU question. Unmeasurable here, still open from
  2026-08-14.
- **P2-7's iOS composite cost.** The alpha finding is confirmed in code; its consequence is not.
- **Real CDN delivery.** Brotli (15.7 % smaller than the measured gzip on text), HTTP/2
  multiplexing, and the `vercel.json` cache headers were all audited statically. `vite preview`
  serves none of them.
- **Returning-visitor benefit (P3-11).** Requires a real deployment to measure.

---

## 9. Reproducing this

Nothing in this audit modified the repository. The measurements come from a production build served
by `vite preview` and driven by Playwright scripts held outside the tree, which read the app's own
instrumentation (`window.__vertigoBootDebug`, the four `vertigo:*` performance marks) plus wrappers
installed at page level.

To reproduce the baseline: build with `VITE_VERCEL_ENV=production`, confirm the production markers
(`robots.txt` at 104 B, `sitemap.xml` present, no `noindex`), serve with `npm run preview`, and load
`http://localhost:4173/` while polling `window.__vertigoBootDebug.state()` for `'ready'` — that
transition is `vertigo:scene-ready` and is the number this report treats as time-to-usable-scene.
Throttling is CDP `Network.emulateNetworkConditions` and `Emulation.setCPUThrottlingRate`; the
profiles are named in §2.1. GPU cost requires launching Chromium with `--disable-gpu-vsync
--disable-frame-rate-limit` and a 1×1 `readPixels` at each frame boundary — this driver advertises
`EXT_disjoint_timer_query_webgl2` and returns zero from it.

Re-measure rather than inheriting these numbers. That is what this file is for.
