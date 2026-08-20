# Mobile Responsiveness & Device Compatibility Audit

## Context

This project is no longer a desktop-only prototype. It is intended to be the production website, and the complete experience must remain usable, visually coherent, and technically stable on mobile devices.

The application combines:

- A Three.js / React Three Fiber interactive 3D environment
- Camera navigation and transitions
- Pointer / interaction systems
- UI overlays and informational content
- Responsive page-level UI
- Potentially expensive rendering and post-processing
- Desktop-oriented interactions that may not translate directly to touch devices

The goal of this task is NOT simply to check whether CSS media queries exist.

The goal is to determine whether the complete application has actually been designed to behave correctly on mobile devices.

This is primarily an audit and architecture task.

Do not make broad speculative changes before establishing what is actually wrong.

---

# Primary Objective

Audit the entire application from the perspective of a real mobile user and identify anything that:

1. Breaks visually on smaller screens.
2. Becomes difficult or impossible to use with touch input.
3. Assumes desktop viewport dimensions.
4. Assumes mouse, hover, keyboard, or precise pointer input.
5. Produces incorrect camera framing or 3D navigation on mobile aspect ratios.
6. Causes excessive rendering or loading cost on mobile hardware.
7. Behaves incorrectly after resize or orientation changes.
8. Creates inaccessible or impractical mobile UI.
9. Uses implementation patterns likely to fail on common mobile browsers.
10. Has never explicitly been designed for a mobile execution path.

The audit must include both the DOM/UI layer and the 3D/WebGL layer.

---

# Phase 1 — Establish the Mobile Surface Area

Before testing individual bugs, map the parts of the application affected by mobile constraints.

Identify:

- Main application shells/layouts
- Navigation
- Overlay UI
- Modals/panels
- HUD elements
- Buttons and interactive controls
- Loading screens
- Error/fallback screens
- Debug UI that could accidentally ship
- Canvas/container sizing
- Camera configuration
- Camera transition system
- Pointer/touch interaction systems
- Raycasting
- Scroll handling
- Gesture handling
- Post-processing pipeline
- Device-pixel-ratio configuration
- Resize listeners
- Asset loading
- Responsive hooks/utilities
- CSS breakpoints
- Any code branching on viewport dimensions, pointer type, user agent, or device capabilities

Produce a short architecture map explaining how mobile behaviour is currently determined.

---

# Phase 2 — Responsive UI Audit

Inspect the entire DOM/UI layer for assumptions that work on desktop but fail at narrow widths.

Specifically inspect:

## Layout

Look for:

- Fixed pixel widths
- Large `min-width`
- Absolute positioning tied to desktop coordinates
- Fixed heights
- Elements escaping the viewport
- Accidental horizontal scrolling
- Overlapping UI
- Content clipping
- Incorrect stacking contexts
- `overflow: hidden` masking layout problems
- Panels that cannot fit vertically
- Elements positioned relative to viewport dimensions without mobile handling
- Text blocks becoming too narrow or too wide
- Unsupported assumptions around landscape/portrait orientation

Test representative widths rather than one generic "mobile" resolution.

At minimum reason about:

- ~320 px width
- ~360–390 px width
- ~430 px width
- Mobile landscape
- Tablet-sized narrow layouts where relevant

## Typography

Check:

- Font sizes
- Line lengths
- Line wrapping
- Titles that overflow
- Controls whose labels wrap incorrectly
- Text becoming illegible over the 3D scene
- Excessive use of viewport-relative typography
- Whether browser text scaling could break layouts

## Interactive Targets

Verify that buttons and interactive elements:

- Are large enough for touch interaction
- Have sufficient spacing
- Do not require pixel-perfect input
- Do not overlap
- Remain reachable
- Remain visible while interacting with the scene

Flag controls designed around mouse precision.

---

# Phase 3 — Desktop Interaction Assumption Audit

Search explicitly for interaction semantics that assume a desktop device.

Audit:

- `mouseenter`
- `mouseleave`
- `mouseover`
- `mouseout`
- `mousemove`
- `mousedown`
- `mouseup`
- wheel events
- hover-dependent UI
- cursor-dependent state
- keyboard shortcuts
- right-click behaviour
- pointer lock
- drag behaviour

Determine whether each interaction has an equivalent touch interaction.

Pay special attention to Three.js / R3F pointer events and raycasting.

For each important interaction, answer:

- What happens with a mouse?
- What happens with a single finger?
- What happens when the user drags?
- What happens when the user taps quickly?
- Is tap distinguished correctly from camera dragging?
- Can an accidental camera movement trigger an object click?
- Can an object interaction prevent camera navigation?
- Are pointer cancellation events handled?
- Is multi-touch possible, and if so what does the application do?

Do not assume Pointer Events automatically make desktop interaction semantics mobile-safe.

---

# Phase 4 — 3D Camera and Framing Audit

This is a critical part of the audit.

Desktop camera composition may be incorrect on portrait screens even when the WebGL canvas itself resizes correctly.

Inspect:

- Camera FOV
- Camera aspect handling
- Target positions
- Camera destinations
- Cinematic transitions
- Orbit/navigation limits
- Interaction targets
- Scene framing
- Minimum/maximum distance constraints
- Hardcoded camera coordinates designed around desktop compositions
- Screen-space offsets
- Any calculation dependent on `window.innerWidth / innerHeight`

Determine whether important views remain compositionally correct at:

- Desktop landscape
- Mobile portrait
- Mobile landscape

For every major camera destination or interaction sequence, assess whether:

- The intended subject stays visible.
- The subject is hidden behind UI.
- The framing becomes excessively close.
- Important geometry leaves the screen.
- The camera clips through geometry.
- Navigation limits remain reasonable.

If the current architecture has no concept of responsive camera framing, explicitly identify this as an architectural issue rather than patching individual coordinates.

---

# Phase 5 — Canvas and Viewport Behaviour

Audit how the WebGL canvas reacts to:

- Initial page load
- Browser resize
- Orientation changes
- Mobile browser chrome appearing/disappearing
- Viewport height changes
- Fullscreen-like layouts
- Scrolling

Inspect use of:

- `100vh`
- `100vw`
- `svh`
- `lvh`
- `dvh`
- `window.innerHeight`
- `window.innerWidth`
- `visualViewport`
- ResizeObserver
- resize/orientation events

Determine whether canvas sizing can:

- Leave gaps
- Extend below the visible viewport
- Cause page bouncing
- Trigger unexpected scroll
- Resize repeatedly while browser chrome animates
- Produce incorrect camera aspect ratios

---

# Phase 6 — Mobile Rendering Cost Audit

Do not treat mobile as merely a smaller viewport.

Audit whether the rendering configuration scales appropriately to weaker GPUs and limited thermal budgets.

Inspect:

- Device pixel ratio
- MSAA / antialiasing
- Bloom
- Afterimage
- Other post-processing passes
- Shadow maps
- Render target dimensions
- Texture resolution
- Texture memory
- Environment maps
- Transparency / overdraw
- Draw calls
- Shader complexity
- Number of lights
- Animation loops
- Effects that execute even when visually disabled

Cross-reference the existing performance audit where relevant.

Particular attention should be given to the fact that the current renderer has already been identified as fill-rate-sensitive.

Determine whether mobile devices currently receive effectively the same expensive render pipeline as desktop.

Identify where capability-based or mobile-specific quality tiers would be justified.

Do NOT reduce visual quality indiscriminately.

Separate:

- Clearly unnecessary GPU work
- Sensible adaptive quality opportunities
- Changes that would noticeably alter the artistic direction

---

# Phase 7 — Asset and Network Cost

Audit first-load behaviour under mobile conditions.

Inspect:

- Initial binary payload
- GLB loading
- KTX2/Basis usage
- Draco usage
- Duplicate decoder downloads
- Large textures
- Asset loading concurrency
- Preloading
- Assets loaded before they are required
- Mobile-specific unnecessary assets
- Loading-state behaviour on slower networks

Reason about realistic mobile conditions, including high latency and slower connections.

Determine whether the application becomes usable progressively or requires nearly the entire scene to download first.

---

# Phase 8 — Orientation Changes

Explicitly audit portrait ↔ landscape transitions.

Check:

- Canvas dimensions
- Camera aspect
- Camera composition
- UI layout
- Fixed panels
- Interaction coordinates
- Raycasting
- Scroll state
- Render targets
- Post-processing buffers

Look for state that is initialized only once and therefore becomes stale after orientation changes.

---

# Phase 9 — Accessibility and Mobile Usability

This is not a full accessibility audit, but mobile usability must include basic accessibility constraints.

Check:

- Touch target size
- Contrast where UI overlays the scene
- Focusable interactive DOM elements
- Reliance on hover
- Reduced-motion support where appropriate
- Ability to understand interactive elements without a cursor
- Whether important content exists exclusively inside a difficult 3D interaction

Flag issues; do not redesign the site unless necessary.

---

# Phase 10 — Real Browser Validation

Where the available environment permits it, test the actual application at representative mobile viewport sizes.

Do not rely entirely on reading the source code.

Validate:

- Initial load
- Main navigation
- Scene interaction
- Camera navigation
- Content overlays
- Returning to previous states
- Resize
- Portrait/landscape
- Scroll
- Tap interactions

Screenshots should be captured for meaningful visual defects where useful.

---

# Required Output

Write the result to `docs/audits/reports/mobile-responsiveness-<YYYY-MM-DD>.md`, keeping the
`mobile-responsiveness-` prefix so every pass in this lineage sorts together beside
`mobile-responsiveness-2026-08-14.md`.

`docs/audits/` holds briefs — the audits that can be run. `docs/audits/reports/` holds the audits
that *were* run. Never write a report beside the briefs.

Before the report enters Git history it must satisfy the sanitization contract in
`docs/audits/README.md`: no credentials, secret values, personal data, authentication material,
raw production dumps, or exploit detail beyond the minimum reproduction. `npm run check:audit`
enforces the mechanical half and fails the build. The judgment calls are yours.

Screenshots are the usual way this contract gets broken here — a captured viewport can include a
real logged-in account, a customer name, or unpublished CMS copy. Check what is in the frame.

Open it with the header this directory uses:

```
**Date:** YYYY-MM-DD · **Against:** working tree at `<commit>`
**Brief:** `audits/mobile-responsiveness-device-compability.md`
```

If earlier passes exist, write the new one as a delta against them and say so in the header.
Earlier passes remain accurate for everything the new one does not restate, and where the two
disagree, the newer one wins. Never overwrite or delete a previous report — it is the record of
what was true at its commit.

Where a finding is platform-specific rather than a responsive-design problem, hand it to the iOS
brief and say so, rather than restating it here.

Create a report containing:

## 1. Executive Summary

State whether the application is currently:

- Mobile-ready
- Mostly mobile-compatible with specific defects
- Functionally usable but architecturally desktop-first
- Not safe to release as a mobile experience

Explain why.

## 2. Findings

Rank findings by severity:

### P0 — Release blocker
Broken functionality, unusable interaction, crashes, or inaccessible essential content.

### P1 — Major
Serious visual, usability, compatibility, or performance problem.

### P2 — Moderate
Noticeable issue that should be corrected.

### P3 — Minor
Polish, resilience, or maintainability issue.

Each finding must include:

- Evidence
- Relevant file(s)
- Relevant code path
- Affected viewport/device class
- User-visible consequence
- Root cause
- Recommended direction
- Estimated implementation complexity
- Whether the fix should be architectural or local

## 3. Mobile Architecture Assessment

Explain whether the current project has a coherent strategy for:

- Responsive UI
- Responsive 3D framing
- Touch interaction
- Adaptive rendering quality
- Viewport changes

If not, identify what abstraction should own each responsibility.

## 4. Implementation Plan

After completing the audit, propose an ordered implementation plan.

Prioritize:

1. Functional blockers
2. Interaction correctness
3. Camera/framing problems
4. Layout defects
5. Rendering stability/performance
6. Secondary polish

Avoid unrelated refactors.

---

# Constraints

- Do not redesign the visual identity.
- Do not simplify the 3D experience merely because the device is mobile.
- Do not introduce arbitrary device detection where capability detection or responsive behaviour is more appropriate.
- Do not create separate mobile and desktop applications.
- Prefer one coherent responsive architecture.
- Do not fix symptoms before determining the underlying ownership problem.
- Do not make large production changes during the audit unless required to validate a hypothesis.
- Distinguish measured problems from theoretical risks.
- Reference exact files and code paths.
- Preserve existing project architecture and engineering principles unless the audit demonstrates that a change is necessary.