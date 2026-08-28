// Rio water — vertex stage.
//
// Nothing beyond the transform: the fragment stage works entirely from the
// world-space position. The mesh UVs are unusable (every vertex carries the
// same coordinate — see riverFrame.ts), and the bank outline and flow axis the
// fragment stage needs arrive as uniforms, not attributes.

#include <common>
#include <fog_pars_vertex>

varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;

  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
