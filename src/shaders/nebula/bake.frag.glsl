precision highp float;

uniform vec3 uBandAxis;
uniform float uBandWidth;
uniform float uBrightness;
uniform float uDustDensity;
uniform vec3 uCoreColor;
uniform vec3 uDustColor;
uniform vec3 uHydrogenColor;
uniform float uSeed;

varying vec3 vDirection;

// GLSL TWIN of `bandDensity` in src/space/galaxyBand.ts. Kept to one line so
// the duplication cannot hide a discrepancy; the axis and width arrive as
// uniforms derived from that same module, so only the gaussian is duplicated.
// If you change it there, change it here.
float bandDensity(vec3 dir, vec3 axis, float width) {
  float t = dot(dir, axis) / width;
  return exp(-t * t);
}

float hash13(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float valueNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y),
    mix(
      mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y),
    f.z);
}

float fbm(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += amp * valueNoise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return sum;
}

// Ridged noise gives sharp filaments where plain fbm gives blobs. This is what
// makes the dust lanes read as lanes.
float ridged(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += amp * (1.0 - abs(valueNoise(p) * 2.0 - 1.0));
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec3 dir = normalize(vDirection);
  vec3 p = dir * 2.4 + uSeed;

  float band = bandDensity(dir, uBandAxis, uBandWidth);

  // Each of these is an EXPLICIT structural term. Plain fbm alone produces
  // undifferentiated noise soup that reads as fog, not as a galaxy; the
  // structure has to be authored rather than left to emerge.

  // Core — the bright concentration along the plane.
  float core = pow(band, 3.0);

  // Warm dust filling the band, broken up so it is not a smooth smear.
  float clouds = fbm(p * 1.6, 5);
  float dust = band * smoothstep(0.25, 0.85, clouds);

  // Dust lanes cutting ACROSS the plane. The single most recognisable feature
  // of a galaxy seen edge-on, and the reason this is not just a bright stripe.
  float lanes = ridged(p * 2.7 + 11.3, 4);
  float lane = smoothstep(0.55, 0.95, lanes) * uDustDensity;

  // Hydrogen — sparse, faint, lower frequency, only loosely band-bound.
  float h = fbm(p * 0.9 + 47.1, 3);
  float hydrogen = smoothstep(0.62, 0.92, h) * (0.35 + 0.65 * band);

  vec3 color = uDustColor * dust
             + uCoreColor * core * 0.9
             + uHydrogenColor * hydrogen * 0.55;

  color *= (1.0 - lane * 0.85);
  color *= uBrightness;

  gl_FragColor = vec4(color, 1.0);

  // Required by project rule. A no-op when the destination is the linear cube
  // render target, and correct if this shader is ever pointed at the canvas.
  #include <colorspace_fragment>
}
