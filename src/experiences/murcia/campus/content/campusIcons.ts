import type { IconLibrary } from './iconLibrary';

/**
 * The symbols the campus's particles can form, kept in code.
 *
 * PLACEHOLDERS. These are the lab's four stand-ins (`service-campus/demo/
 * placeholderIcons.ts`), copied as they are until the real artwork arrives.
 * Replacing one is replacing its string: the NAMES are what
 * `scene/cityDistrictBindings.ts` points each service at, and they stay.
 *
 * In code rather than in the CMS by rule (`iconLibrary.ts`): an SVG from the
 * CMS is refused as a file, so the library ships in the bundle, an editor picks
 * by name, and nothing untrusted is ever rasterised.
 *
 * Each value is square SVG markup with `width` and `height` declared; the
 * sampler reads alpha, so a hole is a subpath, never a dark fill.
 */

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none" stroke="#fff">${body}</svg>`;

export const CAMPUS_ICONS: IconLibrary = {
  magnifier: svg(
    '<circle cx="110" cy="110" r="56" stroke-width="19"/>' +
      '<line x1="154" y1="154" x2="205" y2="205" stroke-width="19" stroke-linecap="round"/>',
  ),
  mark: svg('<polyline points="56,61 128,200 200,61" stroke-width="28"/>'),
  pin: svg(
    '<ellipse cx="128" cy="205" rx="61" ry="18" stroke-width="13"/>' +
      '<path d="M128 195 L86 122 A49 49 0 1 1 170 122 Z M148 102 a20 20 0 1 0 -40 0 a20 20 0 1 0 40 0 Z" ' +
      'fill="#fff" stroke="none" fill-rule="evenodd"/>',
  ),
  window: svg(
    '<rect x="46" y="61" width="164" height="133" stroke-width="13"/>' +
      '<rect x="46" y="61" width="164" height="28" fill="#fff" stroke="none"/>' +
      '<line x1="69" y1="128" x2="187" y2="128" stroke-width="9"/>' +
      '<line x1="69" y1="156" x2="136" y2="156" stroke-width="9"/>',
  ),
};
