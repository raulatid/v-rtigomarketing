/**
 * The atlas resolutions the bake ships and the pure decision of which one a
 * device gets. The manifest itself, the bake's one versioned `lightmaps.json`,
 * is parsed by `unifiedManifest`. No three, no DOM: this is the part under test.
 */

export type LightmapResolution = 1024 | 2048;

/**
 * Which atlas size a device gets.
 *
 * Every atlas the bake names is resident in GPU memory from the intro, whether
 * or not the visitor ever reaches the city, and the 2048 set holds four times
 * the texels of the 1024 one (measured on an earlier bake in
 * `docs/audits/reports/website-performance-and-optimization-murcia-2026-09-23.md`
 * P1-B, against the whole iOS budget this project measured). What each set may
 * cost to download is capped by `LIGHTMAP_BUDGET_BYTES` in `unifiedManifest`.
 *
 * A phone-width or touch-first viewport takes the smaller set, as the sky
 * panorama does, and so do two devices those queries miss:
 *
 * - `touchCapable`: an iPad with a trackpad reports a fine primary pointer and a
 *   desktop width, and was getting the full 2048 set. Any touch screen counts,
 *   which also sends touchscreen laptops to 1024; they are mostly integrated
 *   GPUs sharing system memory, and that is the right side to err on.
 * - `lowMemory`: `navigator.deviceMemory` of 4 GB or less. Chromium only; where
 *   it is missing the caller passes false.
 *
 * All inputs are booleans so the rule is testable without a window.
 */
export function chooseLightmapResolution(device: {
  narrow: boolean;
  coarse: boolean;
  touchCapable: boolean;
  lowMemory: boolean;
}): LightmapResolution {
  return device.narrow || device.coarse || device.touchCapable || device.lowMemory ? 1024 : 2048;
}
