import * as THREE from 'three'

/**
 * The whole of what the render pipeline needs to know about an experience.
 *
 * ARCHITECTURE.md §17 lists `graphics -> murcia` under forbidden dependencies
 * and §29 restates it as an invariant, but `RenderPipeline` imported
 * `MurciaExperience` and reached into `.scene` and `.viewCamera` directly. ADR
 * 001 and ADR 002 justify the single renderer and the single render authority;
 * neither grants an exemption from the dependency rule, so the edge was an
 * undocumented architectural change (PRINCIPLES §32).
 *
 * This is the contract that replaces it. It is deliberately two readonly
 * properties: the pipeline draws a scene with a camera, and everything else
 * about an experience — its lifecycle, its input, its bounds, its assets — is
 * none of the pipeline's business.
 *
 * Structural, so nothing has to implement it explicitly. `MurciaExperience`
 * already exposed both as getters and satisfies this unchanged; a future Earth
 * experience will satisfy it the same way, at which point the pipeline stops
 * having a special case at all.
 */
export interface RenderableExperience {
  /** The scene to draw. */
  readonly scene: THREE.Scene
  /** The camera to draw it with. Never another experience's — near/far differ. */
  readonly viewCamera: THREE.PerspectiveCamera
}

/**
 * Which path a frame takes through the pipeline.
 *
 * `composer` is the post-processed path: bloom, then the warp's afterimage,
 * then OutputPass. `direct` goes straight to the canvas and keeps the MSAA that
 * `antialias: true` provides, which the composer's HalfFloat targets do not
 * carry.
 *
 * The choice belongs to whoever knows which experience is showing, which is
 * orchestration — not to the pipeline, which used to decide it by comparing an
 * experience id against a string literal.
 */
export type RenderRoute = 'composer' | 'direct'
