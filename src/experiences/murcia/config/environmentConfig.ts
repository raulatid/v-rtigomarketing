/**
 * Environment-scoped configuration.
 *
 * One of these per user-facing environment. Nothing here is global: the shell
 * passes an EnvironmentConfig to the environment that owns it, so a second
 * environment can be added without promoting anything to a singleton
 * (docs/plans/002 Amendment A5).
 *
 * Terminology, per Amendment A: "environment" is a user-facing place;
 * "Scene" is reserved for THREE.Scene, of which there is exactly one.
 */

/** Axis-aligned rectangle on the world XZ plane. */
export interface BoundsRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Fixed camera pose relative to the navigation focus.
 *
 * The pose is expressed as angles plus a distance rather than a raw offset
 * vector, because the navigable area depends directly on elevation and FOV
 * (see docs/plans/002 Appendix A) and those are the values worth tuning.
 */
export interface CameraPoseConfig {
  /** Vertical field of view, degrees. */
  fov: number;
  /** Angle above the horizon, degrees. Lower reads less isometric. */
  elevationDegrees: number;
  /** Rotation around Y, degrees. 0 places the camera on the +Z side of focus. */
  azimuthDegrees: number;
  /** Slant distance from focus to camera, world units. */
  distance: number;
  /** Height above the ground plane that the camera aims at. */
  lookAtHeight: number;
  near: number;
  far: number;
}

/**
 * Feel for one navigation axis. The rendered value eases toward a target rather
 * than tracking the pointer exactly, so navigation reads as moving something
 * with mass instead of teleporting.
 *
 * Weight lives in the *drag*, not in a coast. Momentum after release was tried
 * and rejected — a view that keeps travelling once the pointer is gone reads as
 * a loss of control, not as mass — so `inertiaTimeConstant` is 0 and the release
 * constant is short enough that motion ends with the gesture.
 *
 * `smoothingTimeConstant` is coupled to `NavigationConfig.translationGain` and
 * the two must move together. The earlier design paired a gain of 0.5 with a
 * longer constant, on the reasoning that lag during a drag only reads as latency
 * while the grabbed ground is *expected* to stay under the cursor — and a gain
 * below 1 had already given that up. Pan is now grab-the-point at gain 1, so
 * that condition fires: the ground is expected to track the cursor exactly, the
 * lag is visible as `dragSpeed × smoothingTimeConstant` of slide, and the
 * constant came down to match. Restoring one without the other reintroduces the
 * complaint that prompted the change. See PROJECT_MEMORY, "Murcia's navigation".
 *
 * Pan and rotation no longer share a gesture, so their feels are no longer
 * deliberately matched — only translation's constant moved.
 */
export interface DragFeelConfig {
  /**
   * Seconds to close ~63% of the distance to the target while the pointer is
   * down. This is the tracking responsiveness, and with inertia off it is where
   * the smoothness comes from. 0 tracks exactly.
   */
  smoothingTimeConstant: number;
  /**
   * The same constant, applied once the pointer is released. Keep it short: the
   * target stops the instant the pointer does, so this is purely how long the
   * rendered value takes to catch up, and anything long reads as inertia even
   * with momentum disabled. Motion is effectively over after ~3x this.
   */
  releaseTimeConstant: number;
  /**
   * Seconds for release momentum to decay to ~37% of its speed.
   * 0 disables inertia, which is the shipped setting — see the note above.
   */
  inertiaTimeConstant: number;
  /**
   * Momentum below this speed is dropped, so the coast ends rather than creeps.
   * Unused while `inertiaTimeConstant` is 0.
   */
  minInertiaSpeed: number;
  /**
   * Upper bound on release speed, so a fast flick cannot fling the view.
   * Unused while `inertiaTimeConstant` is 0.
   */
  maxInertiaSpeed: number;
  /**
   * Blend factor, 0-1, for the running velocity estimate used at release.
   * Lower is steadier and shrugs off a single jittery pointer sample; higher is
   * more faithful to a late flick.
   */
  velocityBlend: number;
}

/**
 * Horizontal rotation of the camera about the navigation focus.
 *
 * A deliberate, dedicated gesture — right button on a mouse, two fingers on
 * touch — not one screen axis of the only drag. That separation is what lets
 * `degreesPerViewportWidth` be low: rotation is entered on purpose, so it can
 * afford to cost more travel, and it can no longer be triggered by accident
 * while panning.
 *
 * There is no vertical equivalent by design: elevation stays at the configured
 * pose, so the analysis the navigable area depends on (Appendix A) holds. That
 * is structural — no pitch input exists to clamp. With user zoom gone (`adr/009`),
 * distance is no longer user state either, so elevation and distance are BOTH
 * constant outside a focus flight — and a flight only ever moves inward.
 */
export interface RotationConfig {
  enabled: boolean;
  /**
   * Yaw swept by dragging across the full width of the viewport, degrees.
   *
   * Expressed per viewport width rather than per pixel so sensitivity does not
   * change with resolution or window size. Rotation is free and unbounded —
   * the value only sets how much drag a full turn costs. The touch path feeds
   * the two-finger centroid through the same mapping, so a turn costs the same
   * fraction of the screen on either input.
   */
  degreesPerViewportWidth: number;
  /**
   * Centroid travel required before two fingers turn anything, in CSS pixels.
   *
   * The two-finger path had no threshold of any kind: the first pixel of
   * centroid drift turned the city. One finger has had `touchDragThresholdPx`
   * since it learned that a resting finger must not move the world, and two
   * fingers need it MORE, not less — real thumbs are not symmetric, so every
   * two-finger gesture that is not a deliberate sideways sweep still drifts
   * the centroid by a few pixels.
   *
   * It is also what makes the centroid separable from the separation between
   * the fingers, which is a different signal and may one day want its own
   * meaning. Without a dead zone the two can never be told apart, because
   * rotation has already fired by the time there is any evidence to weigh.
   */
  twoPointerThresholdPx: number;
  /** Feel for the yaw axis. Speeds are degrees per second. */
  feel: DragFeelConfig;
}

/**
 * How close a controlled focus flight may bring the camera.
 *
 * This replaced `ZoomConfig`, and the difference is who holds the input rather
 * than what moves. There is no user-facing zoom any more (`adr/009`): the wheel
 * belongs to scene navigation and pinch does nothing. Distance is no longer user
 * state — it changes only when a flight takes the camera to a clickable object,
 * and it returns to rest when that closes.
 *
 * Only `distance` moves, still. Elevation, azimuth and FOV stay untouched because
 * those set the ground footprint the terrain skirt was sized against, and distance
 * is the only one of the four that can be moved safely — inward.
 *
 * Expressed as a multiplier of `CameraPoseConfig.distance` rather than in world
 * units, so changing the resting distance carries the floor with it instead of
 * silently moving it.
 *
 * THE DANGEROUS DIRECTION IS GONE. `maxDistanceScale` existed because zooming OUT
 * grows the viewport’s ground footprint and eats the skirt margin that keeps the hard
 * plate edge off screen — invisibly on 16:9, visibly on ultrawide. A flight may only
 * ever move inward, where the footprint shrinks, so that end no longer exists and
 * neither does the hazard. What remains is a floor, and it is not merely taste: below
 * distance ~60 the fixed `lookAtHeight` tilts the camera up, the effective pitch
 * collapses through the ~28 degree floor where the bounds maths degenerates, and the
 * footprint widens again (PROJECT_MEMORY, "The number that can hurt you").
 */
export interface FocusFlightConfig {
  /**
   * Closest approach, as a multiple of the resting distance. A per-district
   * target may not go below this — `DistrictSceneBinding.focusDistanceScale`
   * is clamped against it rather than trusted.
   */
  minDistanceScale: number;
  /**
   * Seconds to close ~63% of the distance when a flight hands the rig back and
   * the controller adopts whatever distance it was left at. Distinct from the
   * flight’s own closed easing curve, which has a known endpoint and duration.
   */
  smoothingTimeConstant: number;
}

export interface NavigationConfig {
  enabled: boolean;
  /** Screen-space movement before a mouse or pen sequence becomes a drag. */
  dragThresholdPx: number;
  /**
   * The same threshold for touch, and it is a second number rather than a
   * retune of the first. A finger wanders 5–15px between contact and release
   * while a physical click barely moves a cursor, so one value cannot serve
   * both — see DECISIONS.md section 17, which states the rule, and
   * `interactionConfig.ts`, where Earth has carried the pair since the touch
   * work landed.
   */
  touchDragThresholdPx: number;
  /**
   * Multiplier on the pan solve. 1 makes the ground track the cursor exactly —
   * the grabbed point stays under the pointer, in both axes.
   *
   * 1 is the shipped value and it is the *point*: pan is grab-the-point, which
   * is a definition rather than a taste. Below 1 the grabbed point slides
   * behind the cursor and the gesture stops being a map, which is the complaint
   * that prompted the rework. The knob is retained only so `?dragGain=` can put
   * the old feel back for comparison. See PROJECT_MEMORY, "Murcia's navigation".
   */
  translationGain: number;
  /**
   * Feel for panning the focus across the ground. Speeds are world units per
   * second. Coupled to `translationGain` — see DragFeelConfig.
   */
  feel: DragFeelConfig;
  rotation: RotationConfig;
  /** Y of the horizontal plane that pointer rays are projected against. */
  groundPlaneHeight: number;
  /**
   * Area the navigation focus may move within, before footprint insets.
   * Used as-is when `deriveBoundsFromTerrain` is false, and as the fallback
   * when the terrain plate cannot be located.
   */
  bounds: BoundsRect;
  /**
   * Derive the navigable area from the terrain plate measured at load, inset by
   * `boundsInset`, instead of trusting the configured rectangle.
   *
   * Strongly preferred: hardcoded world coordinates silently drift the moment
   * the model is re-exported, and a mismatch here shrinks the navigable area
   * without any visible error.
   */
  deriveBoundsFromTerrain: boolean;
  /** Inset applied to the measured plate. 0 makes the whole model navigable. */
  boundsInset: number;
  /** Extra inset applied after the viewport footprint, world units. */
  edgeSafetyMargin: number;
  /**
   * Upper bound on how far a viewport corner ray may be considered to reach
   * across the ground plane. Prevents near-horizon rays from producing an
   * effectively infinite footprint (docs/plans/002 Phase 4).
   */
  maxGroundDistance: number;
}

export interface TerrainTransitionConfig {
  enabled: boolean;
  /**
   * Name of the terrain plate mesh. Note the Blender export contract names
   * (TERRAIN_VISUAL etc.) are absent from the current asset — see Appendix A.
   */
  terrainObjectName: string;
  /** How far the skirt extends beyond the plate, world units. */
  width: number;
  /** Concentric loops across the skirt. More loops = smoother gradient. */
  loops: number;
  /** Subdivisions along each side of the rectangle. */
  segmentsPerSide: number;
  /**
   * Fraction of `width` over which the fade completes. Below 1 the gradient is
   * narrower than the geometry, so the skirt can reach far enough to stay out
   * of frame without the fade itself becoming a huge wash.
   */
  fadeEndFraction: number;
  /** How far the inner edge tucks under the plate, to avoid a hairline gap. */
  innerOverlap: number;
  /** How far below the sampled plate edge the skirt sits, to avoid z-fighting. */
  verticalOffset: number;
  /** Exponent applied to the fade curve. >1 holds opacity longer near the plate. */
  fadeExponent: number;
}

/**
 * Scene-level state. Owned and applied by the shell, never set directly by
 * environment code: with one shared THREE.Scene these leak across environments,
 * and fog in particular affects every material in the Scene
 * (docs/plans/002 Amendment A3).
 */
export interface SceneStateConfig {
  backgroundColor: number;
  fog: { color: number; near: number; far: number } | null;
  /**
   * Light rig parameters. Keep the light count and types identical across
   * environments — changing them invalidates every material's shader program
   * and stalls at exactly the moment of a transition (Amendment A3).
   */
  lighting: {
    hemisphere: { sky: number; ground: number; intensity: number };
    directional: { color: number; intensity: number; position: [number, number, number] };
  };
}

export interface EnvironmentConfig {
  id: string;
  modelPath: string;
  sceneState: SceneStateConfig;
  camera: CameraPoseConfig;
  /**
   * Pose overrides applied when the viewport is narrower than
   * `portraitAspectThreshold`. Null means one pose serves every viewport,
   * which is the preferred outcome (docs/plans/002 Phase 5).
   */
  cameraPortraitOverrides: Partial<CameraPoseConfig> | null;
  portraitAspectThreshold: number;
  navigation: NavigationConfig;
  /**
   * The only thing left that changes camera distance. See FocusFlightConfig.
   */
  focusFlight: FocusFlightConfig;
  terrainTransition: TerrainTransitionConfig;
  /**
   * Approximate bounds of meaningful content. Distinct from the navigable area
   * and from the visual extent, which is derived at runtime from the terrain
   * plate plus the transition skirt.
   */
  /**
   * Closest the warp dolly may bring the camera, in the same units as
   * camera.distance.
   *
   * Environment data, not transition data: how close you can get to THIS
   * city before its ground footprint stops shrinking is a property of its
   * pose and its terrain skirt. The transition only supplies a 0..1 amount.
   */
  warpCloseDistance: number;

  /**
   * The pose the warp departs to when LEAVING this environment, reached at the
   * cut. Same units as `camera.distance` and `camera.elevationDegrees`.
   *
   * Environment data for the same reason `warpCloseDistance` is: which way a
   * city can afford to be left is a property of its terrain skirt. Distance
   * alone cannot carry a departure — pulling back widens the ground footprint,
   * which is the one thing the skirt cannot absorb — so the departure rises
   * instead. Steepening the elevation shrinks the footprint faster than the
   * extra distance grows it (see murciaConfig for the arithmetic), which is
   * what makes a receding departure affordable at all.
   */
  warpDepartDistance: number;
  warpDepartElevationDegrees: number;

  contentBounds: BoundsRect;
  initialFocus: { x: number; z: number };
}

/** Resolves the pose for a viewport, applying portrait overrides if configured. */
export function resolveCameraPose(
  env: EnvironmentConfig,
  aspect: number,
): CameraPoseConfig {
  if (env.cameraPortraitOverrides === null || aspect >= env.portraitAspectThreshold) {
    return env.camera;
  }
  return { ...env.camera, ...env.cameraPortraitOverrides };
}
