import type { CampusFraming } from './section/campusCamera';

export const CAMPUS_DOCK_QUERY = '(min-width: 1024px) and (min-aspect-ratio: 4/3)';
export const CAMPUS_COMPACT_FRACTION = 0.35;

/** Frame the whole particle field inside the space above the compact sheet.
 * Expanding the reading panel deliberately does not move this camera. */
export function campusMobileFraming(width: number, height: number): CampusFraming {
  const top = Math.min(88, height * 0.18);
  const bottom = height * (1 - CAMPUS_COMPACT_FRACTION) - 24;
  const available = Math.max(48, bottom - top);
  return {
    x: 0,
    y: 1 - (top + bottom) / height,
    // The disc's projected diameter at the default distance is 0.6 viewport heights.
    distanceScale: Math.max(1.6, 0.6 * height / Math.max(48, width - 48),
      0.6 * height / Math.max(48, available - 32)),
  };
}
