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
    // How far the overview camera sits from the origin. FIXED — this replaced
    // `zoomMin: 3R`, `zoomMax: 11R` and `zoomSensitivity`, which existed for the
    // wheel. The wheel belongs to scene navigation now (`adr/009`), so nothing
    // writes the orbit radius after it is seeded: drag still turns the globe, it
    // just cannot change how far away it is.
    //
    // A single constant rather than a band, and it is the ONE number here that is
    // read outside the interactive phase. `CameraController.EARTH_REST` is derived
    // from it so the intro lands exactly where the rig will take over, and
    // `checks/space-backdrop.ts` measures the star shell against it — the shell has
    // to enclose the camera or stars render over the planet. Keeping it here rather
    // than in `CameraController` is what lets a Node harness read it without
    // pulling React and R3F into the bundle.
    overviewRadius: 7 * R,
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
    distance: 1.05 * R,
    // Small vertical camera lift.
    lift: 0.15 * R,
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
