import { EARTH_CONFIG } from '../config/earthConfig'

// Tuning for the interactive phase, ported from earth-connections'
// satelliteFocusConfig.js (see docs/extractions/003).
//
// SCALE: every distance in the source is in "Earth radius = 1" units. Ours is
// radius 2, so anything measured against the planet is expressed here as a
// multiple of EARTH_CONFIG.radius rather than a rewritten literal — same reason
// orbitConfig keeps its presets in source units.
const R = EARTH_CONFIG.radius

export const INTERACTION_CONFIG = {
  camera: {
    // Exponential lerp constant: ~95% of the distance covered in ~1s.
    lerpK: 3,
    // Below this distance to its target the camera counts as arrived.
    arrivalEpsilon: 0.005 * R,
    // Manual spherical orbit (this replaces OrbitControls — see extraction §1).
    orbitSensitivity: 0.004,
    phiMin: 0.15, // never flip over the north pole
    phiMax: Math.PI - 0.15, // never dive under the planet
    // Accumulated pointer travel (px) above which a click counts as a drag.
    // Mouse and pen: a physical click barely moves the cursor, so the tolerance
    // can be tight enough that even a small deliberate drag is respected.
    dragClickThreshold: 4,
    // Touch needs its own number, not a retune of the one above. A finger tap
    // routinely wanders 5–15px between contact and release — at 4px nearly
    // every tap was classified as a drag and swallowed, which is half of why
    // the site was mouse-only.
    touchDragClickThreshold: 12,
    // How far a finger must travel before it turns the globe AT ALL.
    //
    // Distinct from the tolerance above, which decides after the fact whether a
    // finished gesture counted as a click. This one gates the orbit itself, and
    // until 2026-08-25 Earth had no equivalent: the very first pointermove wrote
    // theta and phi, so resting a finger on the globe nudged it.
    //
    // Two things depend on it. A tap stops moving the planet, and — because the
    // rig re-anchors when it fires — a navigation classifier can hold the first
    // few pixels of a gesture back while it decides, then hand them over with
    // nothing lost and nothing jumped. That is what makes a DECLINE free, and it
    // is why this survived the one-finger prototype it was first written for.
    // Murcia has had exactly this since it learned the same lesson
    // (`touchDragThresholdPx`, murciaConfig).
    //
    // 12 matches both that value and the click tolerance above, which is not a
    // coincidence: it is the size of the wander a real finger produces, and all
    // three questions are asking about the same wander.
    touchDragThresholdPx: 12,
    // How far the overview camera sits from the origin.
    //
    // The REST POINT of the zoom band since `adr/014`, having been a single fixed
    // constant under `adr/009` and, before that, the middle of a `zoomMin: 3R` /
    // `zoomMax: 11R` band the wheel drove directly. It is where the intro lands,
    // where a session starts, and where the depth is 0.
    //
    // It is also the ONE number here that is read outside the interactive phase.
    // `CameraController.EARTH_REST` is derived from it so the intro lands exactly
    // where the rig will take over, and `checks/space-backdrop.ts` measures the
    // star shell against it — the shell has to enclose the camera or stars render
    // over the planet. Keeping it here rather than in `CameraController` is what
    // lets a Node harness read it without pulling React and R3F into the bundle.
    // 7R -> 9R on 2026-09-05, CLIENT DIRECTION against a reference frame of the
    // arrival: the globe sits smaller and space carries the frame. Measured
    // rather than judged, because the disc's angular size is arithmetic — at
    // 1880x966 and fov 45 the silhouette is 337px across at 7R and 262px at 9R,
    // against 265px in the reference.
    //
    // It moves the whole band with it (the factors below are factors for exactly
    // this reason), so the zoom now spans 11.34 .. 18 .. 28.29. Closest approach
    // goes 2.21 -> 2.84 against a planet of radius 2, i.e. FURTHER from the
    // surface than before, and the far end stays well inside the star shell.
    overviewRadius: 9 * R,

    // Where on the sphere of that radius the overview camera rests, in the
    // three.js spherical convention: theta is the azimuth around +Y measured
    // from +Z, phi is the polar angle down from +Y. Degrees, because they are
    // read off the F3 camera readout and pasted here.
    //
    // CLIENT DIRECTION, 2026-09-05, read off the readout at the framing the
    // client chose: the camera sits above the equator looking down 26 degrees,
    // and around to the west so the sun (fixed in world space, EARTH_CONFIG)
    // lights a crescent on the right. What this bakes is the LIGHTING and the
    // TILT — the planet spins on its own, so which continent faces the lens
    // drifts regardless. `camera/overviewPose.ts` turns the pair into the
    // landing point the intro flies to and the rig rests at; every arrival
    // from Murcia comes back to it.
    overviewThetaDegrees: -81.4,
    overviewPhiDegrees: 63.9,

    // ─── The ends of the zoom band, as multiples of the radius above ───
    //
    // Factors rather than radii, so they follow `overviewRadius` if it is ever
    // retuned. `camera/zoomPose.ts` carries the reasoning for both.
    zoomNearFactor: 0.63,
    zoomFarFactor: 11 / 7,
  },

  closeUp: {
    // Back-off from the satellite along the Earth→satellite direction — THE
    // knob for how close the case-panel view gets. Smaller = closer.
    //
    // DERIVED FROM `ORBIT_CONFIG.satellite.modelSize`, which is the whole
    // history of this number. 1.25R framed the old flat badge; it went to 0.55R
    // because the GLB that replaced the badge read far smaller at the same
    // distance. On 2026-08-20 `modelSize` doubled, so the same subject now
    // subtends twice the angle and 0.55R overflows the frame — the distance
    // roughly doubles with it to hold the composition. A future size change has
    // to move this too, or the close-up silently reframes.
    //
    // 2026-09-09: `modelSize` went 0.52 -> 0.88 at the client's request, so this
    // took the same ×1.69 and rounds to 1.78R. The close-up subtends the same
    // angle as before on purpose — the overview is where the satellite had to
    // read larger — and holding this framing is also what keeps the brand
    // atlas's cell resolution sufficient (see createBrandAtlas's CELL note,
    // which sizes both cells for this view).
    distance: 1.78 * R,
    // Small vertical camera lift. Scaled with `distance` on 2026-09-09: it is a
    // world offset added at the camera, so leaving it while the back-off grew
    // would have shrunk the angle it tilts the subject by, and the close-up
    // would have flattened out rather than simply holding. Measured on screen —
    // doubling `distance` alone put the subject off-centre and face-on.
    lift: 0.25 * R,
    // The look-at offset that pushes the satellite LEFT on screen, clearing the
    // right of the viewport for the case panel, is NOT here any more.
    //
    // It was `screenOffset: 0.16 * R` — 0.32 world units — and a fixed world
    // offset at a fixed distance is a fixed ANGLE, while the frame's horizontal
    // half-angle shrinks with the aspect ratio. At 9:19.5 the offset exceeded
    // the half-width and the close-up's subject left the screen. It now lives
    // in `camera/closeUpFraming.ts` as a fraction of the half-width, which is
    // what was actually being chosen, and it reproduces this constant at 16:9.
  },
}
