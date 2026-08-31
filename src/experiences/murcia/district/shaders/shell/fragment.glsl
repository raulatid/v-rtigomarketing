// The display's body: the plate the copy sits on.
//
// ## This supersedes the constraint in `display.frag`'s header
//
// Commit 1fdfacd, "dissolve the display's silhouette", made the panel's rectangle
// deliberately impossible to locate. That was right for what the display was: a
// lone plane with no body, whose rectangle — once findable — read as a rectangle,
// so the fix was to make it unfindable.
//
// This object has a body. A solid plate that fades out at its own edge does not
// read as atmosphere; it reads as a rendering fault. The silhouette is deliberate
// now, and it is carried by GEOMETRY rather than drawn by a shader, which is the
// only way an edge stays consistent at every camera angle the visitor can reach.
//
// ## Nothing here varies with time
//
// There is no `uTime` uniform, and that is a decision rather than an omission. A
// premium interface object is stable; anything that pulses, drifts or scans on a
// five-pixel rim reads as a prop. The holographic quality has to come from how the
// edge catches light, not from motion.

#include <fog_pars_fragment>

uniform float uActivation;
uniform float uThickness;
/** Half-extents of the plate, object space. */
uniform vec2 uHalfSize;
uniform float uCornerRadius;
/** The lighter band just inside the silhouette, framing the copy. */
uniform float uBevelWidth;
uniform float uBevelLift;
uniform float uRimBase;
uniform float uRimPeak;
uniform float uRimGrazing;
uniform float uRimDepthFade;
uniform vec3 uBodyColor;
uniform vec3 uRimColor;

varying vec3 vLocal;
varying vec3 vLocalNormal;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

/** Signed distance to a rounded box. Negative inside. */
float roundedBoxSdf(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  // Exactly 1.0 on the caps and exactly 0.0 on every rim wall.
  //
  // `ExtrudeGeometry` is non-indexed and finishes with `computeVertexNormals()`,
  // which on non-indexed geometry produces FLAT per-face normals. So this is a
  // clean binary surface mask with no threshold to tune — the reason the rest of
  // this shader is as short as it is.
  float facing = clamp(vLocalNormal.z, 0.0, 1.0);

  vec3 color = uBodyColor;

  // --- front cap -------------------------------------------------------------
  //
  // One band inside the silhouette, and nothing else. The copy sits on this face,
  // and anything more here competes with type — which readability wins by rule.
  // The band occupies the bleed ring OUTSIDE the readable core, so it frames the
  // copy without ever being underneath it.
  float sdf = roundedBoxSdf(vLocal.xy, uHalfSize, uCornerRadius);
  float band = smoothstep(-uBevelWidth, -uBevelWidth * 0.35, sdf) *
               (1.0 - smoothstep(-uBevelWidth * 0.10, 0.0, sdf));
  color += uRimColor * band * uBevelLift * facing;

  // --- rim -------------------------------------------------------------------
  float rimMask = 1.0 - facing;

  // OBJECT space, deliberately.
  //
  // The panel yaws +/-42 degrees to follow the camera. A world-space light
  // direction would slide this highlight around the rim as it turns, and a moving
  // specular on a five-pixel edge is exactly the instability this object must not
  // have. In object space the lit edge is always the same edge.
  //
  // And it is the BOTTOM edge that carries it. The panel leans back, so its top
  // rim points up and away from any camera in front of it — a top light is
  // invisible precisely when it is wanted. The bottom rim faces a camera that
  // sits above, it is the edge the projector beams converge toward, and it is the
  // edge nearest the controls.
  float fromBelow = smoothstep(-1.0, 0.35, -vLocalNormal.y);

  // Grazing angle — the same device `beam.frag` uses, so this is house
  // vocabulary rather than a new one. It is what keeps the edge readable from ANY
  // camera angle instead of only the one it was tuned at.
  float grazing = 1.0 - abs(dot(normalize(vWorldNormal), normalize(vViewDir)));

  // Front lip brighter than the back. Over half a world unit of depth this is the
  // difference between a machined edge and a painted stripe.
  float depth01 = clamp(1.0 - vLocal.z / max(uThickness, 1e-3), 0.0, 1.0);
  float lip = mix(1.0, uRimDepthFade, depth01);

  float rim = rimMask * lip *
    (uRimBase + uRimPeak * fromBelow + uRimGrazing * pow(clamp(grazing, 0.0, 1.0), 1.6));

  color += uRimColor * rim;

  // Alpha is the activation and nothing else: at rest this is an opaque plate.
  // `depthWrite` stays TRUE on this material — that is what backs the copy and
  // what occludes the beams, and it is the mechanism, not the render order.
  gl_FragColor = vec4(color, clamp(uActivation, 0.0, 1.0));

  // NOT OPTIONAL, AND THE FAILURE IS SILENT — plan 001 amendment A3.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
