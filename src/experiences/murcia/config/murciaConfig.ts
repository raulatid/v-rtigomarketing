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
 * The OUTER ground, measured from the 2026-09-04 GLB the same way the plate was.
 *
 *   node `SUELO_CIUDAD`   translation (-387.55, 0, 274.81)
 *   local XZ              X [-1030, 1140]   Z [-895.39, 1030]
 *   world XZ              X [-1417.55, 752.48]   Z [-620.58, 1304.81]   (2170 x 1925)
 *
 * This is new, and it is the single fact that changes what Murcia's camera is
 * allowed to do. Until this export the plate WAS the world: the model bounds and
 * the plate coincided exactly, so the only ground the camera could reach was
 * 352 x 353 units of authored city and the skirt existed to stop its edge being
 * seen. The city now sits in the middle of a filler city six times its area.
 *
 * The plate did not move — it is byte-for-byte the rectangle above — so
 * `contentBounds`, `initialFocus` and the navigable area are all unchanged.
 *
 * Read by `checks/footprint.ts`, which cannot open a GLB, and asserted against
 * the shipped file by `checks/city-asset.ts` §7 — so a re-export that shrinks
 * the ground fails the build rather than quietly putting its edge on screen.
 */
const GROUND = { minX: -1417.5, maxX: 752.4, minZ: -620.5, maxZ: 1304.8 };

/**
 * The first simplified city ring, measured from the shipped GLB the same way
 * the plate and the ground were.
 *
 *   node `CITY_A2_SIMPLIFIED`
 *   world XZ   X [-463.1, -56.4]   Z [70.5, 489.8]   (406.7 x 419.3)
 *
 * Since murcia-v5 the ring is no longer its own node: the exporter joins it
 * into `Edificios_Procedurales`, whose own mesh now measures the same rectangle
 * to within 0.4 units. `checks/city-asset.ts` §7b reads it from there.
 *
 * It wraps the plate, strictly containing it on all four sides:
 *
 *   -X 24.9   +X 30.0   -Z 50.0   +Z 16.5
 *
 * That ring is the resistance band (DECISIONS §40). It is the rectangle the
 * camera may be PUSHED into, at a gain that falls to zero across it, and the
 * reason it is an acceptable place for the eye to stand is that it is CITY —
 * simplified, but built. §39's failure was the camera out on bare filler
 * ground with the horizon in frame, and neither is reachable from here: the
 * frame already reaches ~78 units past the focus, so A2 has always been on
 * screen at the plate edge. This adds 17-50 units more of it.
 *
 * Deliberately NOT symmetric. Rounding the four margins to one number would
 * either give up the 50 units on -Z or push the +Z edge out of A2 and onto the
 * next ring, and the asymmetry is not perceptible — the ramp is felt through
 * its gain at the edge, which is 1 on all four.
 *
 * Asserted against the shipped file by `checks/city-asset.ts`, so a re-export
 * that shrinks or moves the ring fails the build rather than quietly letting
 * the camera stand somewhere there is nothing to stand on.
 */
export const CITY_A2 = { minX: -463.1, maxX: -56.4, minZ: 70.5, maxZ: 489.8 };

/**
 * Inset from the plate to the area the navigation target may reach.
 *
 * ZERO, because the rectangle is no longer derived from the plate at all — see
 * `navigation.bounds` below, which is the A2 ring. Kept as a field because the
 * shape of the config still says "a rectangle, and how it relates to the plate",
 * and a caller that wanted to inset further has somewhere to say so.
 */
const NAVIGATION_INSET = 0;

/** Typical building height, used to derive look-at height. */
const REPRESENTATIVE_BUILDING_HEIGHT = 13;

/**
 * Camera pose.
 *
 * ── 30 deg -> 19 deg, and why that was not previously possible ──
 *
 * CLIENT DIRECTION, 2026-09-04, against two reference frames: a lower, more
 * horizontal view, where facades read and the eye travels ACROSS the city
 * instead of down onto it.
 *
 * Every earlier version of this comment explained why the elevation could not
 * go below about 28: ground reach goes as
 *
 *     height / tan(effectivePitch - fov/2)
 *
 * so it runs away as the pitch drops, and the skirt is finite. Measured through
 * the real pose maths (worst over four aspects x 360 deg of yaw, at distance
 * 225, fov 35, against the 700-unit skirt this file used to ship):
 *
 *     26 deg -> 1018      22 deg -> 2112      20 deg -> 5712      18 deg -> horizon
 *
 * That argument was never about the elevation. It was about there being nothing
 * out there: the plate was the whole world, so anything the frustum reached past
 * it was the edge of the world. `GROUND` above is what changed. There is now
 * 741 units of city in the thinnest direction beyond the plate, the skirt wraps
 * THAT instead, and reaching further simply means seeing more city.
 *
 * ── 19 deg / 225 / azimuth 0 -> 18 deg / 285 / azimuth 267, 2026-09-05 ──
 *
 * CLIENT DIRECTION again, and this time against a single reference frame of the
 * arrival rather than a description. Three things had to move together, and only
 * the third was new:
 *
 *  - **azimuth 267** is the change that actually reframes the city, and it is
 *    the reason the other two moved. The reference looks along the plate's -X
 *    axis: the Segura runs down the RIGHT of the frame with the services
 *    district beyond it, and the stadium / plaza / cathedral read left to right
 *    across the near bank. At azimuth 0 that whole composition is mirrored and
 *    the river sits flat along the bottom. This was found by sweeping — 180 put
 *    the landmarks in the right ORDER but the river in the wrong place, and
 *    only a bearing near 270 puts +Z on the right where the reference has it.
 *
 *    It is a POSE azimuth, not a yaw, so it composes with the user's turning
 *    exactly as before. (The display district's flights compared an absolute
 *    heading against pose + yaw; the services campus that replaced them takes
 *    its heading from the camera itself, so nothing here depends on it.)
 *
 *  - **18 degrees**, down from 19. The reference sits lower than the previous
 *    pose, not higher: the near bank fills the bottom of the frame while the far
 *    side of the plate is still in it. Camera height is 88.1 (285 * sin 18),
 *    which is still well above the 13-unit buildings and below the 45-unit
 *    cathedral, so the landmarks keep standing over the lens.
 *
 *  - **distance 285**, up from 225, is what buys the far side back after the
 *    elevation dropped. 225 at 18 degrees put the frame inside the city; 285 is
 *    the point where the plate reads whole without the skirt edge entering.
 *
 *  - **FOV 35** is unchanged and should stay. Widening the lens grows the ground
 *    footprint at no distance cost, which is the one thing that was never
 *    affordable; and `applyPoseToCamera` carries it straight into the bounds
 *    maths.
 *  - **lookAtHeight** is unchanged and is the knob to reach for if the client
 *    wants the horizon back OUT of frame without giving up the low camera:
 *    aiming below the focus raises the effective pitch and crops the far
 *    distance. -20 puts worst reach at 647 and -40 at 413, both inside even the
 *    old skirt. `?lookAt=` exists for exactly that comparison.
 *
 * The numbers were found by capturing the arrival at 1880x966 through the
 * `?dist=` / `?elev=` overrides and comparing against the client's frame, then
 * running the harnesses on the result. The same rule as before applies: the
 * sweep produces a CANDIDATE, the harness decides whether it is allowed — and
 * here it did. 16 degrees matched the reference marginally better and FAILED
 * `check:navigation`: at that pitch the top of an upward drag reaches past the
 * ground solve's usable range, so the point under the cursor slips by 19px
 * instead of the 1px the drag rework exists to guarantee. The cliff is between
 * 17 and 18 (7.5px at 17, exact at 18). 18 is the shallowest pitch that keeps
 * grab-the-point exact, and the framing difference against 16 is small enough
 * that the client's tolerance absorbs it. Do not lower this without re-reading
 * that check.
 *
 * JUDGED for the look, MEASURED for whether it is allowed. `check:footprint` is
 * the gate; a failure there is never a tuning question.
 *
 * ── 18 deg / 285 -> 35 deg / 220, 2026-09-08. DECISIONS §39 ──
 *
 * CLIENT DIRECTION, and it reverses the 2026-09-04 one above. Everything that
 * comment says about WHY the low pitch was reachable is still true; what it did
 * not price is where the low pitch puts the CAMERA.
 *
 * The eye sits `distance * cos(pitch)` behind the focus on the ground. At 18/285
 * that is 271 units on a plate 352 units across, so the camera stands off the
 * authored city almost everywhere — and on the services arrival it stands out on
 * the filler ground and looks back in at the display from there. The reported
 * symptom was the other half of the same number: at 18 degrees the top of frame
 * is 0.5 deg below horizontal, the view reaches thousands of units, and the
 * emptiness past the city is plainly in shot at the moment the visitor lands.
 *
 *  - **35 degrees** is a fixed constant now, not a tuning target. The pitch
 *    changes on the pinch out toward Earth (`zoomFarElevationDegrees`) and in
 *    the warp, and nowhere else. Top of frame comes to 17.5 deg below horizontal,
 *    so ground reach falls from "horizon" to ~218 units and the emptiness is
 *    gone by construction rather than by skirt width.
 *
 *  - **220**, down from 285, is what buys the panning back. The eye offset falls
 *    to 180 units, and because the camera is on ONE side of the focus the
 *    surviving pan range is `352 - 180` rather than `352 - 360`: ~172 units,
 *    about half the plate. At 285 it would have been ~119. See
 *    `computeStationLimitedBounds` for why the arithmetic is one-sided.
 *
 *    Note this is no longer "the distance that reads the whole plate". At 35 deg
 *    the frame covers ~139 units of ground depth and the whole plate cannot be
 *    read at ANY distance, so that constraint retired with the shallow pitch and
 *    the number was free to be chosen against navigation instead.
 *
 *  - **azimuth 267, fov 35, lookAtHeight** are all unchanged, and lookAtHeight is
 *    still the knob for the horizon. It matters less now: at 35 deg the horizon
 *    is not close to the frame.
 *
 * The pitch rise is the SAFE direction for everything the file worries about —
 * a steeper camera has a smaller footprint, and `check:navigation` §13's
 * grab-the-point cliff is at LOW pitch (16 failed, 18 was exact). The distance
 * drop is not: it multiplies straight into the compound closest approach, and
 * `zoomNearScale` below was re-measured because of it.
 *
 * ── 35 deg / 220 -> 35 deg / 285, 2026-09-10. DECISIONS §44 ──
 *
 * 220 was chosen AGAINST NAVIGATION: it bought pan range back under §39's eye
 * clamp, and the one-sided arithmetic above is that clamp's. The camera-navigation
 * port retired the clamp — the viewer's TARGET is clamped to the A2 ring and the
 * eye is free — so the argument for 220 went with it, and 285 is the pose the
 * sandbox's feel was judged at. The pitch is unchanged. `zoomNearScale` returned
 * to 0.45 with it; see there.
 */
const ELEVATION_DEGREES = 35;
const CAMERA_DISTANCE = 285;

export const murciaConfig: EnvironmentConfig = {
  id: 'murcia',
  // Root-absolute: a document-relative path resolves against the current
  // route and 404s anywhere but the root.
  modelPath: '/models/murcia-v4-lightmaps-v2.glb',

  // No trim sheet since murcia-v7. The city's colour is vertex colour alone:
  // the export embeds a neutral white trim so Blender could bake against the
  // same material graph, and the runtime drops it rather than multiply by
  // white (`assets/lightmaps/loadLightmaps.ts`). The mechanism stays — a real
  // sheet is still a file drop into these three strings (docs/plans/009 Phase
  // 4) — but a path here would be written onto the authored material and over
  // the colours the light was baked for.
  //
  // Normal and ORM are null until they exist. They are not placeholders waiting
  // to be filled in with something plausible: a wrong normal map is worse than
  // none, and the material simply omits the slot.
  trimSheet: {
    baseColor: null,
    normal: null,
    orm: null,
  },

  // Selected 512-sample bake: 13 atlases, 1K mobile / 2K desktop.
  // Total KTX2 payload: 1,990,653 / 3,991,938 bytes. Keep model and manifest paired.
  lightmaps: {
    baseUrl: '/textures/murcia/lightmaps-v2/',
    manifest: 'lightmaps.json',
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
    azimuthDegrees: 267,
    distance: CAMERA_DISTANCE,
    // ~45% of a representative building. Raising the aim point tilts the camera
    // up without flattening the rig itself, which is what stops the view
    // reading as pointed at the ground. Note this lowers the *effective* pitch
    // to ~27 deg (from the rig's 30) and so widens the ground footprint — the
    // skirt width below accounts for it.
    lookAtHeight: REPRESENTATIVE_BUILDING_HEIGHT * 0.45,
    // Near is generous because nothing approaches the camera closer than the
    // near frustum edge.
    //
    // 1200 -> 3500, and this one is forced rather than chosen. The far plane has
    // to clear the furthest SKIRT vertex that can be in frame, and the skirt now
    // wraps `GROUND` rather than the plate: its outer rectangle is
    // X [-2117.6, 1452.5], Z [-1320.6, 2004.8], so a camera near the opposite
    // plate corner sits about 3000 units from the far corner of it. At 1200 that
    // corner is clipped — and a clipped skirt is not a subtle artefact, it is a
    // straight line of background cutting across the ground at a fixed radius
    // from the camera, moving as you pan.
    //
    // Only the FADE band strictly has to be inside this: everything past
    // `width * fadeEndFraction` is already fully transparent, so clipping it
    // changes nothing on screen. 3500 covers the whole skirt anyway rather than
    // relying on that argument staying true if `fadeEndFraction` moves.
    near: 1,
    far: 3500,
  },

  cameraPortraitOverrides: null,
  portraitAspectThreshold: 0.85,

  // ── The drag's own feel no longer lives here ──
  //
  // `translationGain`, `touchTranslationGain`, `feel` and `rotation` were the
  // map-pan controller's: a gain per pointer type, two first-order time
  // constants each for pan and yaw, and a two-pointer rotation threshold. All of
  // it went with `DragPanController` (DECISIONS §44). The replacement is
  // `camera/cameraTuning.ts`, which the rig and its pointer input share by
  // reference — one gain for both pointer types, and spring frequencies rather
  // than time constants.
  //
  // What is left below is what is NOT feel: where the viewer may go, how far the
  // frustum may reach, and the tap tolerances the districts read.
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


    // Plate surface sits just above zero. Pointer rays — district picking and
    // the framing solve — are projected against this mean surface height.
    groundPlaneHeight: 1,
    boundsInset: NAVIGATION_INSET,
    /**
     * Where the navigation target may go: THE A2 RING, not the plate.
     *
     * The camera-navigation port clamps the viewer's target to one rectangle
     * grown past the authored city, so the plate's own edges can be brought to
     * the middle of the frame. The sandbox grew its plate by a flat 50 units;
     * that number is a property of the sandbox's fixture and not of this city.
     *
     * Measured, Murcia's built ground extends past the plate by -X 24.9,
     * +X 30.0, -Z 50.0, +Z 16.5 — so a flat 50 would put the viewer over
     * nothing on three sides of four. The honest equivalent of "grow the plate"
     * here is the ring that was already measured out of the GLB for exactly this
     * purpose, and `checks/city-asset.ts` section 7b asserts the shipped file
     * still carries it.
     *
     * This rectangle used to be `extendedBounds`, the outer edge of §40's
     * resistance band. The band is gone; the rectangle it bounded is now simply
     * where the viewer may go.
     */
    bounds: { ...CITY_A2 },
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
    // The band’s OUT end (maxDistanceScale 1.2) did not come back with `adr/014`.
    // A FLIGHT may still only move inward: the direction that eats skirt margin
    // belongs to the zoom now, and it pays for it by rising (`zoomFarDistance`).
    // This scale multiplies whatever the zoom resolved to, so a flight is always
    // inward of a pose already proven safe.
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
    // The skirt wraps the filler city, not the authored plate.
    //
    // This one field is what lets the camera lie down. The skirt's job has never
    // changed — dissolve the one hard edge in the model — but which mesh carries
    // that edge did, on 2026-09-04: `suelo-principal` used to be the outermost
    // ground and is now an island in the middle of `SUELO_CIUDAD`. Left pointing
    // at the plate, the skirt would fade out the middle of the city and the real
    // edge would still be sitting there, 741 units further out, unhidden.
    //
    // Name lookup only, with no largest-flat-mesh fallback — `findOuterGround`
    // records why: that fallback would find this very mesh, so a mistyped plate
    // name would hand both lookups the same object and the skirt would wrap the
    // rectangle navigation is bounded to.
    //
    // NULL since the 2026-09-06 export, which merged the two meshes: there is no
    // `SUELO_CIUDAD` any more, and `suelo-principal` is now both the plate and
    // the outer ground. So the skirt wraps the plate again — and this time that
    // is right, because the plate has become the outermost ground rather than an
    // island in it. Naming the same mesh twice is what `findOuterGround` exists
    // to reject, and pointing this at `suelo-principal` would trip exactly that
    // guard. The two facts that used to be read off this field resolving —
    // whether to notch the river and whether the horizon is in frame — are
    // measured in `MurciaExperience` now, which is what they always meant.
    groundObjectName: null,
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
  //
  // 210/50 until `adr/014`. The departure now has to CONTINUE a user-driven
  // zoom-out rather than start from rest, so it has to end beyond where that
  // zoom can leave the camera (`zoomFarDistance` below) or the cinematic's first
  // frame would move back INWARD from the pose the viewer had chosen. Same arc,
  // one step further along it.
  //
  //   depart 330 @ 62 deg  ->  height 291.4  ->  reaches ~460
  //
  // Still far short of rest's ~633, which is the invariant that matters.
  //
  // 330/62 -> 470/66 with the 2026-09-04 pose. Nothing about the argument
  // changed, only the number it has to stay outside of: the departure has to end
  // beyond `zoomFarDistance` or a commit from full zoom-out would open by moving
  // back toward the city, and that moved 280 -> 400. Same arc, one step further
  // along it again, still elevation-dominant.
  //
  // The reach arithmetic above is now historical rather than binding — at 19 deg
  // the resting pose reaches past the horizon and "reaches ~633" has no finite
  // value to compare against. What replaced it is in `checks/footprint.ts` §2.
  // `checks/warp-transition.ts` §7 is unaffected and still asserts the join from
  // every depth in the band.
  warpDepartDistance: 470,
  warpDepartElevationDegrees: 66,

  // ─── The user's zoom band (`adr/014`) ───
  //
  // `adr/009` removed zoom from the product outright and this is the product
  // decision that put it back. The band is a POSITION the viewer owns: it stays
  // where they leave it, and the transition fires only when they keep pushing
  // after it has run out.
  //
  // ── Zooming out is an ascent, not a pull-back ──
  //
  // The same constraint the departure pose is built around (ADR 006), and the
  // reason zooming out cannot simply increase the distance: at a fixed 30 deg,
  // ground reach grows about 1.33 units per unit of distance and rest already
  // spends all but ~59 units of the skirt. Pulling straight back to 280 would
  // reach ~910 against a 700-unit skirt and put the plate edge on screen for
  // ultrawide viewers only, silently.
  //
  // Steepening the pitch as the camera recedes buys that back and then some.
  // Measured over the four skirt aspects at every 5 deg of yaw with the focus at
  // each plate corner, through the real computeGroundFootprint:
  //
  //   near 136.5 @ 30 deg  ->  reaches ~473,  slack +219
  //   rest 195   @ 30 deg  ->  reaches ~633,  slack  +59   <- still the worst case
  //   far  280   @ 52 deg  ->  reaches ~444,  slack +241
  //
  // So every pose the viewer can zoom to has MORE skirt margin than the resting
  // pose they start from, and `checks/footprint.ts` sweeps the whole band to say
  // so rather than trusting these three rows.
  //
  // What the viewer gets for it: the city 30% smaller and seen from above. The
  // buildings shrinking is the zoom; the tilt is what pays for it.
  //
  // JUDGED 2026-09-04 for how far to go, MEASURED for whether it is allowed.
  //
  // 280 @ 52 -> 400 @ 55, which is the pair the note above already named as
  // still safe. CLIENT DIRECTION, same session as the pose change and for the
  // same reason: the city got six times bigger, so the pose you climb to in
  // order to see all of it has to climb further. Camera height goes 220.6 -> 328.
  //
  // The arc is doing something the low resting pose now depends on. At 19 deg
  // the horizon is in frame; at 55 deg it is not — measured, no ground edge
  // enters the frustum at the far end at any aspect or yaw. So zooming out is
  // also what puts the lid back on the view, and the rise is paying for two
  // things at once.
  //
  // Still the number to raise if the zoom reads timid, and still only through
  // `check:footprint`.
  zoomFarDistance: 400,
  zoomFarElevationDegrees: 55,

  // Zooming IN keeps the resting pitch and only shortens the distance, because
  // nothing has to be paid for: flying in shrinks the footprint.
  //
  // This WAS `focusFlight.minDistanceScale`, reused rather than measured so the
  // two could not drift apart about what "as close as the city goes" means. The
  // reuse cost more than it saved: at 0.7 a full pinch-in bought 285 -> 199.5
  // units, an apparent x1.43 for an entire opening of the hand, and the client
  // reported the inward half of the band as not working at all. The two numbers
  // answer different questions — one is how close a FLIGHT may dolly from
  // wherever the viewer is, the other is how close the viewer may put themselves
  // — so they are now measured separately.
  //
  // 0.45 is x2.22 (285 -> 128.25), and it is not the lowest value that passes.
  // Swept through `check:footprint` 2026-09-06: 0.35 passes, 0.30 FAILS at a
  // compound closest approach of 59.8 units against the ~60-unit footprint
  // inversion floor, where the fixed `lookAtHeight` tilts the camera up and
  // flying in stops being the safe direction. The binding case is the compound
  // one — full zoom-in and THEN a district flight, 285 x this x
  // focusFlight.minDistanceScale — which at 0.45 lands at 89.8 units, half again
  // above the floor and two sweep steps clear of the boundary. A value chosen
  // hard against a cliff is one the next GLB discovers in production.
  //
  // Raise it toward 0.35 only through `check:footprint`, and only with a reason
  // to spend the margin.
  //
  // ── 0.45 -> 0.58, 2026-09-08 ──
  //
  // FORCED by `CAMERA_DISTANCE` 285 -> 220, and it is the one number that change
  // could not leave alone. This is a SCALE, so a shorter rest distance multiplies
  // straight into the compound closest approach: 285 x 0.45 x 0.7 = 89.8 became
  // 220 x 0.45 x 0.7 = 69.3, and `check:warp` §7 refuses anything with less than a
  // quarter of the 60-unit floor in hand. 0.58 restores 89.3 — the same margin the
  // number was chosen with, not a new judgement about it.
  //
  // Read it in ABSOLUTE terms and nothing about the product changed: the closest
  // the viewer may put themselves is 127.6 units, against 128.25 before. What
  // changed is the RATIO, x2.22 -> x1.72, because rest came 65 units closer and
  // the pinch has less left to buy. The client's 2026-09-06 complaint was about
  // x1.43 feeling like nothing; the total against the OLD rest is still x2.22, so
  // the hand is not being asked to do less work than it was after `adr/015`.
  //
  // If the pinch reads short on a device, the honest fix is this number through
  // `check:footprint` and `check:warp` — not `focusFlight.minDistanceScale`, which
  // is the other half of the compound and answers a different question.
  //
  // ── 0.58 -> 0.45, 2026-09-10. DECISIONS §44 ──
  //
  // 0.58 existed only to undo 220's cut to the compound closest approach. With
  // rest back at 285, 0.45 restores the numbers this block was first measured at:
  // 128.25 at full zoom-in (127.6 under 220 x 0.58), 89.8 with a district flight on
  // top, and a pinch ratio of x2.22.
  zoomNearScale: 0.45,

  contentBounds: { ...PLATE },

  // The outer ground, for the harness. See `GROUND` above for the measurement.
  //
  // The runtime never reads this — it measures the real mesh at load, which is
  // the only honest source. It is here because `checks/footprint.ts` runs in
  // node against no GLB at all, and the alternative is a harness that asserts
  // its own copy of the number it is checking.
  groundBounds: { ...GROUND },

  // Plate centre in Z, and as far toward it in X as §39 allows. Verified as a
  // starting composition; the plan asks for an explicit value rather than an
  // implicit centre-of-model.
  //
  // X is NOT the plate centre any more, and the 12 units are worth spelling out
  // rather than leaving to the clamp. At rest the camera stands
  // `220 * cos 35 = 180.2` units from the focus along pose azimuth 267, which is
  // very nearly straight down -X: offset (-180.0, -9.4). For the eye to stay on
  // the plate the focus needs `x >= -438.2 + 180.0 + 8 = -250.2`, and the plate
  // centre is -262.3. Left as the centre it would simply have been corrected on
  // the first recompute — a config value the runtime silently disagrees with,
  // which is the kind of thing that is discovered years later.
  //
  // This is yaw 0 only. Turning moves the legal region and the clamp follows it
  // live; this number only has to be legal at the pose the city opens on.
  initialFocus: {
    x: -250,
    z: (PLATE.minZ + PLATE.maxZ) / 2,
  },
};
