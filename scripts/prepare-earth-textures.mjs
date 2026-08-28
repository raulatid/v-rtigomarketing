// Regenerates the narrow-viewport variants of the three Earth maps.
//
// A one-off asset tool, NOT part of the build — the same shape and for the same
// reason as `prepare-sky-panorama.mjs`: `sharp` is a ~40 MB native binary with
// no business in an install that only ever needs to serve the files it
// produces. Run it by hand if the source maps ever change:
//
//   npm i --no-save sharp && node scripts/prepare-earth-textures.mjs
//
// ── Why this exists ──
// The three source maps are 4096x2048 RGBA8 with mipmaps, which is 44.7 MB of
// GPU memory each and 134 MB for the set (decimal MB, the unit this repo uses
// throughout — see PROJECT_MEMORY's 75.5 MB for the sky). They were served identically to a 4K
// desktop and an iPhone SE. Against a total texture budget the iOS audit
// measured at ~226 MB — on a platform that terminates tabs rather than paging —
// that set is the single largest item, and the phone is the device least able
// to hold it. See `docs/audits/ios-safari-2026-08-14.md`, I2.
//
// ── Why 2048 is not a compromise ──
// At a 390 CSS px viewport and DPR 2 the drawing buffer is 780 px wide, and the
// globe spans roughly 300 of them at the resting pose. An equirectangular map
// wraps its full width around the sphere, so the visible hemisphere is about
// half the map: 1024 texels across ~300 device pixels, i.e. still oversampled by
// more than 3x. The resolution was buying nothing on a phone and costing 100 MB
// to do it.
//
// That reasoning is the whole justification, and it is worth re-checking rather
// than inheriting if the close-up framing ever changes: a globe that fills a
// phone screen is a different calculation from one that occupies a third of it.
//
// ── Why JPEG, and why quality 70 ──
// The sources are JPEG and the sky's AVIF work does not transfer. That work was
// about smooth dark gradients magnified on screen, where WebP's macroblocking is
// the dominant artifact (PROJECT_MEMORY 11.38). These are daylight surface maps:
// high-frequency, mid-to-high luminance, and drawn at roughly 1:1 rather than
// magnified. Keeping the format means `EarthScene`'s loader path does not change
// at all.
//
// The quality number is NOT a taste judgement, and choosing one by taste is what
// went wrong the first time. This script shipped at 90, which produced narrow
// files carrying two to three times the desktop set's bits per pixel: a quarter
// of the pixels bought only ~30% less transfer, so the phone paid for a
// resolution cut it barely received.
//
// The number to match is the one already in the source files. Reading the
// quantization tables out of their DQT markers gives an IJG-equivalent quality
// of ~60 — luma DQT[0..3] = 13,9,8,13 for day and specularClouds, 12,9,8,12 for
// night — against 3,3,3,4 for the narrow files written at 90.
//
// 70 rather than 60, because mozjpeg's tables are flatter than the IJG ones and
// the number does not transfer literally: mozjpeg at 70 quantizes to 10,10,10,11,
// at or finer than the sources near DC, where mozjpeg at 60 gives 13,13,13,14 and
// is genuinely coarser than the set these are derived from. These are a second
// generation encode of an already-lossy source, so parity with the source tables
// is the floor and not the target.
//
// `specularClouds.jpg` carries data rather than colour — the shader reads .rg —
// so it gets the same treatment but must NOT be chroma-subsampled, which would
// smear the two channels that matter into each other.

import { stat, writeFile } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'public', 'earth')

// Half of 4096x2048. See the header for why half is the right amount.
const WIDTH = 2048
const HEIGHT = 1024

// Matched to the source maps' own quantization, not chosen by eye. See header.
const QUALITY = 70

const MAPS = [
  // `chromaSubsampling: '4:4:4'` on the data map only. The other two are
  // colour and lose nothing to the default.
  { name: 'day', data: false },
  { name: 'night', data: false },
  { name: 'specularClouds', data: true },
]

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error(
    'sharp is not installed. This is deliberate — it is a ~40MB native binary\n' +
      'and nothing at runtime or in the build needs it. Run:\n\n' +
      '  npm i --no-save sharp && node scripts/prepare-earth-textures.mjs\n',
  )
  process.exit(1)
}

const kb = (n) => `${Math.round(n / 1024)} KB`
// Bits per pixel is the number that catches a mismatched quality setting, and
// bytes alone hide it: a narrow file is smaller than its source no matter how
// badly it is encoded. Printed against the source's own rate so the next person
// to run this can see at a glance whether the two sets still agree.
const bpp = (bytes, w, h) => bytes / (w * h)
// RGBA8 plus a full mip chain is 4/3 of the base level.
//
// Decimal MB, not MiB, because that is the unit every other memory figure in
// this repository uses — PROJECT_MEMORY's 75.5 MB for the 6144x3072 sky is
// 6144*3072*4 / 1e6. Mixing the two makes the same texture look like two
// different sizes depending on which document you read.
const vram = (w, h) => ((w * h * 4 * 4) / 3 / 1e6)

for (const { name, data } of MAPS) {
  const source = join(DIR, `${name}.jpg`)
  const target = join(DIR, `${name}-narrow.jpg`)

  const input = await readFile(source)
  const meta = await sharp(input).metadata()

  const encoded = await sharp(input)
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .jpeg({
      quality: QUALITY,
      // Data channels must not be smeared into each other.
      chromaSubsampling: data ? '4:4:4' : '4:2:0',
      mozjpeg: true,
    })
    .toBuffer()

  // Written with fs, NOT with sharp's toFile. `sharp(buffer).toFile(path)`
  // decodes and RE-ENCODES at default quality, so the file on disk is not the
  // one that was measured — it has shipped that way once in this repo already
  // (PROJECT_MEMORY 11.39). An image library's toFile is a pipeline sink, not a
  // byte writer.
  await writeFile(target, encoded)

  const before = (await stat(source)).size
  const rateBefore = bpp(before, meta.width, meta.height)
  const rateAfter = bpp(encoded.length, WIDTH, HEIGHT)
  console.log(
    `${name}: ${meta.width}x${meta.height} ${kb(before)} -> ` +
      `${WIDTH}x${HEIGHT} ${kb(encoded.length)}  |  ` +
      `${rateBefore.toFixed(4)} -> ${rateAfter.toFixed(4)} bpp ` +
      `(x${(rateAfter / rateBefore).toFixed(2)} the source's rate)  |  ` +
      `VRAM ${vram(meta.width, meta.height).toFixed(1)} MB -> ${vram(WIDTH, HEIGHT).toFixed(1)} MB`,
  )
}

console.log(
  `\nSet total: ${(vram(4096, 2048) * 3).toFixed(0)} MB -> ${(vram(WIDTH, HEIGHT) * 3).toFixed(0)} MB of GPU memory on a narrow viewport.`,
)
