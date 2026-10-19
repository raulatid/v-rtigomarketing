import { chooseLightmapResolution, type LightmapResolution } from './lightmapManifest';

// Apart from `loadLightmaps` so the city's prefetch (`assets/cityBytes`) can
// choose the same atlases without an import cycle: `loadLightmaps` reaches
// `cityBytes` through `loadUnifiedLightmaps`.

const NARROW_QUERY = '(max-width: 767px)';
const COARSE_QUERY = '(pointer: coarse)';
const ANY_COARSE_QUERY = '(any-pointer: coarse)';
const LOW_MEMORY_GB = 4;

export function deviceResolution(): LightmapResolution {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 2048;
  // Not in lib.dom: Chromium-only, and absent everywhere else.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return chooseLightmapResolution({
    narrow: window.matchMedia(NARROW_QUERY).matches,
    coarse: window.matchMedia(COARSE_QUERY).matches,
    touchCapable: navigator.maxTouchPoints > 1 || window.matchMedia(ANY_COARSE_QUERY).matches,
    lowMemory: typeof memory === 'number' && memory <= LOW_MEMORY_GB,
  });
}
