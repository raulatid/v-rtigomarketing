// Self-contained by rule: no project-level #include anywhere in this
// experiment's GLSL (plan 001 amendment A4).
//
// One particle of the materialisation. The trajectory is entirely in `reveal.vert`;
// all this decides is what a single mote looks like and what colour it is by the
// time it gets there.
//
// ## Normal blending, not additive
//
// The obvious choice for glowing motes is additive, and it is wrong in this scene
// for the reason `districtFlow` already documents: the background is light grey, so
// additive saturates to white and the particles vanish into it exactly where they
// most need to read. Normal blending keeps them legible against the ground, the
// buildings and the plate alike.
//
// ## The colour tells the story
//
// A particle is born the colour of the beam that carries it and cools to the
// display's own neutral as it settles. That is one `mix` and it is doing narrative
// work: it says the projector light BECAME the structure, rather than the two being
// unrelated things that happen at the same moment. It is also the only place the
// beams' cyan and the panel's graphite are reconciled anywhere in the object.

/** The beam's colour — what a particle looks like leaving the projector. */
uniform vec3 uColorFrom;
/** The display's own neutral — what it has cooled to by the time it lands. */
uniform vec3 uColorTo;
uniform float uOpacity;

varying float vFade;
varying float vSettle;
varying float vSeed;

void main() {
  // A soft round mote. `gl_PointCoord` runs 0..1 across the sprite, so this is a
  // radial falloff with no texture to load and nothing to dispose.
  //
  // The inner edge is at 0.30 rather than at 0.0 so there is a small solid core:
  // a pure gradient dot reads as a blur, and at three or four pixels it reads as
  // nothing at all.
  float d = length(gl_PointCoord - 0.5);
  float mote = 1.0 - smoothstep(0.30, 0.5, d);

  // Discarding the corners is worth it here: these are hundreds of overlapping
  // transparent sprites and the fully transparent ring is most of each quad.
  if (mote <= 0.001) discard;

  vec3 color = mix(uColorFrom, uColorTo, vSettle);

  // Per-particle brightness variation, so a settled outline reads as many separate
  // motes rather than as a dotted line drawn at one value.
  float variation = mix(0.75, 1.0, vSeed);

  float alpha = mote * vFade * uOpacity * variation;

  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));

  // NOT OPTIONAL, AND THE FAILURE IS SILENT — plan 001 amendment A3.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
