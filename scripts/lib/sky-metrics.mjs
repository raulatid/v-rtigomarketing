// The three measurements that say what a candidate sky image actually IS.
//
// Extracted from scripts/prepare-sky-panorama.mjs so that the screening tool
// and the preparation pipeline cannot disagree about the one number this whole
// feature turns on. They are MOVED, not copied: two definitions of `poleRatios`
// drifting apart would mean the screen that accepts a source and the pipeline
// that processes it were answering different questions.
//
// Pure functions over a raw RGB(A) buffer. No `sharp`, no I/O, no mutation —
// the caller decodes and the caller writes, so these can be run against an
// untouched download as safely as against a half-finished pipeline stage.
//
// Every function takes (data, width, height, channels) in the shape sharp's
// `.raw().toBuffer({ resolveWithObject: true })` returns.

/** Middle value of a set. Used for seam offsets, where the mean is not robust. */
export function median(values) {
  const sorted = Float64Array.from(values).sort()
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Row standard deviation at the two poles, each over the equator's. THE test
 * for whether a source is really an equirectangular panorama.
 *
 * The shader maps v = asin(dir.y)/PI + 0.5, so the top row IS the zenith: one
 * point smeared across every column. In a real panorama those W pixels are
 * therefore near-identical and the ratio is near 0. A flat 2:1 image has as
 * much detail there as anywhere, and scores in the same range as its own
 * middle. Measured:
 *
 *   eso0932a.tif  (a real panorama)   0.029 / 0.152
 *   sky-panorama-001.png  (shipped)   0.670 / 0.383
 *   candidates 002-006                0.319-0.838 / 0.174-1.257
 *
 * Every CC0 candidate that was screened fails it. That is the finding, not a
 * property of the one that shipped: the screen those six went through checked
 * wrapping and whether they had a galactic plane, and nothing looked at a pole.
 *
 * Read the gap, not a threshold. The reference itself measures 0.152 at the
 * bottom, so "under 0.05" would reject a real panorama; the candidates sit at
 * 0.319 and above, which is the separation that actually means something.
 *
 * MEASURE THIS ON THE UNTOUCHED SOURCE. A median filter — and the preparation
 * script runs a 15x15 one at the poles — flattens the pole rows itself, so a
 * ratio taken afterwards reports the filter's work rather than the image's
 * projection, and would answer "equirectangular" about anything.
 */
export function poleRatios(data, width, height, channels) {
  // PER CHANNEL, averaged. Pooling all three into one distribution also
  // measures the spread BETWEEN the channel means, so a perfectly converged row
  // — flat in R, flat in G, flat in B, at three different levels — still scores
  // non-zero and the metric can never reach 0. Measured on this source, pooling
  // reported 0.473 for a pole row that was in fact constant; per channel the
  // same row reads 0.014. That very nearly sent someone after a bug in the
  // correction that was only ever in the ruler.
  const rowSd = (y) => {
    let total = 0
    for (let c = 0; c < channels; c++) {
      let sum = 0
      let sumSq = 0
      for (let x = 0; x < width; x++) {
        const v = data[(y * width + x) * channels + c]
        sum += v
        sumSq += v * v
      }
      const mean = sum / width
      total += Math.sqrt(Math.max(0, sumSq / width - mean * mean))
    }
    return total / channels
  }
  const equator = rowSd(height >> 1)
  if (equator === 0) return { top: 0, bottom: 0 }
  return { top: rowSd(0) / equator, bottom: rowSd(height - 1) / equator }
}

/**
 * Per-channel wrap-seam report: `{ offset, spread }` for each channel, in
 * 0-255 units. Measures only — `levelSeam` in the preparation script applies
 * the correction and calls this for the numbers that drive it.
 *
 * `offset` is the median row delta `px(0) - px(W-1)`: the genuine photometric
 * step between the two vertical edges, which is what a seam IS. One number per
 * channel for the whole image, so a correction built from it cannot band.
 *
 * `spread` is the median absolute deviation of those row deltas about that
 * offset, and it is the one that decides whether a source is usable at all.
 * A large spread means the disagreement is CONTENT rather than level: the two
 * edges show different sky, the image is a crop rather than a 360-degree wrap,
 * and no correction of any kind closes it. Measured on the screened set:
 *
 *   sky-panorama-003   offset 0,0,0   spread 0.5   (synthetic, already wraps)
 *   sky-panorama-001   offset 3,4,4   spread 2.0   <- shipped
 *   sky-panorama-002   offset 9,6,9   spread 5-7
 *   sky-panorama-006   offset -       spread 8-30  (a crop; rejected)
 */
export function seamMetrics(data, width, height, channels) {
  const report = []
  for (let c = 0; c < channels; c++) {
    const rowDelta = new Float64Array(height)
    for (let y = 0; y < height; y++) {
      rowDelta[y] = data[y * width * channels + c] - data[(y * width + width - 1) * channels + c]
    }
    const offset = median(rowDelta)
    const spread = median(Float64Array.from(rowDelta, (d) => Math.abs(d - offset)))
    report.push({ offset, spread })
  }
  return report
}

/**
 * The SIGNED mean of `px(0) - px(W-1)`, in 0-255 units. The number `levelSeam`
 * exists to drive toward zero, and the only honest way to check that it did.
 *
 * On a source whose edges hold different content this stays large however good
 * the correction is, because the difference is real. Read `spread` alongside it.
 */
export function seamDelta(data, width, height, channels) {
  let sum = 0
  for (let y = 0; y < height; y++) {
    for (let c = 0; c < channels; c++) {
      sum += data[y * width * channels + c] - data[(y * width + width - 1) * channels + c]
    }
  }
  return sum / (height * channels)
}
