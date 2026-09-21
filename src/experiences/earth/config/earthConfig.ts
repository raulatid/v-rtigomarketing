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
 * THE NARROW SET IS 1024x512. This paragraph said 2048 and did its arithmetic
 * with 1024 texels across the visible hemisphere — twice what a 1024-wide map
 * carries — until 2026-09-21. The files were always 1024; the prose was wrong,
 * and it is the kind of wrong that survives, because anyone re-deriving the
 * budget re-derives it with the number written here.
 *
 * 1024 is not a compromise, it is the judged resolution, and the judgement was
 * made against the RESTING pose: at 390 CSS px with the buffer capped at dpr 2
 * the globe spans 456 device pixels and the hemisphere's 512 texels land at
 * x1.4 magnification. Deliberately not 1:1 — that would need a radius of 25,
 * further out than the rest pose itself, so no set anyone would ship reaches it.
 *
 * Re-derive that if the close-up framing ever changes; a globe that fills a
 * phone screen is a different sum. It did change, and the sum had expired: the
 * zoom's near end reaches a framing where the globe covers 70% of the height
 * and the same maps land at x3.6. The answer was not more texels — 2048 still
 * gives x1.8 there — but a nearer end for this tier, in
 * `interactionConfig.zoomNearFactorNarrow`, which carries the table.
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

/**
 * Which set this session is using, decided once and remembered.
 *
 * LATCHED, and that is the whole point of it existing rather than each caller
 * reading the width again. `EarthScene` already chooses once and never re-reads
 * — re-downloading the set because a window crossed a breakpoint costs more
 * than the mismatch it corrects, and a phone that rotates keeps the narrow set
 * because both orientations of a phone are a phone.
 *
 * The zoom's near end depends on this (`interactionConfig.zoomNearFactorNarrow`),
 * and a second reader asking the LIVE width would disagree with the texture the
 * moment the phone rotated: 852x393 passes a 767 width test, so a phone turned
 * sideways would be handed the unrestricted zoom while still carrying the
 * 1024-wide maps — which is exactly the framing the restriction exists to stop.
 * One latch, two readers.
 *
 * Reads `window` lazily rather than at module scope: `checks/` bundles this
 * file's consumers for Node, where there is no window and nothing calls this.
 */
let narrowTier: boolean | null = null

export function usesNarrowEarthTextures(): boolean {
  if (narrowTier === null) {
    narrowTier = typeof window !== 'undefined' && window.innerWidth <= EARTH_TEXTURES.narrowMaxWidth
  }
  return narrowTier
}

/** Test seam. Nothing in the application calls this. */
export function resetEarthTextureTier(): void {
  narrowTier = null
}
