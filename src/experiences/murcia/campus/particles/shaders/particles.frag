// A solid disc with a crisp edge. The rim is antialiased over exactly one
// pixel, from the screen-space derivative of the radius, so it is sharp at
// any size and never reads as a glow.
//
// Two tones: each particle wears the white or the accent, fixed per particle
// (aTone), so a shape reads as a mix of both rather than a blend of them.
uniform vec3 uColor;
uniform vec3 uAccent;
uniform float uOpacity;

varying float vAlpha;
varying float vTone;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float rim = fwidth(d);
  float disc = 1.0 - smoothstep(1.0 - rim, 1.0, d);
  float alpha = disc * vAlpha * uOpacity;
  if (alpha < 0.005) discard;
  gl_FragColor = vec4(mix(uColor, uAccent, vTone), alpha);
  #include <colorspace_fragment>
}
