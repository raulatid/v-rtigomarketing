/**
 * Random screen targets for a vantage point's anchors. Authoring only —
 * imported by `observerDebug.ts` alone, behind `DEBUG_TOOLS_ENABLED`.
 *
 * The composition is authored BACKWARDS: rather than looking for scenery that
 * happens to line up, pick random points on the screen from a chosen pose and
 * cast each onto whatever building is behind it. The anchors then align exactly
 * from that pose and scatter from every other, and the figure they make has no
 * shape anyone could guess — it is only recognisable against the hint.
 *
 * Targets are placed in HEIGHT units, not raw NDC. With the lens fixed, a
 * pose's projection keeps its pixel geometry when only the viewport's width
 * changes: a wider screen shows more around the figure, a narrower one less.
 * So the horizontal extent is capped by the NARROWEST aspect the figure has to
 * fit — an upright phone is about 0.46 — or its outer anchors fall off the side.
 */

export interface ScatterOptions {
  count: number;
  /** Viewport width / height. */
  aspect: number;
  /** Vertical half-extent of the target area, in half-heights. */
  extent: number;
  /** The narrowest width / height the figure must fit. Caps the horizontal half-extent. */
  minAspect: number;
  /** Minimum distance between two targets, as a fraction of the viewport height. */
  minSeparation: number;
  /** Uniform in [0, 1). Injected so a test can be deterministic. */
  random: () => number;
  maxAttempts?: number;
}

/**
 * `count` NDC targets, pairwise at least `minSeparation` apart, or null when the
 * constraints could not be met within the attempts — ask for fewer or closer.
 */
export function scatterTargets(options: ScatterOptions): Array<[number, number]> | null {
  const { count, aspect, extent, minAspect, minSeparation, random } = options;
  // A margin inside the narrowest screen, so an anchor is never on its very edge.
  const extentX = Math.min(extent, minAspect * 0.9);
  const maxAttempts = options.maxAttempts ?? 2_000;
  // Distances are measured in half-heights, the unit NDC y already uses.
  const minDistance = minSeparation * 2;
  const chosen: Array<[number, number]> = [];

  for (let attempt = 0; attempt < maxAttempts && chosen.length < count; attempt++) {
    const hx = (random() * 2 - 1) * extentX;
    const hy = (random() * 2 - 1) * extent;
    if (chosen.some(([x, y]) => Math.hypot(x * aspect - hx, y - hy) < minDistance)) continue;
    chosen.push([hx / aspect, hy]);
  }
  return chosen.length === count ? chosen : null;
}

/** crypto-backed uniform [0, 1), so an authored figure is not a seeded Math.random. */
export function cryptoRandom(): number {
  const word = new Uint32Array(1);
  crypto.getRandomValues(word);
  return word[0] / 2 ** 32;
}
