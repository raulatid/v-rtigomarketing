// Regenerates public/textures/sky-panorama.webp from the ESO original.
//
// A one-off asset tool, NOT part of the build — it is not in `npm run build`
// and `sharp` is not a project dependency, because a 40 MB native binary has no
// business in an install that only ever needs to serve the 111 KB it produces.
// Run it by hand if the sky ever needs regenerating:
//
//   npm i --no-save sharp && node scripts/prepare-sky-panorama.mjs
//
// Licence and credit for the source image are in CREDITS.md, and the credit is
// a CC BY 4.0 obligation rather than a courtesy. If you change the source here,
// change it there, and check whether the visible credit in the site footer
// still says the right thing.
//
// ── The median filter is the load-bearing step ──
// It removes point stars while leaving the diffuse gas, the dust lanes and the
// Magellanic Clouds. The scene draws its own star field on a nearer shell where
// the stars parallax against the sky and twinkle, so photographed stars would
// be a second, static, contradictory set sitting behind them.
//
// It also happens to be what makes the file small. Point stars are
// high-entropy: the same 4096x2048 WebP without this step is 1.5 MB against
// 111 KB with it. That is a 14x difference from one filter, so if you are
// tempted to drop it for sharpness, know what it costs.
//
// Window size is a trade. 3 leaves bright stars as smudges; 9 clears everything
// but visibly softens the dust lanes near the galactic core. 5 was chosen by
// looking at the result in the scene, which is the only way to choose it.
//
// ── The wrap seam is not optional either ──
// The original is a stitched mosaic and its two vertical edges do not match
// photometrically. Measure it SIGNED, not absolute: mean(px(0) - px(W-1)) is
// 0.40/255 while the same measure between adjacent interior columns is 0.03.
// The mean of the ABSOLUTE difference is 1.7 either way, because at that scale
// it measures per-pixel noise rather than the step, and it will tell you the
// seam is still there after you have fixed it. Ask for the signed mean.
//
// 0.40 sounds negligible and is not, for two reasons. The sky background sits
// around 12/255, so this is a 3% step, and the sRGB transfer curve is steep in
// the toe — a few percent of linear signal down there becomes a much larger
// difference on screen. And a great circle projects to a STRAIGHT LINE under a
// perspective camera, so the step does not read as a soft variation in the gas;
// it renders as a hard diagonal ruler line across the sky.
//
// No wrap mode or filter setting fixes it. The discontinuity is in the data.
// `levelSeam` below closes it, to a residual of 0.011.
//
// ── AVIF, at q60, and NOT because higher is better ──
// The first version of this shipped WebP q82 and the sky read as "a bad-res
// image where you can see big squares". It was not resolution. WebP quantises
// smooth dark gradients into flat macroblocks, and magnification multiplies
// them: 16-px blocks become 28-px squares on screen at DPR 1 and 56 at DPR 2.
//
// Measure it as the ratio of pixel steps ACROSS 16-px block boundaries to steps
// WITHIN blocks, over dark pixels only. A codec that is not blocking scores 1.0.
// At 6144x3072, median 5:
//
//   PNG lossless (reference)   1.004    5018 KB
//   WebP q82  (first shipped)  2.147     108 KB   <- at 4096
//   WebP q88                   1.396     493 KB
//   AVIF q60                   1.169     302 KB   <- shipped
//   AVIF q70                   1.335     446 KB
//   AVIF q80                   1.246     682 KB
//
// Two things in that table matter. WebP stays blocky at ANY quality — q96 only
// reaches 1.600, at 440 KB — so raising WebP quality is not a fix. And AVIF is
// NOT MONOTONIC: q70 and q80 block worse than q60, because rate control picks
// different tiling at different targets. Do not "improve" this by raising
// QUALITY without re-running the measurement; you will most likely make it
// worse and larger at once.
//
// WebP is still emitted as a fallback for browsers without AVIF. Only one file
// is ever fetched — `SkyShell` probes support and picks.

import { createWriteStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const SOURCE_URL = 'https://cdn.eso.org/images/original/eso0932a.tif'
const CACHED_SOURCE = join(ROOT, 'node_modules', '.cache', 'eso0932a.tif')
const OUT_DIR = join(ROOT, 'public', 'textures')

const MEDIAN_WINDOW = 5

// Widths, and why there are two. 6144 is the ceiling the SOURCE allows: ESO's
// public original is 6000x3000 = 16.7 px/deg, and anything wider is empty
// upscaling. At 6144 the texture is 17.1 px/deg against a ~20 px/deg viewport,
// so it is very nearly 1:1 instead of the 1.76x magnification 4096 gave.
//
// It costs 75.5 MB of VRAM (6144 * 3072 * 4, no mipmaps). Proportionate on
// desktop — the Earth's three 4096x2048 maps already cost roughly 134 MB — but
// too much for a phone, where the small viewport means the resolution buys
// nothing anyway. Hence the narrow variant at 18.9 MB.
const WIDTH_WIDE = 6144
const WIDTH_NARROW = 3072

// See the block-ratio table above before touching this. Higher is not better.
const AVIF_QUALITY = 60
// Only reached by browsers without AVIF. Quality is chosen for size rather than
// for blocking, because blocking is unavoidable in WebP and this is a fallback.
const WEBP_QUALITY = 88
// ACES tone mapping desaturates as it compresses, and the sky arrives already
// pale from the median. Pre-saturating here rather than in the shader keeps the
// runtime cost at zero; the value is low on purpose, because the subject is
// dust and starlight and this is meant to restore the photograph's warmth, not
// to invent colour that was never in it.
const SATURATION = 1.35
// Rows to average the seam correction over. Per-row deltas are noisy enough
// that applying them raw would print the noise as horizontal banding.
const SEAM_SMOOTH_ROWS = 48

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('sharp is not installed. Run:\n\n  npm i --no-save sharp\n')
  process.exit(1)
}

// Cached under node_modules/.cache so a rerun does not refetch 27.7 MB, and so
// the original never lands in the repo — it is 250x the size of what ships.
async function source() {
  try {
    await stat(CACHED_SOURCE)
    console.log(`source: ${CACHED_SOURCE} (cached)`)
    return CACHED_SOURCE
  } catch {
    // Not cached. Fall through and download.
  }

  console.log(`downloading ${SOURCE_URL} ...`)
  const response = await fetch(SOURCE_URL)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${SOURCE_URL}`)

  await mkdir(dirname(CACHED_SOURCE), { recursive: true })
  await pipeline(Readable.fromWeb(response.body), createWriteStream(CACHED_SOURCE))
  return CACHED_SOURCE
}

const input = await source()

const { width, height } = await sharp(input).metadata()
// 2:1 is what makes the equirect mapping in shell.frag.glsl correct. A source
// with any other aspect would be silently stretched across the sphere.
if (width !== height * 2) {
  throw new Error(`expected a 2:1 equirectangular source, got ${width}x${height}`)
}

/**
 * Closes the wrap seam by spreading the edge-to-edge mismatch across the whole
 * width as a gradient.
 *
 * For each row, `delta = px(0) - px(W-1)`, and every pixel gains
 * `delta * x / (W - 1)`. The last column therefore lands exactly on the first
 * column's value and the meridian closes, while the correction itself is a ramp
 * over a full 360 degrees — far too gradual for the eye to find.
 *
 * Deltas are averaged over a band of rows first. The mismatch is a property of
 * how two exposures were joined, so it varies slowly with declination; the
 * per-row measurement of it is mostly noise, and printing that noise back into
 * the image would trade a vertical seam for horizontal banding.
 *
 * Cross-fading the two edges into each other was the alternative. It is worse:
 * it destroys real sky over the blend width, and it leaves the two halves at
 * different levels either side of the blend, which is the same step spread over
 * more pixels rather than removed.
 */
function levelSeam(data, width, height, channels) {
  const rowDelta = new Float32Array(height * channels)
  for (let y = 0; y < height; y++) {
    for (let c = 0; c < channels; c++) {
      const first = data[(y * width) * channels + c]
      const last = data[(y * width + width - 1) * channels + c]
      rowDelta[y * channels + c] = first - last
    }
  }

  for (let y = 0; y < height; y++) {
    const lo = Math.max(0, y - SEAM_SMOOTH_ROWS)
    const hi = Math.min(height - 1, y + SEAM_SMOOTH_ROWS)
    for (let c = 0; c < channels; c++) {
      let sum = 0
      for (let r = lo; r <= hi; r++) sum += rowDelta[r * channels + c]
      const delta = sum / (hi - lo + 1)

      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels + c
        const corrected = data[i] + (delta * x) / (width - 1)
        data[i] = corrected < 0 ? 0 : corrected > 255 ? 255 : corrected
      }
    }
  }
  return data
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

  // After the resize, so the ramp closes the seam at the width that ships. Doing
  // it before would let lanczos blend the corrected edge columns with their
  // neighbours and reopen a small step.
  levelSeam(data, info.width, info.height, info.channels)

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
      `  block ${(await blockRatio(buffer)).toFixed(3)}`,
  )
}

console.log(`median ${MEDIAN_WINDOW}, saturation ${SATURATION}, seam levelled`)
await emit(WIDTH_WIDE, 'avif', AVIF_QUALITY)
await emit(WIDTH_WIDE, 'webp', WEBP_QUALITY)
await emit(WIDTH_NARROW, 'avif', AVIF_QUALITY)
await emit(WIDTH_NARROW, 'webp', WEBP_QUALITY)
console.log('\nblock ratio: 1.00 is lossless. Above ~1.5 the squares are visible.')
