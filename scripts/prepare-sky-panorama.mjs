// Regenerates the four sky-panorama files in public/textures/ from one
// equirectangular source image.
//
// A one-off asset tool, NOT part of the build — it is not in `npm run build`
// and `sharp` is not a project dependency, because a 40 MB native binary has no
// business in an install that only ever needs to serve the ~190 KB it produces.
// Run it by hand if the sky ever needs regenerating:
//
//   npm i --no-save sharp
//   node scripts/prepare-sky-panorama.mjs <path-to-equirectangular-png>
//
// The source is a PATH, not a URL, and it deliberately lives OUTSIDE the repo:
// it is a 6 MB intermediate, 25x the size of what ships. The shipped sky comes
// from
//
//   04_Assets/fonde del espacio/sky-panorama-001.png   (4096x2048, CC0)
//
// Read the source PNG, never a WebP or JPEG of it. Recompressing an already
// lossy file bakes that codec's artifacts into the AVIF and then spends bits
// preserving them.
//
// Provenance is in CREDITS.md. The current source is public domain, so unlike
// the ESO panorama this replaced there is NO visible-credit obligation.
//
// TWO CLIENT REQUIREMENTS bind this asset, and both are requirements rather
// than preferences:
//
//   1. NO ATTRIBUTION. The source must carry no credit obligation of any kind.
//      This is why the ESO panorama (CC BY 4.0, credit mandatory) was dropped
//      despite looking good. "Credit requested as a courtesy" does not pass
//      either — NASA/Goddard's Deep Star Maps were rejected on that plus their
//      ESA/Gaia DR2 layer, which is not NASA's to place in the public domain.
//   2. The desktop AVIF stays at or under 200 KB.
//
// If you change the source, satisfy both before shipping, and update
// CREDITS.md.
//
// ── The source must be a true 360-degree wrap, and the script tells you ──
// It prints `offset` and `spread` per channel for every file it writes.
// `offset` is the photometric step between the two vertical edges and is
// correctable. `spread` is how much of the edge disagreement is CONTENT rather
// than level: a large spread means the two edges show DIFFERENT SKY, the image
// is a crop rather than a panorama, and no correction of any kind closes it.
// Measured on the candidates that were considered:
//
//   sky-panorama-003   offset 0,0,0   spread 0.5   (synthetic, already wraps)
//   sky-panorama-001   offset 3,4,4   spread 2.0   <- shipped
//   sky-panorama-002   offset 9,6,9   spread 5-7
//   sky-panorama-006   offset -       spread 8-30  (a crop; rejected)
//
// Spread above ~3 is a reason to reject the source, not a number to tune.
//
// ── The median filter is the load-bearing step ──
// It removes point stars while leaving the diffuse gas and the dust lanes. The
// scene draws its own star field on a nearer shell where the stars parallax
// against the sky and twinkle, so photographed stars would be a second, static,
// contradictory set sitting behind them.
//
// It also happens to be what makes the file small. Point stars are
// high-entropy: the same image without this step is roughly 14x larger. So if
// you are tempted to drop it for sharpness, know what it costs.
//
// Window size is a trade. 3 leaves bright stars as smudges; 9 clears everything
// but visibly softens the dust lanes near the galactic core. 5 was chosen by
// looking at the result in the scene, which is the only way to choose it.
//
// ── The poles are not optional either, and 2:1 does NOT mean equirectangular ──
// The only thing this script used to check about the projection was that the
// source is 2:1. Aspect ratio is not projection, and every flat 2:1 image on
// earth passes that guard. The six CC0 candidates screened in 2026-08 were
// looked at for wrapping and for having a galactic plane; none of them is
// actually an equirectangular panorama, and the one that shipped is not either.
//
// `shell.frag.glsl` maps v = asin(dir.y)/PI + 0.5, so the TOP ROW IS THE
// ZENITH: one point of sky smeared across all W columns. A real panorama has
// near-identical pixels there. `poleRatios` measures exactly that and the
// numbers are in its doc comment — a real one scores 0.03, this source 0.67.
//
// What a viewer sees when it is wrong is not subtle and does not read as "the
// sky is a bit off". The top strip of the image gets wrapped into a disc around
// the pole, so its horizontal detail becomes azimuthal detail, compressed
// harder the closer to the pole it lands. It renders as a PINWHEEL OF RADIAL
// SPOKES converging on a point, with a hard straight wedge where the meridian
// lands. It gets reported as "the edge of the image". Both poles are reachable by ordinary
// dragging — the sky pole lies along bandAxis(22deg), needing a camera phi of
// 158 / 22 degrees against an orbit clamp of 8.6 to 171.4 — and the warp to
// Murcia opens the FOV from 45 to 74 degrees, which pulls ~1.8x more sky into
// frame at once and is where it gets noticed.
//
// `convergePoles` below does two things, and ONLY THE SECOND ONE FIXES IT.
// This was established by rendering the pole view rather than by reasoning, and
// the reasoning had it wrong, so do not undo the second step on the strength of
// the argument for the first.
//
//   1. It band-limits each row to 1/cos(lat), which is the textbook
//      anti-aliasing for equirect and is exactly right on its own terms. It
//      drove the measured pole ratio from 0.54 to 0.015 — AND THE PICTURE WAS
//      VISUALLY UNCHANGED. A ratio near zero says the pole row is constant; it
//      says nothing about the ring one degree out.
//   2. It fades each row toward its own azimuthal MEAN, from POLE_FADE_START_DEG
//      to the pole. This is what removes the spokes, because the spokes are
//      CONTENT, not aliasing: a flat image's horizontal detail becomes
//      azimuthal detail when wrapped, and a real panorama has genuine sky there
//      while this has a stretched picture. Nothing short of removing the
//      azimuthal variation removes it.
//
// Render the pole view before and after if you change either. The metric agrees
// with a picture that is still wrong, which is the trap this file exists to
// stop the next person falling into.
//
// It does NOT make the source a panorama. The image's features are still drawn
// at whatever angular scale results from stretching its authored framing across
// 360 degrees, and no filter here recovers a framing the image never had. If
// the sky still reads as "zoomed" after this, the answer is a different source,
// not a different filter.
//
// There is deliberately NO hard throw on the pole ratio. Rejecting sources on
// it would reject every 4096x2048 asset currently available, against a standing
// decision that space backgrounds are 4096x2048. The number is printed instead,
// on both sides of the correction, and the correction handles the rest.
//
// ── The wrap seam is not optional either ──
// Measure it SIGNED, not absolute: mean(px(0) - px(W-1)). The mean of the
// ABSOLUTE difference measures per-pixel noise at this scale and will tell you
// the seam is still there after you have fixed it. Ask for the signed mean.
//
// A step of 0.40/255 sounds negligible and is not, for two reasons. The sky
// background sits around 12/255, so that is a 3% step, and the sRGB transfer
// curve is steep in the toe. And a great circle projects to a STRAIGHT LINE
// under a perspective camera, so the step does not read as a soft variation in
// the gas; it renders as a hard diagonal ruler line across the sky.
//
// No wrap mode or filter setting fixes it. The discontinuity is in the data.
//
// ── AVIF, at q59, and NOT because higher is better ──
// The first version of this shipped WebP q82 and the sky read as "a bad-res
// image where you can see big squares". It was not resolution. WebP quantises
// smooth dark gradients into flat macroblocks, and magnification multiplies
// them: 16-px blocks become 28-px squares on screen at DPR 1 and 56 at DPR 2.
//
// Measure it as the ratio of pixel steps ACROSS 16-px block boundaries to steps
// WITHIN blocks, over dark pixels only. A codec that is not blocking scores 1.0.
// Measured on THIS source, at 4096 wide, after the median AND after
// convergePoles — the correction changes the content the encoder sees, so the
// pre-correction ladder no longer applies and was re-run:
//
//   PNG lossless (reference)   1.011  10022 KiB
//   AVIF q45                   1.887    128 KiB
//   AVIF q50                   1.841    155 KiB
//   AVIF q55                   1.800    172 KiB
//   AVIF q59                   1.666    190 KiB  <- shipped (194,642 bytes)
//   AVIF q60                   1.647    197 KiB  202,169 bytes - OVER 200,000
//   AVIF q65                   1.659    214 KiB  over the budget either way
//   AVIF q70                   1.590    248 KiB
//   AVIF q80                   1.423    340 KiB
//   WebP q88                   2.615    273 KiB  (fallback only)
//
// Two things in that table matter. WebP stays blocky at ANY quality, so raising
// WebP quality is not a fix — it is a fallback and is priced as one. And AVIF
// is NOT MONOTONIC: q50 blocks WORSE than q45, and q65 worse than q60, because
// rate control picks different tiling at different targets. Do not "improve"
// this by raising AVIF_QUALITY without re-running the measurement. The `block`
// column below is that same measurement, printed for every file this writes.
//
// The optimum is per-image and does not transfer. The ESO panorama this
// replaced shipped at q60, where it measured 1.169 and q70/q80 were worse. On
// this source the curve runs the other way. If you swap the source again,
// re-run the ladder; do not inherit this number.
//
// ── Why q59, of all things ──
// A 200 KB ceiling on the desktop backdrop is a CLIENT REQUIREMENT, and "200
// KB" is ambiguous by a factor that matters here. q60 is 202,169 bytes: that is
// 197.4 KiB and passes a 1024-based reading, and it fails a 1000-based one.
// Every file this project has ever shipped was under 200,000 bytes on both
// readings, so crossing that line silently on a client requirement is not a
// call this script gets to make. q59 is 194,642 bytes, under either, and at
// block 1.666 it gives up essentially nothing against q60's 1.647.
//
// It was q50 before `convergePoles` existed, when q55 came to 206 KiB and did
// not fit at all. The correction removes detail the encoder was spending bits
// on — a little from the band limit, far more from the polar fade — and that is
// what walked the affordable quality up from q50 to q59. Same rule throughout,
// applied to re-measured numbers rather than inherited ones.
//
// The ladder is not smooth down here: q56 and q57 produce byte-identical
// output. Do not read fine structure into single steps.
//
// The size is printed for every file for this reason. If you change the source,
// the fade start, or the median window, CHECK IT before shipping rather than
// assuming q59 still fits.
//
// The block ratio overstates what you actually see, and that is worth knowing
// before someone "fixes" this by spending 220 KB. The number is measured on the
// STORED texture, but the shader never shows you the stored texture:
// `shell.frag.glsl` multiplies by uSkyBrightness (0.60) and adds a +/-0.5/255
// per-pixel dither. The dither turns block edges into grain the eye integrates
// away, and it is there for exactly this reason.
//
// It also reads HIGHER after the correction on identical settings — q50 went
// 1.680 to 1.815 — and that is largely the ruler, not the picture. The ratio is
// block-boundary steps over WITHIN-block steps, and convergePoles drives the
// within-block steps near the poles toward zero, which shrinks the denominator.
// A smoother image can therefore score worse while looking better.
//
// So the ladder ranks encoder settings and the scene decides. Do not raise this
// on the strength of the number alone — look at it, and check the 200 KB budget
// before you do.
//
// WebP is still emitted as a fallback for browsers without AVIF. Only one file
// is ever fetched — `SkyShell` attempts the AVIF and falls back on a decode
// failure.

import { writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'textures')

const MEDIAN_WINDOW = 5

// Widths, and why there are two. 4096 is the ceiling the SOURCE allows —
// anything wider is empty upscaling — and it costs 33.6 MB of VRAM
// (4096 * 2048 * 4, no mipmaps).
//
// At 4096 the texture spans 360 degrees at 11.4 px/deg, against a viewport
// showing ~45 degrees over ~900 px (20 px/deg). So the sky is still MAGNIFIED,
// never minified, which is why mipmaps stay off in spaceConfig.ts. That margin
// is the constraint to preserve if this number ever changes.
//
// The narrow variant is half the width and a quarter of the VRAM, at 8.4 MB.
// Phones have small viewports, so the resolution buys them nothing, and there
// is no reason to hand a phone a 33.6 MB backdrop.
const WIDTH_WIDE = 4096
const WIDTH_NARROW = 2048

// See the block-ratio table above before touching this. Higher is not better —
// q65 blocks worse than q60 AND busts the budget — and this value was measured
// on THIS source AFTER convergePoles. It is capped by the 200 KB budget rather
// than chosen freely: q60 crosses 200,000 bytes, which is why this is 59 and
// not a round number. See the header.
const AVIF_QUALITY = 59
// Only reached by browsers without AVIF. Quality is chosen for size rather than
// for blocking, because blocking is unavoidable in WebP and this is a fallback.
const WEBP_QUALITY = 88
// ACES tone mapping desaturates as it compresses, and the sky arrives already
// pale from the median. Pre-saturating here rather than in the shader keeps the
// runtime cost at zero; the value is low on purpose, because the subject is
// dust and starlight and this is meant to restore the photograph's warmth, not
// to invent colour that was never in it.
const SATURATION = 1.35

// Latitude, in degrees, at which the polar fade begins; it reaches full
// strength at the pole. See the pole section in the header — this is the number
// that actually removes the artifact, and it was chosen by rendering the pole
// view at the scene's widest FOV (74 degrees, the warp peak) at 90 (off), 65,
// 55 and 45 and looking at the four.
//
// 65 already removes both things that read as "the edge of the image": the
// convergence point and the hard straight wedge along the meridian. 45 is
// cleaner still and flattens noticeably more sky. 55 is the balance.
//
// Raising it toward 90 turns the fade off and the spokes come back. Lowering it
// costs real sky: the weight is 0 here and 1 at the pole, so everything above
// this latitude is pulled toward its own row mean by some amount.
const POLE_FADE_START_DEG = 55

const SOURCE = process.argv[2]
if (!SOURCE) {
  console.error(
    'usage: node scripts/prepare-sky-panorama.mjs <path-to-equirectangular-png>\n\n' +
      "The shipped sky is '04_Assets/fonde del espacio/sky-panorama-001.png'.\n",
  )
  process.exit(1)
}

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('sharp is not installed. Run:\n\n  npm i --no-save sharp\n')
  process.exit(1)
}

const input = resolve(SOURCE)
const { width, height } = await sharp(input).metadata()
// 2:1 is what makes the equirect mapping in shell.frag.glsl correct. A source
// with any other aspect would be silently stretched across the sphere.
if (width !== height * 2) {
  throw new Error(`expected a 2:1 equirectangular source, got ${width}x${height}`)
}
if (width < WIDTH_WIDE) {
  throw new Error(`source is ${width} wide; ${WIDTH_WIDE} would upscale it`)
}

/**
 * A deterministic value in [0, 1) from a pixel address, used as the rounding
 * threshold in `levelSeam`. An integer hash rather than Math.random, so that
 * regenerating an asset produces the same bytes.
 */
function dither(x, y, c) {
  let h = (x * 374761393 + y * 668265263 + c * 2246822519) >>> 0
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
  return (h >>> 8) / 16777216
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function median(values) {
  const sorted = Float64Array.from(values).sort()
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Closes the wrap seam by spreading the edge-to-edge mismatch across the whole
 * width as a gradient. Mutates `data` in place; returns a per-channel report.
 *
 * Every pixel gains `offset * x / (W - 1)`, so the last column lands exactly on
 * the first column's value and the meridian closes, while the correction itself
 * is a ramp over a full 360 degrees — far too gradual for the eye to find.
 *
 * ── Why ONE offset per channel, and not a per-row delta ──
 * The original scheme took a per-row delta smoothed over +/-48 rows. It closed
 * the seam — the signed mean fell from 0.40 to 0.011 — but nobody measured how
 * much it PAINTED INTO THE PICTURE to get there, and that is a separate
 * quantity. Per-row edge deltas are dominated by whether a star happened to
 * land on one edge and not the other, so they swing over +/-238/255. A moving
 * average of that is still a large, arbitrary, PER-CHANNEL signal, and ramping
 * it across the width prints it as broad coloured horizontal bands — flat, tens
 * of rows tall, pink and teal, because each channel gets its own delta. The
 * row-varying correction reached p90 = 4.21 and max = 11.92 on the ESO source
 * this replaced, against a sky background around 12/255. It was visible, and it
 * was the first thing anyone noticed about the output.
 *
 * The MEDIAN row delta is one number per channel for the whole image. It
 * removes the genuine photometric step between the two edges — which is what a
 * seam IS — and being constant down every column it cannot band by
 * construction. The row-varying part it discards is content, not level, and no
 * ramp fixes content anyway.
 *
 * `spread`, the median absolute deviation of the row deltas about that offset,
 * is returned so the caller can say when a source is beyond correcting.
 *
 * ── The ramp is DITHERED ──
 * `data` is 8-bit, so writing `v + offset*x/(W-1)` into it truncates: a ramp
 * whose total rise is a few units becomes a staircase, the fractional part is
 * thrown away, and the seam does not close. Measured on a source whose raw
 * mismatch was -3.91/255, the residual seam after levelling was:
 *
 *   truncated    0.491    <- barely better than nothing
 *   rounded     -0.017
 *   dithered    -0.012    <- used
 *
 * Rounding fixes the residual but leaves the staircase — a 4-unit rise prints
 * four vertical 1-unit steps across the sky, which against a background around
 * 12/255 is the same kind of straight-line artifact the seam itself was.
 * Dithering the fractional part scatters each step over a column of noise
 * instead.
 */
function levelSeam(data, width, height, channels) {
  const report = []
  for (let c = 0; c < channels; c++) {
    const rowDelta = new Float64Array(height)
    for (let y = 0; y < height; y++) {
      rowDelta[y] = data[y * width * channels + c] - data[(y * width + width - 1) * channels + c]
    }
    const offset = median(rowDelta)
    const spread = median(Float64Array.from(rowDelta, (d) => Math.abs(d - offset)))
    report.push({ offset, spread })

    if (offset === 0) continue
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels + c
        const corrected = Math.floor(data[i] + (offset * x) / (width - 1) + dither(x, y, c))
        data[i] = corrected < 0 ? 0 : corrected > 255 ? 255 : corrected
      }
    }
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
function seamDelta(data, width, height, channels) {
  let sum = 0
  for (let y = 0; y < height; y++) {
    for (let c = 0; c < channels; c++) {
      sum += data[y * width * channels + c] - data[(y * width + width - 1) * channels + c]
    }
  }
  return sum / (height * channels)
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
 * Reported both sides of convergePoles. The BEFORE number is the diagnostic —
 * it says whether the source was a panorama, at the width that ships. The AFTER
 * number only confirms the correction ran, and is near 0 by construction.
 */
function poleRatios(data, width, height, channels) {
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
 * Circular box blur of one row. Wrapping is correct here and not a convenience:
 * u genuinely wraps at the meridian, so the first and last columns are
 * neighbours on the sphere.
 *
 * A running sum, so the cost is O(width) rather than O(width * kernel). Near
 * the poles the kernel approaches the full width, and the naive form would be
 * billions of operations per image.
 */
function boxBlurCircular(src, dst, width, radius) {
  if (radius < 1) {
    dst.set(src)
    return
  }
  const span = 2 * radius + 1
  if (span >= width) {
    let total = 0
    for (let x = 0; x < width; x++) total += src[x]
    dst.fill(total / width)
    return
  }
  const wrap = (i) => ((i % width) + width) % width
  let sum = 0
  for (let i = -radius; i <= radius; i++) sum += src[wrap(i)]
  for (let x = 0; x < width; x++) {
    dst[x] = sum / span
    sum -= src[wrap(x - radius)]
    sum += src[wrap(x + radius + 1)]
  }
}

/**
 * Band-limits every row to the number of samples its latitude can actually
 * carry, which is what makes the poles converge. Mutates `data` in place.
 *
 * ── The defect this exists to remove ──
 * A ring at latitude `lat` has circumference proportional to cos(lat), so it
 * can resolve about W*cos(lat) distinct samples. The image supplies W of them
 * at EVERY row. Near the poles the excess is unresolvable, and unresolvable
 * detail does not vanish quietly — it aliases, as a pinwheel spiralling into
 * the pole. That pinwheel is what a viewer reads as "the edge of the image",
 * and both poles are reachable by ordinary dragging: the sky pole lies along
 * bandAxis(22deg), which needs a camera phi of 158 / 22 degrees against an
 * orbit clamp of 8.6 to 171.4.
 *
 * The panorama this replaced had nothing to alias — its pole rows were already
 * flat, because that is what the projection means. See `poleRatios`.
 *
 * ── The band limit, which is correct and is not sufficient ──
 * The kernel is 1/cos(lat) wide, which degrades correctly at both ends on its
 * own: at the equator it is 1 pixel and the image is UNTOUCHED, and at the pole
 * row it spans the full width and the row collapses to its own mean — a flat
 * disc, which is what a real panorama's pole already is.
 *
 * It was shipped alone first, on the reasoning that the spokes were aliasing
 * and this is the anti-aliasing. The pole ratio fell from 0.54 to 0.015 and the
 * rendered pole view was INDISTINGUISHABLE from before. The reasoning was
 * wrong: at 22.5 degrees from the pole the kernel is 2.6 pixels out of 4096,
 * and the spokes there are resolvable content, not unresolvable detail. It is
 * kept because it is genuinely correct at the innermost degree and costs
 * nothing, not because it solves the reported problem.
 *
 * ── The polar fade, which does fix it ──
 * Each row is pulled toward its own azimuthal mean, weight 0 at
 * POLE_FADE_START_DEG and 1 at the pole. Removing the azimuthal variation is
 * the only thing that removes spokes, and a flat image has no azimuthal
 * variation worth keeping up there — a real panorama has sky, this has a
 * picture stretched into an annulus.
 *
 * Toward the mean rather than to a flat colour, so the polar caps keep their
 * brightness and colour gradient and read as sky receding rather than as a disc
 * pasted over the hole. smoothstep rather than linear, so there is no edge where
 * the correction starts.
 *
 * Two box passes rather than one. A single box has sinc sidelobes and would
 * trade the pinwheel for ringing; two make the kernel triangular. Both passes
 * run at the full band-limit width, so the pair smooths about sqrt(2) harder
 * than the strict limit. That is deliberate: narrowing each pass to compensate
 * stops the pole row from ever reaching its own mean — measured, it left the
 * pole ratio at 0.475 instead of 0 — and the margin is spent only on detail the
 * sphere cannot resolve there anyway.
 *
 * ROUND, not ceil, on the radius. ceil turns a strict kernel of 1.41 at 45
 * degrees of latitude into a 3-pixel span, which visibly softens the
 * mid-latitudes for no reason; round leaves everything below 60 degrees
 * untouched, which is where nearly all of the picture is.
 *
 * Dithered on write for the same reason `levelSeam` is: `data` is 8-bit, and
 * truncating a blurred value throws the fractional part away as a staircase.
 */
function convergePoles(data, width, height, channels) {
  const row = new Float64Array(width)
  const scratch = new Float64Array(width)
  const fadeStart = (POLE_FADE_START_DEG * Math.PI) / 180
  for (let y = 0; y < height; y++) {
    const lat = (y / (height - 1) - 0.5) * Math.PI
    const kernel = Math.min(width, 1 / Math.max(Math.cos(lat), 1e-9))
    const radius = Math.round((kernel - 1) / 2)
    const fade = smoothstep(fadeStart, Math.PI / 2, Math.abs(lat))
    if (radius < 1 && fade <= 0) continue

    for (let c = 0; c < channels; c++) {
      for (let x = 0; x < width; x++) row[x] = data[(y * width + x) * channels + c]

      if (radius >= 1) {
        boxBlurCircular(row, scratch, width, radius)
        boxBlurCircular(scratch, row, width, radius)
      }

      // The fade to the row's own mean. See the header: the band limit alone
      // does not remove the spokes, because they are content rather than
      // aliasing, and only removing the azimuthal variation removes them.
      if (fade > 0) {
        let mean = 0
        for (let x = 0; x < width; x++) mean += row[x]
        mean /= width
        for (let x = 0; x < width; x++) row[x] += (mean - row[x]) * fade
      }

      for (let x = 0; x < width; x++) {
        const v = Math.floor(row[x] + dither(x, y, c))
        data[(y * width + x) * channels + c] = v < 0 ? 0 : v > 255 ? 255 : v
      }
    }
  }
}

/**
 * Reports the block ratio the comment at the top of this file tabulates, so the
 * numbers can be re-derived rather than trusted.
 *
 * Mean |horizontal step| across 16-px block boundaries, over mean |step| within
 * blocks, restricted to dark pixels — which is where the codec has the least
 * signal to hide behind and where the artifact is actually visible. Lossless
 * scores 1.00; anything approaching 2 is what "you can see the squares" means.
 */
async function blockRatio(buffer) {
  const { data, info } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true })
  let edgeSum = 0
  let edgeCount = 0
  let interiorSum = 0
  let interiorCount = 0
  for (let y = 0; y < info.height; y++) {
    for (let x = 1; x < info.width; x++) {
      const i = y * info.width + x
      if (data[i] > 40) continue
      const step = Math.abs(data[i] - data[i - 1])
      if (x % 16 === 0) {
        edgeSum += step
        edgeCount++
      } else {
        interiorSum += step
        interiorCount++
      }
    }
  }
  return edgeSum / edgeCount / (interiorSum / interiorCount)
}

// The median runs ONCE at source resolution, then feeds both widths. Running it
// per-width would remove a different set of stars at each, so the two variants
// would not be the same sky.
const filtered = await sharp(input)
  .median(MEDIAN_WINDOW)
  .modulate({ saturation: SATURATION })
  .removeAlpha()
  .toBuffer()

async function emit(width, format, quality) {
  const { data, info } = await sharp(filtered)
    .resize(width, width / 2, { kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  // After the resize, so the ramp closes the seam at the width that ships.
  // Doing it before would let lanczos blend the corrected edge columns with
  // their neighbours and reopen a small step.
  const seam = levelSeam(data, info.width, info.height, info.channels)
  const residual = seamDelta(data, info.width, info.height, info.channels)

  // AFTER levelSeam, and the order is load-bearing. levelSeam ramps a
  // per-channel offset across the width; running it second would paint that
  // ramp — a few units, against a sky background near 12/255 — back across the
  // pole rows and reopen exactly what this just closed.
  const polesBefore = poleRatios(data, info.width, info.height, info.channels)
  convergePoles(data, info.width, info.height, info.channels)
  const polesAfter = poleRatios(data, info.width, info.height, info.channels)

  const encoder = sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
  const buffer = await (format === 'avif'
    ? encoder.avif({ quality, effort: 6 })
    : encoder.webp({ quality, effort: 6 })
  ).toBuffer()

  const name = `sky-panorama${width === WIDTH_NARROW ? '-narrow' : ''}.${format}`
  // writeFile, NOT sharp(buffer).toFile(). Handing an encoded buffer back to
  // sharp DECODES AND RE-ENCODES it at sharp's default quality, silently
  // discarding the settings chosen above — the file on disk then has nothing to
  // do with the block ratio printed next to it. It shipped that way once.
  await writeFile(join(OUT_DIR, name), buffer)

  console.log(
    `  ${name.padEnd(28)} ${String(width).padStart(5)}x${width / 2}` +
      `  ${format} q${quality}` +
      `  ${(buffer.length / 1024).toFixed(0).padStart(5)} KB` +
      `  block ${(await blockRatio(buffer)).toFixed(3)}` +
      `  seam ${residual.toFixed(3)}` +
      `  offset ${seam.map((s) => s.offset).join(',')}` +
      `  spread ${seam.map((s) => s.spread.toFixed(1)).join(',')}` +
      `  poles ${polesBefore.top.toFixed(2)},${polesBefore.bottom.toFixed(2)}` +
      `->${polesAfter.top.toFixed(3)},${polesAfter.bottom.toFixed(3)}`,
  )
}

console.log(`source: ${input} (${width}x${height})`)
console.log(`median ${MEDIAN_WINDOW}, saturation ${SATURATION}, seam levelled by median offset`)
await emit(WIDTH_WIDE, 'avif', AVIF_QUALITY)
await emit(WIDTH_WIDE, 'webp', WEBP_QUALITY)
await emit(WIDTH_NARROW, 'avif', AVIF_QUALITY)
await emit(WIDTH_NARROW, 'webp', WEBP_QUALITY)
console.log('\nblock ratio: 1.00 is lossless. Above ~1.5 the squares are visible.')
console.log('seam: signed mean of px(0) - px(W-1). Should be near 0.')
console.log('spread: how much edge disagreement is CONTENT. Above ~3, reject the source.')
console.log('poles: row sd at each pole over the equator, before -> after convergence.')
console.log('       BEFORE is the diagnostic. Under ~0.15 is consistent with a real')
console.log('       equirectangular source; above ~0.3 it is definitely not one. Do not')
console.log('       read a tight threshold into it - the ESO panorama, which IS one,')
console.log('       measures 0.029 at the top and 0.152 at the bottom.')
console.log('       AFTER is ~0.015 here. It does not reach 0 on the ENCODED file (~0.07):')
console.log('       the codec puts noise back into a flat row. Measure sources, not output.')
