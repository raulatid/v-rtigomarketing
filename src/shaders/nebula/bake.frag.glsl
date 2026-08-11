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

  // THE FREQUENCY IS LOAD-BEARING, and it is the thing that was wrong first.
  // `dir` is a unit vector, so the noise lattice only ever sees the domain
  // this scalar defines. At the 2.4 first tried, the whole sky spanned about
  // eight integer cells — features came out ~23 degrees wide, so roughly two
  // of them filled a 45 degree viewport and the result read as fog rather than
  // as a galaxy. At 8.0 a cell is a few degrees and the octaves have somewhere
  // to go. Lower this and you get soup back.
  vec3 p = dir * 8.0 + uSeed;

  float band = bandDensity(dir, uBandAxis, uBandWidth);

  // Each of these is an EXPLICIT structural term. Plain fbm alone produces
  // undifferentiated noise soup; the structure has to be authored.

  // Core — the bright concentration along the plane. A high power keeps it a
  // spine rather than a wash.
  //
  // Mottled, because `band` is a smooth analytic gaussian: on its own the core
  // renders as a clean gradient down the plane, which reads as a searchlight
  // beam rather than as gas. The noise is what makes it a substance.
  float coreMottle = fbm(p * 2.2 + vec3(3.7, 19.2, 6.4), 4);
  float core = pow(band, 4.0) * (0.45 + 0.9 * coreMottle);

  // Warm dust filling the band, broken up so it is not a smooth smear. The
  // threshold is deliberately high: what makes a sky read is the DARK between
  // the structures, not the structures.
  float clouds = fbm(p * 3.0, 5);
  float dust = pow(band, 1.5) * smoothstep(0.44, 0.86, clouds);

  // Dust lanes cutting ACROSS the plane. The single most recognisable feature
  // of a galaxy seen edge-on, and the reason this is not just a bright stripe.
  //
  // Note the `* band`. Without it the ridged filaments are applied to the whole
  // sky including the empty parts, and a multiply against near-black is still
  // visible — the result was a crazed, cracked-marble texture over everything.
  // Lanes are dust occluding dust; where there is no dust there is no lane.
  float lanes = ridged(p * 4.5 + vec3(11.3, 5.1, 8.7), 3);
  float lane = smoothstep(0.62, 0.95, lanes) * uDustDensity * band;

  // Hydrogen — sparse, faint, lower frequency, mostly band-bound.
  float h = fbm(p * 1.8 + vec3(47.1, 13.9, 29.4), 3);
  float hydrogen = smoothstep(0.66, 0.94, h) * (0.08 + 0.92 * band);

  vec3 color = uDustColor * dust * 0.8
             + uCoreColor * core * 0.9
             + uHydrogenColor * hydrogen * 0.5;

  color *= (1.0 - lane * 0.55);
  color *= uBrightness;

  gl_FragColor = vec4(color, 1.0);

  // Required by project rule. A no-op when the destination is the linear cube
  // render target, and correct if this shader is ever pointed at the canvas.
  #include <colorspace_fragment>
}
