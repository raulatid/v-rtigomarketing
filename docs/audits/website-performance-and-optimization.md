# Website Performance & Optimization Audit

## Context

This project is an interactive production website with a substantial Three.js / React Three Fiber rendering component.

Performance is therefore determined by several different systems:

- HTML/CSS/UI
- JavaScript
- React
- React Three Fiber
- Three.js
- WebGL/GPU
- Post-processing
- Asset loading
- Texture decompression
- GLB decoding
- Web Workers / WASM
- Network delivery
- Browser caching
- Runtime memory
- Device pixel ratio
- Device capability
- Mobile thermal constraints

Prior performance work exists and must not be rediscovered blindly.

Before measuring anything, read:

- the most recent dated reports in `docs/audits/` (`<topic>-YYYY-MM-DD.md`)
- the code comments that cite them, which record what was changed and why

Treat every prior finding as a HYPOTHESIS to revalidate against the current codebase, never as established fact.

Findings from earlier investigations may have been fixed, may have reappeared, or may have moved and changed shape as the project evolved.

Where a prior finding no longer holds, say so explicitly in the report rather than silently dropping it.

This task is primarily a measurement and architecture audit.

Do not start by applying generic optimizations.

---

# Primary Objective

Determine where user-visible performance is currently lost and produce an evidence-based optimization strategy.

The audit must answer:

1. What delays first meaningful use?
2. What delays the initial 3D scene?
3. What consumes the most network bandwidth?
4. What consumes the most main-thread time?
5. What consumes the most GPU/frame time?
6. What consumes the most memory?
7. What work is duplicated?
8. What work happens unnecessarily?
9. What scales poorly with DPR?
10. What behaves poorly on mobile hardware?
11. What causes frame-time spikes rather than average slowdown?
12. What could generate thermal throttling during prolonged use?
13. Which optimizations offer the highest benefit per implementation cost?

Performance recommendations must be ranked using measured impact wherever possible.

---

# Phase 1 — Establish Production Baseline

Do not benchmark only the development server.

Create or use a production build wherever possible.

Record:

- Production bundle size
- Initial JS transferred
- Initial CSS transferred
- Static asset bytes
- Initial GLB/model bytes
- Texture bytes
- WASM decoder bytes
- Number of requests
- Request waterfall
- Time to first content
- Time to app interactive state
- Time to usable 3D scene
- Largest Contentful Paint
- Interaction to Next Paint where meaningful
- Cumulative Layout Shift
- Long tasks
- Memory behaviour
- Frame-time behaviour

Clearly label measurements as:

- production
- development
- synthetic
- real-device
- inferred

Do not mix them.

---

# Phase 2 — Loading Critical Path

Map the complete startup sequence.

Identify:

- HTML
- CSS
- JS entrypoint
- React initialization
- Canvas creation
- Three.js initialization
- shader compilation
- asset fetching
- decoder loading
- texture transcoding
- GLB decoding
- scene construction
- post-processing initialization
- first rendered frame
- first interactive frame

Construct a dependency chain showing what actually blocks usability.

Look for serial work that could execute concurrently and concurrent work that creates resource contention.

---

# Phase 3 — JavaScript Bundle Audit

Inspect:

- initial bundle
- route bundles
- lazy-loaded modules
- third-party packages
- Three.js imports
- examples/addons imports
- duplicate modules
- unused code
- large utility dependencies
- development-only packages accidentally included

Determine:

- Which code must exist on first load.
- Which code can be delayed.
- Whether tree shaking works.
- Whether code splitting is effective.
- Whether dynamic imports would materially reduce startup cost.

Do not optimize kilobytes that have negligible effect compared with multi-megabyte 3D assets unless the cost/benefit justifies it.

---

# Phase 4 — Network and Asset Waterfall

Audit every initial request.

Categorize:

- Critical
- Required shortly after interaction
- Prefetch candidate
- Deferred
- Unnecessary

Inspect:

- request concurrency
- dependency chains
- repeated requests
- duplicate decoders
- duplicate models
- duplicate textures
- fonts
- environment textures
- preload directives
- cache misses

Determine whether loading too many assets simultaneously creates:

- bandwidth contention
- decoder contention
- worker contention
- memory spikes

---

# Phase 5 — Compression and Asset Format

Audit:

- GLB compression
- Draco
- Meshopt if applicable
- KTX2/Basis
- image formats
- texture dimensions
- mipmaps
- environment maps
- static UI imagery
- fonts

For each major asset category determine:

- transfer size
- decoded size
- GPU size
- whether compression is appropriate
- whether resolution exceeds visual requirement

Do not confuse network compression with GPU memory reduction.

---

# Phase 6 — Loader Architecture

Explicitly inspect loader ownership.

Audit:

- DRACOLoader creation
- KTX2Loader creation
- GLTFLoader creation
- worker pools
- decoder paths
- lifecycle/disposal

Verify whether multiple independent systems instantiate equivalent decoders or worker pools.

Determine whether loader ownership should be centralized.

If proposing shared loaders, define:

- owner
- initialization lifecycle
- disposal lifecycle
- concurrency semantics
- failure semantics

Do not create global mutable state without defined ownership.

---

# Phase 7 — Cache Strategy

Audit production caching for:

- models
- textures
- decoders
- fonts
- JS bundles
- CSS
- images
- generated assets

Determine whether immutable assets use:

`Cache-Control: public, max-age=31536000, immutable`

only where versioning guarantees immutability.

Inspect filename/version strategy.

Separate:

- immutable hashed/versioned assets
- mutable public assets
- HTML
- API responses

Quantify the benefit for returning users.

---

# Phase 8 — Three.js Scene Cost

Measure:

- objects
- meshes
- triangles
- vertices
- materials
- textures
- shaders
- draw calls
- lights
- transparent objects
- instancing
- scene traversal

Determine whether geometry is actually a limiting factor.

Do not propose geometry simplification merely because this is a 3D application.

Validate it.

---

# Phase 9 — Post-Processing Cost

Profile every render pass independently.

Inspect:

- RenderPass
- UnrealBloomPass
- AfterimagePass
- OutputPass
- any custom passes

Record:

- framebuffer binds
- full-screen passes
- render-target resolution
- mip levels
- shader passes
- memory use
- approximate GPU cost

Verify whether passes continue executing even when their visible effect is disabled.

For example, if an effect is configured with a visually neutral parameter but still performs full render passes, treat it as unnecessary work.

Determine whether effects can be:

- conditionally removed
- reduced in resolution
- consolidated
- adapted by quality tier

Preserve visual intent.

---

# Phase 10 — Device Pixel Ratio

Determine renderer DPR behaviour.

Test representative values:

- 1.0
- 1.25
- 1.5
- 2.0
- relevant real device values

Calculate framebuffer pixel count.

Measure or estimate interaction with:

- scene render
- bloom
- afterimage
- antialiasing
- render targets

Determine the point at which additional resolution produces little visible benefit but substantial GPU cost.

Evaluate:

- hard cap
- responsive cap
- capability-derived DPR
- dynamic resolution

Avoid simplistic `isMobile ? 1 : 2` logic unless evidence supports it.

---

# Phase 11 — Adaptive Quality Strategy

Determine whether the renderer needs explicit quality levels.

Possible variables include:

- DPR
- bloom resolution
- bloom mip count
- shadow resolution
- antialiasing
- secondary effects
- environment resolution

If recommending adaptive quality, define a coherent policy.

Prefer a small number of centrally owned quality decisions rather than scattered device checks.

Quality should be capability-oriented, not browser-brand-oriented.

---

# Phase 12 — React / R3F Runtime Audit

Inspect React behaviour around the 3D scene.

Look for:

- unnecessary rerenders
- context updates propagating widely
- frequently changing state
- render-loop React state
- recreated objects
- recreated materials
- recreated geometries
- recreated arrays/objects
- unstable callbacks
- unnecessary component remounts
- React state controlling values better held outside React

Use profiling evidence before adding `memo`, `useMemo`, or `useCallback`.

Do not perform memoization by habit.

---

# Phase 13 — Animation Loop

Audit everything executed per frame.

Build a list of:

- `useFrame`
- animation callbacks
- camera controllers
- shader uniform updates
- interaction probes
- raycasting
- DOM synchronization
- post-processing updates

For each, determine:

- frequency
- cost
- whether it must execute every frame
- whether it executes when inactive
- whether it allocates memory

Look for repeated allocations in hot paths.

---

# Phase 14 — Raycasting and Interaction

Inspect pointer hit-testing.

Measure:

- objects tested
- frequency
- recursive traversal
- expensive bounding calculations
- interaction layers
- pointer-move frequency

Determine whether raycasting can be scoped without changing interaction semantics.

Do not optimize it if profiling shows negligible cost.

---

# Phase 15 — Memory Audit

Measure or estimate:

- JavaScript heap
- ArrayBuffers
- WASM memory
- decoded model memory
- texture GPU memory
- render targets
- worker memory
- duplicate resources

Test:

- initial load peak
- steady state
- repeated navigation
- repeated camera transitions
- scene changes
- resize
- prolonged runtime

Look for both:

- leaks
- unnecessarily high steady-state memory

A flat JS heap does not rule out GPU/WASM/resource problems.

---

# Phase 16 — Resource Disposal

Audit lifecycle of:

- textures
- geometries
- materials
- render targets
- composers
- loaders
- workers
- event listeners
- observers

Identify resources that:

- are never disposed
- are disposed too aggressively and recreated
- have unclear ownership

Performance architecture must have explicit resource ownership.

---

# Phase 17 — Main Thread and Long Tasks

Profile:

- JS parsing
- React initialization
- asset processing
- scene construction
- decoder coordination
- runtime interaction

Identify long tasks affecting responsiveness.

Determine whether heavy work can be:

- deferred
- chunked
- moved to workers
- avoided

Do not move work to workers unless transfer/coordination cost justifies it.

---

# Phase 18 — Layout and DOM Rendering

Although 3D is important, inspect the normal webpage too.

Look for:

- expensive layout/reflow
- large DOM trees
- repeated measurements
- unnecessary observers
- expensive filters/backdrop filters
- layout thrashing
- forced synchronous layout

Determine whether UI performance materially contributes to the experience.

---

# Phase 19 — Fonts and UI Assets

Audit:

- font files
- weights
- subsets
- preload
- `font-display`
- icons
- SVG
- UI imagery

Look for unnecessary first-load resources.

---

# Phase 20 — Runtime Thermal / Sustained Performance

A short benchmark is insufficient for a continuously rendered scene.

Where possible, test sustained execution.

Measure:

- frame-time degradation
- memory drift
- CPU/GPU load
- adaptive performance behaviour

Explicitly identify what requires physical-device validation.

---

# Phase 21 — Visibility and Background Rendering

Verify what happens when:

- tab is hidden
- browser window loses visibility
- device locks
- mobile browser backgrounds the page

Determine whether rendering continues unnecessarily.

Inspect:

- animation loop
- timers
- workers
- loaders

---

# Phase 22 — Error and Retry Cost

Inspect failed asset loading.

Look for:

- uncontrolled retries
- repeated decoder initialization
- fallback assets causing duplicate loading
- repeated scene reconstruction

Ensure failures do not produce performance storms.

---

# Required Output

Write the result to `docs/audits/reports/website-performance-and-optimization-<YYYY-MM-DD>.md`.

`docs/audits/` holds briefs — the audits that can be run. `docs/audits/reports/` holds the audits
that *were* run. Never write a report beside the briefs.

Before the report enters Git history it must satisfy the sanitization contract in
`docs/audits/README.md`: no credentials, secret values, personal data, authentication material,
raw production dumps, or exploit detail beyond the minimum reproduction. `npm run check:audit`
enforces the mechanical half and fails the build. The judgment calls are yours.

Network waterfalls and HAR excerpts are the usual way this contract gets broken here — they carry
request headers, cookies and signed URLs. Quote the timing, not the transcript.

Open it with the header this directory uses:

```
**Date:** YYYY-MM-DD · **Against:** working tree at `<commit>`
**Brief:** `audits/website-performance-and-optimization.md`
```

If earlier passes exist, write the new one as a delta against them and say so in the header.
Earlier passes remain accurate for everything the new one does not restate, and where the two
disagree, the newer one wins. Never overwrite or delete a previous report — it is the record of
what was true at its commit.

State the measurement conditions with every number: device, network throttling, cold or warm
cache. A figure without them cannot be compared against the next run, which is the whole point of
keeping the report.

## 1. Performance Executive Summary

Explain the dominant current bottlenecks.

Distinguish:

- Network-bound
- CPU-bound
- GPU-bound
- Memory-bound
- Architecture-induced duplicate work

---

## 2. Baseline Metrics

Provide a compact table of current measurements.

Include methodology and environment.

---

## 3. Performance Findings

Rank:

### P0 — Severe
Crash, extreme unusability, or catastrophic resource behaviour.

### P1 — High impact
Major measurable user-facing cost.

### P2 — Moderate
Meaningful optimization.

### P3 — Minor
Small optimization or resilience improvement.

Each finding must include:

- Evidence
- Measurement
- Relevant files
- Root cause
- User impact
- Proposed direction
- Estimated engineering complexity
- Expected benefit
- Confidence level

---

## 4. Performance Budget Proposal

Recommend explicit budgets where meaningful for:

- initial transferred bytes
- 3D initial payload
- texture memory
- render-target memory
- draw calls
- long tasks
- DPR
- target frame time

Budgets must reflect the nature of this project rather than arbitrary generic web limits.

---

## 5. Device Quality Strategy

If necessary, propose a centralized renderer quality model.

Explain:

- what it controls
- who owns it
- when decisions are made
- whether quality may change at runtime

---

## 6. Optimization Roadmap

Rank changes using:

Impact × Confidence ÷ Complexity

Group into:

### Immediate wins
High confidence, low risk.

### Structural optimizations
Require architectural work.

### Experimental optimizations
Require measurement before adoption.

### Physical-device validation
Cannot be proven in the current environment.

---

# Constraints

- Measure before optimizing.
- Prefer production measurements.
- Do not optimize theoretical bottlenecks.
- Preserve visual/artistic direction.
- Do not remove meaningful effects solely to improve benchmark numbers.
- Do not add memoization without demonstrated rerender cost.
- Do not over-engineer adaptive quality.
- Avoid device/user-agent hacks.
- Treat previous performance findings as hypotheses to revalidate.
- Distinguish network size, decoded memory, and GPU memory.
- Keep resource ownership explicit.
- Avoid unrelated refactoring.