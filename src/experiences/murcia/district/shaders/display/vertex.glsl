// No project-level #include: every chunk below is one of three's own
// (plan 001 §A4, docs/plans/010-services-district/).
//
// Unlike the model's meshes, this plane is built in code, so its UVs are real
// and usable — the ring and exit shaders derive coordinates from position only
// because the authored meshes ship degenerate UVs.
// Fog is opted into the way `water/shaders/rio/*` does. Murcia's scene fog is
// `null` today, so `USE_FOG` is undefined and every chunk below compiles to
// nothing; the cost is zero, and the district will not be the one thing that
// ignores fog on the day it is switched on.
#include <fog_pars_vertex>

varying vec2 vUv;

void main() {
  vUv = uv;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
