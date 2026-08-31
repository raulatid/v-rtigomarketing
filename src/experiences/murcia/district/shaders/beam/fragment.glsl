// A projection beam: a cone that has to read as volume rather than as a cone.
//
// The whole trick is the grazing-angle term. A translucent cone lit evenly looks
// like a solid object with low opacity; brightening it where the surface turns
// away from the eye is what makes it read as light with nothing inside it.

#include <fog_pars_fragment>

uniform float uActivation;
uniform float uIntensity;
uniform float uTime;
uniform vec3 uColor;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  // v runs from the projector (0) to the panel (1) — see the geometry's
  // orientation in servicesDisplay.ts. Brightest at the source, thinning as it
  // travels, so the beam looks emitted rather than drawn.
  float alongBeam = 1.0 - smoothstep(0.0, 1.0, vUv.y);

  // Grazing angle: 0 face-on, 1 at the silhouette.
  float grazing = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
  float edge = pow(clamp(grazing, 0.0, 1.0), 1.6);

  // A slow travelling ripple, small enough to suggest the beam is live without
  // becoming a second animation competing with the ring.
  float pulse = 0.88 + 0.12 * sin(vUv.y * 12.0 - uTime * 2.2);

  float alpha = alongBeam * edge * uIntensity * pulse * uActivation;

  gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));

  // NOT OPTIONAL, AND THE FAILURE IS SILENT — plan 001 amendment A3.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
