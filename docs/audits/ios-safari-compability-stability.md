# iOS / Safari Compatibility & Stability Audit

## Context

This project uses an interactive Three.js / React Three Fiber environment as a central part of the production website.

iOS must be treated as a specific target platform rather than assuming that behaviour observed in desktop Chromium, Android Chrome, or desktop Safari will transfer directly.

Relevant characteristics include:

- Safari/WebKit-specific browser behaviour
- WebGL implementation differences
- Strict memory constraints
- Aggressive tab/process termination under memory pressure
- High device pixel ratios
- Dynamic browser chrome and viewport dimensions
- Touch-only interaction
- Gesture arbitration
- Safe-area insets
- Different media/autoplay restrictions
- Texture/GPU constraints
- Orientation behaviour
- WebKit-specific CSS and event quirks

The objective is to determine whether the current application is safe to release on modern iPhone and iPad devices and to identify iOS-specific risks before they become production failures.

This task is primarily an audit.

Do not add user-agent hacks or broad Safari workarounds without first demonstrating the underlying problem.

---

# Primary Objective

Identify code, rendering behaviour, CSS, interactions, or resource usage that could:

1. Work on Chromium but fail on Safari/WebKit.
2. Work on desktop Safari but fail on iOS Safari.
3. Cause crashes or page reloads due to memory pressure.
4. Produce incorrect WebGL output.
5. Produce incorrect viewport sizing.
6. Break when Safari's browser chrome changes size.
7. Conflict with native iOS gestures.
8. Ignore display safe areas.
9. Become excessively expensive because of Retina DPR.
10. Break after orientation changes.
11. Fail due to unsupported or partially supported browser APIs.
12. Cause context loss or unrecoverable WebGL state.
13. Behave incorrectly when the page moves between foreground and background.

---

# Phase 1 — Identify the iOS-Relevant Execution Surface

Map all code that interacts directly or indirectly with:

- WebGLRenderer
- WebGL capabilities
- WebGL extensions
- Canvas lifecycle
- Device pixel ratio
- Render targets
- Post-processing
- Texture loading
- KTX2 / Basis
- Draco
- GLTF loading
- Resize handling
- Visibility changes
- Pointer/touch events
- Gesture handling
- Scroll
- Viewport dimensions
- CSS viewport units
- Fullscreen behaviour
- Audio/video if present
- Clipboard/share APIs if present
- Browser-specific APIs
- Local/session storage if relevant
- Web Workers
- WASM decoders

Search for assumptions based on Chromium behaviour.

---

# Phase 2 — Safari / WebKit API Compatibility Audit

Inventory browser APIs used by the application.

For each non-trivial API, determine:

- Whether it is supported by current iOS Safari.
- Whether behaviour differs from Chromium.
- Whether feature detection exists.
- Whether failure is handled.
- Whether a fallback is needed.

Inspect especially:

- Pointer Events
- Touch Events
- ResizeObserver
- IntersectionObserver
- VisualViewport
- Web Workers
- WebAssembly
- requestAnimationFrame
- requestIdleCallback
- WebGL/WebGL2 features
- Fullscreen API
- Screen Orientation API
- Pointer Lock
- passive event listeners
- CSS environment variables
- any experimental APIs

Do not rely on user-agent strings as proof of capability.

Prefer feature/capability detection whenever possible.

---

# Phase 3 — iOS Viewport Audit

This deserves explicit testing.

Mobile Safari does not behave like a static desktop viewport.

Audit all uses of:

- `100vh`
- `100vw`
- `window.innerHeight`
- `window.innerWidth`
- `visualViewport`
- `svh`
- `lvh`
- `dvh`

Test behaviour when:

- Safari's top/bottom browser bars are visible.
- Browser chrome collapses.
- Browser chrome expands again.
- The user scrolls.
- The device rotates.
- The page is loaded directly in portrait.
- The page is loaded directly in landscape.

Determine whether the application suffers from:

- Canvas taller than the visible area
- Empty bars
- Layout jumps
- UI hidden behind Safari controls
- Repeated expensive canvas resize operations
- Incorrect camera aspect ratio
- Post-processing render targets being continuously reallocated

Pay particular attention to whether dynamic viewport changes unintentionally cause repeated GPU resource allocation.

---

# Phase 4 — Safe Area Audit

Inspect UI positioned near:

- Top edge
- Bottom edge
- Left/right edges in landscape

Determine whether the design accounts for devices with:

- Display notch
- Dynamic Island
- Home indicator
- Rounded display corners

Inspect use of:

- `env(safe-area-inset-top)`
- `env(safe-area-inset-bottom)`
- `env(safe-area-inset-left)`
- `env(safe-area-inset-right)`

Check whether `viewport-fit=cover` is present and whether using it would actually be appropriate for the layout.

Do not mechanically add safe-area padding everywhere.

Determine which UI elements actually need it.

---

# Phase 5 — Device Pixel Ratio and Fill Rate

This is a high-priority section because the project has already shown sensitivity to fill rate and post-processing cost.

Modern iPhones can expose very high device pixel ratios.

Inspect how React Three Fiber / Three.js currently chooses DPR.

Determine the effective internal framebuffer resolution on representative Retina devices.

Calculate approximate pixel counts for representative iPhones and compare them against DPR 1 or a capped DPR.

Then evaluate the interaction with:

- UnrealBloomPass
- AfterimagePass
- OutputPass
- MSAA / antialiasing
- Render targets
- Any full-screen shader pass

Check whether the current renderer allows an iPhone to render millions of pixels through the complete post-processing chain every frame unnecessarily.

Determine whether a DPR cap or adaptive quality strategy is justified.

Any recommendation must distinguish:

- CSS display resolution
- renderer pixel ratio
- post-processing buffer resolution

Do not alter visual quality without quantifying the reason.

---

# Phase 6 — GPU and Memory Pressure

Treat memory as a first-class iOS constraint.

Inventory approximate GPU/resource memory associated with:

- Texture uploads
- GLB geometry
- Render targets
- Bloom mip chains
- Afterimage buffers
- Depth buffers
- Environment maps
- Decoded texture data
- Draco/Basis decoder instances
- Web Workers
- WASM memory

Use the existing performance audit as evidence where applicable.

The existing measurement of texture uploads is particularly relevant and must be reconsidered from an iOS memory-budget perspective.

Investigate:

- Whether resources are duplicated.
- Whether textures remain alive unnecessarily.
- Whether post-processing buffers are larger than necessary.
- Whether resources are disposed correctly.
- Whether route/scene changes retain GPU resources.
- Whether repeated initialization creates duplicate loaders/workers.
- Whether loading peaks are materially larger than steady-state memory.

Distinguish:

- JavaScript heap
- WASM memory
- decoded asset memory
- GPU texture/render-target memory

A stable JS heap does NOT prove the application is safe from iOS memory termination.

---

# Phase 7 — WebGL Context Loss

Audit whether the application handles:

- `webglcontextlost`
- `webglcontextrestored`

Determine what happens if iOS/WebKit loses the graphics context due to:

- Memory pressure
- Backgrounding
- GPU reset
- Browser resource management

Identify whether:

- The UI becomes permanently blank.
- The scene can recover.
- Asset state becomes inconsistent.
- A full reload is required.
- The user receives any fallback/error state.

Do not necessarily implement a full context restoration system during the audit.

First determine current behaviour and realistic recovery requirements.

---

# Phase 8 — Texture and Asset Compatibility

Audit texture formats and loading paths specifically for Safari/iOS.

Inspect:

- KTX2
- Basis transcoding
- Runtime GPU format selection
- Fallback paths
- Compressed texture extension detection
- Environment textures
- Large source textures
- Maximum texture dimensions

Determine which compressed GPU texture formats are likely to be selected on representative iOS devices and whether the project's KTX2 setup handles them correctly.

Confirm that failure to support a preferred compressed format does not produce:

- Invisible materials
- Failed texture loading
- excessive uncompressed fallback memory
- crashes
- unexpected network fallback behaviour

Also inspect Draco/Basis workers and WASM loading from Safari.

Cross-reference the duplicate decoder issue already found in the performance audit.

---

# Phase 9 — Shader and WebGL Compatibility

Inspect custom shaders, shader modifications, post-processing passes, and renderer configuration for assumptions that may differ between GPU/browser implementations.

Check:

- Shader precision
- Unsupported extensions
- WebGL1 vs WebGL2 assumptions
- texture sampling
- floating-point render targets
- depth textures
- blending
- color-space handling
- tone mapping
- transparent materials
- derivatives if relevant
- shader compilation failures
- excessive shader variants

Do not assume that successful compilation in Chromium proves compatibility.

Identify custom shader code separately from Three.js-standard shader paths.

---

# Phase 10 — Touch and Gesture Arbitration

iOS interaction must be tested as a native touch environment.

Audit:

- `touch-action`
- Pointer Events
- passive listeners
- `preventDefault`
- dragging
- tapping
- pinch gestures
- browser scrolling
- pull-to-refresh interaction
- double-tap behaviour
- Safari text/image selection
- long press
- accidental browser zoom
- edge gestures

Determine whether canvas gestures conflict with native Safari/iOS behaviour.

For each core interaction, verify:

- Tap
- Drag
- Tap after drag
- Long press
- Multi-touch
- Gesture cancellation
- Finger leaving the canvas
- Orientation change during/after interaction

Look specifically for stale pointer state when `pointercancel` occurs.

---

# Phase 11 — Hover Semantics

iOS normally has no persistent hover state.

Audit all CSS and JS functionality that depends on:

- `:hover`
- pointer enter/leave
- hover labels
- cursor changes
- hover previews
- hover as a prerequisite for clicking

Determine whether important information or interaction affordances are invisible on touch devices.

Where CSS differentiation is appropriate, inspect use of media features such as:

- `hover`
- `any-hover`
- `pointer`
- `any-pointer`

Do not equate viewport width with input capability.

---

# Phase 12 — Orientation Behaviour

Test iPhone portrait ↔ landscape transitions explicitly.

Verify:

- Renderer dimensions
- DPR
- Camera aspect
- Camera framing
- UI safe areas
- Post-processing buffers
- Raycast coordinates
- Overlay alignment
- Gesture state

Look for rendering resources that are unnecessarily recreated during orientation changes.

Also consider iPad multitasking/resizable viewport behaviour where architecture makes it relevant.

---

# Phase 13 — Page Lifecycle and Backgrounding

iOS aggressively suspends background pages.

Audit behaviour when:

1. The page is running.
2. Safari is backgrounded.
3. The device remains elsewhere for a period.
4. Safari returns to the page.

Inspect:

- `visibilitychange`
- animation loop behaviour
- elapsed-time calculations
- clocks/timers
- camera animations
- shader time uniforms
- loading operations
- Web Audio if present
- network requests
- WebGL state

Determine whether returning to the application can cause:

- Giant animation deltas
- Camera transitions completing instantly
- physics/animation jumps
- unnecessary rendering while hidden
- stale interaction state
- broken WebGL state

The application should not assume continuous foreground execution.

---

# Phase 14 — Safari CSS Behaviour

Audit UI for WebKit-sensitive CSS.

Prioritize actual project usage rather than creating a generic browser compatibility checklist.

Inspect where relevant:

- viewport units
- backdrop filters
- filters
- sticky positioning
- overflow containers
- fixed positioning
- transforms
- compositing layers
- masks
- clipping
- text rendering
- touch scrolling
- CSS environment variables

Identify unsupported or behaviourally inconsistent properties only where they are actually used.

---

# Phase 15 — Navigation and Browser Behaviour

Test the application against normal Safari navigation patterns.

Check:

- Reload
- Back
- Forward
- Page restoration
- Browser history
- bfcache behaviour where relevant
- Direct deep links
- Returning after opening another page/app

Determine whether scene state, camera state, or initialization code behaves incorrectly when the page is restored instead of fully recreated.

---

# Phase 16 — Real iOS Validation Strategy

Source-code inspection alone is not sufficient to declare iOS compatibility.

Determine what can be validated in the current environment and explicitly document what cannot.

The report must distinguish:

### Verified
Observed directly on Safari/iOS or a sufficiently representative environment.

### Strongly inferred
Supported by implementation evidence and platform documentation but not physically reproduced.

### Requires physical-device validation
Issues involving:

- GPU performance
- memory termination
- thermal behaviour
- WebGL context loss
- touch feel
- Safari browser chrome behaviour
- device-specific rendering

Define a concise physical-device test matrix.

A reasonable minimum target matrix should cover different capability classes rather than every iPhone generation.

For example:

- A recent high-end iPhone
- A several-generation-old iPhone
- At least one iPad if tablet support is intended

Do not claim compatibility based purely on desktop Safari.

---

# Required Output

Write the result to `docs/audits/reports/ios-safari-<YYYY-MM-DD>.md`, keeping the `ios-safari-`
prefix so every pass in this lineage sorts together beside `ios-safari-2026-08-14.md`.

`docs/audits/` holds briefs — the audits that can be run. `docs/audits/reports/` holds the audits
that *were* run. Never write a report beside the briefs.

Before the report enters Git history it must satisfy the sanitization contract in
`docs/audits/README.md`: no credentials, secret values, personal data, authentication material,
raw production dumps, or exploit detail beyond the minimum reproduction. `npm run check:audit`
enforces the mechanical half and fails the build. The judgment calls are yours.

Device logs and Web Inspector output are the usual way this contract gets broken here — they carry
device identifiers and request headers. Quote the symptom, not the console dump.

Open it with the header this directory uses:

```
**Date:** YYYY-MM-DD · **Against:** working tree at `<commit>`
**Brief:** `audits/ios-safari-compability-stability.md`
```

If earlier passes exist, write the new one as a delta against them and say so in the header.
Earlier passes remain accurate for everything the new one does not restate, and where the two
disagree, the newer one wins. Never overwrite or delete a previous report — it is the record of
what was true at its commit.

Name the iOS version and hardware behind every behavioural claim, and mark anything inferred
rather than observed on a real device as unverified.

Produce an iOS-specific audit report containing:

## 1. Release Assessment

Classify the current project as:

- Safe for iOS production
- Likely compatible but requiring physical validation
- Contains significant iOS risks
- Not currently safe for iOS release

Explain the evidence behind the classification.

## 2. Compatibility Findings

Rank findings:

### P0 — Release blocker
Crash, blank screen, unusable interaction, impossible navigation, or critical unsupported functionality.

### P1 — Major
High probability of serious performance, rendering, layout, or interaction problems.

### P2 — Moderate
Compatibility or robustness problem affecting a subset of devices/conditions.

### P3 — Minor
Polish or defensive engineering improvement.

Each finding must contain:

- Evidence
- Relevant file(s)
- Relevant code
- iOS/WebKit mechanism involved
- Affected device/browser conditions
- User impact
- Recommended solution direction
- Implementation complexity
- Confidence level: verified / strongly inferred / requires device validation

## 3. iOS Resource Budget

Summarize the main iOS-sensitive resource costs:

- DPR / framebuffer resolution
- Texture memory
- Render-target memory
- Post-processing
- Asset-loading peak
- WASM/workers
- GLB resources

Identify the largest realistic risks.

## 4. Required Physical Tests

Produce a concise test protocol that can later be executed on actual devices.

Include:

- Cold load
- Navigation
- Main interactions
- Repeated camera transitions
- Portrait/landscape switching
- Browser chrome expansion/collapse
- Background/foreground
- Several minutes of continuous scene activity
- Memory-pressure symptoms
- Context-loss symptoms
- Return navigation
- Slow-network loading where relevant

## 5. Remediation Plan

Only after the audit, provide an ordered engineering plan.

Prioritize:

1. Crash/context-loss risks
2. Memory pressure
3. Broken rendering
4. Broken touch interaction
5. Viewport/safe-area issues
6. DPR and rendering cost
7. Lifecycle robustness
8. Secondary Safari-specific polish

---

# Important Constraints

- Do not implement generic Safari hacks without reproducing or substantiating the problem.
- Do not use user-agent detection when capability detection is sufficient.
- Do not downgrade the entire experience merely because the browser is Safari.
- Do not create an independent iOS codebase.
- Prefer adaptations at well-defined architectural boundaries.
- Do not confuse responsive-design problems with iOS-specific problems; those belong in the separate mobile audit.
- Do not interpret successful desktop Safari execution as proof of iPhone compatibility.
- Do not interpret stable JavaScript heap usage as proof of safe total memory consumption.
- Do not rely exclusively on emulated mobile viewport testing.
- Cross-reference existing performance findings instead of rediscovering them without context.
- Clearly separate observed failures from plausible platform risks.
- Avoid unrelated refactors.