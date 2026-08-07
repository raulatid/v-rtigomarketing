import type { EnvironmentConfig } from './environmentConfig';

/**
 * Murcia city environment.
 *
 * Every world-space number below is derived from the Phase 1 audit
 * (docs/plans/002 Appendix A), which measured the shipped GLB directly:
 *
 *   terrain plate `Plane.013`   X [-438.2, -86.4]   Z [120.5, 473.3]
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
const CAMERA_DISTANCE = 165;

export const murciaConfig: EnvironmentConfig = {
  id: 'murcia',
  // Root-absolute: a document-relative path resolves against the current
  // route and 404s anywhere but the root.
  modelPath: '/models/city-prototype.glb',

  sceneState: {
    backgroundColor: 0x9fb4c7,
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
    // Half speed. Translation is solved against the ground, so with no gain the
    // camera covers whatever distance the cursor swept across a plate seen from
    // 83 units up — far too much per pixel, which is what made the drag feel
    // quick and light. The cost is that the grabbed ground point no longer stays
    // locked under the cursor; that fidelity was bought back as weight.
    translationGain: 0.5,
    // Translation along the camera's forward axis, world units per second.
    //
    // SIGNED OFF 2026-08-06. These values, and translationGain and
    // degreesPerViewportWidth with them, were judged by a person driving the
    // build and accepted first pass. They are the only values in this file set
    // by judgement rather than by measurement or derivation, so they cannot be
    // checked by the harness and cannot be re-derived if lost. Do not adjust
    // them from reasoning alone — see PROJECT_MEMORY section 7.
    //
    // Weight lives in the drag, not in a coast. The previous values put it in
    // the coast instead (inertia 1.1s, release 0.3s) on the theory that lag
    // during a drag reads as latency rather than mass. Tested by hand, the
    // result was a view that kept moving after the pointer stopped — which
    // reads as a loss of control. Inertia is off; heaviness now comes from
    // translationGain above and the longer smoothing constant below.
    feel: {
      // Raised from 0.05. This is the smoothness, and it is affordable now:
      // the latency objection only applies while the ground is expected to
      // track the cursor exactly, and a gain of 0.5 has already given that up.
      smoothingTimeConstant: 0.09,
      // Short. The target stops with the pointer, so this is only how long the
      // render takes to catch up — ~0.25s to settle. At the previous 0.3 the
      // view drifted for nearly a second after release and read as inertia
      // even with momentum disabled.
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
      // A drag across the full viewport turns a third of a circle. Lowered from
      // 180: at half a turn per sweep the horizontal axis was twitchy, and it
      // is the harder axis to be twitchy on, since it also has to be held
      // steady while aiming a forward move.
      degreesPerViewportWidth: 120,
      // Matched to the translation feel so the two axes of one gesture have the
      // same weight; only the speed limits differ, being degrees not units.
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

  terrainTransition: {
    enabled: true,
    // The audit found none of the contract names present; this is the actual
    // node name in the shipped GLB.
    //
    // Note it is written with the dot. GLTFLoader strips reserved characters
    // ([].:/) from node names, so at runtime this object is called "Plane013".
    // findTerrainPlate tries the configured spelling, the sanitized spelling,
    // and userData.name, so either form works here.
    terrainObjectName: 'Plane.013',
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
    // 600 restores 50 units at 5120x1440 (aspect 3.56), the binding case; 16:9
    // and narrower need only ~395. The extra geometry is a few hundred more
    // transparent triangles.
    width: 600,
    // The fade completes over the inner 25%: ~150 units of visible gradient.
    // Lowered from 0.4 in step with the width increase, which is exactly what
    // decoupling the gradient from the geometry is for — the skirt has to reach
    // 600 units to stay out of frame, but a 240-unit gradient would wash the
    // horizon. The remainder is already fully transparent and exists only to
    // guarantee coverage.
    fadeEndFraction: 0.25,
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
  // the camera up and the footprint widens again (PROJECT_MEMORY 5).
  warpCloseDistance: 75,

  contentBounds: { ...PLATE },

  // Plate centre. Verified as a starting composition; the plan asks for an
  // explicit value rather than an implicit centre-of-model.
  initialFocus: {
    x: (PLATE.minX + PLATE.maxX) / 2,
    z: (PLATE.minZ + PLATE.maxZ) / 2,
  },
};
