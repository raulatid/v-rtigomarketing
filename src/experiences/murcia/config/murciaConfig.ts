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
const CITY_A2 = { minX: -463.1, maxX: -56.4, minZ: 70.5, maxZ: 489.8 };

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
 *    exactly as before. District flights are unaffected: `approachYawDegrees` in
 *    `cityDistrictBindings` is compared against `CameraRig.getAzimuthDegrees()`,
 *    which is pose + yaw, so an absolute heading of 45 is still an absolute
 *    heading of 45 — `check:district` is the gate on that claim.
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
 */
const ELEVATION_DEGREES = 35;
const CAMERA_DISTANCE = 220;

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
    // The same thing for touch, at grab-the-point, and the split is what makes
    // the mouse number above safe to leave alone.
    //
    // The complaint was that panning a phone costs too many strokes. The
    // obvious explanation — a phone shows less ground, so a pixel buys less —
    // is FALSE, and worth writing down because it is the first thing anyone
    // will reach for. Ground per CSS pixel at this pose is 2*tan(fov/2)/h: a
    // function of viewport pixel HEIGHT alone, in both screen axes, because the
    // frustum widening with aspect is exactly cancelled by there being more
    // pixels to spread it over. Measured through the real pose maths it is
    // 0.2241 units/px on a 390x844 phone against 0.1751 on a 1920x1080 desktop.
    // The phone pixel is worth MORE.
    //
    // What the phone does not have is stroke. A mouse drag is unbounded by the
    // window (pointer capture keeps events coming past the edge) and by the
    // desk (acceleration); a thumb stops at the glass at ~250px. At gain 0.4
    // that is 22.4 units per stroke against the desktop's 70 — so crossing the
    // 352-unit plate costs ~16 strokes on a phone and ~5 on a desktop. That
    // ratio is the whole report.
    //
    // Parity would need 1.25, which is above grab-the-point and therefore not
    // available at all. 1 recovers 80% of the gap (56 units against 70) and is
    // the ceiling for a reason that is not taste: on touch the finger is ON the
    // thing it drags, so ground that outruns it reads as broken rather than as
    // light. checks/navigation-feel.ts asserts the bound.
    //
    // Nothing else moves with it. `smoothingTimeConstant: 0.03` below was
    // already sized for the gain-1 case — see its own note, which records that
    // 0.03 is conservative at 0.4 rather than mandatory.
    //
    // STARTING POINT, derived by arithmetic and NOT yet driven on a phone.
    // `?touchDragGain=` is the ladder: 0.85, then 0.7 if 1 reads slippery.
    // Below 0.7 is back inside the complaint.
    touchTranslationGain: 1,
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
      // Touch turns faster per pixel, because a touch "sweep" is not a viewport
      // width and the comment above prices everything in sweeps.
      //
      // A mouse can genuinely drag a full viewport width — more, with capture.
      // Two fingers cannot: on a 390px phone, contacts ~100px apart carry the
      // centroid about 140px before the outer one leaves the glass, and each
      // gesture re-pays the 8px dead zone. That is 0.338 of a width per usable
      // sweep. Holding the cost stated above — a quarter turn at 1.5 sweeps —
      // gives 90 / (1.5 * 0.338) = 177, rounded to 175.
      //
      // At the shared 110 the same arithmetic put a quarter turn at 2.4 sweeps
      // and a half turn at 4.8, which is the "rotating costs too much" report.
      // And the cost is worse than slow: DragPanController does not wait for
      // the pinch classifier, but `claimPinch` can TAKE a sweep away mid-gesture
      // with a synthetic pointercancel (ADR 015), and the decision latches per
      // finger-pair. So five short sweeps re-run that race five times where one
      // long sweep runs it once. Fewer, longer sweeps is the fix for both.
      //
      // Note the history this pair exists to stop repeating: 60 -> 110 landed in
      // 260f4d8 (2026-08-26, ADR 012) for touch's benefit, on the number both
      // inputs shared, and silently retuned the mouse. Splitting is the
      // alternative to doing that again.
      //
      // `twoPointerThresholdPx` below is deliberately NOT touched. It is
      // coupled by hand to NAVIGATION_PINCH.declineRivalPx and the arbitration
      // is decided in pixels; this changes only what a pixel is worth in
      // degrees, so the coupling is undisturbed. If a settling grip visibly
      // nudges the city, LOWER THIS rather than raising the dead zone.
      //
      // STARTING POINT, derived by arithmetic and NOT yet driven on a phone.
      // `?touchYawDeg=` is the ladder: 150, then 130, floor at 110 where it
      // rejoins the mouse.
      touchDegreesPerViewportWidth: 175,
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
    // FALSE since the 2026-09-06 export, and this is a correction rather than a
    // change of intent. Measuring the plate meant "navigation is bounded to the
    // authored city", which was true while `suelo-principal` WAS that city.
    // That export merged the plate and the outer ground into one mesh of
    // 2170 x 1925, so the same measurement now returns six times the area and
    // would let the focus wander to the far edge of the filler city — silently,
    // since nothing about the read looks different.
    //
    // `contentBounds` below carries the authored rectangle the plate used to
    // measure, unchanged, so this asks for it by name instead of by geometry.
    // Restore the measurement only alongside an export that separates the two
    // meshes again.
    deriveBoundsFromTerrain: false,
    boundsInset: NAVIGATION_INSET,
    bounds: {
      minX: PLATE.minX + NAVIGATION_INSET,
      maxX: PLATE.maxX - NAVIGATION_INSET,
      minZ: PLATE.minZ + NAVIGATION_INSET,
      maxZ: PLATE.maxZ - NAVIGATION_INSET,
    },
    // Where a push may reach, against resistance (§40). `?band=` scales the four
    // margins so the whole change can be judged on a device without a rebuild:
    // 1 is the A2 ring, 0 is §39's hard wall.
    extendedBounds: CITY_A2,
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
  zoomNearScale: 0.58,

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
