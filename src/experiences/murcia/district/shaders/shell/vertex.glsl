// No project-level #include: every chunk below is one of three's own
// (plan 001 §A4, docs/plans/010-services-district/).

// No UVs anywhere in this shader.
//
// `ExtrudeGeometry` maps its caps from the shape's own x/y and its walls from
// (position along the contour, depth). Neither is a normalised space, and the two
// do not agree with each other, so there is nothing a fragment shader could do
// with them. Local position and local normal carry the whole thing instead.
// Fog is opted into the way `water/shaders/rio/*` does. Murcia's scene fog is
// `null` today, so `USE_FOG` is undefined and every chunk below compiles to
// nothing; the cost is zero, and the district will not be the one thing that
// ignores fog on the day it is switched on.
#include <fog_pars_vertex>

varying vec3 vLocal;
varying vec3 vLocalNormal;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

void main() {
  vLocal = position;
  vLocalNormal = normal;

  // `mat3(modelMatrix)`, NOT a normal matrix.
  //
  // Correct only because this mesh is never scaled — which is the same fact that
  // makes `displayShell.setDimensions` rebuild the geometry instead of scaling it.
  // Introduce a non-uniform scale and the rim lighting skews silently, with
  // nothing anywhere to say why. The two sites have to change together or not at
  // all.
  vWorldNormal = normalize(mat3(modelMatrix) * normal);

  vec4 world = modelMatrix * vec4(position, 1.0);
  vViewDir = cameraPosition - world.xyz;

  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
