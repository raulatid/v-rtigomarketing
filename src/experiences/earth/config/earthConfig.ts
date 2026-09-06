// Fixed Earth appearance. Values carried over from dolly-earth's default tuning;
// they are not exposed in the debug overlay because the intro never changes them.

export const EARTH_CONFIG = {
  // Keep at 2 to match dolly-earth. earth-connections' orbit presets assume
  // radius 1, so a future orbit system takes scale={2} rather than a rewrite.
  radius: 2,
  atmosphereDayColor: '#00aaff',
  atmosphereTwilightColor: '#CBE7F7',
  sunAzimuth: 0.5,
  sunElevation: 0,
  cloudIntensity: 1,
  nightIntensity: 1,
  rotationSpeed: 0.035, // rad/s
}

/**
 * The surface maps, at two resolutions.
 *
 * All three are KTX2/Basis (ETC1S, BasisLZ), transcoded on the GPU's own
 * compressed format. As RGBA8 JPEGs 4096x2048 cost 44.7 MB of GPU memory each
 * with mipmaps — 134 MB for the set, the largest single item in a texture
 * budget the iOS audit measured at ~226 MB, on a platform that terminates tabs
 * rather than paging (`audits/ios-safari-2026-08-14.md`, I2). Compressed, the
 * same set is roughly a quarter of that.
 *
 * 2048 is not a compromise on a phone, it is the honest resolution. At 390 CSS
 * px and DPR 2 the globe spans roughly 300 device pixels, and an equirect map
 * puts about half its width across the visible hemisphere — 1024 texels over
 * 300 pixels, still more than 3x oversampled. Re-derive that if the close-up
 * framing ever changes; a globe that fills a phone screen is a different sum.
 *
 * `narrowMaxWidth` is deliberately the same 767 the sky panorama and the CSS
 * breakpoints use. One number for "this is a phone" across the project.
 *
 * The flags are not interchangeable. Every file needs mipmaps (a compressed
 * texture cannot be mipped at runtime, and an unmipped globe aliases badly at
 * the resting pose) and dimensions that are multiples of four (Basis rejects
 * the upload otherwise — silently, as a black map). day and night are encoded
 * sRGB; clouds is linear, because it is data the shader thresholds rather than
 * colour.
 *
 * EVERY FILE MUST BE ENCODED BOTTOM-LEFT — `ktx create
 * --convert-texcoord-origin bottom-left`, or `toktx --lower_left_maps_to_s0t0`
 * — and `ktx info` must report `KTXorientation: ru`. This is the one flag that
 * cannot be fixed afterwards. `TextureLoader` gave the JPEGs `flipY = true` and
 * three flipped them on upload; `KTX2Loader` returns a `CompressedTexture`,
 * whose constructor sets `flipY = false`, and for a BasisLZ file the GL upload
 * ignores `UNPACK_FLIP_Y_WEBGL` regardless. So setting `flipY = true` here does
 * NOTHING and the globe renders upside down — which is exactly how the first
 * KTX2 set shipped. (Not the same as `SkyShellCube`, where `flipY = true` does
 * work: those faces are uncompressed PNG.)
 *
 * Sources are the 4k and 2k maps, and they are NOT interchangeable between
 * sizes: day/night narrow come from the 2k files, clouds narrow from the 4k one
 * resized. They live outside the repo — deliberately, they are 16 MB of encoder
 * input nothing serves. `scripts/prepare-earth-textures.mjs` does not yet cover
 * this step; it still only writes the superseded narrow JPEGs.
 */
export const EARTH_TEXTURES = {
  narrowMaxWidth: 767,
  wide: {
    day: '/earth/day.ktx2',
    night: '/earth/night.ktx2',
    clouds: '/earth/clouds.ktx2',
  },
  narrow: {
    day: '/earth/day-narrow.ktx2',
    night: '/earth/night-narrow.ktx2',
    clouds: '/earth/clouds-narrow.ktx2',
  },
} as const
