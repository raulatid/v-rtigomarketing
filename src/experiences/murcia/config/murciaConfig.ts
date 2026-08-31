import type { EnvironmentConfig } from './environmentConfig';

/**
 * Murcia city environment.
 *
 * Every world-space number below is derived from the Phase 1 audit
 * (docs/plans/002 Appendix A), which measured the shipped GLB directly:
 *
 *   terrain plate `suelo-principal` (was `Plane.013` until the 2026-08-27
 *   re-export)                  X [-438.2, -86.4]   Z [120.5, 473.3]
 *   plate size                  351.8 x 352.8       Y [-1.15, 1.41]
 *   representative building     ~13 units           tallest landmark 45
 *   scale                       1 unit ~ 1 metre
 */

const PLATE = { minX: -438.2, maxX: -86.4, minZ: 120.5, maxZ: 473.3 };

/**
 * Inset from the plate to the area the focus may reach.
 *
 * Zero: the whole model is navigable, right out to the plate edge. That is only
 * safe because the transition skirt is sized to stay outside the viewport
 * footprint even at the extreme corners — the skirt, not the clamp, is what
 * keeps the hard edge out of frame.
 */
const NAVIGATION_INSET = 0;

/** Typical building height, used to derive look-at height. */
const REPRESENTATIVE_BUILDING_HEIGHT = 13;

/**
 * Camera pose. Chosen against the elevation/navigable-area analysis in
 * Appendix A:
 *
 *  - elevation 30 deg reads clearly less isometric than the previous 44 deg
 *    while staying above the ~28 deg floor at which the far frustum edge
 *    overshoots the plate and the bounds calculation degenerates.
 *  - distance 165 gives a camera height of 83 (165 * sin 30) against 13-unit
 *    buildings, still far closer than the original 551. Backed off in stages:
 *    90 framed ~84% of the plate width, 110 ~97%, and 165 stands further back
 *    again.
 *
 *    Each step spends skirt margin at the corners. At 110 the worst case
 *    (5120x1440, focus at a plate corner) had 40 units of margin; at 165 that
 *    same case went to -89, i.e. the plate edge on screen. terrainTransition.
 *    width below is sized for 165 *and* for free 360 deg yaw — measured, not
 *    estimated. Change this distance and re-run the azimuth sweep.
 *  - FOV 35 is mid-range for the 30-40 band the plan specifies. Proximity
 *    comes from the distance, not from a wide FOV.
 */
const ELEVATION_DEGREES = 30;
const CAMERA_DISTANCE = 195;

export const murciaConfig: EnvironmentConfig = {
  id: 'murcia',
  // Root-absolute: a document-relative path resolves against the current
  // route and 404s anywhere but the root.
  modelPath: '/models/city-prototype.glb',

  // The sheet in the tree is a CALIBRATION CHART, not art: eight saturated
  // 256px bands, there so the mechanism can be seen working before anyone has
  // painted anything. Replacing it is a file drop at the same path — that is
  // the whole reason the textures are served rather than exported into the GLB
  // (docs/plans/009 Phase 4).
  //
  // Normal and ORM are null until they exist. They are not placeholders waiting
  // to be filled in with something plausible: a wrong normal map is worse than
  // none, and the material simply omits the slot.
  trimSheet: {
    baseColor: '/textures/murcia/murcia-basecolor.png',
    normal: null,
    orm: null,
  },

  sceneState: {
    backgroundColor: 0x9fb4c7,
    // The ground, and with it the collar and the skirt cloned from it.
    //
    // It was left at the material default — white, albedo 1.0 — when the
    // fabricated materials were introduced, on the grounds that choosing a
    // colour was an art decision nobody had asked for. What that produced: a
    // flat +Y surface here receives 1.4 (hemisphere, full at this normal) +
    // 1.6 * 0.811 (directional) = 2.698 of irradiance, so Lambert puts the
    // plate at 2.698 / PI = 0.859 linear, which is 227/255 through ACES. The
    // floor was the brightest thing in the city and read as paper.
    //
    // 0x8a8f94 is 0.254 linear, so 0.218 radiance and about 155/255 on screen.
    // Retune against those numbers rather than by eye, and keep it under the
    // 0.62 bloom threshold Earth's composer thresholds at — the warp borrows
    // that composer, and the ground is what it would catch first.
    groundColor: 0x8a8f94,
    // Left null until the transition skirt is validated on its own. Fog is
    // support, not the edge-hiding mechanism (docs/plans/002 Phase 6).
    fog: null,
    lighting: {
      hemisphere: { sky: 0xffffff, ground: 0x556070, intensity: 1.4 },
      directional: { color: 0xffffff, intensity: 1.6, position: [60, 100, 40] },
    },
  },

  camera: {
    fov: 35,
    elevationDegrees: ELEVATION_DEGREES,
    azimuthDegrees: 0,
    distance: CAMERA_DISTANCE,
    // ~45% of a representative building. Raising the aim point tilts the camera
    // up without flattening the rig itself, which is what stops the view
    // reading as pointed at the ground. Note this lowers the *effective* pitch
    // to ~27 deg (from the rig's 30) and so widens the ground footprint — the
    // skirt width below accounts for it.
    lookAtHeight: REPRESENTATIVE_BUILDING_HEIGHT * 0.45,
    // Near is generous because nothing approaches the camera closer than the
    // near frustum edge (~41 units at this pose). Far covers the plate plus the
    // transition skirt plus maxGroundDistance.
    near: 1,
    far: 1200,
  },

  cameraPortraitOverrides: null,
  portraitAspectThreshold: 0.85,

  navigation: {
    enabled: true,
    dragThresholdPx: 6,
    // Touch gets its own tolerance, and the two must stay two.
    //
    // Until 2026-08-14 one 6px threshold served both, and the consequence was
    // not a slightly awkward gesture: a finger tap that wandered 7px was
    // classified as a drag, and `DistrictInteraction.onPointerUp` refuses to
    // select while the controller reports one. So tapping a district — the only
    // *content* in Murcia — failed intermittently, with no error and nothing on
    // screen to explain it.
    //
    // 12 matches the numbers Earth already ships (`interactionConfig`'s
    // `touchDragClickThreshold`, `createGeoMarkers`' `TOUCH_CLICK_SLOP_PX`),
    // which were measured against real taps during the 2026-08-11 touch work.
    // This is not a feel value and was not judged by hand — it is a tolerance,
    // and PROJECT_MEMORY section 11.23 records where the 5–15px figure comes
    // from. Collapsing these back into one number re-breaks touch even with
    // every raycast correct.
    touchDragThresholdPx: 12,
    // How much of the cursor's ground travel the focus actually covers.
    //
    // 1 is the *definition* of grab-the-point: the grabbed ground point stays
    // exactly under the cursor, in both axes. This is 0.7, so it deliberately
    // does not — the ground covers 70% of the sweep and the grabbed point
    // slides ~30% of the drag distance behind the cursor, by construction and
    // not as lag.
    //
    // JUDGED 2026-08-13, and judgement is the only currency that buys this.
    // The 0.5 signed off on 2026-08-06 was reversed to 1 on user reports that
    // the ground did not follow the mouse; 0.7 is the same person splitting the
    // difference by hand — enough fidelity to read as dragging the map, enough
    // shortfall to keep some weight. `?dragGain=1` gives exact grab-the-point
    // for comparison, `?dragGain=0.5` the original.
    //
    // Two consequences to know before touching it. The solve itself is still
    // exact — §9 of checks/navigation-feel.ts asserts grab-the-point at gain 1
    // and proportionality here, so a broken solve still fails. And the coupling
    // with `smoothingTimeConstant` below is now partial: the latency objection
    // that forced 0.09 → 0.03 fires in proportion to the gain, so 0.03 is
    // conservative here rather than mandatory.
    translationGain: 0.4,
    // Panning the focus across the ground, world units per second.
    //
    // SIGNED OFF 2026-08-06, with two amendments recorded in PROJECT_MEMORY §7.
    // These were judged by a person driving the build and accepted first pass —
    // the only values in this file set by judgement rather than by measurement,
    // so they cannot be checked by the harness and cannot be re-derived if
    // lost. Do not adjust them from reasoning alone.
    //
    // Weight lives in the drag, not in a coast. An earlier design put it in the
    // coast instead (inertia 1.1s, release 0.3s) on the theory that lag during
    // a drag reads as latency rather than mass. Tested by hand, the result was
    // a view that kept moving after the pointer stopped — which reads as a loss
    // of control. Inertia stays off.
    feel: {
      // 0.09 -> 0.03, and this one is a CONSEQUENCE, not an independent choice.
      // The 0.09 was affordable only because the latency objection is
      // conditional: it applies while the ground is expected to track the
      // cursor exactly, and a gain of 0.5 had given that up. At gain 1 the
      // condition fires. The lag is visible as dragSpeed x tau of slide — ~25
      // world units at 0.09 on a fast pan, which is exactly the "it doesn't
      // follow my mouse" complaint — so it is now the thing to minimise rather
      // than the thing to spend. Restoring 0.5 without restoring 0.09, or the
      // reverse, gets the worst of both.
      smoothingTimeConstant: 0.03,
      // Short, and unchanged. The target stops with the pointer, so this is
      // only how long the render takes to catch up — ~0.25s to settle. At the
      // earlier 0.3 the view drifted for nearly a second after release and read
      // as inertia even with momentum disabled.
      releaseTimeConstant: 0.08,
      // No coast. Motion ends with the gesture.
      inertiaTimeConstant: 0,
      // Both unused while inertia is 0. Kept so ?inertia= can be used to
      // re-enable momentum for comparison without restoring anything else.
      minInertiaSpeed: 1.5,
      maxInertiaSpeed: 260,
      velocityBlend: 0.25,
    },

    rotation: {
      enabled: true,
      // A drag across the full viewport turns a sixth of a circle; a quarter
      // turn costs 1.5 sweeps. Halved from 120 for two reasons that compound.
      //
      // Rotation is now a deliberate, separate gesture (right button, or two
      // fingers) rather than one axis of the only gesture, so it is entered on
      // purpose and can afford to cost more travel — and it can no longer be
      // triggered by accident mid-pan, which is what made 120 read as twitchy
      // in the first place. And the gestures that carry it have less usable
      // travel than a primary drag: nobody right-drags across a whole screen,
      // and two fingers run out of room sooner than one.
      //
      // That is the right cost for something you do to re-aim, not to travel.
      degreesPerViewportWidth: 110,
      // Two thirds of the 12px one finger needs, and lower on purpose. A
      // two-finger sweep is unambiguous once it is moving, so the cost of
      // waiting is latency on a deliberate gesture; the cost of not waiting is
      // the city turning under a gesture that never meant to. 8 is above the
      // few pixels of asymmetric drift a pinch or a settling grip produces and
      // below anything a person would call a sweep. JUDGED 2026-08-25, and not
      // yet driven on a real phone.
      twoPointerThresholdPx: 8,
      // Left at the signed-off weights. Rotation did not become grab-the-point,
      // so nothing about it argues for the shorter constant translation took.
      // The two are no longer deliberately matched — they are no longer one
      // gesture, and matching was only ever a property of that.
      feel: {
        smoothingTimeConstant: 0.09,
        releaseTimeConstant: 0.08,
        inertiaTimeConstant: 0,
        minInertiaSpeed: 1.5,
        maxInertiaSpeed: 90,
        velocityBlend: 0.25,
      },
    },

    // Plate surface sits just above zero; projecting drags against the mean
    // surface height keeps the grabbed point under the cursor.
    groundPlaneHeight: 1,
    // Measured from the plate at load. The rectangle below is only the fallback
    // for when the plate cannot be located at all.
    deriveBoundsFromTerrain: true,
    boundsInset: NAVIGATION_INSET,
    bounds: {
      minX: PLATE.minX + NAVIGATION_INSET,
      maxX: PLATE.maxX - NAVIGATION_INSET,
      minZ: PLATE.minZ + NAVIGATION_INSET,
      maxZ: PLATE.maxZ - NAVIGATION_INSET,
    },
    edgeSafetyMargin: 8,
    // 800, not 500. At distance 165 on an ultrawide the corner rays genuinely
    // reach past 500, so the clamp was firing in a normal case rather than the
    // near-horizon one it exists for — and it under-reported the footprint,
    // which is the unsafe direction: measured -37 where the truth was -170.
    // Keep this above the real worst-case corner reach, or the bounds maths
    // silently believes the view is smaller than it is.
    maxGroundDistance: 800,
  },

  focusFlight: {
    // 0.70 -> distance 115.5, camera height 58. Inherited unchanged from the
    // retired zoom band, where it was the IN end: the direction whose footprint
    // shrinks, so nothing downstream is at risk. It is kept rather than re-judged
    // because it was already reasoned against the one measured hazard — below
    // distance ~60 the fixed lookAtHeight tilts the camera up and the footprint
    // widens again (PROJECT_MEMORY, "The number that can hurt you"). 115.5 stays
    // far above that and still reads as clearly closer.
    //
    // The band’s OUT end (maxDistanceScale 1.2) is gone with the band. A flight may
    // only move inward, so the direction that ate skirt margin no longer exists.
    minDistanceScale: 0.7,
    // Was the zoom band’s smoothing. It no longer buys a discrete wheel a glide —
    // the flight runs its own closed easing curve — but it still governs the hand
    // BACK, when the controller adopts whatever distance the flight left behind.
    smoothingTimeConstant: 0.12,
  },

  terrainTransition: {
    enabled: true,
    // The 2026-08-27 re-export named the plate explicitly (it was the
    // auto-generated `Plane.013` before). Dot-free, so GLTFLoader's reserved
    // character stripping ([].:/) no longer applies; findTerrainPlate still tries
    // the sanitized spelling and userData.name in case that changes again.
    terrainObjectName: 'suelo-principal',
    // Generous on purpose. The skirt is what keeps the plate edge out of frame,
    // which is what lets the navigable area be the whole model rather than an
    // inset rectangle (docs/plans/002 Appendix A).
    //
    // Sized so that with NAVIGATION_INSET at 0 — focus reaching the plate
    // corners — the viewport footprint still lands inside the skirt on every
    // tested aspect, including ultrawide, *at every azimuth*.
    //
    // The azimuth term is the expensive one. Yaw moves the frustum's ground
    // footprint against a skirt that is a plate-aligned rectangle, which costs
    // 50-85 units of corner margin on wide viewports (portrait barely notices,
    // its footprint being near-symmetric). Combined with distance 165 the old
    // 380 left 16:9 on 8.6 units and ultrawide 170 units *inside* the edge.
    //
    // 600 restored 50 units at 5120x1440 (aspect 3.56), the binding case; 16:9
    // and narrower need only ~395. The extra geometry is a few hundred more
    // transparent triangles.
    //
    // 600 -> 700, and the extra 100 units were bought to pay for USER ZOOM: reach
    // grows ~2.8 units per unit of distance at the binding case, so the 33 units of
    // dolly between the resting 165 and the old zoom ceiling of 198 cost ~92 units
    // of margin, and 600 only had ~42 to give.
    //
    // THAT MARGIN IS NOW SLACK. There is no user zoom (`adr/009`) and a focus flight
    // only ever moves INWARD, where the footprint shrinks, so nothing reaches past
    // the resting pose any more. `check:footprint` reports the worst slack directly
    // and it went from ~+51 to ~+142 when the band was retired.
    //
    // NOT being narrowed back. It costs a few hundred fully transparent triangles,
    // the warp's departure pose still reaches beyond the resting distance the 600
    // was sized for, and re-tightening a skirt to reclaim geometry nobody is paying
    // for is how the plate edge got on screen the first time (PROJECT_MEMORY, "The
    // number that can hurt you").
    //
    // The same trade this value already made once when it went 380 -> 600.
    width: 700,
    // The fade completes over the inner 21%: ~147 units of visible gradient.
    // Lowered from 0.4 to 0.25 with the first width increase and to 0.21 with
    // the second, which is exactly what decoupling the gradient from the
    // geometry is for — the skirt has to reach far enough to stay out of frame,
    // but a gradient that scaled with it would wash the horizon. The remainder
    // is already fully transparent and exists only to guarantee coverage.
    fadeEndFraction: 0.21,
    // 30 against a 147-unit fade: enough that the ground reads as unambiguously
    // solid where it leaves the authored plate, and only a fifth of the
    // gradient, so the terrain still dissolves into the background well before
    // the skirt ends. The collar used to fill the plate's INTERIOR, which is
    // why this number is new — see `createTerrainTransition`.
    collarWidth: 30,
    loops: 10,
    segmentsPerSide: 12,
    innerOverlap: 0.5,
    verticalOffset: 0.05,
    fadeExponent: 1.6,
  },

  // The audit found the plate and the model bounds to coincide exactly, so
  // content and visual extent are the same rectangle here. They are still
  // modelled separately: the skirt makes the visual extent diverge immediately,
  // and it is derived at runtime rather than configured.
  // 75 against a resting 165. Comfortably inside the band where closer means
  // a smaller footprint: below about 60 the fixed lookAtHeight starts tilting
  // the camera up and the footprint widens again (PROJECT_MEMORY, "The number
  // that can hurt you").
  warpCloseDistance: 75,

  // Leaving Murcia rises rather than backs away. Murcia sits INSIDE the Earth,
  // so the return warp has to recede — but distance alone cannot do it: ground
  // reach grows ~1.33 units per unit of distance against a worst-case skirt
  // margin of +50 at 5120x1440 (PROJECT_MEMORY, "The number that can hurt you").
  //
  // Steepening the elevation buys the recession back. Far reach goes as
  // cameraHeight / tan(pitch - fov/2):
  //
  //   rest   195 @ 30 deg  ->  height 97.5   ->  reaches ~573
  //   depart 210 @ 50 deg  ->  height 160.9  ->  reaches ~339
  //
  // Both figures are the worst max ground reach computeGroundFootprint returns
  // over the four skirt aspects at every 15 deg of yaw, not a closed form.
  //
  // So the departure pose reaches LESS far than the pose the skirt was measured
  // for, and moves away from the ~28 deg floor where the bounds maths
  // degenerates rather than toward it. checks/warp-transition.ts asserts that
  // property directly, against computeGroundFootprint rather than against these
  // numbers — re-run it after changing either one.
  warpDepartDistance: 210,
  warpDepartElevationDegrees: 50,

  contentBounds: { ...PLATE },

  // Plate centre. Verified as a starting composition; the plan asks for an
  // explicit value rather than an implicit centre-of-model.
  initialFocus: {
    x: (PLATE.minX + PLATE.maxX) / 2,
    z: (PLATE.minZ + PLATE.maxZ) / 2,
  },
};
