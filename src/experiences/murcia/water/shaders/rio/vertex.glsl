// Rio water — vertex stage.
//
// Nothing beyond the transform, plus, on the river, its channel coordinates:
// the fragment stage works from the world-space position. The mesh UVs are
// unusable (every vertex carries the same coordinate — see riverFrame.ts), so
// the channel coordinates are solved at load and set as attributes, and the
// bank outline arrives as uniforms.

#include <common>
#include <fog_pars_vertex>

varying vec3 vWorldPosition;

#ifdef USE_RIVER_CHANNEL
// RiverChannel (riverFrame.ts): metres (along, across) the centre line, and the
// local current direction, local XZ.
attribute vec2 riverCoord;
attribute vec2 riverTangent;
varying vec2 vRiverCoord;
varying vec2 vRiverTangent;
#endif

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;

  #ifdef USE_RIVER_CHANNEL
  vRiverCoord = riverCoord;
  vRiverTangent = (modelMatrix * vec4(riverTangent.x, 0.0, riverTangent.y, 0.0)).xz;
  #endif

  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
