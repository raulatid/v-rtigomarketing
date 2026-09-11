// The lake surface.
//
// No noise. The surface is a sum of directional waves with analytic slopes:
// a few long swells crossing at angles, a set of shorter ripples running
// against them, and a faint capillary layer on top. Crossing wave trains
// interfere, and interference is what a real surface does; a single noise
// field only ever looks like noise.
//
// Shading is a reflection of a sky gradient weighted by fresnel, over a
// water body lit by a slow caustic pattern, with a sun glint on top. The key
// light matches the scene's, so the glint sits where the buildings' shading
// says the sun is.
uniform float uTime;
uniform float uWaveLength;      // world units; scales every wave train together
uniform float uSpeed;           // scales every wave train's speed together
uniform float uStrength;        // how much the waves tilt the normal
uniform float uGloss;           // sun glint tightness
uniform float uCaustics;        // how strongly light plays on the body
uniform vec3 uDeep;             // body colour looking straight down
uniform vec3 uShallow;          // body colour where light collects
uniform vec3 uSky;              // reflected overhead
uniform vec3 uHorizon;          // reflected at a grazing angle
uniform vec3 uLightDir;         // toward the key light

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

// One wave train: height and its gradient, accumulated. `dir` need not be
// normalised; its length is folded into the wavelength.
void wave(vec2 p, vec2 dir, float wavelength, float amplitude, float speed, inout float h, inout vec2 grad) {
  float k = 6.2831853 / (wavelength * uWaveLength);
  vec2 d = normalize(dir);
  float phase = dot(d, p) * k + uTime * speed * uSpeed;
  h += amplitude * sin(phase);
  grad += amplitude * k * cos(phase) * d;
}

// The surface slope at `p`, as a normal. Three families of wave trains.
vec3 surfaceNormal(vec2 p) {
  float h = 0.0;
  vec2 g = vec2(0.0);

  // Swells: long, slow, crossing at about sixty degrees.
  wave(p, vec2(1.0, 0.3), 9.0, 0.09, 0.55, h, g);
  wave(p, vec2(-0.4, 1.0), 7.2, 0.07, 0.62, h, g);
  wave(p, vec2(0.7, -0.8), 11.0, 0.06, 0.42, h, g);

  // Ripples: shorter, a little faster, running against the swells.
  wave(p, vec2(-1.0, -0.2), 3.4, 0.03, 1.1, h, g);
  wave(p, vec2(0.3, -1.0), 2.7, 0.025, 1.35, h, g);
  wave(p, vec2(0.9, 0.9), 4.1, 0.028, 0.95, h, g);

  // Capillary: barely there, but it breaks up the glint.
  wave(p, vec2(0.2, 1.0), 1.1, 0.006, 2.4, h, g);
  wave(p, vec2(-1.0, 0.6), 0.9, 0.005, 2.9, h, g);

  return normalize(vec3(-g.x * uStrength, 1.0, -g.y * uStrength));
}

// A band of light: bright along a moving line, dark between. Folded, so the
// bands are thin and the gaps wide, the way light focuses under a ripple.
float band(vec2 q, vec2 dir, float k, float t) {
  return 1.0 - abs(sin(dot(q, normalize(dir)) * k + t));
}

// Light collecting under the surface. Three bands in three directions are
// summed and the sum sharpened, so light shows only where two or three
// crests coincide: an irregular web of soft lines that wanders and knots,
// not a grid of dots and not blobs that pulse. Two such nets at different
// scales, drifting different ways, and the brighter wins. Sampled through
// the surface normal, so the web refracts with the waves.
float caustics(vec2 p, vec3 n) {
  float k = 1.6 / uWaveLength;
  vec2 q = p + n.xz * 2.0;
  float t = uTime * uSpeed * 0.5;
  float a = band(q, vec2(0.9, 0.4), k, t)
    + band(q, vec2(-0.5, 0.8), k * 1.15, -t * 1.2)
    + band(q, vec2(0.2, -1.0), k * 0.9, t * 0.7);
  float b = band(q + 7.0, vec2(0.3, -1.0), k * 0.6, t * 0.8)
    + band(q + 7.0, vec2(0.8, 0.7), k * 0.75, -t * 0.9)
    + band(q + 7.0, vec2(-1.0, 0.1), k * 0.65, t * 0.6);
  return pow(max(a, b) / 3.0, 6.0);
}

void main() {
  vec2 p = vWorldPosition.xz;
  vec3 up = normalize(vWorldNormal);
  vec3 n = surfaceNormal(p);
  // The mesh is flat and faces up; if it ever tilts, lean the wave normal with it.
  n = normalize(n + (up - vec3(0.0, 1.0, 0.0)));

  vec3 view = normalize(cameraPosition - vWorldPosition);
  vec3 light = normalize(uLightDir);

  // Fresnel: straight down you see the water, at a grazing angle the sky.
  float facing = max(dot(n, view), 0.0);
  float fresnel = 0.03 + 0.97 * pow(1.0 - facing, 5.0);

  vec3 reflected = reflect(-view, n);
  vec3 sky = mix(uHorizon, uSky, smoothstep(0.0, 0.6, reflected.y));

  float play = caustics(p, n) * uCaustics;
  vec3 body = mix(uDeep, uShallow, clamp(play, 0.0, 1.0));
  // Hemisphere shading, so a wave's lit side reads even from straight above,
  // where fresnel gives the reflection almost nothing to show.
  body *= 0.7 + 0.3 * max(dot(n, light), 0.0);

  // The glint: a tight sun and a broad sheen under it.
  vec3 halfway = normalize(light + view);
  float glint = pow(max(dot(n, halfway), 0.0), uGloss);
  float sheen = pow(max(dot(n, halfway), 0.0), uGloss * 0.08) * 0.08;

  vec3 color = mix(body, sky, fresnel) + vec3(glint * 1.2 + sheen);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
