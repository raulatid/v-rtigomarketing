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
   * Closest approach, as a multiple of the resting distance. The display
   * district's flight clamped its dolly against this; since the services campus
   * replaced it (plan 024) no flight reads it, and `check:footprint` and
   * `check:warp` keep it as the closest pose they prove.
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
  /*
   * `translationGain`, `touchTranslationGain`, `feel` and `rotation` were here,
   * along with the `DragFeelConfig` and `RotationConfig` types above.
   *
   * They were the map-pan controller's feel: a gain per pointer type and two
   * first-order time constants each for pan and yaw, plus the threshold at which
   * two fingers became a rotation. All of it went with `DragPanController`
   * (DECISIONS §44). The replacement is `camera/cameraTuning.ts` — one gain for
   * both pointer types, spring frequencies rather than time constants, and no
   * two-finger rotation left to threshold.
   *
   * What remains in this interface is deliberately NOT feel: where the viewer
   * may go, how far the frustum may reach, and the tap tolerances the districts
   * read.
   */
  /** Y of the horizontal plane that pointer rays are projected against. */
  groundPlaneHeight: number;
  /**
   * Area the navigation TARGET may move within.
   *
   * Authored rather than measured. It used to be derived from the terrain plate
   * at load when `deriveBoundsFromTerrain` said so, and then inset by the
   * camera's own ground footprint on every pose change; neither happens now.
   * See `murciaConfig`, where the rectangle and the reason for it live.
   */
  bounds: BoundsRect;
  /*
   * `extendedBounds` was here: the outer rectangle of DECISIONS §40's resistance
   * band, the A2 ring measured out of the GLB. It retired with §39 and §40 in
   * the camera-navigation port — there is one rectangle now, grown past the
   * authored plate by `boundsInset`, and the clamp against it is hard.
   */
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
  /**
   * The mesh the skirt WRAPS, when the model carries ground beyond the plate.
   *
   * Null means wrap the plate itself, which is what every version of this
   * before the 2026-09-04 city did: the plate was the whole world, and the
   * skirt existed to stop its hard edge being seen.
   *
   * With a surrounding ground the two jobs separate. The plate is still the
   * content — it is what navigation is bounded to and the one mesh that must
   * not get the trim sheet — but it is no longer the edge of anything, so
   * wrapping it would fade out the middle of the city. The skirt has to wrap
   * the OUTER ground instead, which is the only hard edge left.
   *
   * Resolved by the same three-spelling lookup as `terrainObjectName`, so a
   * miss degrades to wrapping the plate rather than to no skirt at all.
   */
  groundObjectName: string | null;
  /** How far the skirt extends beyond the plate, world units. */
  width: number;
  /**
   * How far the opaque collar extends beyond the plate, world units.
   *
   * Must stay well inside the skirt's fade (`width * fadeEndFraction`): the
   * collar is opaque, so ground still covered by it cannot fade toward the
   * background, and a collar reaching past the fade would leave the terrain
   * ending in a hard edge instead of dissolving.
   */
  collarWidth: number;
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
  /**
   * The terrain plate's base colour, and so the collar's and the skirt's, which
   * are clones of its material.
   *
   * The odd one out in this interface: `createScene` does not apply it, because
   * it is a material property of a mesh that does not exist until the GLB has
   * loaded — `applyTrimSheet` sets it, and only on the fabricated default. It
   * lives here anyway because it is an art value, and it is meaningless apart
   * from the background and the light rig it has to be judged against.
   */
  groundColor: number;
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

/**
 * Where the city's trim sheet is served from.
 *
 * Paths, not regions. Which band means brick and which means roof tile is an
 * authoring decision that lives in the .blend and in the sheet itself; the
 * runtime only ever loads an image and hands it to a material, and it must stay
 * that way — a region list in code would have to be kept in step with an artist
 * iterating in Affinity, by hand, forever.
 *
 * A null map is simply not loaded. All three null is the state before the first
 * sheet lands: the city renders untextured and nothing warns, because that is
 * not an error yet.
 *
 * The extension decides the loader (`loadTrimSheet`), so promoting the test PNG
 * to the production KTX2 set is an edit to these three strings.
 */
export interface TrimSheetConfig {
  baseColor: string | null;
  normal: string | null;
  /** Occlusion in R, roughness in G, metallic in B — the glTF packing. */
  orm: string | null;
}

/**
 * Where the city's baked light is served from.
 *
 * Files, not slots: the bake pipeline writes two manifests naming every atlas
 * per chunk and resolution, and the runtime reads those rather than carrying
 * a second copy of the list (`assets/lightmaps/`). Absent means the model is
 * not baked and renders lit, which is every city before murcia-v7 and what
 * the tests' untextured loads still get.
 */
export interface LightmapConfig {
  /** Directory the manifests and every KTX2 they name sit in. Trailing slash. */
  baseUrl: string;
  assetsManifest: string;
  groundManifest: string;
}

export interface EnvironmentConfig {
  id: string;
  modelPath: string;
  trimSheet: TrimSheetConfig;
  lightmaps?: LightmapConfig;
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

  /**
   * The far end of the viewer's own zoom band, reached at depth +1 (`adr/014`).
   *
   * Environment data for the same reason the two above are, and constrained the
   * same way: this is a pose a viewer can PARK at, indefinitely, so it has to be
   * at least as safe as the resting pose rather than merely survivable in
   * passing. It rises as it recedes for exactly the reason the departure does.
   *
   * Must stay inward of `warpDepart*` along the same arc, or a warp committed
   * from full zoom-out would begin by moving back toward the city.
   */
  zoomFarDistance: number;
  zoomFarElevationDegrees: number;

  /**
   * The near end of the zoom band, at depth -1, as a multiple of the resting
   * distance.
   *
   * A scale rather than a distance because it composes with a pose that a
   * portrait viewport is allowed to rewrite, and because it is the same quantity
   * `focusFlight.minDistanceScale` expresses. Elevation is untouched on this
   * half: flying in shrinks the footprint, so there is nothing to pay for.
   */
  zoomNearScale: number;

  contentBounds: BoundsRect;
  /**
   * The outer ground's XZ extent, or null when the plate is the whole ground.
   *
   * A measured mirror of the asset, in the same spirit as `contentBounds`, and
   * for one reader: the footprint harness runs in node with no GLB and no
   * loader. The runtime measures the real mesh instead — this is never what
   * places anything.
   */
  groundBounds: BoundsRect | null;
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
