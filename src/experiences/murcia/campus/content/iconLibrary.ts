import { svgToMask } from '../particles/svgMask';

/**
 * The icons the campus can form, kept in code.
 *
 * A service document names one of these; it never carries markup. That is
 * the site's rule: an SVG from the CMS is refused as a file, so the library
 * ships with the bundle and an editor picks by name. Adding an icon is a
 * deploy, and nothing untrusted is ever rasterised.
 *
 * Each value is the SVG markup, square, with `width` and `height` declared.
 */
export type IconLibrary = Readonly<Record<string, string>>;

/** The library rasterised: name to pixels, ready for sampling. */
export type IconMasks = ReadonlyMap<string, ImageData>;

/** Rasterises every icon once. Awaited before the campus is attached. */
export async function rasterizeIcons(icons: IconLibrary, px = 256): Promise<IconMasks> {
  const entries = await Promise.all(
    Object.entries(icons).map(async ([name, svg]) => [name, await svgToMask(svg, px)] as const),
  );
  return new Map(entries);
}
