// The district's flowing material: two ring bands and five connection wedges,
// all drawn by this one shader.
//
// ## Where the seam went
//
// The band wraps through +/-PI, and anything written as a function of `atan()`
// is discontinuous there. The hex lattice this replaces paid for that with an
// integer cell COUNT, so the lattice closed exactly at the join. The same
// invariant is still enforced here, but it now has one term to govern instead of
// the whole pattern, because the work is split in two:
//
//   the ORGANIC field is sampled on world (x, z) — Cartesian, where no seam
//   exists at all. A plane is continuous everywhere, so the pattern closes
//   because it was never cut;
//
//   the TRAVELLING phase is the only thing that reads an angle, and it
//   multiplies it by a WHOLE number. `sin(k * angle)` with integer k is exactly
//   2*PI-periodic, so it matches across +/-PI in value and in derivative.
//
// The inward component is added to that phase rather than blended with it. A
// `mix()` between the two would scale the angular term by something other than a
// whole number and reopen the seam — which is the trap, because it looks correct
// everywhere except along one ray.
//
// ## Two rules this shader will not break
//
// Never take `fwidth()` or `dFdx()` of anything derived from the angle. `atan`
// jumps by 2*PI at the seam and the derivative of that jump is enormous, so a
// screen-space-width smoothstep draws a bright hairline along +/-PI even where
// the values either side are identical. Every smoothstep below has fixed edges.
//
// Never write `smoothstep(a, b, x)` with `a >= b`. The spec leaves it undefined;
// the old ring shader relied on it and got away with it on every driver anyone
// tried, which is exactly how that kind of thing survives to bite later.

precision highp float;

#include <fog_pars_fragment>

uniform float uTime;
/** 0..1 for THIS element, already staggered and eased on the CPU. */
uniform float uActivation;
/** Eased on the CPU. The shader never decides what colour anything is. */
uniform vec3 uColor;
uniform float uOpacity;
uniform float uIntensity;
/** Shared by all seven, so the organic field stays coherent across junctions. */
uniform float uFlowSpeed;
/** Waves per world unit. */
uniform float uFlowScale;
/** How hard the currents bend each other. 0 is a regular swell. */
uniform float uWarp;
/** Per element: how fast the bands themselves run. */
uniform float uTravelScale;
/** WHOLE number of currents around the ring. Zero on a connection. */
uniform float uAngularHarmonic;
/** How much of the travel runs inward instead of around. */
uniform float uRadialFlow;
/** The district axis in world x/z. One measured value, shared by all seven. */
uniform vec2 uCenter;
/** This mesh's own measured (min, max) radius. */
uniform vec2 uRadialRange;
/** This mesh's own measured (min, max) world height. */
uniform vec2 uHeightRange;
/** Object-space (centre, half-width). A half-width of 0 means "full ring". */
uniform vec2 uAngularRange;
uniform float uEdgeSoftness;
/** Brightness of the bloom toward the band's inner edge. */
uniform float uEdgeEmphasis;
/** How much of the pattern survives outside the district. */
uniform float uRestLevel;

varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vWorldNormal;

const float TAU = 6.2831853;
const float PI = 3.14159265;

/** How soft the leading edge of the reveal is, as a fraction of the band. */
const float REVEAL_SOFT = 0.35;

/**
 * Directions advance by the golden angle and frequencies by an irrational ratio,
 * so no two terms ever line up. That is what keeps the field from repeating and
 * from showing the k-fold rosette a stack of `sin(k * angle)` would.
 */
const float GOLDEN_ANGLE = 2.39996323;
#define FLOW_WAVES 5

/**
 * A sum of plane waves travelling in five directions.
 *
 * Each term is a single band-limited sinusoid, so under minification the sum
 * fades toward flat rather than sparkling. That decides this shader: these are
 * flat surfaces lying on the ground, seen at grazing angles from a camera the
 * visitor controls, and a hash-based noise shimmers under exactly that.
 */
float flowField(vec2 q, float t) {
  float sum = 0.0;
  float norm = 0.0;
  float amp = 1.0;
  float freq = 1.0;
  float dir = 0.0;

  // The bound is a #define because GLSL ES 1.00 requires loop limits to be
  // constant expressions — a parameter, even a const one, does not compile on
  // strict drivers.
  for (int i = 0; i < FLOW_WAVES; i++) {
    vec2 d = vec2(cos(dir), sin(dir));
    sum += amp * sin(dot(q, d) * freq + t * (1.0 + float(i) * 0.31));
    norm += amp;
    amp *= 0.63;
    freq *= 1.73;
    dir += GOLDEN_ANGLE;
  }

  return sum / norm;
}

void main() {
  vec2 p = vWorld.xz - uCenter;
  float radius = length(p);
  vec3 n = normalize(vWorldNormal);

  // 1 on a horizontal face, 0 on a vertical wall. The bands have real thickness
  // now, so this is the difference between the top of the band and its sides.
  float up = abs(n.y);

  // Where this fragment sits in the mesh's own height: 0 at its base, 1 at its
  // top.
  float rise = clamp(
    (vWorld.y - uHeightRange.x) / max(uHeightRange.y - uHeightRange.x, 1e-4),
    0.0,
    1.0
  );

  // --- unrolling the profile -------------------------------------------------
  //
  // A field sampled on world (x, z) alone is CONSTANT down a vertical wall —
  // every height on it samples the same point — so the wall renders as vertical
  // streaks. That was invisible while these meshes were flat annuli and is the
  // main thing that breaks now that they are box sections.
  //
  // Unrolling fixes it by continuing the journey the top face was making: going
  // down the OUTER wall carries on outward, and down the INNER wall carries on
  // inward, so the pattern flows over the lip instead of stopping dead at it.
  // Same idea the hex lattice used before it, for the same geometry.
  float drop = (1.0 - rise) * (uHeightRange.y - uHeightRange.x);
  // +1 on a wall facing away from the axis, -1 on one facing toward it. The
  // epsilon only decides the top face, where `1.0 - up` is zero and it cannot
  // matter.
  float outward = sign(dot(n.xz, p) + 1e-6);
  float unrolled = radius + (1.0 - up) * outward * drop;

  vec2 direction = radius > 1e-4 ? p / radius : vec2(1.0, 0.0);
  vec2 q = direction * unrolled;

  // --- the organic part: no angle anywhere, so no seam anywhere -------------
  //
  // One domain-warp pass, and it is the whole difference between "waves" and
  // "current": without it the field is a regular swell; with it the streamlines
  // bend around one another the way a fluid's do.
  float fieldTime = uTime * uFlowSpeed;
  float warpAngle = flowField(q * uFlowScale * 0.45, fieldTime * 0.22) * PI;
  vec2 warped = q * uFlowScale + vec2(cos(warpAngle), sin(warpAngle)) * uWarp;
  float field = flowField(warped, fieldTime * 0.5);

  // --- the travelling part: a whole harmonic, exact at the seam -------------
  //
  // ADDED, not mixed. `uAngularHarmonic` keeps its full integer coefficient, and
  // the inward term is a function of radius alone, which has no seam of its own.
  // The two together read as a spiral on a ring and as a straight run inward on
  // a connection, without the angular term ever losing its periodicity.
  //
  // The inward term reads the UNROLLED radius, so a current running in toward the
  // ring keeps travelling as it crosses the lip rather than stalling on the wall.
  float angle = atan(p.y, p.x);
  float phase = uAngularHarmonic * angle
              - unrolled * uFlowScale * TAU * uRadialFlow
              - fieldTime * uTravelScale * 1.7;

  // The field bends the PHASE rather than being added to the colour, so the
  // bands themselves meander. That is what stops a ring reading as concentric
  // circles and a connection as a barcode.
  float current = sin(phase + field * 2.4) * 0.5 + 0.5;
  current = pow(current, 1.7);

  // --- how this patch fades at its own edges --------------------------------
  //
  // Where this fragment sits across the mesh radially, 0 at its inner edge and 1
  // at its outer. Read from the TRUE radius rather than the unrolled one, because
  // this drives the reveal front, and a front that ran up the walls out of step
  // with the top face would break the single sweep outward.
  float across = clamp(
    (radius - uRadialRange.x) / max(uRadialRange.y - uRadialRange.x, 1e-3),
    0.0,
    1.0
  );

  // NO radial fade any more. These meshes are solid volumes now, and their own
  // geometry carries the silhouette; a band that dissolved at its own walls would
  // read as a rendering fault rather than as atmosphere — the same argument the
  // display's plate settled. All that is left is a soft foot where a wall meets
  // the plaza, so the band sits on the ground instead of being cut off by it.
  float band = smoothstep(0.0, uEdgeSoftness, rise);

  // Sides, in object space, where a connection sits nowhere near the wrap. The
  // difference is still wrapped through `atan(sin, cos)`: two instructions that
  // remove a whole class of bug if a future export drops a wedge near +/-PI in
  // its own frame.
  float side = 1.0;
  if (uAngularRange.y > 0.0) {
    float delta = atan(vLocal.z, vLocal.x) - uAngularRange.x;
    delta = atan(sin(delta), cos(delta));
    float sideCoord = clamp(abs(delta) / uAngularRange.y, 0.0, 1.0);
    side = 1.0 - smoothstep(1.0 - uEdgeSoftness, 1.0, sideCoord);
  }

  float mask = band * side;

  // --- the reveal: a front running outward from the inner edge --------------
  //
  // Each element's activation is staggered on the CPU — the ring first, the
  // connections behind it — and within each, the fill runs from its own inner edge
  // outward. Together that reads as the system flooding out from the plaza toward
  // the buildings, rather than as a light switch or a rotating wipe.
  float front = uActivation * (1.0 + REVEAL_SOFT);
  float reveal = 1.0 - smoothstep(front - REVEAL_SOFT, front, across);
  reveal = max(reveal, uRestLevel);

  // Soft bloom toward the inner edge, so the plaza reads as the source.
  float rim = exp(-across * 4.0) * uEdgeEmphasis;

  // Floored on purpose. A current that reaches zero strobes, and the dark half
  // of the wave still has to read as the base colour rather than as a gap.
  float luminance = (0.55 + current * 0.75) * uIntensity + rim;

  float alpha = mask * reveal * uOpacity * mix(0.6, 1.0, current);

  gl_FragColor = vec4(uColor * luminance, clamp(alpha, 0.0, 1.0));

  // NOT OPTIONAL, AND THE FAILURE IS SILENT.
  //
  // three applies tone mapping and output colour conversion in-shader, and only
  // for its own materials. A raw ShaderMaterial gets neither. Omit these two and
  // the surface looks perfectly reasonable here and washed out in any app that
  // renders on the direct route. Plan 001 amendment A3.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
