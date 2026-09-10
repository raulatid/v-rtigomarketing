// The vacuum: being pulled up out of the city.
//
// Three effects in one pass, sharing one radial term, because they are one
// sensation. Splitting them into three passes would cost three full-screen draws
// and, worse, would let them disagree about where the centre is.
//
// ## The radial term, and why everything hangs off it
//
//   r  = 0 at the screen centre, 1 at the midpoint of an edge, ~1.41 at a corner.
//   rn = pow(r, uDistortPower), the NONLINEARITY.
//
// `rn` is what keeps the centre stable. At power 1 the distortion is a plain
// uniform scale — every pixel moves, the image just gets bigger, and it reads as a
// zoom rather than as a stretch. At power 2 or 3 the centre is nearly untouched
// while the edges move hard, which is what makes it read as the frame being pulled
// apart around something that is holding still. That difference is the whole
// request, so `uDistortPower` is a control and not a constant.
//
// ## Distortion: the UVs are remapped, the image is not scaled
//
// The sample point is pulled TOWARD the centre by `1 - uDistortAmount * rn`, which
// magnifies: content that was near the edge is now past it, so the world races
// outward off the frame. Sampling outward instead (a negative amount) compresses,
// pulling the surroundings in — both are reachable, and the sign is the difference
// between being sucked out and being crushed in.
//
// ## Blur: along the ray, not across it
//
// The taps march back along the same radial direction, so the smear is a streak
// pointing at the centre rather than a soft focus. Scaled by `rn` as well, so the
// middle of the frame stays readable while the edges tear — a uniform blur would
// just look like the renderer had given up.
//
// The taps are a compile-time loop because GLSL ES 1.0 requires a constant bound.
// 8 is enough that the streak reads as continuous at the strengths this runs at;
// more would be invisible and this pass is drawn every frame of a scrub.
//
// ## Vignette: dark grey, and soft
//
// Grey rather than black on purpose. Black is what `warpOverlay` uses for the cut,
// and a black vignette here would read as the flash starting early — two different
// events wearing the same colour. Grey reads as atmosphere thickening at the edge
// of vision, which is the tunnel this is meant to be.
//
// Applied AFTER the blur, so it darkens the streaks rather than being smeared into
// them. Smearing the vignette would spread its edge inward and turn a soft border
// into a grey haze over the whole frame.

uniform sampler2D tDiffuse;
uniform float uIntensity;
uniform float uDistortAmount;
uniform float uDistortPower;
uniform float uBlurAmount;
uniform float uVignetteAmount;
uniform float uVignetteStart;
uniform vec3 uVignetteColor;

varying vec2 vUv;

const int TAPS = 8;

void main() {
  vec2 centred = vUv - 0.5;

  // Doubled so `r` is 1 at an edge midpoint rather than 0.5, which makes every
  // amount below read as "per screen half" and keeps the controls comparable.
  float r = length(centred) * 2.0;
  float rn = pow(r, uDistortPower);

  // One multiplier on all three, so the whole sensation scrubs from a single
  // number and the effects cannot arrive at different times.
  float distort = uDistortAmount * uIntensity;
  float blur = uBlurAmount * uIntensity;

  vec2 sampleUv = 0.5 + centred * (1.0 - distort * rn);

  // The step each tap walks back along the ray. Derived from the DISTORTED
  // position, so the streak follows the stretched image rather than crossing it.
  float reach = blur * rn;
  vec2 step = (sampleUv - 0.5) * reach / float(TAPS);

  // BRANCHED, and the branch pays for itself. `rn` goes to zero at the centre, so
  // over the middle of the frame every tap samples the same texel — seven eighths of
  // the work, thrown away, on the largest share of the pixels. The branch is
  // spatially coherent (a disc), so it costs nothing to diverge on.
  //
  // The threshold is a sub-texel reach rather than zero: below it the taps land
  // inside one texel and the average is the texel, so the loop is not merely cheap
  // to skip, it is exactly equal to skipping it.
  vec4 color;
  if (reach > 0.002) {
    vec4 sum = vec4(0.0);
    for (int i = 0; i < TAPS; i += 1) {
      sum += texture2D(tDiffuse, sampleUv - step * float(i));
    }
    color = sum / float(TAPS);
  } else {
    color = texture2D(tDiffuse, sampleUv);
  }

  // `uVignetteStart` is where the grey begins; it always reaches full at the
  // corner, so widening the start softens the gradient rather than moving a hard
  // edge inward.
  float vignette = smoothstep(uVignetteStart, 1.45, r) * uVignetteAmount * uIntensity;
  color.rgb = mix(color.rgb, uVignetteColor, clamp(vignette, 0.0, 1.0));

  gl_FragColor = color;
}
