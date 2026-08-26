precision highp float;

uniform sampler2D uSky;
uniform mat3 uSkyOrientation;
uniform mat3 uSkyCapRotation;
// sin(latitude) at which the cap blend starts and reaches full strength. Stored
// as sines rather than angles so the shader compares against dir.y directly and
// never calls asin a second time.
uniform vec2 uSkyCapBand;
// LINEAR luminance the borrowed sample is divided by, north in x and south in
// y. See SPACE_CONFIG.sky.capLevel — one per pole, and they are 3.2x apart.
uniform vec2 uSkyCapLevel;
uniform vec2 uSkyCapClamp;
uniform float uSkyCapStrength;
uniform float uSkyBrightness;
uniform float uSkyContrast;
uniform float uSkyGrain;
uniform float uSkyGrainFrequency;

varying vec3 vDirection;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// Cheap per-pixel hash, used only for dither. Quality barely matters here: the
// requirement is that neighbouring pixels get uncorrelated values, not that the
// sequence is statistically sound.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

// One octave of trilinear value noise on a direction.
//
// VALUE noise, and the old procedural nebula's failure is not an argument
// against it here. That shader built RIDGED noise on value noise, and ridging
// folds around a level set which then snaps to the lattice — which is what drew
// axis-aligned polygon walls (DECISIONS 19). This has no level set to fold on:
// it is used flat, as a multiplier near 1.
float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i),                       hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z
  );
}

// The equirectangular mapping, factored out because the cap sample MUST use
// exactly this one. Two copies of it drifting apart is the failure mode of the
// whole dual-sample scheme, and it would surface as a seam rather than as
// anything that names itself.
//
// The panorama is 2:1 and in galactic coordinates, so the galactic plane is
// dir.y == 0 and the galactic centre is at u == 0.5.
//
// `clamp` on the y before asin is not defensive noise: normalize can return a
// component a few ULP outside [-1, 1], and asin of that is NaN, which paints a
// black pixel at each pole.
vec2 equirect(vec3 d) {
  return vec2(
    atan(d.z, d.x) * 0.15915494309 + 0.5,
    asin(clamp(d.y, -1.0, 1.0)) * 0.31830988618 + 0.5
  );
}

void main() {
  // Into the panorama's own frame, so its galactic plane lands where the star
  // distribution put the band. See `skyOrientation` in space/galaxyBand.ts.
  vec3 dir = normalize(uSkyOrientation * normalize(vDirection));

  // NOTE there is no seam at u's wrap, and it is worth knowing why rather than
  // rediscovering it. atan's branch cut makes du/dx enormous on the one pixel
  // column where u jumps 1 -> 0, so a mipmapped sampler picks the smallest mip
  // there and draws a grey line down the whole sky. The texture ships without
  // mipmaps (SPACE_CONFIG.sky.generateMipmaps), which removes the mechanism.
  // Turn mips on and the seam comes back — it is not a wrap-mode problem and
  // RepeatWrapping does not fix it.
  vec3 sky = texture2D(uSky, equirect(dir)).rgb;

  // ── The polar caps ──
  // The panorama is a flat 2:1 photograph, not an equirectangular projection,
  // so its top and bottom strips wrap into a pinwheel around the poles.
  // `convergePoles` in scripts/prepare-sky-panorama.mjs removed that by fading
  // each row toward its own azimuthal mean above 55 degrees of latitude. It
  // worked, and it left a SECOND artifact behind: above ~78 degrees the image
  // has almost no azimuthal variation left at all, so each cap is an EXACTLY
  // radially symmetric smooth gradient. That reads as a funnel, and it is what
  // gets reported as "you can see where the sphere closes".
  //
  // The DARKNESS is not the defect and must not be "fixed". convergePoles is
  // mean-preserving on both of its passes — the circular box blur preserves
  // each row's sum, and `row += (mean - row) * fade` preserves the mean by
  // construction — so the caps' brightness is the SOURCE PHOTOGRAPH's own dark
  // top and bottom edges. A real galactic pole is dark too, and the star field
  // agrees: bandDensity at the pole is under 0.01. Keep the level, restore the
  // structure.
  //
  // So the texture is sampled a second time through a fixed 90-degree rotation
  // (see `skyCapRotation`), which hands the caps a conformal, correctly scaled,
  // NON-converging patch of real gas — and that patch is used for its variation
  // only, as a MULTIPLIER whose mean over the cap is 1 by construction. That is
  // what makes this ringless without tuning: a cross-fade between two
  // uncorrelated skies steps the brightness wherever their means differ, and
  // here the two caps' levels differ by 3.2x, so a cross-fade would trade a
  // dark funnel for a bright one. A mean-1 multiplier cannot step at all. It
  // also leaves the primary's hue exactly alone, which is all polar sky has.
  //
  // The band's LOWER edge is fixed by geometry rather than by taste — see
  // `skyCapStart` in introConfig.ts and section 7 of checks/space-backdrop.ts.
  float cap = smoothstep(uSkyCapBand.x, uSkyCapBand.y, abs(dir.y)) * uSkyCapStrength;
  if (cap > 0.0) {
    // A texture fetch inside non-uniform control flow would normally have an
    // undefined LOD. It is well defined HERE, and only here, because
    // SPACE_CONFIG.sky.generateMipmaps is false: there is one level, so there
    // is nothing for an undefined LOD to select. Do NOT hoist this out of the
    // branch "for safety" — at rest the nearer pole is 68 degrees off axis and
    // this fetch is skipped for the entire screen.
    vec3 capSky = texture2D(uSky, equirect(uSkyCapRotation * dir)).rgb;
    float level = dir.y > 0.0 ? uSkyCapLevel.x : uSkyCapLevel.y;
    float ratio = dot(capSky, LUMA) / level;
    sky *= mix(1.0, clamp(ratio, uSkyCapClamp.x, uSkyCapClamp.y), cap);
  }

  // Depth, as a tone curve. Three has already converted the sRGB texture to
  // linear by this point, so this is a plain gamma on a linear signal — a
  // tonal adjustment, NOT a colour-space conversion, and it must not be
  // mistaken for one or "corrected" into a 2.2.
  //
  // Above 1 it deepens the darks while leaving the band's bright core roughly
  // where it is, which separates the gas from the black sky. Dimming alone
  // pushes the sky back but flattens it toward an even grey; this is what keeps
  // it reading as distance rather than as fog.
  sky = pow(sky, vec3(uSkyContrast));

  sky *= uSkyBrightness;

  // ── Grain, which is NOT the dither below and does a different job ──
  // The sky is magnified 1.76x on screen and 3.5x at DPR 2, and bilinear
  // magnification of a soft image reads as "zoomed / pixeled". The
  // magnification is fixed by a standing client decision that space backgrounds
  // are 4096x2048, so it cannot be answered with resolution; what it CAN be
  // given is high-frequency content for the eye to resolve, which is the same
  // reason film grain rescues a soft scan.
  //
  // Locked to DIRECTION, not to the screen. Screen-locked noise at a visible
  // amplitude swims under a rotating sky and reads as a dirty lens; this
  // belongs to the sky and turns with it, including under the tilt and yaw
  // sliders. Cell size is set in DEGREES (SPACE_CONFIG.sky.grainCellDegrees)
  // against the viewport's px/deg, so it stays above Nyquist at rest.
  //
  // MULTIPLICATIVE, so it lives in the gas and vanishes in black sky — dust
  // granularity rather than video noise. The additive dither below covers the
  // near-black that this cannot reach.
  //
  // It cannot bloom: after uSkyBrightness the sky sits near 0.015 against a
  // bloomThreshold of 0.62.
  if (uSkyGrain > 0.0) {
    sky *= 1.0 + uSkyGrain * (valueNoise(dir * uSkyGrainFrequency) * 2.0 - 1.0);
  }

  // Dither, ±0.5/255, and it is doing real work rather than being a flourish.
  // Two separate quantisations land on this image: AVIF leaves block structure
  // in smooth dark gradients (block ratio 1.666 against a lossless 1.00), and
  // the composer's OutputPass quantises to 8 bits at the end. Both surface in
  // exactly the dark, smooth regions this sky is mostly made of, as flat
  // patches with visible edges between them.
  //
  // This is NOT redundant with the grain above, and merging them would lose one
  // of the two jobs. One code value of white noise is the correct amount for
  // the OutputPass's 8-bit quantisation; the grain is sized for AVIF block
  // plateaus, which are several code values across many pixels.
  //
  // A pixel of noise turns those edges into grain, which the eye integrates and
  // stops seeing. It has to be here rather than baked into the texture: baked
  // dither is precisely the high-entropy detail the encoder would spend its
  // bits on, so it would inflate the file and then be quantised away.
  float dither = (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  sky += dither;

  gl_FragColor = vec4(sky, 1.0);

  #include <colorspace_fragment>
}
