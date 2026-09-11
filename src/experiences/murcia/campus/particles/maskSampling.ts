/**
 * Pixels into points: how a symbol becomes particle targets.
 *
 * `sampleMask` reads any ImageData, so where the pixels come from is not
 * its concern: a rasterised SVG from the icon library, or anything else
 * that can draw itself into a canvas.
 */

/** A point in the mask's square, both axes in -0.5..0.5, +v is up. */
export type MaskSample = readonly [u: number, v: number];

/** A small seeded generator: the same seed, the same sequence, every visit. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `count` points inside the opaque pixels of `mask`, evenly spread.
 *
 * Rejection sampling against the alpha channel, jittered inside the chosen
 * pixel so the result never shows the grid. Seeded through `random`, so the
 * same mask samples the same way every time.
 */
export function sampleMask(mask: ImageData, count: number, random: () => number): MaskSample[] {
  const { width, height, data } = mask;
  const opaque: number[] = [];
  for (let i = 0; i < width * height; i += 1) if (data[i * 4 + 3]! > 127) opaque.push(i);
  if (opaque.length === 0) throw new Error('[service-campus] the mask is empty');

  const samples: MaskSample[] = [];
  for (let n = 0; n < count; n += 1) {
    const pixel = opaque[Math.floor(random() * opaque.length)]!;
    const x = (pixel % width) + random();
    const y = Math.floor(pixel / width) + random();
    samples.push([x / width - 0.5, 0.5 - y / height]);
  }
  return samples;
}
