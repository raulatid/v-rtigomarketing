// The lake surface. The mesh is a flat disc with a couple of hundred
// vertices, so nothing moves here; the waves are entirely in the fragment
// normal. This only hands over where the fragment is in the world.
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
