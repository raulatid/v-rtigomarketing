// Self-contained by rule: no project-level #include anywhere in this module's
// GLSL, so it can move between repositories as it is.
//
// `LED_Main` ships REAL authored UVs at the screen's physical aspect — measured,
// not assumed: 1024 × 3686 of artwork over 42.8 m × 154 m, v running top to
// bottom. So this passes them straight through, and every coordinate the
// fragment shader needs is already in them.
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
