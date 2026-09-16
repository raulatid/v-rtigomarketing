// The lake particles. One vertex per particle; every phase is decided here.
//
// A particle's life is a fixed sequence, offset by its own delay:
//
//   hidden, at its SOURCE below the water
//     -> rises to its EMERGE point just above the surface   (uRiseSeconds)
//     -> travels to its TARGET                              (uConvergeSeconds)
//     -> holds at the target.
//
// The target is an attribute, so the same shader forms a disc, a symbol, or
// anything else that can hand each particle a point to aim for. When the
// target changes, the previous one is kept in aFrom and uMorph carries each
// particle across, staggered by its seed so the change ripples through.

attribute vec3 aSource;
attribute vec3 aEmerge;
attribute vec3 aFrom;
attribute vec3 aTarget;
attribute float aSeed;
attribute float aDelay;
attribute float aTone;          // 0 wears uColor, 1 wears uAccent

uniform float uElapsed;         // seconds since play; the global progress
uniform float uTime;            // wall clock, for the swell
uniform float uRotation;        // continuous angle, shared by all layouts
uniform vec3 uRotationCenter;   // lake centre; rotation preserves height
uniform float uDelaySpread;     // seconds over which starts are spread
uniform float uRiseSeconds;
uniform float uConvergeSeconds;
uniform float uMorph;           // 0 at aFrom, 1 at aTarget
uniform float uSwellAmp;        // world units the settled shape bobs by
uniform float uSwellK;          // radians per world unit across the shape
uniform float uSwellSpeed;      // radians per second
uniform float uSurfaceY;
uniform float uWaterFade;       // depth below the surface over which a particle dims
uniform float uSize;
uniform float uScale;           // half the drawing-buffer height, for size attenuation

varying float vAlpha;
varying float vTone;

// How much of the morph is spent staggering the starts. At 0 every particle
// moves together; at 1 the last starts as the first arrives.
uniform float uMorphSpread;

float easeInOut(float x) { return x * x * (3.0 - 2.0 * x); }
float easeOut(float x) { return 1.0 - (1.0 - x) * (1.0 - x); }

void main() {
  float t = uElapsed - aDelay * uDelaySpread;
  float rise = clamp(t / uRiseSeconds, 0.0, 1.0);
  float converge = clamp((t - uRiseSeconds) / uConvergeSeconds, 0.0, 1.0);

  // Where this particle rests right now: between the previous target and the
  // current one, on its own schedule within the morph.
  float m = clamp(uMorph * (1.0 + uMorphSpread) - aSeed * uMorphSpread, 0.0, 1.0);
  vec3 rest = mix(aFrom, aTarget, easeInOut(m));
  // Turn the whole form, including a morph in flight, around its own centre.
  // Source and emergence stay anchored in the water until convergence.
  vec2 offset = rest.xz - uRotationCenter.xz;
  float turnCos = cos(uRotation);
  float turnSin = sin(uRotation);
  rest.xz = uRotationCenter.xz + vec2(
    turnCos * offset.x + turnSin * offset.y,
    -turnSin * offset.x + turnCos * offset.y
  );

  // Rising through the water. Eased out, so a particle slows as it surfaces
  // rather than shooting through. Then a lazy S-curve to where it rests.
  vec3 p = mix(aSource, aEmerge, easeOut(rise));
  p = mix(p, rest, easeInOut(converge));

  // A slow swell over the settled shape: two long sine waves crossing, with
  // a little per-particle phase, so the shape is alive without being busy.
  // Scaled by the convergence, so nothing bobs on the way up.
  float swell = sin(rest.x * uSwellK + uTime * uSwellSpeed + aSeed * 0.8) * 0.6
    + sin((rest.z + rest.y) * uSwellK * 0.7 - uTime * uSwellSpeed * 0.8 + aSeed * 2.4) * 0.4;
  p.y += swell * uSwellAmp * easeInOut(converge);

  // Visibility: fades in over the first half of the rise, and stays dim while
  // still under the surface, so it looks like it is coming up through water.
  float depth = p.y - uSurfaceY;
  float underwater = smoothstep(-uWaterFade, 0.0, depth);
  float alpha = smoothstep(0.0, 0.5, rise) * mix(0.18, 1.0, underwater);
  vAlpha = alpha;
  vTone = aTone;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float variation = 0.7 + 0.6 * fract(aSeed * 7.31);
  gl_PointSize = uSize * variation * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}
