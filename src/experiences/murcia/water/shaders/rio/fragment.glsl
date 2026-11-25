// Rio water — fragment stage.
//
// Layered so each contribution can be read on its own: ripple normals, then the
// bank ramp and the crests, then the clouded sky under fresnel, then the current
// streaks, then the wall shadow.
//
// TONE MAPPING AND COLOUR SPACE ARE HANDLED HERE, AT THE BOTTOM, AND THAT IS
// NOT OPTIONAL. three applies tone mapping in-shader only for its own
// materials; a raw ShaderMaterial that skips the two chunks below renders
// correctly in isolation and washed-out in the app, with nothing to point at.
// starShader.ts carries the same warning.
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

// Seen from above, fresnel is ~0 and the hemi term ~1, so the ripples had no
// way left to show and the water read as flat paint. These three do not depend
// on the view angle. None of them is a sun: see the `5e9cefb` note.
uniform float uCrestLight;
uniform float uZenithReflection;
uniform float uCloudScale;
uniform float uCloudContrast;
uniform float uReflectionDistortion;
uniform float uStreakStrength;
uniform float uStreakScale;

/**
 * The bank outline as world-space segments (xz of one end, xz of the other),
 * so the distance to the nearest bank can be measured exactly at every pixel.
 * Must be supplied (`setBankSegments`); with count 0 the whole surface reads
 * as mid-channel.
 */
#define MAX_BANK_SEGMENTS 48
uniform vec4 uBankSegments[MAX_BANK_SEGMENTS];
uniform int uBankSegmentCount;

/**
 * The one fixed drift axis, world XZ, unit, pointing downstream — used by
 * surfaces without channel coordinates (the campus lake and pools). The noise
 * is stretched and advected along it.
 *
 * The river does NOT use it any more: one axis ran straight across its bends,
 * up to ~55 degrees off the current. Nor does it rotate this axis per pixel to
 * follow the current: a rotating frame shears the pattern by (distance from the
 * world origin) x (rotation), and a few degrees of turn inside one triangle
 * smeared the ripples into streaks with a hard seam. With USE_RIVER_CHANNEL the
 * pattern is sampled in the channel's own (along, across) metres instead — an
 * arc length along the centre line, continuous across every triangle — so it
 * turns with the river and nothing shears.
 */
uniform vec2 uFlowAxis;

/**
 * +1, or -1 when `flowReversed`: which way along the channel the current runs.
 * The channel coordinates increase along the unsigned axis; this signs them.
 */
uniform float uFlowSign;

#ifdef USE_RIVER_CHANNEL
varying vec2 vRiverCoord;
varying vec2 vRiverTangent;
#endif

/**
 * The light the water is seen under, a linear multiplier: white by day, the
 * city's night colour under Conócenos' night (`setLight`).
 */
uniform vec3 uLight;

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
 * `flow` is the pixel's (along, across) position in ripple cells and `axis` the
 * world XZ direction along points at here. The along axis is stretched 2.5x, so
 * every feature is elongated downstream — that is what makes the field read as
 * a current. Each octave fades out once its cells drop below a couple of
 * pixels; without that the far river shimmers, because sub-pixel normal detail
 * becomes sparkle.
 */
vec3 rippleField(vec2 flow, vec2 axis, float time) {
  vec2 acrossAxis = vec2(-axis.y, axis.x);
  float along = flow.x;
  float across = flow.y;

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
  // ---- Flow frame -------------------------------------------------------
  // `axis` is the downstream direction here, world XZ; `flowPos` the pixel's
  // (along, across) position in METRES, so ripple size does not depend on the
  // mesh. On the river both come from the channel, so they bend with it.
  vec2 axis;
  vec2 flowPos;
  #ifdef USE_RIVER_CHANNEL
  axis = (length(vRiverTangent) > 1e-4 ? normalize(vRiverTangent) : vec2(1.0, 0.0)) * uFlowSign;
  flowPos = vRiverCoord * uFlowSign;
  #else
  axis = length(uFlowAxis) > 0.001 ? normalize(uFlowAxis) : vec2(1.0, 0.0);
  flowPos = vec2(dot(vWorldPosition.xz, axis), dot(vWorldPosition.xz, vec2(-axis.y, axis.x)));
  #endif

  // Metres the current has carried the surface so far, in ripple cells.
  float flowTime = uTime * uFlowSpeed * 100.0 / max(uRippleScale, 0.001);

  vec3 field = rippleField(flowPos / max(uRippleScale, 0.001), axis, flowTime);

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

  // ---- Crests -----------------------------------------------------------
  // The ripple height itself, lighter on the crests and darker in the troughs.
  // View-independent, so it is what keeps the ripples legible looking straight
  // down. field.x sits around -0.35..0.35.
  waterColor *= 1.0 + uCrestLight * field.x * 2.0;

  // ---- Sky / fresnel ----------------------------------------------------
  // The sky is not one colour: a slow cloud field, sampled where the rippled
  // normal points, so the reflection wobbles with the water. Fixed in the
  // world rather than following the camera, because there is no sky to agree
  // with; it only has to move like a reflection does.
  float cloudScale = max(uCloudScale, 0.001);
  vec2 cloudPos = (vWorldPosition.xz + normal.xz * uReflectionDistortion) / cloudScale
    + uTime * vec2(0.011, 0.004);
  float cloud = gradientNoiseD(cloudPos).x + 0.5 * gradientNoiseD(cloudPos * 2.03 + 17.1).x;
  cloud = smoothstep(-0.35, 0.55, cloud);
  vec3 sky = uSkyColor * mix(1.0 - 0.5 * uCloudContrast, 1.0 + uCloudContrast, cloud);

  float fresnel = uFresnelBias
    + (1.0 - uFresnelBias) * pow(1.0 - saturate(dot(viewDir, normal)), uFresnelPower);
  vec3 color = mix(waterColor, sky, fresnel);

  // Straight down the fresnel above is ~0 and carries nothing. The clouds
  // come through anyway as a brightness swing around the water's own colour,
  // centred on zero so the colour authored in Blender stays the average.
  color *= 1.0 + uZenithReflection * (cloud * 2.0 - 1.0);

  // ---- Current streaks --------------------------------------------------
  // Thin lighter lines drawn out along the flow axis and carried by it, the
  // way a current marks its surface. Ridged noise: 1 - |n| peaks on the zero
  // set of the noise, which is a thin wandering line. A second, coarse noise
  // breaks them into patches so they never read as rails. Faded with distance
  // like the ripple octaves, before the lines turn into sparkle.
  float streakScale = max(uStreakScale, 0.001);
  vec2 streakPos = vec2(
    (flowPos.x - uTime * uFlowSpeed * 100.0) * 0.1,
    flowPos.y
  ) / streakScale;
  float ridge = 1.0 - abs(gradientNoiseD(streakPos).x) * 2.4;
  float streak = pow(saturate(ridge), 6.0);
  float patches = smoothstep(-0.1, 0.4, gradientNoiseD(streakPos * vec2(0.5, 0.25) + 41.7).x);
  float streakFade = 1.0 - smoothstep(0.15, 0.45, length(fwidth(streakPos)));
  color = mix(color, sky * 1.1, streak * patches * streakFade * uStreakStrength);

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
  color *= uLight;

  gl_FragColor = vec4(color, 1.0);

  // Order matters, and matches three own material shaders: tone map, convert to
  // the output colour space, then fog. See the header note.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
