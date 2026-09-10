// Self-contained by rule: no project-level #include in this experiment's GLSL.
//
// THIS FILE DRAWS NO CONTENT. Typography, numbers, charts and layout all arrive
// already composed in `uMapA`/`uMapB`, drawn by a 2D canvas that knows about
// fonts and metres. What lives here is everything the canvas cannot express:
// that the surface is an LED wall attached to a building rather than a picture
// hanging on one.
//
// The split is not stylistic. Text rendered in GLSL means reimplementing font
// metrics and line breaking against a signed-distance atlas, which is a project;
// `fillText` is a function call.

uniform sampler2D uMapA;
uniform sampler2D uMapB;
/** 0 shows A, 1 shows B. The crossfade between two services. */
uniform float uBlend;

/** The one clock, 0..1, shared with the composition on the canvas. */
uniform float uProgress;
/** Where the wake sweep finishes, as a fraction of progress. */
uniform float uWakeEnd;

uniform float uBrightness;
uniform vec3 uTint;

/** LED pitch in METRES, so the dot size is a property of the wall, not the texture. */
uniform float uLedPitch;
uniform float uLedStrength;
/** What the dark wall emits when nothing is playing — the architecture state. */
uniform float uIdleGlow;

uniform float uShimmer;
uniform float uTime;

/**
 * The dust field, one set per canvas slot.
 *
 * Two of everything for the same reason there are two maps: during a crossfade
 * both compositions are on screen, and a single rect would snap from one image's
 * bounds to the other's at the moment the switch is requested.
 *
 * `xy` is the rect's top-left in UV, `zw` its size. Strength is already staged
 * by the CPU — it carries the image block's own reveal window, so dust arrives
 * with the picture it belongs to.
 */
uniform vec4 uDustRectA;
uniform vec4 uDustRectB;
uniform float uDustStrengthA;
uniform float uDustStrengthB;
/** Motes across the rect, and how fast they drift. Shared by both. */
uniform float uDustDensity;
uniform float uDustSpeed;

/** Facade size in metres, for anything that must be physical. */
uniform vec2 uMetres;
/** Top and bottom falloff, in v. */
uniform float uEdgeFalloff;

varying vec2 vUv;

/** Cheap hash for the shimmer. Not noise, and does not need to be. */
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453123);
}

/**
 * One parallax layer of drifting motes.
 *
 * A cell grid rather than a particle list: every fragment asks only which cell it
 * is in and where that cell's mote sits, so the cost is a couple of hashes and
 * nothing is stored, simulated or uploaded. The mote drifts on a slow circle
 * whose phase comes from the cell id, which is enough to read as air rather than
 * as a moving pattern.
 *
 * Neighbour cells are not sampled. A mote clipped at a cell boundary would be a
 * bug in a particle system; here it is a mote that has drifted out of frame, at
 * this size and density indistinguishable from one that has.
 */
float dustLayer(vec2 p, float density, float radius, float phase) {
  vec2 c = p * density + phase;
  vec2 id = floor(c);
  vec2 f = fract(c);

  vec2 seed = hash2(id);

  // MOST CELLS ARE EMPTY, and that is the whole difference between dust and
  // static. One mote per cell fills the rect with a regular field that reads as
  // noise over the artwork; occupancy around a third leaves the gaps that make
  // the remaining motes look like something floating rather than a texture.
  float live = smoothstep(0.58, 0.78, seed.x);
  if (live <= 0.0) return 0.0;

  float t = uTime * uDustSpeed * (0.18 + seed.y * 0.35) + seed.x * 6.283;
  // A slow ellipse, kept inside the cell so motes stay separated.
  vec2 centre = vec2(0.5) + vec2(cos(t), sin(t * 0.7)) * 0.26;

  float d = length(f - centre);
  float mote = 1.0 - smoothstep(radius * 0.25, radius, d);
  // Each mote also breathes, so the field never looks like a fixed constellation.
  return mote * live * (0.5 + 0.5 * sin(t * 1.3 + seed.y * 6.283));
}

/**
 * The field inside one rect, weighted by what is underneath it.
 *
 * `lum` is the luminance of the composed image at this fragment, and it is what
 * makes the motes read as being IN the picture: they brighten over the wordmark
 * and nearly vanish over the dark ground, the way lit dust behaves in front of a
 * light source rather than on a pane of glass in front of it.
 */
float dustField(vec2 uv, vec4 rect, float strength, float lum) {
  if (strength <= 0.0 || rect.z <= 0.0 || rect.w <= 0.0) return 0.0;

  vec2 p = (uv - rect.xy) / rect.zw;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;

  // Square the cells, or a 2:1 rect gives oval motes.
  vec2 aspect = vec2(rect.z * uMetres.x, rect.w * uMetres.y);
  vec2 q = p * (aspect / min(aspect.x, aspect.y));

  // Three layers at close densities, not octaves: a far finer layer would land
  // near the LED pitch and alias into the grid instead of reading as depth.
  float field =
      dustLayer(q, uDustDensity, 0.40, 0.0) * 0.70 +
      dustLayer(q, uDustDensity * 0.64, 0.46, 17.3) * 1.00 +
      dustLayer(q, uDustDensity * 1.45, 0.34, 41.7) * 0.40;

  // Never ends on a hard line.
  float edge =
      smoothstep(0.0, 0.07, p.x) * smoothstep(0.0, 0.07, 1.0 - p.x) *
      smoothstep(0.0, 0.09, p.y) * smoothstep(0.0, 0.09, 1.0 - p.y);

  return field * edge * strength * mix(0.18, 1.0, smoothstep(0.02, 0.5, lum));
}

void main() {
  // The composed frame. Both maps are sampled unconditionally: branching on
  // uBlend would cost more than the fetch and would pop at the ends.
  vec3 mapA = texture2D(uMapA, vUv).rgb;
  vec3 mapB = texture2D(uMapB, vUv).rgb;
  vec3 content = mix(mapA, mapB, uBlend);

  // Each field is weighted by ITS OWN map's luminance, not the blend's, so a
  // composition's dust tracks its own picture through a crossfade instead of
  // briefly lighting up over the other one's.
  float dust = mix(
      dustField(vUv, uDustRectA, uDustStrengthA, dot(mapA, vec3(0.2126, 0.7152, 0.0722))),
      dustField(vUv, uDustRectB, uDustStrengthB, dot(mapB, vec3(0.2126, 0.7152, 0.0722))),
      uBlend);

  // ---- The LED field ------------------------------------------------------
  // Cells measured in design metres across the screen, so changing the texture
  // resolution cannot change the apparent pixel pitch of the wall.
  vec2 metres = vUv * uMetres;
  vec2 cell = fract(metres / max(uLedPitch, 1e-4)) - 0.5;
  // NOT named `dot`: a float by that name shadows the built-in `dot()`, which this
  // shader calls a few lines above for luminance.
  float ledDot = 1.0 - smoothstep(0.16, 0.46, length(cell));

  // Between the dots the wall is dark. This is what stops the surface reading
  // as a texture pasted onto geometry.
  float grid = mix(1.0 - uLedStrength, 1.0, ledDot);

  // A slow, per-cell flicker. `servicesDisplay` forbids uTime on its face on the
  // grounds that a premium display is stable, and that is right for a UI panel;
  // an architectural media wall is the opposite case, so this exists — kept
  // barely visible, and switchable off.
  vec2 cellId = floor(metres / max(uLedPitch, 1e-4));
  float flicker = 1.0 + (hash(cellId) - 0.5) * 0.5 * uShimmer *
    (0.5 + 0.5 * sin(uTime * 0.7 + hash(cellId + 3.7) * 6.283));

  // ---- The wake -----------------------------------------------------------
  // The surface comes on as a sweep along the arc rather than all at once, so a
  // 49 m facade energises the way a real one does. A function of progress only,
  // which is what keeps the whole effect scrubbable.
  float front = clamp(uProgress / max(uWakeEnd, 1e-3), 0.0, 1.4);
  float lit = smoothstep(vUv.x - 0.15, vUv.x + 0.05, front);
  // A brighter crest riding the leading edge, gone once the sweep completes.
  float crest = exp(-pow((front - vUv.x) / 0.05, 2.0)) * (1.0 - smoothstep(1.0, 1.15, front));

  // ---- Assembly -----------------------------------------------------------
  vec3 color = content * uTint * uBrightness * lit * grid * flicker;

  // The idle emission of an addressed-but-empty wall. Applied through the same
  // grid so the dots are what glows, and scaled by `lit` so an inactive facade
  // is genuinely inactive.
  color += uTint * uIdleGlow * ledDot * lit;
  color += uTint * crest * 0.6 * grid;

  // Dust rides the LED grid like everything else on this wall — a mote is the
  // pixels under it glowing, not a speck floating in front of the surface —
  // and waits for the wake sweep to reach it.
  color += uTint * dust * 0.85 * grid * lit;

  // Soft top and bottom, so the screen does not end on a hard texel row.
  float edge = smoothstep(0.0, uEdgeFalloff, vUv.y) *
               smoothstep(0.0, uEdgeFalloff, 1.0 - vUv.y);
  color *= edge;

  // Opaque: this is a wall. Nothing behind it should ever show through, and an
  // opaque surface keeps it out of the transparent sort entirely.
  gl_FragColor = vec4(color, 1.0);

  // NOT OPTIONAL, AND THE FAILURE IS SILENT.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
