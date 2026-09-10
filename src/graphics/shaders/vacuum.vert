// The standard full-screen pass vertex shader.
//
// `EffectComposer` draws a single triangle-pair quad in clip space, so there is no
// model or view transform to apply and `projectionMatrix * modelViewMatrix` is the
// identity-ish transform three's `ShaderPass` sets up. All this does is forward the
// UVs.

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
