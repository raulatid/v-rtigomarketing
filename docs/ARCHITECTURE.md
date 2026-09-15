# Architecture

## Current ownership map (2026-09-15, audit stage 3)

- Application navigation owns a stable mutable channel created by
  `app/navigation/continuousState.ts`. Experiences receive read-only views of
  its transition, zoom and approach signals through props. The shared contract
  is `interaction/navigationSignals.ts`; it creates no state.
- Earth owns only its intro phase, intro overlays, motion blur and orbit reveal
  in `experiences/earth/config/sequenceState.ts`. Hint permission is supplied
  separately by the application and combined with the live intro phase.
- The audit panel owns the desired camera composition in `app/auditView.ts`.
  Earth receives a read-only `AuditComposition` prop; it neither imports the
  application nor decides the panel's state.
- Shared build/debug policy lives in `platform/buildFlags.ts`. Earth prototype
  parameters live in `experiences/earth/config/`.
- Murcia's R3F adapter lives at `experiences/murcia/MurciaLayer.tsx`; the logo
  adapter and its minimal timeline handle live in `corner-logo/`.
- `checks/architecture.ts` forbids all experience imports into `app/`, as well
  as application/experience dependencies from platform infrastructure.

These boundaries preserve mutable per-frame reads, lazy loading, renderer
ownership and the existing experience lifecycles. See
[stage 3](plans/029-architecture-audit-stage-3.md) for validation.

## 1. Purpose

This document defines the high-level architecture of the VertigoSEO interactive web experience.

The application contains multiple WebGL-driven experiences with different responsibilities and interaction models. The current primary experiences are:

- Earth Intro
- Murcia City

The architecture must allow both experiences to coexist within the same application without creating hidden coupling, duplicated runtime ownership, uncontrolled rendering work, or unnecessary complexity.

This document describes the system boundaries, ownership rules, lifecycle model, dependency direction, rendering responsibilities, asset architecture, and architectural invariants that must be preserved as the project evolves.

Implementation details may change. The architectural boundaries defined here should change only through an explicit architectural decision.

---

# 2. Architectural Goals

The system should optimize for:

1. Clear ownership
2. Low cognitive complexity
3. Explicit lifecycle management
4. Strong boundaries between experiences
5. Deterministic WebGL resource management
6. Predictable application state
7. High rendering performance
8. Reusable infrastructure without premature abstraction
9. Safe incremental evolution
10. Production reliability

The application should remain understandable as additional interactions, scenes, transitions, and content are introduced.

---

# 3. System Model

The application is divided into three conceptual layers:

```text
Application
│
├── Application Orchestration
│
├── Experiences
│   ├── Earth
│   └── Murcia
│
├── Content              copy and the shapes it takes — src/content/
│
└── Shared Infrastructure
    ├── Graphics
    ├── Assets
    ├── Platform
    └── Utilities
```

**Content is a layer, not a folder inside an experience.** Case studies belong to Earth and
district copy belongs to Murcia, and section 17 forbids either experience importing the other,
so a vocabulary both sides need has nowhere else it can legally live. `src/content/` is leaf
infrastructure with the same standing as `utils/`: types, invariants, and the generated
collections.

**The content build is not part of the application at all.** It lives at the repository root in
`content/` and runs in Node before the bundler does, emitting `src/content/generated/`. The
arrow points `content/ → src/content/` and never back — anything `src/content/` reached for
would be bundled for Node by esbuild, which is how `fetch`, `fs` or a DOM global would arrive
somewhere none of them exist. See `adr/010`.

The fundamental dependency direction is:

```text
Application orchestration
        ↓
Experiences
        ↓
Shared infrastructure
```

Lower-level infrastructure must not depend on higher-level experiences.

Earth and Murcia must not directly depend on each other.

---

# 4. Application Lifecycle

The current high-level experience flow is conceptually:

```text
BOOT
  ↓
LOAD
  ↓
EARTH INTRO
  ↓
TRANSITION
  ↓
MURCIA EXPERIENCE
```

The application layer owns this progression.

Individual experiences must not independently decide when another experience is mounted, started, paused, or destroyed.

Experience transitions belong to application orchestration.

---

# 5. Application Orchestration

The application layer coordinates the runtime but must remain unaware of scene-specific Three.js implementation details.

Its responsibilities include:

- Application startup
- High-level state transitions
- Experience activation
- Experience deactivation
- Transition coordination
- Fatal application errors
- Global visibility lifecycle when required
- Ownership of application-level UI state
- Coordination of the rendering surface where applicable

Conceptually:

```text
ExperienceController
 ├── Boot
 ├── Loading
 ├── Earth
 ├── Transition
 └── Murcia
```

The exact implementation may differ, but orchestration must remain conceptually separate from rendering and scene-specific behavior.

The application controller should communicate with experiences through small lifecycle-oriented interfaces.

---

# 6. Experience Boundary

Each major WebGL section is an independent experience.

Current experiences:

```text
experiences/
├── earth/
└── murcia/
```

Each experience owns its domain-specific behavior.

## Earth owns

Examples include:

- Earth scene composition
- Earth-specific camera behavior
- Intro animation sequencing
- Satellite behavior
- Earth-specific loading coordination
- Earth-specific transitions and visual effects
- Intro-specific timelines

## Murcia owns

Examples include:

- Murcia scene composition
- Navigation behavior
- Navigation limits
- Camera positioning
- Drag-based movement
- Interaction probing
- District and building interaction
- Focus/fly-to behavior
- Murcia-specific scene state

Scene-specific behavior must remain inside its experience unless a genuinely shared responsibility is demonstrated.

---

# 7. Experience Lifecycle

Experiences must expose an explicit lifecycle.

A conceptual lifecycle is:

```text
created
   ↓
mounted
   ↓
loaded
   ↓
active
   ↓
inactive
   ↓
destroyed
```

A possible interface is:

```ts
interface Experience {
  mount(): void | Promise<void>
  start(): void
  pause?(): void
  resume?(): void
  destroy(): void
}
```

This is a conceptual contract, not a mandatory exact interface.

**The two experiences implement it differently, and that is intended.** Murcia is a class
with `load()`/`setActive()`/`dispose()`, because it was migrated from a standalone prototype
that owned its own renderer and frame loop. Earth is an R3F component tree, so React owns its
lifecycle: mounting *is* rendering it, and pausing *is* the `active` prop that every one of
its layers already gates its own per-frame work on. Wrapping that in a class to make the two
look alike would be a shallow module forwarding a boolean React already delivers (PRINCIPLES
§4, §13), and §12 is explicit that Earth and Murcia may differ where they genuinely do.

What both must have is a single boundary the application mounts, rather than the application
knowing an experience's internal composition.

The actual API should remain as small as possible while correctly representing the lifecycle.

Experiences must not rely on undocumented invocation order.

If a lifecycle constraint is required, it should be represented by the design rather than only by convention.

---

# 8. Ownership

Every long-lived mutable resource must have one clear owner.

Ownership must never be ambiguous.

Important resources include:

- WebGLRenderer
- Canvas
- Scene
- Camera
- Controls
- Render loop
- Event listeners
- Resize observers
- Timers
- Animation timelines
- Asset loaders
- Application state
- Experience state
- GPU resources
- Render targets

The module that creates or explicitly acquires ownership of a resource is responsible for its lifecycle unless ownership is deliberately transferred.

Ownership transfer must be obvious from the interface.

---

# 9. Canvas Ownership

The application should prefer a single rendering surface when Earth and Murcia do not require simultaneous independent rendering.

Conceptually:

```html
<canvas id="experience"></canvas>
```

A single canvas reduces unnecessary WebGL contexts and simplifies transitions between experiences.

If multiple canvases become necessary, the architectural reason must be documented.

Canvas ownership belongs at the application or rendering-infrastructure level unless an experience-specific requirement justifies otherwise.

---

# 10. Renderer Ownership

Renderer ownership must always be explicit.

The preferred architecture should evaluate reuse of a single `WebGLRenderer` when renderer configuration and lifecycle requirements are compatible across experiences.

A shared renderer is appropriate only when it does not force experiences to depend on each other's rendering assumptions.

Relevant renderer configuration includes:

- Output color space
- Tone mapping
- Exposure
- Pixel ratio
- Antialiasing
- Alpha
- Power preference
- Shadow configuration
- Clear color / transparency behavior

If experiences require incompatible renderer configurations, renderer isolation may be preferable.

Multiple simultaneous WebGL contexts should be avoided unless a concrete requirement justifies them.

---

# 11. Render Loop Ownership

Rendering-loop ownership must never be implicit.

The application must not accidentally accumulate:

```text
Application RAF
+
Earth RAF
+
Murcia RAF
```

without explicit coordination.

Only the intended active rendering loop should perform continuous frame work.

The architecture may use:

- One application-owned RAF
- One active experience-owned RAF
- `renderer.setAnimationLoop`
- Another explicitly documented mechanism

Whichever model is selected, the ownership and shutdown behavior must remain deterministic.

Inactive experiences must not continue rendering unless explicitly required.

---

# 12. Frame Work Policy

Code executed every frame is architecturally significant.

Per-frame operations must be justified.

Avoid placing work in the render loop when it can instead be:

- Event-driven
- Precomputed
- Cached
- Updated only when state changes
- Updated at a lower frequency

Performance-sensitive logic must remain visible and intentional.

---

# 13. Camera and Controls

Camera behavior belongs to the experience that defines its interaction model.

Earth and Murcia should not share camera controllers merely because both use Three.js cameras.

For example:

```text
Earth camera animation
```

and:

```text
Murcia navigation camera
```

represent different responsibilities.

They should remain independent unless a shared low-level primitive clearly reduces complexity without coupling their behavior.

Controls must be activated and deactivated according to the experience lifecycle.

No inactive experience may continue processing user input.

---

# 14. State Architecture

State should live at the lowest level that fully owns the responsibility.

State should be classified conceptually into:

```text
Application state
Experience state
Rendering state
UI state
Transient interaction state
```

## Application state

Examples:

- Current experience
- Transition state
- Global loading state
- Fatal application state

## Experience state

Examples:

- Murcia navigation state
- Current selected district
- Earth animation phase

Experience-specific state must not be promoted into global application state without a clear cross-experience requirement.

Global mutable state should be minimized.

---

# 15. Shared Infrastructure

Shared infrastructure exists to hide genuine cross-cutting complexity.

## Document motion policy

`src/platform/motionPreference.ts` owns one JavaScript reduced-motion snapshot
per document. The standalone intro captures the preference and hands it over
through `window.__vertigoIntro.reducedMotion`; no runtime import crosses the boot
boundary. The app entry captures that handoff before rendering. A cold blog has
no intro and captures its own preference in its entry.

Late-mounted panels, scene engines and warm route changes reuse that value.
Changing the system preference takes effect in JavaScript after a document
reload; it cannot switch a camera transition's implementation halfway through.
CSS media queries remain live. This defines when the preference is sampled;
each effect retains its existing reduced-motion behavior.

## Shared response and screen lifetimes

- `src/app/submissionResponse.ts` owns delivery confirmation, status fallback
  and field-message parsing for both form endpoints. Each transport still owns
  its payload, endpoint, timeout and request error handling.
- `src/experiences/murcia/screens/screenPlayer.ts` owns composition creation,
  carousel playback, first-slide readiness and disposal. `screenMesh.ts` owns
  mesh lookup and UV selection. Tower and campus adapters retain their defaults,
  palette policy, texture limits and material restoration behavior. Rendering
  primitives remain under `landmark/towerScreen/`; this stage does not relocate
  that engine.

## Graphics infrastructure

Potential shared responsibilities include:

```text
graphics/
├── renderer/
├── loaders/
├── disposal/
├── capabilities/
└── performance/
```

Typical candidates:

- Renderer configuration
- GLTF loader configuration
- Draco configuration
- KTX2 configuration
- Meshopt configuration
- GPU capability detection
- Resource disposal primitives
- Resize primitives
- Performance measurement
- Common asset-loading infrastructure

Alongside `graphics/`, and on the same terms:

```text
src/content/
├── types.ts          the shapes the UI consumes
├── invariants.ts     the bounds, as pure predicates
├── lookup.ts         resolution helpers
└── generated/        the collections — BUILD OUTPUT, gitignored
```

`invariants.ts` has two consumers on purpose: the vitest suites assert it against what shipped,
and the Node content build asserts it against what it is about to write. One definition, so a
bound cannot be relaxed in one place and quietly not the other. It is pure by rule — no Node
APIs, no DOM — because it is bundled for both.

Code should not become shared simply because it appears twice.

Shared modules must represent the same responsibility for all consumers.

---

# 16. Shared Module Constraints

A shared module must satisfy all of the following:

1. It represents one coherent responsibility.
2. Its consumers require the same semantics.
3. Its lifecycle requirements are compatible.
4. It hides meaningful implementation complexity.
5. It reduces total system complexity.
6. It does not expose experience-specific concepts.

The following are not sufficient reasons to create shared infrastructure:

- Similar filenames
- Similar method names
- Small duplicated code blocks
- Future hypothetical reuse
- Desire to reduce raw line count

Duplication is acceptable when the alternative is an incorrect abstraction.

---

# 17. Dependency Rules

Allowed conceptual dependencies:

```text
app → experiences
app → graphics
app → shared

experiences → graphics
experiences → shared

graphics → shared
```

Forbidden dependencies:

```text
earth → murcia
murcia → earth

graphics → earth
graphics → murcia

shared → earth
shared → murcia

content → earth
content → murcia
content → app
content → graphics
```

`src/content/` is leaf infrastructure. It carries copy and the shapes copy takes; who renders it,
where on a globe it appears and what it costs to upload are all somebody else's concern.

Experience-independent infrastructure must never import experience-specific implementation.

Circular dependencies are prohibited.

**These rules are enforced, not merely documented.** `checks/architecture.ts` asserts them
against the real import graph and runs as part of `npm run check`. It exists because two of
them had already been broken — `graphics → murcia` for several phases, and `corner-logo →
earth` — and both were found by reading the code rather than by anything failing. A rule that
only lives in this file is a rule the code will drift past. Adding one there is cheap;
removing one should require the same argument as changing this document.

## What the import graph cannot tell you

These rules are about *direction*, and there is a second constraint they are structurally unable
to express: **which chunk a legal import lands a module in.**

Rollup places a module imported by two chunks into the chunk they share — for this app, the
budgeted entry — and re-exports it. So a module can satisfy every rule above and still drag its
whole transitive value graph into a bundle with a hard size limit. That is not hypothetical:
`orbitConfig.ts` re-exported the case-study content, `useMasterTimeline` imported one *number*
from it, and every word of Spanish prose was pinned inside the 320,000 B entry chunk as a result.
Nothing was violated. The build was simply 8 KB from failing.

The rule that follows is a design one, not a graph one: **a module shared across a chunk boundary
should carry only what both sides need.** `orbitConfig.ts` holds numbers; the content it used to
re-export is imported directly by the scene code that consumes it.

The measurement, not the reasoning, is what settles this — `VERTIGO_SKIP_BUDGETS=1 npx vite build`
prints every chunk's size and imports, and `vite.config.ts` fails the build on the budget.

---

# 18. Asset Architecture

Runtime assets must be treated as part of the application architecture.

The asset pipeline is conceptually:

```text
Source assets
     ↓
Authoring / Blender
     ↓
Export
     ↓
Optimization
     ↓
Runtime assets
     ↓
Application loading
```

Source assets and runtime assets are different concepts.

Runtime assets should be optimized specifically for WebGL delivery.

Potential runtime techniques include:

- GLB / glTF
- Geometry compression
- Meshopt
- Draco where justified
- KTX2 / GPU texture compression
- Baked textures
- Texture atlases
- Trim sheets
- Shared materials
- Instancing

The exact technique depends on visual and performance requirements.

---

# 19. Asset Ownership

Assets must belong clearly to:

```text
Earth
Murcia
Shared
```

Experience-specific assets should remain inside their respective domain whenever practical.

Only assets genuinely reused by multiple experiences belong in shared asset infrastructure.

Asset URLs must be production-safe and must not rely on accidental development-server behavior.

Decoder and loader paths must work after the production build.

---

# 20. Loading Architecture

Asset loading must expose meaningful high-level state rather than leaking loader implementation throughout the application.

Consumers should not need to know unnecessary details about:

- Decoder initialization
- Loader configuration
- Internal cache behavior
- Low-level progress plumbing

Loading infrastructure should encapsulate these mechanics when doing so reduces complexity.

Loading progress displayed to users must represent actual loading behavior rather than arbitrary simulated completion.

Animation may impose a minimum visual duration, but it must not falsely indicate that required assets are ready before they are actually available.

---

# 21. Resource Disposal

Three.js resources have explicit lifetimes.

Experience destruction must correctly release all owned resources.

This may include:

- Event listeners
- Resize observers
- RAF callbacks
- Timers
- GSAP timelines
- Controls
- Geometries
- Materials
- Textures
- Render targets
- Helper objects
- Scene references
- Cached temporary resources

Shared resources must not be disposed while still owned by another active consumer.

Disposal responsibility must follow ownership.

---

# 22. Visibility Lifecycle

The application should avoid unnecessary rendering when the page is not visible.

Visibility behavior must be coordinated with:

- Render loops
- Animation timelines
- Controls
- Expensive simulation
- Time-based interpolation

Pause/resume behavior must not create duplicate RAF loops or restart timelines incorrectly.

---

# 23. Error Model

Errors should be handled according to their scope.

Conceptual categories:

## Fatal application errors

Examples:

- Required WebGL capability unavailable
- Critical application boot failure

## Experience-level fatal errors

Examples:

- Required scene asset cannot be loaded
- Required scene initialization fails

## Recoverable errors

Examples:

- Optional visual asset unavailable
- Non-critical enhancement failure

## Development invariant violations

Examples:

- Starting an already active rendering loop
- Destroying a resource with invalid ownership
- Entering an impossible lifecycle state

Errors must not be silently swallowed.

Fallback states must only exist if they are actually implemented.

---

# 24. Performance Architecture

Performance is a product requirement and therefore an architectural concern.

The system should prioritize:

- Stable frame time
- Low unnecessary CPU usage
- Controlled GPU workload
- Low WebGL context count
- Reasonable VRAM usage
- Efficient network delivery
- Predictable startup behavior

Prefer techniques such as:

- GPU instancing
- Geometry reuse
- Material reuse
- Texture atlases
- Trim sheets
- Baked lighting where appropriate
- Static data preprocessing
- Compressed runtime assets
- Controlled device pixel ratio
- Event-driven updates

when they improve measured performance without introducing disproportionate complexity.

---

# 25. Measurement Before Optimization

Performance decisions should be driven by evidence.

Relevant metrics include:

```text
Frame time
CPU time
GPU time
Draw calls
Triangles
Texture memory
GPU memory
Asset size
Network transfer
Startup time
WebGL context count
```

Do not introduce architectural complexity solely for hypothetical performance benefits.

---

# 26. UI and WebGL Separation

DOM/UI logic and WebGL scene logic should remain conceptually distinct.

The UI may communicate user intent to an experience.

An experience may expose high-level state to the UI.

Neither side should require unnecessary knowledge of the other's implementation.

Prefer domain-level communication over direct manipulation of internal scene objects.

---

# 27. Interaction Architecture

Interaction systems should expose intent rather than low-level mechanics.

Prefer conceptual operations such as:

```text
focusDistrict(id)
selectService(id)
enterExperience()
```

over exposing chains of camera coordinates, interpolation parameters, raycasting implementation, or scene-node manipulation to external consumers.

Raycasting and interaction probing belong inside the experience or a sufficiently deep interaction module.

---

# 28. Module Design

Modules should hide complexity.

A module is preferred when it provides:

```text
small interface
+
substantial implementation
```

Avoid shallow modules whose interfaces expose nearly all internal mechanics.

Splitting a large file into many small files is not automatically an architectural improvement.

The relevant question is whether the amount of knowledge required by consumers decreases.

---

# 29. Architectural Invariants

The following constraints must remain true unless explicitly changed through an architectural decision:

- Earth and Murcia do not directly depend on each other.
- Application orchestration owns experience transitions.
- Experience-specific state remains inside its experience unless genuinely global.
- Renderer ownership is explicit.
- Canvas ownership is explicit.
- Render-loop ownership is explicit.
- No uncontrolled permanent RAF loops exist.
- Inactive experiences do not perform unnecessary rendering.
- Shared infrastructure does not depend on an experience.
- GPU resource ownership is deterministic.
- Resource disposal follows ownership.
- Scene-specific controls cannot remain active after experience deactivation.
- Runtime asset paths must remain production-safe.
- Shared modules are created only for genuine shared responsibilities.
- Performance-sensitive work must be intentional and measurable.
- Architectural decisions must not be changed silently during unrelated feature work.

---

# 30. Architectural Changes

A change should be treated as architectural when it modifies any of the following:

- Dependency direction
- Experience boundaries
- Renderer ownership
- Canvas ownership
- Render-loop ownership
- Application lifecycle
- Global state ownership
- Asset architecture
- Shared infrastructure responsibilities
- Resource lifecycle
- Major performance strategy

Such changes should not be introduced incidentally during a local implementation task.

---

# 31. Architecture Decision Records

Significant architectural decisions should be documented separately under:

```text
docs/adr/
```

Examples:

```text
001-renderer-and-scene-ownership.md    007-loading-has-a-deadline.md
002-single-render-pipeline.md          008-the-pipeline-draws-a-contract.md
003-experience-lifecycle.md            009-navigation-is-a-gesture.md  (§4 reversed by 012)
004-transition-and-prefetch.md         010-content-is-generated-at-build-time.md
005-warp-transition.md                 011-the-cms-is-sanity.md
006-the-return-is-an-ascent.md         012-touch-navigates-by-pinching-the-world.md
```

An ADR should capture:

- Context
- Problem
- Alternatives considered
- Decision
- Trade-offs
- Consequences

`ARCHITECTURE.md` describes the current architecture.

ADRs explain why important architectural decisions were made.