// A solid disc with a crisp edge. The rim is antialiased over exactly one
// pixel, from the screen-space derivative of the radius, so it is sharp at
// any size and never reads as a glow.
uniform vec3 uColor;
uniform float uOpacity;

varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float rim = fwidth(d);
  float disc = 1.0 - smoothstep(1.0 - rim, 1.0, d);
  float alpha = disc * vAlpha * uOpacity;
  if (alpha < 0.005) discard;
  gl_FragColor = vec4(uColor, alpha);
  #include <colorspace_fragment>
}
