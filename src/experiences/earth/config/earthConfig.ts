// Fixed Earth appearance. Values carried over from dolly-earth's default tuning;
// they are not exposed in the debug overlay because the intro never changes them.

export const EARTH_CONFIG = {
  // Keep at 2 to match dolly-earth. earth-connections' orbit presets assume
  // radius 1, so a future orbit system takes scale={2} rather than a rewrite.
  radius: 2,
  atmosphereDayColor: '#00aaff',
  atmosphereTwilightColor: '#ff6600',
  sunAzimuth: 0.5,
  sunElevation: 0,
  cloudIntensity: 1,
  specularIntensity: 1,
  nightIntensity: 1,
  rotationSpeed: 0.035, // rad/s
}

/**
 * The surface maps, at two resolutions.
 *
 * 4096x2048 is 44.7 MB of GPU memory each with mipmaps, so the set costs
 * 134 MB — the largest single item in a texture budget the iOS audit measured
 * at ~226 MB, on a platform that terminates tabs rather than paging. The narrow
 * set costs 34 MB (`audits/ios-safari-2026-08-14.md`, I2).
 *
 * 2048 is not a compromise on a phone, it is the honest resolution. At 390 CSS
 * px and DPR 2 the globe spans roughly 300 device pixels, and an equirect map
 * puts about half its width across the visible hemisphere — 1024 texels over
 * 300 pixels, still more than 3x oversampled. Re-derive that if the close-up
 * framing ever changes; a globe that fills a phone screen is a different sum.
 *
 * `narrowMaxWidth` is deliberately the same 767 the sky panorama and the CSS
 * breakpoints use. One number for "this is a phone" across the project.
 * Regenerate the files with `scripts/prepare-earth-textures.mjs`.
 */
export const EARTH_TEXTURES = {
  narrowMaxWidth: 767,
  wide: {
    day: '/earth/day.jpg',
    night: '/earth/night.jpg',
    specularClouds: '/earth/specularClouds.jpg',
  },
  narrow: {
    day: '/earth/day-narrow.jpg',
    night: '/earth/night-narrow.jpg',
    specularClouds: '/earth/specularClouds-narrow.jpg',
  },
} as const
