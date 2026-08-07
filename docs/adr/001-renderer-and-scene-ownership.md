# ADR 001 — Renderer and Scene Ownership

Status: **Accepted** — 2026-08-07
Supersedes: the Murcia prototype's one-Scene rule (for the Earth↔Murcia boundary only). That
document has since been folded into `docs/PROJECT_MEMORY.md`; the clause is quoted below.

## Context

The unified application merges two working prototypes with incompatible runtime shapes:

- **Earth** (`starting-animation`) — React 19 + `@react-three/fiber` 9.6. R3F creates the
  `WebGLRenderer`, owns the frame loop, and reconciles the scene graph from JSX. On top of
  that, `MotionBlurPass` runs at `useFrame` priority 1, which means R3F stops calling
  `gl.render()` and that pass becomes the render authority. A *second* `WebGLRenderer`
  drives the corner logo on its own canvas with its own rAF.
- **Murcia** (`murcia-test`) — vanilla three. A `CityPrototype` class creates its own
  renderer, its own `THREE.Scene`, and runs its own `requestAnimationFrame`.

The two source documents disagreed on the target model:

- `docs/ARCHITECTURE.md` §17/§29 — Earth and Murcia must not depend on each other; shared
  infrastructure must not depend on an experience.
- The Murcia prototype's project memory — "one `WebGLRenderer`, one canvas, **one
  `THREE.Scene`**, two environments inside it, one active at a time."

## Problem

Can Earth and Murcia share a single `THREE.Scene`, as Murcia's memory mandates?

## Decision

**One canvas. One `WebGLRenderer` (R3F's). One frame loop (R3F's). One render authority.
But two separate `THREE.Scene`s.**

Both experiences stay permanently mounted. The transition swaps which scene the render
authority draws; nothing is created or destroyed at the moment of transition.

Murcia's §2.2 is superseded **only** on the "one Scene" clause, and **only** for the
Earth↔Murcia boundary. Its renderer/canvas/loop clauses are honoured exactly.

## Rationale

§2.2 was written when "the other environment" meant *another city* — two vanilla-three
worlds with identical lighting rigs. It was not written against a React-reconciled R3F
scene. Under the actual pairing, a shared Scene breaks on Murcia's own documented rules:

1. **§2.4 — "Detach from the graph; do not rely on `visible = false`."** A hidden root is
   still walked by raycasts, `Box3.setFromObject` and `traverse`. Murcia's
   `buildSceneReport`, `findLargestFlatMesh`, terrain-plate measurement and bounds
   derivation all traverse the Scene and would see Earth's nodes.
2. **§2.3 — lights and fog are Scene-global.** Earth contributes `AmbientLight(1.0)` +
   `DirectionalLight(1.8)`; Murcia contributes `HemisphereLight(1.4)` +
   `DirectionalLight(1.6)`. In one Scene they cross-light each other's world. §2.3 also
   requires light *count and type* to stay constant or every material's shader program is
   invalidated — merging two rigs violates that permanently, not just at the transition.
3. `ARCHITECTURE.md` §29 forbids exactly this coupling.

Two Scenes also serve the product requirement better. The user's priority is a transition
that never stalls. With separate scenes the inactive world is simply never passed to a
render call — strictly cheaper than toggling `visible` on a shared graph, which still
costs traversal.

## Consequences

- `RenderPipeline` (replacing `MotionBlurPass`) is the single `gl.render()` /
  `composer.render()` caller. It selects the active `(scene, camera)` pair each frame.
- **Murcia bypasses the `EffectComposer`.** Verified against three 0.174:
  `EffectComposer` builds its render target as
  `new WebGLRenderTarget(w, h, { type: HalfFloatType })` with no `samples`, so it has no
  MSAA. Earth already renders through it and that is its shipped behaviour, but routing
  Murcia through it would silently drop antialiasing on a city of hard-edged buildings.
  Murcia renders straight to the canvas and keeps its `antialias: true` MSAA.
  Tone mapping is *not* applied twice: three gates `outputColorSpace` and `toneMapping` on
  `currentRenderTarget === null`, so render targets are always linear and `OutputPass`
  applies ACES + sRGB exactly once.
- **Cameras are not shared.** Earth needs `near 0.1 / far 5000`, Murcia `near 1 / far 1200`,
  and each has its own per-frame writer. Murcia owns its own `PerspectiveCamera`.
- Peak VRAM holds both worlds at once. This is accepted; it is the cost of the no-hitch
  requirement and is bounded (Murcia is a 456 KB Draco GLB with zero textures).
- Murcia's `INTERACTION_LAYER = 1` no longer risks collision, since the two scenes are
  raycast independently. It should still become an allocated constant.

## Alternatives rejected

- **One Scene (literal §2.2).** Rejected for the three reasons above.
- **Renderer per experience.** Would have preserved both prototypes almost verbatim, but
  the user explicitly requires a single R3F renderer, and two contexts make the corner
  logo and the transition harder rather than easier.
- **Porting Murcia's logic into R3F JSX.** Unnecessary. Murcia's modules are already
  constructor-injected with no global access (§2.2's "hard rule"), so only `CityPrototype`'s
  *shell* duties dissolve. Rewriting the logic would invalidate the 77 assertions in
  `checks/`, which are the migration's only regression gate.
