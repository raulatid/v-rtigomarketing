// Self-contained by rule: no project-level #include anywhere in this
// experiment's GLSL (plan 001 amendment A4).
//
// The materialisation's whole trajectory lives here. Each mote leaves a projector,
// rides its beam up, COLLECTS INTO A MASS at the display's centre, holds there
// churning, and then opens outward onto the plate's silhouette and stops.
//
// ## Why there is a mass at all
//
// The previous flow went from the beams straight onto the outline. It read well as
// motion and said very little: a stream became a thin dotted rectangle, and nowhere
// in it was there a moment showing the QUANTITY of material the display is made of.
// The mass is that moment. It is the difference between "particles drew a shape" and
// "there was a pile of stuff, and the display is what it turned into".
//
// ## Three lerps, and they OVERLAP
//
// ride     projector -> convergence point   (the beam is the path)
// gather   convergence -> the mass          (it collects)
// open     the mass -> the outline          (it becomes the display)
//
// The ramps overlap on purpose. Chained end to end they produce a visible corner at
// each handover, because the direction changes instantaneously; overlapped, the next
// lerp starts pulling while the previous is still moving and the corner rounds itself
// off for free. These are Beziers by another name, written as mixes because the same
// ramps also drive size and colour and would otherwise be computed twice.
//
// The mass sits at the display's OWN centre, so `open` is a purely radial expansion
// and the mass and the shape it becomes share an origin exactly. That is what makes
// the relationship between the two legible from any camera angle.
//
// ## Everything is in the PANEL's local space
//
// This geometry is a child of the panel, so the landing points inherit the yaw follow
// and the 45-degree tilt and can never drift out of register with the plate they are
// drawing. The cost is that the projector sources — which are fixed in the world —
// have to be converted the other way, once per frame on the CPU. That is three
// vectors against however many motes, so it is the cheap direction.

attribute vec3 aTarget;
/** A point in the UNIT ball. Scaled by `uMassRadius`, so radius needs no rebuild. */
attribute vec3 aMass;
attribute float aBeam;
attribute float aSeed;

/** The three projector tops, converted into panel space each frame. */
uniform vec3 uSource0;
uniform vec3 uSource1;
uniform vec3 uSource2;
/** Where the beams meet — the display's lower edge. */
uniform vec3 uConverge;
/** World X and Z as directions in panel space, for scattering across the projector. */
uniform vec3 uSpreadU;
uniform vec3 uSpreadV;
uniform float uSourceRadius;
/** The mass's centre, which is also the display's. Panel space. */
uniform vec3 uMassCentre;
uniform float uMassRadius;
/** How far the mass swirls, in radians across the whole clock. 0 is a still ball. */
uniform float uChurn;
/** The reveal clock, 0..1. Nothing here runs on wall time. */
uniform float uProgress;
/** Point size in pixels at one world unit of depth. */
uniform float uSize;

varying float vFade;
varying float vSettle;
varying float vSeed;

/** Clamped remap — the same staging idiom `districtFlow` uses on the CPU. */
float staged(float value, float from, float to) {
  return clamp((value - from) / max(to - from, 1e-4), 0.0, 1.0);
}

float easeInOut(float t) {
  return t * t * (3.0 - 2.0 * t);
}

void main() {
  vSeed = aSeed;

  vec3 source = aBeam < 0.5 ? uSource0 : (aBeam < 1.5 ? uSource1 : uSource2);

  // SCATTERED ACROSS THE PROJECTOR'S FACE, not launched from its centre.
  //
  // There is one projector now and it is the plaza — a 40-unit surface sitting
  // directly under the display. Every mote starting at its centre put the entire rise
  // in a single thin column on the display's own axis, which reads as a spout rather
  // than as a surface emitting.
  //
  // `aMass.xz` is reused as the disc offset rather than adding an attribute. It is
  // already an unstructured point in a unit ball, and its x/z happen to be exactly
  // the unbiased disc sample this needs. The coupling — where a mote leaves the plaza
  // correlates with where it sits in the mass later — is invisible at these counts,
  // but it is real and worth knowing if either distribution is retuned.
  //
  // Offset along WORLD x/z carried in as panel-space directions. Using the panel's
  // own axes would scatter the motes across a plane tilted 45 degrees, so they would
  // leave from a sloping sheet through the plaza rather than from its flat top.
  source += (uSpreadU * aMass.x + uSpreadV * aMass.z) * uSourceRadius;

  // Per-mote stagger, so the three beams do not fire as three solid slugs. Small,
  // because every mote has to be inside the mass before the mass is supposed to be
  // standing still and being looked at.
  float offset = aSeed * 0.05;

  // The ride is SHORT now, and the gather does the travelling.
  //
  // With three focos standing away from the axis, the run to the convergence point
  // was a real journey and worth a third of the rise. The plaza sits directly under
  // the display, so that same run is 4.6 world units straight up — giving it the old
  // window just made the motes hesitate on the spot. It now covers little more than
  // leaving the surface, and the climb into the mass is one continuous motion.
  float ride = easeInOut(staged(uProgress, 0.02 + offset, 0.10 + offset));
  float gather = easeInOut(staged(uProgress, 0.08 + offset, 0.36 + offset));
  // The one ramp WITHOUT a per-mote offset.
  //
  // The outline has to arrive as a single event — it is a shape, and a shape whose
  // edges land at staggered times reads as a smear rather than as a structure
  // snapping into place. The stagger belongs to the parts that read as a flow.
  float open = easeInOut(staged(uProgress, 0.55, 0.72));

  // --- how the time is divided, and why ---------------------------------------
  //
  // THE MASS IS THE LONGEST-LIVED STATE. It used to be the other way round: the
  // outline stood for 0.82s against the mass's 0.61s, so the interesting part — a
  // quantity of material becoming a shape — was over quickest, and the effect then
  // stopped on a pose for nearly a second before anything else happened.
  //
  // Everything after the outline lands is now roughly halved (1.23s -> 0.70s) and the
  // clock came down with it rather than the mass being stretched to compensate. The
  // outline still has to REGISTER, which is what its 0.34s hold buys; it just no
  // longer waits around afterwards.
  //
  // If the outline ever stops reading as a shape at all, lengthen that hold — not the
  // clock. The ratio is the thing being tuned here, not the duration.

  // --- the mass -------------------------------------------------------------
  //
  // Rotated about the panel's local Z — the panel's normal — so the swirl is seen
  // face-on rather than edge-on, and PER MOTE rather than rigidly. A single angle
  // for every mote is a spinning ball, which reads as one solid object; shearing the
  // layers against each other is what reads as a mass of separate things.
  //
  // Driven by `uProgress`, never by `uTime`. This module owns no clock, and that is
  // what keeps the whole effect scrubbable, reversible and identical on every play.
  float spin = uProgress * uChurn * mix(0.6, 1.4, aSeed);
  float c = cos(spin);
  float s = sin(spin);
  vec3 swirled = vec3(aMass.x * c - aMass.y * s, aMass.x * s + aMass.y * c, aMass.z);
  vec3 massPoint = uMassCentre + swirled * uMassRadius;

  vec3 riding = mix(source, uConverge, ride);
  vec3 gathered = mix(riding, massPoint, gather);
  vec3 settled = mix(gathered, aTarget, open);

  // A small outward drift as they release, away from the panel's centre. Without
  // it they wink out exactly where they landed, which reads as the effect being
  // switched off rather than as the motes dispersing.
  //
  // They must be visibly LEAVING before the display arrives at 0.87, and finish clear
  // of it — a handover rather than a dissolve underneath a panel already drawing on
  // top of them.
  float release = staged(uProgress, 0.84, 0.93);
  vec3 drift = normalize(vec3(aTarget.xy, 0.001)) * release * 2.4;

  vec4 mvPosition = modelViewMatrix * vec4(settled + drift, 1.0);

  // Perspective divide, or every mote is the same size on screen regardless of
  // depth and the whole thing reads as a 2D overlay.
  //
  // Fades in over the first sliver of the ride rather than popping at full size:
  // a mote that appears at its final size is a mote that was always there.
  float birth = staged(uProgress, 0.01 + offset, 0.07 + offset);
  float size = uSize * mix(0.75, 1.25, aSeed) * birth;
  gl_PointSize = size / max(-mvPosition.z, 1e-3);

  vFade = birth * (1.0 - release);
  // Fed by the GATHER, not by the open.
  //
  // Driving it from `open` was tried first and is wrong twice over. Visually: the
  // mass is the moment this pass exists for, and it was rendering in beam cyan on a
  // light grey background — the exact low-contrast trap that already forced the
  // landed colour to be dark rather than pale. A mass you cannot see is not a mass.
  //
  // And narratively it is better: the motes are light while they are IN the beams,
  // and become matter as they condense. The mass is already material, so it should
  // already be the display's graphite by the time it forms. The colour change now
  // marks light-becoming-substance, and the open is a change of shape rather than a
  // change of state.
  vSettle = gather;

  gl_Position = projectionMatrix * mvPosition;
}
