precision highp float;

uniform sampler2D uSky;
uniform mat3 uSkyOrientation;
uniform float uSkyBrightness;
uniform float uSkyContrast;

varying vec3 vDirection;

// Cheap per-pixel hash, used only for dither. Quality barely matters here: the
// requirement is that neighbouring pixels get uncorrelated values, not that the
// sequence is statistically sound.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  // Into the panorama's own frame, so its galactic plane lands where the star
  // distribution put the band. See `skyOrientation` in src/space/galaxyBand.ts.
  vec3 dir = normalize(uSkyOrientation * normalize(vDirection));

  // Equirectangular. The panorama is 2:1 and in galactic coordinates, so the
  // galactic plane is dir.y == 0 and the galactic centre is at u == 0.5.
  //
  // `clamp` on the y before asin is not defensive noise: normalize can return a
  // component a few ULP outside [-1, 1], and asin of that is NaN, which paints
  // a black pixel at each pole.
  vec2 uv = vec2(
    atan(dir.z, dir.x) * 0.15915494309 + 0.5,
    asin(clamp(dir.y, -1.0, 1.0)) * 0.31830988618 + 0.5
  );

  // NOTE there is no seam at u's wrap, and it is worth knowing why rather than
  // rediscovering it. atan's branch cut makes du/dx enormous on the one pixel
  // column where u jumps 1 -> 0, so a mipmapped sampler picks the smallest mip
  // there and draws a grey line down the whole sky. The texture ships without
  // mipmaps (SPACE_CONFIG.sky.generateMipmaps), which removes the mechanism.
  // Turn mips on and the seam comes back — it is not a wrap-mode problem and
  // RepeatWrapping does not fix it.
  vec3 sky = texture2D(uSky, uv).rgb;

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

  // Dither, ±0.5/255, and it is doing real work rather than being a flourish.
  // Two separate quantisations land on this image: AVIF leaves block structure
  // in smooth dark gradients (block ratio 1.68 against a lossless 1.00), and
  // the composer's OutputPass quantises to 8 bits at the end. Both surface in
  // exactly the dark, smooth regions this sky is mostly made of, as flat
  // patches with visible edges between them.
  //
  // This carries MORE load than it used to. The panorama ships at AVIF q50
  // rather than q60 because the desktop file is held under a 200 KB client
  // budget, so the stored texture blocks measurably worse (1.68, was 1.17) and
  // this is what keeps that off the screen. Verified by screenshotting the
  // scene at 1440x900 and 390x844 — no visible squares. Weaken or remove this
  // and the squares come back at the current quality setting.
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
