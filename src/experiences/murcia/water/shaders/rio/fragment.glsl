// Rio water — fragment stage.
//
// Layered so each contribution can be read on its own: ripple normals, then the
// bank ramp, then fresnel-to-sky, then the wall shadow.
//
// TONE MAPPING AND COLOUR SPACE ARE HANDLED HERE, AT THE BOTTOM, AND THAT IS
// NOT OPTIONAL. three applies tone mapping in-shader only for its own
// materials; a raw ShaderMaterial that skips the two chunks below renders
// correctly in isolation and washed-out in the app, with nothing to point at.
// starShader.ts and warpStarShader.ts carry the same warning.
//
// The two chunks are also correct on BOTH of Murcia's render routes, which is
// not obvious. Murcia normally renders direct to the canvas, but RenderPipeline
// flips to `direct-composited` — through the composer, ending in OutputPass —
// for the ~1.6 s of a warp, which looks like a double-tone-mapping trap. It is
// not: three gates TONE_MAPPING on `toneMapped && currentRenderTarget == null`
// and forces Linear output for any render target, and both are in the program
// cache key. So these chunks fire on the direct route and self-disable inside
// the composer, where OutputPass does the work — applied exactly once either
// way. Do not "fix" this by setting material.toneMapped.

#include <common>
#include <fog_pars_fragment>

uniform float uTime;

uniform float uFlowSpeed;
uniform float uRippleScale;
uniform float uRippleStrength;
uniform float uRippleLayerRatio;

uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uSkyColor;
uniform float uShoreWidth;

uniform float uWallShadowStrength;
uniform float uWallShadowWidth;
uniform vec3 uWallShadowColor;

uniform float uFresnelPower;
uniform float uFresnelBias;

/**
 * The bank outline as world-space segments (xz of one end, xz of the other),
 * so the distance to the nearest bank can be measured exactly at every pixel.
 * Must be supplied (`setBankSegments`); with count 0 the whole surface reads
 * as mid-channel.
 */
#define MAX_BANK_SEGMENTS 32
uniform vec4 uBankSegments[MAX_BANK_SEGMENTS];
uniform int uBankSegmentCount;

/**
 * The overall river axis, world XZ, unit, pointing downstream. The noise is
 * stretched and advected along this ONE fixed axis. A frame that rotates with
 * the local current shears the pattern by (distance from the world origin) x
 * (rotation), and the domain is ~40 cells wide, so a few degrees of turn inside
 * one triangle smeared the ripples into streaks with a hard seam. On the
 * sharpest bends the texture now runs a little off the local current, which at
 * the Murcia camera distance is not visible; the seam was.
 */
uniform vec2 uFlowAxis;

varying vec3 vWorldPosition;

// ---------------------------------------------------------------------------
// Noise
//
// Gradient noise with an ANALYTIC derivative, so the ripple normal is exact and
// costs no neighbour taps. Texture-free on purpose: GPU memory is the binding
// constraint on iOS in the target app.
//
// This replaced a sum of directional sines: a handful of sines with comparable
// gradient weights interfere into a regular quilted lattice that the eye reads
// as a repeating pattern immediately. Noise has no such period.
// ---------------------------------------------------------------------------

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
}

/** Gradient noise. .x = value (about -0.7..0.7), .yz = d(value)/d(p). */
vec3 gradientNoiseD(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  // Quintic fade and its derivative, so the second derivative is continuous
  // too — cubic fade leaves a visible crease in the NORMAL at every cell edge.
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);

  vec2 ga = hash22(i + vec2(0.0, 0.0));
  vec2 gb = hash22(i + vec2(1.0, 0.0));
  vec2 gc = hash22(i + vec2(0.0, 1.0));
  vec2 gd = hash22(i + vec2(1.0, 1.0));

  float va = dot(ga, f - vec2(0.0, 0.0));
  float vb = dot(gb, f - vec2(1.0, 0.0));
  float vc = dot(gc, f - vec2(0.0, 1.0));
  float vd = dot(gd, f - vec2(1.0, 1.0));

  float k = va - vb - vc + vd;
  float value = va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k;
  vec2 deriv = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd)
    + du * (u.yx * k + vec2(vb, vc) - va);

  return vec3(value, deriv);
}

// ---------------------------------------------------------------------------
// Ripples
// ---------------------------------------------------------------------------

// Four octaves: with three the finest cell was ~3 m and from anywhere closer
// than the Murcia camera the sun highlight became soft 5 m patches that read
// as clouds. The fourth is faded out by distance before it can alias.
const int RIPPLE_OCTAVES = 4;

/**
 * Ripple height and its XZ gradient in a single pass.
 *
 * Sampled in the (along, across) frame of the river axis, with the along axis
 * stretched 2.5x, so every feature is elongated downstream — that is what makes
 * the field read as a current. Each octave fades out once its cells drop below
 * a couple of pixels; without that the far river shimmers, because sub-pixel
 * normal detail becomes sparkle.
 */
vec3 rippleField(vec2 p, vec2 axis, float time) {
  vec2 acrossAxis = vec2(-axis.y, axis.x);
  float along = dot(p, axis);
  float across = dot(p, acrossAxis);

  // .x = height, .yz = d(height)/d(p)
  vec3 acc = vec3(0.0);
  float amplitude = 1.0;
  float frequency = 1.0;
  float totalAmplitude = 0.0;

  // Octaves drift at different speeds so they slide against each other rather
  // than moving as one sheet. Non-integer ratios, so they never re-align.
  float drifts[4];
  drifts[0] = 1.0; drifts[1] = 1.31; drifts[2] = 0.77; drifts[3] = 1.13;

  const float ALONG_STRETCH = 0.4;

  for (int i = 0; i < RIPPLE_OCTAVES; i++) {
    vec2 q = vec2(
      (along - time * drifts[i]) * ALONG_STRETCH,
      across + 7.3 * float(i)
    ) * frequency;

    // Cells per pixel. Past ~0.5 the octave is under two pixels wide and can
    // only alias, so it is faded rather than sampled.
    float cellsPerPixel = length(fwidth(q));
    float fade = 1.0 - smoothstep(0.2, 0.5, cellsPerPixel);

    vec3 n = gradientNoiseD(q);
    float weight = amplitude * fade;
    acc.x += n.x * weight;
    // Chain rule back to world XZ.
    acc.yz += (n.y * ALONG_STRETCH * axis + n.z * acrossAxis) * frequency * weight;

    totalAmplitude += amplitude;
    amplitude *= 0.5;
    frequency *= uRippleLayerRatio;
  }

  return acc / max(totalAmplitude, 0.001);
}

// ---------------------------------------------------------------------------
// Bank distance
//
// Exact distance from the pixel to the nearest bank segment, in metres.
//
// Measured against the outline rather than interpolated from the vertices
// because the ribbon has no interior vertices: any per-vertex field is linear
// across 35 m triangles and kinks on every diagonal where the river bends,
// which a 1.5 m band shows as a step. Twenty segment tests per river pixel is
// cheap — the river is a few percent of the screen.
// ---------------------------------------------------------------------------

float bankDistance(vec2 p) {
  float nearest = 1e9;
  for (int i = 0; i < MAX_BANK_SEGMENTS; i++) {
    if (i >= uBankSegmentCount) break;
    vec4 s = uBankSegments[i];
    vec2 ab = s.zw - s.xy;
    vec2 ap = p - s.xy;
    float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    nearest = min(nearest, length(ap - ab * t));
  }
  return nearest;
}

void main() {
  vec2 axis = length(uFlowAxis) > 0.001 ? normalize(uFlowAxis) : vec2(1.0, 0.0);

  // World XZ, so ripple size is in metres and does not depend on the mesh.
  vec2 ripplePos = vWorldPosition.xz / max(uRippleScale, 0.001);
  // Metres the current has carried the surface so far, in ripple cells.
  float flowTime = uTime * uFlowSpeed * 100.0 / max(uRippleScale, 0.001);

  vec3 field = rippleField(ripplePos, axis, flowTime);

  // A flat plate, so the base normal is +Y and the gradient becomes the tilt
  // directly. Scaling the gradient rather than the result keeps the vector
  // normalisable at every strength, including 0.
  vec3 normal = normalize(vec3(
    -field.y * uRippleStrength,
    1.0,
    -field.z * uRippleStrength
  ));

  vec3 viewDir = normalize(cameraPosition - vWorldPosition);

  // ---- Depth ramp -------------------------------------------------------
  // Metres from the nearest bank stand in for a real depth read: true
  // depth-buffer intersection would need a prepass and a second texture, and at
  // the 195-unit Murcia camera distance across a ~19-unit channel the two are
  // indistinguishable.
  float bank = bankDistance(vWorldPosition.xz);
  float depth = smoothstep(0.0, max(uShoreWidth, 0.001), bank);
  vec3 waterColor = mix(uShallowColor, uDeepColor, depth);

  // ---- Sky / fresnel ----------------------------------------------------
  float fresnel = uFresnelBias
    + (1.0 - uFresnelBias) * pow(1.0 - saturate(dot(viewDir, normal)), uFresnelPower);
  vec3 color = mix(waterColor, uSkyColor, fresnel);

  // ---- Ambient ----------------------------------------------------------
  // A hemispheric term matching the scene rig in spirit: sky from above, the
  // water own colour bouncing from below. This material does not opt into three
  // light uniforms (lights: false). With one hemisphere and one directional
  // light in the scene, taking the full lighting pipeline would buy nothing and
  // would tie the shader to the rig exact composition — which the target app
  // forbids changing anyway, because it invalidates every shader program.
  float hemi = normal.y * 0.5 + 0.5;
  color *= mix(0.72, 1.06, hemi);

  // ---- Wall shadow ------------------------------------------------------
  // The channel walls darken the water along both banks. A multiply, so a black
  // shadow colour is a real shadow rather than a wash over the water.
  // The band dissolves once it is under about two pixels wide rather than
  // aliasing into a dotted line at distance.
  float shadowWidth = max(uWallShadowWidth, 0.001);
  float shadow = uWallShadowStrength * (1.0 - smoothstep(0.0, shadowWidth, bank));
  float bandPixels = shadowWidth / max(fwidth(bank), 1e-5);
  shadow *= smoothstep(1.0, 3.0, bandPixels);

  color *= mix(vec3(1.0), uWallShadowColor, shadow);

  gl_FragColor = vec4(color, 1.0);

  // Order matters, and matches three own material shaders: tone map, convert to
  // the output colour space, then fog. See the header note.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
