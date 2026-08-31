// No project-level #include: every chunk below is one of three's own. The rule
// came from plan 001 §A4 (docs/plans/010-services-district/) and earned its keep
// — it is what let this shader cross from the lab's vite-plugin-glsl 1.6 to this
// app's 1.3 without a line changing.

// TWO frames, and each is used only where it is the correct one.
//
// `vWorld` carries the flow field. All seven meshes share one node translation
// and differ only by a Y rotation, and the five connections are literally the
// SAME authored patch — every one of them sits at about +45 degrees in its own
// object space. In object space they would therefore all render a pixel-identical
// copy of one wedge, in a frame the rings do not share, and the field would break
// exactly at the ring/connection junction where it most needs to be continuous.
// World space is the one frame all seven agree on, and the district never moves.
//
// `vLocal` carries the side mask. That is a property of the authored patch rather
// than of the district, and in object space every connection sits near +45
// degrees — nowhere near the angular wrap.
// The world normal tells the fragment shader which SURFACE of the band it is on.
//
// These meshes have real thickness now — the ring is a box-section band and the
// connections are slabs — so "top face" and "vertical wall" are different places
// that need different treatment, and the normal is the only thing that
// distinguishes them.
// Fog is opted into the way `water/shaders/rio/*` does. Murcia's scene fog is
// `null` today, so `USE_FOG` is undefined and every chunk below compiles to
// nothing; the cost is zero, and the district will not be the one thing that
// ignores fog on the day it is switched on.
#include <fog_pars_vertex>

varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vWorldNormal;

void main() {
  vLocal = position;
  // `mat3(modelMatrix)` rather than a normal matrix: these nodes carry rotation
  // and translation only, never scale, so the two are the same here.
  vWorldNormal = mat3(modelMatrix) * normal;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;

  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
