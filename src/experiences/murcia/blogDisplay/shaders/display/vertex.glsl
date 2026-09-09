// Self-contained by rule: no project-level #include anywhere in this
// experiment's GLSL (plan 001 amendment A4).
//
// Unlike the model's meshes, this plane is built in code, so its UVs are real
// and usable — the ring and exit shaders derive coordinates from position only
// because the authored meshes ship degenerate UVs.
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
