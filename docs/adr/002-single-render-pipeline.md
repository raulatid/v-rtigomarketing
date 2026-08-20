# ADR 002 — A Single Render Pipeline

Status: **Accepted** — 2026-08-07 (written up 2026-08-07; the decision was implemented in P2)
Supersedes: the Earth prototype's "The 3D logo gets its own renderer" — see the `Superseded`
table in `docs/DECISIONS.md`

> Written late. The code referenced "ADR 002" from six places for several phases before this
> file existed. Recorded here as a caution: a citation to a document nobody wrote is worse
> than no citation, because it reads as though the reasoning was captured when it was not.

## Context

`starting-animation` shipped **two** `WebGLRenderer` instances:

1. R3F's, created by `<Canvas>`, with `MotionBlurPass` at `useFrame` priority 1 taking over
   `gl.render()` for the warp's `AfterimagePass`.
2. A second one inside `createCornerLogo.ts` — its own canvas at z-index 30, its own scene,
   camera, `THREE.Clock` and `requestAnimationFrame` loop, its own resize listener.

The second renderer was deliberate. The prototype's entry argued it gave the 3D logo depth
isolation without compositing into another scene's loop, and kept the two cameras from ever
being able to affect each other.

Merging Murcia in would have made it three contexts.

## Decision

**One `WebGLRenderer`, one canvas, one frame loop, one render authority.**

`graphics/RenderPipeline.tsx` is the only thing in the application that calls
`gl.render()` or `composer.render()`. Per frame, unconditionally:

1. The active experience — Earth through the `EffectComposer`, Murcia direct (ADR 001), or
   Murcia through the composer during a warp (ADR 005).
2. The corner logo, as an overlay pass with `autoClear = false` and an explicit
   `clearDepth()`.

`createCornerLogo` no longer creates a renderer, a canvas, a loop or a resize listener. It
takes the shared renderer and exposes `scene`, `camera`, `update`, `setSize`, `isDrawable`.

## Why the logo could give up its renderer

The isolation the second context provided is reproduced exactly:

- **Depth isolation** — the explicit `clearDepth()` before the overlay pass, rather than a
  separate depth buffer.
- **Camera isolation** — the logo's camera is still private to the module; nothing outside
  it can reach it.
- **Colour** — verified rather than assumed. three applies tone mapping and output colour
  space in-shader **only when the render target is null**, so the composer's targets stay
  linear and `OutputPass` converts once; the logo's direct-to-canvas draw then applies its
  own ACES + sRGB once. Neither is double-converted.
- **Resolution** — R3F's `<Canvas>` defaults to `dpr = [1, 2]`, identical to the logo's old
  explicit `Math.min(window.devicePixelRatio, 2)`.

## Consequences

- The logo moved **inside** the Canvas (`components/CornerLogoLayer.tsx`) because the
  shared renderer is only reachable there. Its refs stay owned by `App`, which needs
  `reset()` / `snapToCorner()` for replay and debug seeking.
- `reset()` no longer calls `renderer.clear()` — that would wipe the shared framebuffer.
- `dispose()` no longer touches the renderer or canvas; they belong to the application.
- The logo's GPU warm-up is still required. Its `MeshStandardMaterial` programs derive from
  *its* lights and defines, which no amount of Earth warm-up covers.
- **Accepted regression:** the logo composites at z-index 10 (the scene canvas) instead of
  30, so the CSS2D geo-tag layer at z 15 now paints above it where they overlap. The logo
  idles top-left and the tags sit on the globe, so overlap is unlikely, but it is a real
  change and is noted in `styles.css` at the layer-stack comment.
- The corner logo now persists across an experience transition for free, which is what
  makes it application chrome rather than part of Earth.

## Consequence discovered afterwards

Moving the logo inside the Canvas changed the **chunk graph**. three.js had been hoisted
into a shared chunk only because the logo's dynamic import was rooted at the app entry while
the scene's was rooted at `LazyScene` — two consumers forced the split. With one consumer,
Rollup inlined all 800 KB of three into the `SceneCanvas` chunk.

Caught by reading the emitted output, not by any assertion. Pinned back with an explicit
`manualChunks` for three in `vite.config.ts`, which is worth having on its own merits: three
is the one dependency that essentially never changes between deploys, so keeping it
separately hashed is what lets a returning visitor skip re-downloading it.
