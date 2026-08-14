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
    // Wheel zoom, overview mode only. Expressed in Earth radii from centre.
    zoomMin: 3 * R,
    zoomMax: 11 * R,
    zoomSensitivity: 0.0012,
  },

  closeUp: {
    // Back-off from the satellite along the Earth→satellite direction — THE
    // knob for how close the case-panel view gets. Smaller = closer. The old
    // 1.25R was tuned for the flat badge; the GLB model reads far smaller at
    // the same distance, so the close-up is pulled in to keep it the subject.
    distance: 0.55 * R,
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
