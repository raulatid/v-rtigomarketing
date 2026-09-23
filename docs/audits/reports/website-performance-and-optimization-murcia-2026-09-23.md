# Website Performance & Optimization: Murcia scene audit

**Date:** 2026-09-23 · **Against:** working tree at `2a24dd7` (clean)
**Brief:** `audits/website-performance-and-optimization.md`, adapted and **scoped to the Murcia scene only**

This is a scoped delta against `reports/website-performance-and-optimization-2026-09-02.md`. That
report still holds for everything outside Murcia. For Murcia, this one replaces it: 95 commits have
touched `src/experiences/murcia/` since then. They added the services campus with particles, the
blog display and its orbit ring, the tower LED screen, lightmaps v5.1-r3 and the merged ground.

The audit asked three questions:

1. Is there a memory leak?
2. What is the GPU cost, and where does it go?
3. Is anything misconfigured, or running when it should not?

No source file was modified. The harness and its outputs live outside the repository, in the
session scratchpad.

## Measurement conditions

| | |
|---|---|
| Build | `npx vite build` (no `VITE_VERCEL_ENV`), so it is a **preview-flavoured production bundle**. Debug seams are compiled in so the harness can drive the campus and the blog. This adds about 6 KB to the Murcia chunk and nothing to the frame. |
| Content | `src/content/generated/` as built at 09:13 today, not rebuilt for this audit. There is 1 tower slide, with no image. |
| Server | `vite preview` on `:4173`, localhost. HTTP/1.1, no CDN. |
| Client | Playwright's Chromium, **headed, real GPU** (this desktop's discrete GPU, ANGLE D3D11). Launched with `--disable-gpu-vsync --disable-frame-rate-limit`. |
| Frame time | The interval between rAF callbacks with vsync off. This is a **throughput proxy** (CPU + GPU, not GPU-synchronised), so it is not directly comparable to the 09-02 "GPU ms" column. |
| Viewports | Run 1: 1440×900 CSS at DPR 1. Runs 2–3: 1920×1080 at DPR 1. |
| Cache | Cold. Every run uses a fresh browser context. |
| Instrumentation | Page-level wrappers on `WebGL2RenderingContext`. They track textures (bytes by `texStorage2D`/`texImage2D`/`compressed*` per level, BC7 counted at 1 B/px), buffers, programs, FBOs/RBOs, draws, uploads, `bufferSubData`, `generateMipmap`, `shaderSource`/`linkProgram`, timers, `Worker` construct/terminate, and rAF. CDP supplies the heap after a forced GC (`HeapProfiler.collectGarbage`), plus DOM nodes and JS listeners (`Memory.getDOMCounters`). |
| Labels | **measured** means observed in these runs. **code** means read from source, with file:line. **inferred** means arithmetic or reasoning, not observed. |

---

## 1. Executive summary

**No memory leak.** Four Earth↔Murcia↔campus cycles and three Murcia↔blog round trips each return
to identical counts after the first pass: textures, estimated VRAM, buffers, programs, FBOs, DOM
nodes, listeners and workers. The heap stays inside 15–16.5 MiB. Nothing in Murcia ticks, uploads or
fires a timer while Earth is showing or while the blog is open. **Measured.**

**Murcia at rest does no redundant GPU work.** In the city overview there are 0 texture uploads,
0 buffer uploads and 0 timers per second, and no new programs over a 60 s sustained run. The frame is
flat at 2.4 ms. **Measured.**

**The problems are elsewhere, and they fall into three groups.**

1. **A first-show stall (CPU/GPU spike).** The first frames of the first entry into Murcia take
   **313 ms, 120 ms and 82 ms**. The main cause is two shader programs for the blog's orbit ring that
   `warm()` never compiles. The second cause is a 3840×2160 page texture and its mip chain uploading
   on that same visit. Both are measured and attributed (P1-A).
2. **Resident GPU memory (memory-bound, architecture-induced).** The city holds **~107 MiB of
   texture VRAM from the end of the intro onward**, including for a visitor who never leaves Earth.
   After the first view it holds **~134 MiB at 1440×900 and ~151 MiB at 1920×1080**. About 30 MiB of
   that is textures that show nothing, or show a flat ×1.0 (P1-B, P1-C, P2-E, P2-F).
3. **One piece of per-frame work that should not be per-frame.** While a service figure is shown,
   the campus particles relayout all 4000 targets on the CPU and re-upload **48 KB every frame**. They
   also do this under reduced motion, where the data does not change (P2-D).

**Draw calls rose from 176 to 244–250** since 09-02, and are now past the 200 budget that report
proposed. Triangles are flat (1.85 M to 1.88 M). The resting frame is 2.4 ms against Earth's 1.3 ms
under the same harness. That is comfortable on this desktop GPU, and **unproven on phones** (§6).

---

## 2. Baseline metrics

### 2.1 Frame cost (measured, 1440×900 DPR 1, vsync off)

| State | fps | frame ms (med / p95 / max) | draws/frame | tris/frame | tex uploads/s | buffer uploads/s | timers/s |
|---|---|---|---|---|---|---|---|
| Earth at rest, before Murcia | 760 | 1.3 / 1.7 / 5.9 | 116.4 | 314 k | 0 | 0 | 0 |
| **Murcia overview, idle** | 403 | **2.5 / 2.9 / 7.7** | **250** | **1.885 M** | **0** | **0** | **0** |
| Murcia overview, dragging | 366 | 2.7 / 3.4 / 5.0 | 250 | 1.885 M | 0 | 0 | 0 |
| Campus engaged (entry) | 628 | 0.7 / 9.5 / 12.6 | 48 | 1.66 M | 0 | 0 | 0 |
| **Campus, service figure shown** | 368 | 2.6 / 3.5 / 7.9 | 99 | 1.82 M | 0 | **368 (1 per frame), 17.2 MB/s** | 0 |
| Murcia after campus exit | 400 | 2.5 / 2.9 / 4.4 | 244 | 1.883 M | 0 | 0 | 0 |
| Blog open (scene suspended) | 1798 | 0.5 / 0.7 / 1.4 | 2 (blog header logo only) | 522 | 0 | 0 | 0 |
| Earth after Murcia | 695 | 1.4 / 1.8 / 5.1 | 116.4 | 314 k | 0 | 0 | 0 |
| Murcia sustained, 6 × 10 s | 421–427 | 2.4 / 2.8–2.9 / ≤7.7 | 244 | 1.883 M | 0 | 0 | 0 |

The "Earth after Murcia" row is identical to the Earth row before it. Murcia leaves no work behind on
the Earth route.

### 2.2 Resident texture VRAM owned by Murcia (measured allocations, 1440×900 unless stated)

| Texture | Dims / format | VRAM | When resident | Shows |
|---|---|---|---|---|
| Lightmap atlases, desktop profile (13 with 2 mips, 3 with 1) | 2048² BC7 sRGB | **77.0 MiB** | from load (during the intro) | the lighting |
| **Blog page texture** | 2880×1800 RGBA8 + mips (**3840×2160 → 43.9 MiB at 1920×1080**) | **26.4 MiB** | from first Murcia view | a distant panel, until the final approach frame |
| Campus ring screen, slots A + B | 2 × 8192×159 RGBA8 + mips | **13.2 MiB** | from load | slot A only; slot B never shows (single composition) |
| Tower LED screen, slots A + B | 2 × 569×2048 RGBA8 + mips | **11.8 MiB** | from load | one slot (1 slide today) |
| Embedded trim ("neutral-16") | 1024² RGBA8 sRGB + mips | **5.3 MiB** | from load | **every pixel 255,255,255**, a ×1.0 multiply (code + agent pixel decode) |
| Blog orbit ring canvas | 2048×160 + mips | ~1.7 MiB (inferred) | from load | the ring |
| **Total** | | **~107 MiB on Earth · ~134 MiB after first view · ~151 MiB at 1920×1080** | | |

For scale: the whole page, both experiences included, holds 268.5 MiB of texture at 1440×900 and
313.5 MiB at 1920×1080.

### 2.3 Leak census (measured)

| Checkpoint | heap MiB | DOM nodes | listeners | textures | tex VRAM MiB | buffers | programs | FBO | workers created/terminated |
|---|---|---|---|---|---|---|---|---|---|
| Earth, boot + 12 s | 15.2 | 612 | 418 | 49 | 240.5 | 1611 | 68 | 18 | 12 / 8 |
| Murcia, cycle 1 | 14.6 | 622 | 419 | 51 | 268.5 | 1619 | 70 | 18 | 12 / 8 |
| Campus, cycle 1 | 15.0 | 635 | 419 | 51 | 268.5 | 1627 | 70 | 18 | 12 / 8 |
| Earth, after cycle 1 | 15.2 | 628 | 418 | 51 | 268.5 | 1633 | 71 | 18 | 12 / 8 |
| Earth, after cycle 2 | 15.8 | 633 | 419 | 51 | 268.5 | 1633 | 71 | 18 | 12 / 8 |
| Earth, after cycle 3 | 15.8 | 633 | 419 | 51 | 268.5 | 1633 | 71 | 18 | 12 / 8 |
| Earth, after cycle 4 | 16.1 | 633 | 419 | 51 | 268.5 | 1633 | 71 | 18 | 12 / 8 |
| Murcia, after blog trip 1 (1920×1080) | 14.9 | 975 | 452 | 55 | 313.5 | 1633 | 71 | 21 | 14 / 10 |
| Murcia, after blog trip 2 | 16.0 | 975 | 452 | 55 | 313.5 | 1633 | 71 | 21 | 14 / 10 |
| Murcia, after blog trip 3 | 16.4 | 975 | 452 | 55 | 313.5 | 1633 | 71 | 21 | 14 / 10 |
| Murcia, sustained t+60 s | 15.9 | 984 | 452 | 55 | 268.5 | 1639 | 72 | 21 | 14 / 10 |

- **Where things grow:** growth happens only on first use. Two textures and two programs arrive on
  the first Murcia view, and the first campus entry adds buffers and one program. The first blog
  visit adds about 350 DOM nodes, 33 listeners, 4 textures and 3 FBOs; these belong to the blog route
  and its header logo, which stay cached. Nothing grows after that.
- **Heap:** it wanders within ±1 MiB with no trend across 9 minutes of cycling.
- **Verdict:** no leak.

### 2.4 First-show events (measured, 1920×1080; times relative to the first event)

```
first entry to Murcia
  +0 ms    texStorage2D 3840×2160, full mip chain; generateMipmap ×3   ← blog page texture
  +215 ms  LONG FRAME 82 ms
  +335 ms  LONG FRAME 120 ms
  +340 ms  compile + link: MeshBasicMaterial, USE_MAP                 ← blog orbit ring, outer
  +625 ms  generateMipmap
  +626 ms  compile + link: MeshBasicMaterial, no map                  ← blog orbit ring, inner
  +648 ms  LONG FRAME 313 ms
back to Earth
  +0 ms    compile + link: VacuumShader                               ← render pipeline, first departure
  +74 ms   LONG FRAME 84 ms
second entry to Murcia     (no events, no long frames)
first campus entry         LONG FRAME 85 ms (in run 1, one program was created in this window)
```

---

## 3. Findings

### P0: Severe

None.

### P1: High impact

#### P1-A · The first entry into Murcia stalls for 313 ms, because the blog ring's shaders were never warmed. NEW

**Evidence (measured, §2.4).** The first visit to Murcia compiles two `MeshBasicMaterial` programs
synchronously. The 313 ms frame lands right after the second link, with 120 ms and 82 ms frames just
before it. A second visit has no compiles and no long frames. Run 1 gives the same count: programs go
from 68 to 70 on the first view.

**Root cause (code).**

- `blogDisplay/blogOrbitRing.ts:20,24` creates two `MeshBasicMaterial`s, and `:31` sets
  `object.visible = false`.
- `warm()` (`MurciaExperience.ts:400-437`) relies on `renderer.compileAsync`, which in three 0.174
  walks `scene.traverseVisible`. It also relies on a 1×1 render, which skips invisible objects.
- So the ring's programs are compiled on the first frame the ring becomes visible, which is the
  arrival in the city.
- The comment at `MurciaExperience.ts:876-882` states the intent ("compile with the rest of the
  city"). This path escapes it.

**The same pattern, lower confidence.**

- The campus particle `Points` are also created with `visible = false`
  (`campus/particles/particleField.ts:141`). The first campus entry shows an 85 ms frame, and run 1
  created one program in that window. The comment at `MurciaExperience.ts:1048-1050` says the
  particle shaders are warmed; they are not.
- The render pipeline's `VacuumShader` compiles on the first departure from Murcia (84 ms).
  `graphics/`, not Murcia, owns that pass, but the stall sits on the Murcia exit.

**The texture half.** The blog page texture (3840×2160 plus a full mip chain, 43.9 MiB) is allocated
and mipmapped on the same first visit. The page request is debounced by 180 ms and waits on a
manifest fetch and an image decode (`blogApproach.ts:486-490`), so it resolves after `warm()` and
uploads on a visible frame.

**User impact.** The first arrival, which is exactly the moment the site is showing off, freezes for
about a third of a second on a desktop GPU. Shader compilation on mobile GPUs is typically several
times slower (inferred; physical-device check needed).

**Proposed direction.**

- Make hidden-at-birth objects part of the warm. Either flip them visible for the warm pass (their
  shaders can still output nothing), or compile them explicitly.
- Upload the page texture inside `warm()` (`renderer.initTexture`) once the first page is known, or
  start from the smaller resting texture in P1-C so the late upload is cheap.
- Add a regression guard: "programs created on first Murcia show == 0", which the existing debug
  probes could assert.

**Complexity.** Low. **Expected benefit.** Removes a ~300–500 ms first-show stall. **Confidence.**
High on the attribution (measured compile events plus source), medium on the campus half.

#### P1-B · Murcia keeps ~107 MiB of texture VRAM resident from the end of the intro, visited or not. REVALIDATED, larger shape

**Evidence (measured, §2.2).**

- The lightmaps alone are 77 MiB. That is 16 BC7 2048² atlases in the desktop profile.
- The lightmap manifest's rationale comment (`lightmapManifest.ts:84`, "twelve maps at 2048 ≈
  34 MB") is stale by more than 2×.
- The desktop profile is chosen by `(max-width:767px)` and `(pointer:coarse)` only
  (`loadLightmaps.ts:71-77`). A wide iPad with a trackpad, or a low-VRAM laptop, therefore gets the
  full 77 MiB against the ~70 MB iOS budget documented in `ios-safari-2026-08-14`.

**Root cause.** This is a deliberate lifecycle decision (ADR 003/004: build during the intro, never
dispose), and it is not a leak. What was never costed is its size after the v5.1 bake.

**Proposed direction.**

- Pick the lightmap resolution by capability: a VRAM or device-class heuristic owned by one quality
  decision, not scattered media queries.
- Consider a mixed profile, for example instances and outer buildings at 1024.
- Fold in P1-C, P2-E and P2-F, which are the non-lighting 30 MiB of this total.

**Complexity.** Medium. **Benefit.** Up to ~50 MiB on large-viewport devices. **Confidence.** High
on bytes, medium on device exposure.

#### P1-C · The blog page texture is 2× the CSS viewport with a full mip chain, and stays resident for the session. NEW

**Evidence.**

- Measured: 2880×1800 = 26.4 MiB at 1440×900, and 3840×2160 = 43.9 MiB at 1920×1080. Inferred:
  about 50 MiB at 2560×1440, where the side is capped at 4096.
- Code: `pageImage.ts:53-56` (`TEXTURE_SCALE = 2`, `MAX_TEXTURE_SIDE = 4096`), and
  `blogDisplay.ts:444-452` (`CanvasTexture`, default mips, anisotropy 8).
- The source canvas also stays alive as `texture.image`, which is a same-sized CPU/GPU-backed
  canvas (code).

**Root cause.** The comment at `pageImage.ts:40-50` is right that full resolution matters only on
the last frame before the handoff. The texture is still that size for the whole session, including
the long stretch where the panel is a small object in the distance.

**Proposed direction.**

- Keep a resting texture of about 1024–2048 px on the long side, and swap in the full-resolution one
  when the approach commits (the 3 s flight is ample time to decode it).
- Release the canvas reference after upload.
- Resize events rebuild this texture too (see P3). Debouncing and gating that while inactive belongs
  in the same change.

**Complexity.** Low to medium. **Benefit.** 20–45 MiB, and it shrinks the P1-A upload. **Confidence.**
High.

### P2: Moderate

#### P2-D · Campus particles relayout and re-upload 48 KB every frame while a service is shown, even under reduced motion. NEW

**Evidence.**

- Measured: `bufferSubData` fires once per frame (368/s at 368 fps), 47 KB each time, which is
  4000 × vec3 × 4 B. It is 0 in every other state.
- Code: `particleField.ts:313-317` (`live(...)` followed by `fillTargets` and `needsUpdate` every
  frame).
- The figure holds with `swapAt = Infinity` (`attachServicesCampus.ts:346-354`), so this runs for as
  long as the visitor reads.
- The subagent's reading of the source adds per-particle tuple allocations (`figureLayouts.ts:14,24,52,174`)
  and several `Vector3`s per frame (`attachServicesCampus.ts:233-279`). That is on the order of
  thousands of short-lived arrays per frame (inferred), which feeds minor GC.
- Under reduced motion, `figureMotion.amplitude = 0` (`createServicesCampus.ts:219-228`), so the
  same values are recomputed and re-uploaded every frame.

**Proposed direction.**

- Skip the live layout when its time input has no effect (reduced motion), and write into scratch
  storage instead of returning tuples.
- Structurally: move the "travel" animation into the vertex shader, driven by a time uniform. That
  gives zero uploads, as the rest of the field already manages.

**Complexity.** Low for the first, medium for the shader move. **Benefit.** Mostly CPU/GC on phones,
and 2.8 MB/s of upload at 60 Hz. **Confidence.** High.

#### P2-E · A 1024² all-white texture is sampled by every baked material. NEW (replaces 09-02 P2-I)

**Evidence.**

- Measured: 1024×1024 sRGB at 5.3 MiB.
- Code: the unified lightmap path returns before `dropEmbeddedTrim` runs
  (`loadLightmaps.ts:87` → `loadUnifiedLightmaps`). `preserveAlbedo: true` then copies `source.map`
  onto every baked `MeshBasicMaterial` (`lightmapMaterial.ts:59-61`).
- The subagent decoded the embedded PNG: every pixel is 255,255,255.

**Cost.** 5.3 MiB of VRAM, a retained ImageBitmap (about 4 MiB CPU, inferred), and **one extra
anisotropic texture fetch per fragment across the whole city** for a ×1.0 multiply. The comment at
`murciaConfig.ts:251-257` says "the runtime drops it", which is no longer true.

**Direction.** Drop a known-neutral map on the unified path, or export without it. TEXCOORD_0 may
then become unused too (see P2-H).

**Complexity.** Low. **Confidence.** High.

#### P2-F · Idle second facade slots: ~12.5 MiB that never shows. NEW

**Evidence.**

- Measured: two 8192×159 textures for the campus ring (6.6 MiB each), and two 569×2048 textures for
  the tower (5.9 MiB each).
- Code: `mediaFacade.ts:321` always creates two slots, and both `uMapA` and `uMapB` are sampled
  (`facade.frag:150-151`).
- The campus document has one composition and no rotation (`campusScreenContent.ts:57-59`), and the
  tower has one slide today.

**Direction.** Create slot B lazily on the first real crossfade, or keep it at 1×1 until then.

**Complexity.** Low. **Confidence.** High on the campus, medium on the tower (it depends on slide
count).

#### P2-G · About 79% of the terrain skirt is drawn and blended at alpha 0. NEW (code, not measured separately)

**Evidence.** `murciaConfig.ts:511,518` sets `width: 700` and `fadeEndFraction: 0.21`. Its own
comment says the remainder "is already fully transparent and exists only to guarantee coverage".
The skirt is transparent, does not write depth, uses a clone of the terrain material, and has 10
loops across the full width (`createTerrainTransition.ts:284-339`).

**Cost.** Fragment and blend work over a large horizon band every frame. The 09-02 doubling of
Murcia's GPU time was attributed to fragment cost, and this is a plausible contributor.

**Direction.** Stop emitting loops past `fadeEnd`. `checks/footprint` can keep its coverage rectangle
from `terrainVisualBounds` (pure maths). **Measure first:** an A/B GPU timing with the outer loops
removed.

**Confidence.** Medium-high on the waste, unmeasured on its size.

#### P2-H · CPU and GPU memory kept for data nobody reads. NEW (code, agent-verified)

- **The parsed GLTF lives for the session.** `LoadedCity.gltf` (`loadCity.ts:86,277`) is held on
  `MurciaExperience.loaded`, and nothing reads `.gltf` after load (grep). It pins the parser cache
  and the GLB body (about 5.5 MB).
- **Vertex attributes no shader reads.** COLOR_1/2/3 and TEXCOORD_2 are about 3.4 MiB of GPU vertex
  data, and are uploaded because three uploads every attribute.
- **Draco-decoded arrays.** About 30 MiB of them stay in the heap. Some are needed for bounds and
  raycasts, and which ones was not verified.

**Direction.** Drop the GLTF reference after the lightmaps attach. Strip unused attributes in the
export. Release CPU arrays only where they are proven unused.

**Confidence.** Medium-high (GLTF), high (attributes), medium (arrays).

#### P2-I · Draw calls grew from 176 to 244–250, past the proposed budget of 200. NEW

**Evidence (measured).** 250 in the overview and 244 after the campus has been visited, at a flat
~1.88 M triangles. The resting frame is 2.4 ms against 1.3 ms for Earth in the same harness.

**Reading.** Not a problem on this desktop. The new surfaces (campus screen, particles, tower screen,
orbit ring, skirt, highlight clones) each add draws. **Direction.** Re-baseline the budget or merge
static additions. It needs a phone measurement before it is treated as a cost (§6).

### P3: Minor

| # | Finding | Evidence | Direction |
|---|---|---|---|
| P3-1 | The blog return `setTimeout` is not cleared in `dispose()` or checked against `disposed`. It can call `endExternalControl` on a torn-down experience. | `blogApproach.ts:405-412, 555-577` | Clear it in `dispose`. Latent, because `dispose` never runs in practice. |
| P3-2 | `setAspect` rebuilds the panel plane, the extruded shell and two 128-segment cylinders on **every** resize event, including while Earth is showing. | `blogApproach.ts:484`, `blogDisplay.ts:431`, `displayShell.ts:163`, `blogOrbitRing.ts:36-51` | Debounce, and queue while inactive (the `parked` pattern already exists). |
| P3-3 | Small per-frame allocations in the hot path. | `blogDisplay.ts:520` (`new Vector3`), `:484` (the `anchor` clone, called by the compass every frame), `:491`; `CameraRig.ts:733-741` (`{...pose}`); `carousel.ts:708,726`; campus flight `Vector3`s (`campusCamera.ts:120-150`) | Scratch objects and out-params. |
| P3-4 | The compass writes about 6 style properties per mark per frame, even when unchanged, and has a `backdrop-filter` blur over a canvas that changes every frame. | `compassBar.ts:374-427`, `murcia.css:251-252` | Skip writes for unchanged values. Measure the blur on low-end mobile. |
| P3-5 | The campus sheet's `fit()` forces a synchronous layout on every window resize for the whole session, including while hidden. | `campusSheet.ts:54-68, 90-91` | Fit on `show` and while visible. |
| P3-6 | Tower slide images are not bounded (up to 8192 px, 6 slides), and decoded bitmaps stay resident. **Latent**: the current content has no image. | `editorialBounds.ts:266,309`, `facadeRenderer.ts:545-550, 696-709` | Resize at content build to the slot size, or `createImageBitmap` with a resize. |
| P3-7 | The tower carousel repaints and uploads 569×2048 plus mips on each slide change, even when the tower is off-screen. Today there is 1 slide, so nothing happens. | `MurciaExperience.ts:1326`, `mediaFacade.ts:391-409` | Defer the repaint while outside the frustum. |
| P3-8 | The rio fragment shader has a bank-distance loop of up to 48 segments per pixel, plus 4 noise octaves. The lake reuses it (a shared program, which is good). | `water/shaders/rio/fragment.glsl:120-197` | Only if GPU-bound on mobile: bake the bank distance. |
| P3-9 | The icon `ImageData` (~1.3 MB) is kept for the page's lifetime. The stadium geometry is deep-cloned only to re-index. There are ~15 per-mesh depth-offset material clones. `mipLevels` is in the lightmap program key and splits one program. | `iconLibrary.ts:19-23`, `citySurfaceDepth.ts:11-47,85`, `loadUnifiedLightmaps.ts:98` | Cleanups. |
| P3-10 | The Murcia chunk grew from 118.9 KB to **178.6 KB raw (+50%)** since 09-02. | `vite build` output | Only worth attributing if the chunk gates something. It loads after the handover. |
| P3-11 | The shared KTX2 (Basis) worker pool, **4 workers, stays alive all session.** Murcia's own references are released correctly. The pool survives because `EarthScene` releases its reference only on unmount, which never happens. | measured: workers 1–4 never terminated; they come from three's `WorkerPool`. Code: `EarthScene.tsx:86-118` | Outside Murcia's scope; recorded because Murcia's lightmaps share this pool. |

---

## 4. Measured and found not to be a problem

| Hypothesis | Result |
|---|---|
| Murcia leaks across Earth↔Murcia cycles | **No.** Flat on every counter after the first cycle (§2.3). |
| The blog round trip leaks | **No.** A one-time +350 nodes and +4 textures for the cached blog route, then flat across three trips. |
| Murcia works while Earth is showing | **No.** `update()` is gated on `active` (`MurciaExperience.ts:1237`), and the Earth frame is identical before and after Murcia. |
| Murcia works while the blog is open | **No.** `frameloop="never"`: 2 draws per frame, both from the blog header logo. |
| Canvas textures re-upload at rest | **No.** 0 uploads/s in the overview, after the campus, and across 60 s sustained. The tower, campus screen and compass redraw only on change. |
| Timers or intervals run in the background | **No.** 0 timeouts/s and 0 intervals/s in every sampled state. |
| Murcia's decoders stay resident | **No (prior P2-K fixed for Murcia).** `releaseDecoders()` runs in `load()`'s `finally` (`MurciaExperience.ts:341`), and both Draco pools are terminated (measured). |
| The 2048² trim PNG is still loaded (09-02 P2-I) | **No, closed.** The trim paths are null. Its cost moved to P2-E. |
| Frame time drifts during sustained use | **No.** 2.4 ms median in all six 10 s windows, and the heap is flat. |
| Earth layers tick while Murcia shows | **No.** Every Earth `useFrame` returns early on `!active`. |

**Not measured validly: the hidden tab.** In headed Playwright, the page kept rendering after
another tab was brought to the front, so this harness cannot say what happens when the tab is
hidden. The loop is driven by rAF, which browsers pause in hidden tabs, and no timers are running,
so from the code nothing should run (inferred). **This needs a manual check**: switch tabs and watch
DevTools' Performance panel.

---

## 5. Revalidation of 2026-09-02 findings touching Murcia

| Prior | Status now |
|---|---|
| P2-I: the trim sheet PNG 2048² costs 21.3 MiB | **Closed.** It is no longer loaded. It was replaced by P2-E's 5.3 MiB white map. |
| P2-J: Murcia's GPU time doubled; the district display was never measured | **Superseded.** The display is gone (the campus replaced it). The campus, blog display and tower are measured here. The resting frame is 2.4 ms under this harness (a different metric). |
| P2-K: the decoder pools are never released | **Fixed for Murcia** (measured). The shared Basis pool is still held by Earth (P3-11). |
| P2-L: 641 KB of KTX2 machinery for little texture | **Answered.** The transcoder now decodes 16 lightmap atlases, so it is justified. |
| Draw budget of 200 | **Exceeded** (P2-I). |

---

## 6. Performance budget proposal (Murcia-owned)

| Budget | Proposed | Current |
|---|---|---|
| Programs compiled on the first Murcia show | **0** | 2 (P1-A) |
| Longest frame on the first Murcia show, desktop reference | **< 50 ms** | 313 ms |
| Texture uploads and buffer uploads per frame at rest | **0** | 0 ✓ |
| Buffer uploads per frame in the campus | **0** (after the entrance morph) | 1 × 48 KB (P2-D) |
| Murcia texture VRAM, desktop | **≤ 80 MiB** | ~134–151 MiB |
| Murcia texture VRAM, phone | **≤ 30 MiB** | ~20 MiB lightmaps + ~30 MiB screens/trim/page (inferred) |
| Draw calls, overview | **≤ 200, or re-baseline explicitly** | 244–250 |

---

## 7. Optimization roadmap (Impact × Confidence ÷ Complexity)

### Immediate wins

1. **P1-A:** include hidden-at-birth objects (orbit ring, campus points) in `warm()`, and upload the
   page texture there. This removes the 313 ms first-show stall.
2. **P2-E:** drop the all-white map on the unified lightmap path. That saves 5.3 MiB and one texture
   fetch per city fragment.
3. **P2-F:** lazy slot B for single-composition facades. That saves about 12.5 MiB.
4. **P2-D (first half):** no live relayout under reduced motion, and no per-particle tuple
   allocations.
5. **P3-1, P3-2:** clear the return timer, and debounce plus gate the resize rebuild.

### Structural optimizations

6. **P1-C:** a resting-resolution page texture, upgraded when the approach commits. Saves 20–45 MiB.
7. **P1-B:** a capability-based lightmap profile (one quality decision) and possibly a mixed profile.
8. **P2-D (second half):** particle travel in the vertex shader.
9. **P2-H:** release the GLTF reference, and strip unused attributes in the export.

### Experimental (measure first)

10. **P2-G:** trim the skirt past `fadeEnd`, with an A/B GPU timing.
11. **P3-8:** the rio bank loop cost on a mobile GPU.
12. **P2-I:** draw-call merging, only if a phone shows draws to be the limit.

### Physical-device validation

- The first-show stall (P1-A) on a mid-range Android phone and an iPhone.
- The VRAM headroom of the 2048 lightmap profile on an iPad with a trackpad (P1-B).
- The sustained thermal behaviour of continuous 60 Hz rendering. Murcia is never static (the water's
  `uTime`, the tower logo and the blink), so it renders every frame by design.
- The hidden-tab behaviour (manual DevTools check).

---

## 8. Reproducing this

1. Run `npx vite build`, then `npx vite preview --port 4173`.
2. The harness (outside the repo) launches Chromium headed with `--disable-gpu-vsync
   --disable-frame-rate-limit --enable-precise-memory-info`.
3. It installs WebGL2 prototype wrappers via `addInitScript`, drives navigation through `.nav-control`
   (Enter) and `.scene-home`, drives the campus through the `__vertigoCampus` seam, and drives the
   blog through `__vertigoBlogDisplayPoint`.
4. It forces GC through CDP before every census.
5. First-show attribution logs `shaderSource`/`linkProgram` with the program's `SHADER_TYPE` and
   `USE_*` defines, `texStorage2D` above 1 MP, `generateMipmap`, and every rAF interval above 40 ms.
