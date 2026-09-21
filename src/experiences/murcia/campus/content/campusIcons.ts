import type { IconLibrary } from './iconLibrary';

/**
 * The symbols the campus's particles can form, kept in code.
 *
 * PLACEHOLDERS. These are the lab's four stand-ins (`service-campus/demo/
 * placeholderIcons.ts`), copied as they are until the real artwork arrives.
 * Replacing one is replacing its string: the NAMES are `CAMPUS_SYMBOLS` in
 * `src/content/campusShapes.ts`, they are offered to the editor as a closed
 * list in the Studio, and they stay.
 *
 * In code rather than in the CMS by rule (`iconLibrary.ts`): an SVG from the
 * CMS is refused as a file, so the library ships in the bundle, an editor picks
 * by name, and nothing untrusted is ever rasterised. `campusIcons.test.ts` is
 * what stops a name being offered before anything here can draw it.
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
  // Three nodes on a triangle, joined. The fifth mark, added because four of
  // these had to cover five services and one brand therefore wore another's.
  //
  // The segments stop at the circles' edges rather than running under them —
  // start and end are offset by the radius along each chord. The sampler reads
  // ALPHA, so a line crossing a node would put ink where the ring is meant to
  // read as an outline, and the `repeat` figure is built from these samples.
  nodes: svg(
    '<circle cx="128" cy="72" r="24" stroke-width="13"/>' +
      '<circle cx="72" cy="184" r="24" stroke-width="13"/>' +
      '<circle cx="184" cy="184" r="24" stroke-width="13"/>' +
      '<line x1="117.3" y1="93.5" x2="82.7" y2="162.5" stroke-width="13" stroke-linecap="round"/>' +
      '<line x1="138.7" y1="93.5" x2="173.3" y2="162.5" stroke-width="13" stroke-linecap="round"/>' +
      '<line x1="96" y1="184" x2="160" y2="184" stroke-width="13" stroke-linecap="round"/>',
  ),
};
