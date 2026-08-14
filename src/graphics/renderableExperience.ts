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
 * An extra pass drawn on top of the frame, with a cleared depth buffer.
 *
 * The corner logo is the only one. It is application chrome rather than part of
 * either experience (ADR 002), and the pipeline needs the same four things from
 * it that it needs from an experience plus a clock and a readiness flag.
 */
export interface OverlayPass {
  readonly scene: THREE.Scene
  readonly camera: THREE.Camera
  /** False while still loading; the overlay is skipped and its clock does not advance. */
  isDrawable(): boolean
  update(delta: number): void
}

/**
 * Which path a frame takes through the pipeline.
 *
 * `composer` is the post-processed path: bloom, then the warp's afterimage,
 * then OutputPass. `direct` goes straight to the canvas and keeps the MSAA that
 * `antialias: true` provides, which the composer's HalfFloat targets do not
 * carry. `direct-composited` is the direct experience borrowed through the
 * composer for the duration of a warp (ADR 005) — the one case where the smear
 * is worth more than the antialiasing.
 *
 * The choice belongs to whoever knows which experience is showing and whether a
 * transition is playing, which is orchestration — not to the pipeline, which
 * used to decide it by comparing an experience id against a string literal and
 * reading a transition progress value out of the intro's sequence state.
 */
export type RenderRoute = 'composer' | 'direct' | 'direct-composited'

/**
 * Everything the pipeline needs to know about the frame it is about to draw.
 *
 * Read through a callback rather than passed as props: these change every frame
 * during a warp, and a prop that changes every frame is a React render every
 * frame. The application already keeps this state in a mutable object for
 * exactly that reason; this is the seam that lets the pipeline read it without
 * knowing what it is.
 *
 * Numbers, not concepts. The pipeline previously imported the intro's config
 * and its sequence state and worked out the blur itself — which meant shared
 * infrastructure knew that a warp existed, that it had a progress value, and
 * which of two blur sources won.
 */
export interface FrameSettings {
  route: RenderRoute
  /** 0..1. How strongly this frame accumulates into the previous one. */
  motionBlur: number
  /** Afterimage damp at full blur. */
  afterimageDampMax: number
  /** Zero disables the bloom pass entirely, which is what reclaims its cost. */
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number
}
