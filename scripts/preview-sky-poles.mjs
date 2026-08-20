// Renders what the camera actually sees when it looks straight at the sky's
// poles, and writes it to a PNG you open and look at.
//
// A one-off asset tool like `prepare-sky-panorama.mjs`, and `sharp` is not a
// project dependency for the same reason:
//
//   npm i --no-save sharp
//   node scripts/preview-sky-poles.mjs [image ...]
//
// With no arguments it renders the two shipped AVIFs. Pass paths to compare a
// candidate source, or the ESO original if it is still cached, against them.
//
// ── Why this exists as a tool rather than as a check ──
// `prepare-sky-panorama.mjs` prints a `poles` number and that number is a good
// SOURCE SCREEN — a real equirectangular panorama scores near 0.03, a flat 2:1
// image scores 0.3 and up. It is NOT a verification of the correction, and
// treating it as one cost a full wrong fix on 2026-08-19: the band-limit pass
// drove it from 0.54 to 0.015 and the picture was visually identical, because a
// pole ratio near zero says the pole ROW is constant and says nothing about the
// ring one degree out. The fade that actually fixed it does not move the number
// at all.
//
// So: screen sources with the number, verify corrections with this. See
// `docs/audits/sky-panorama-projection-2026-08-19.md`.
//
// ── Reading the output ──
// Top row is the north sky pole, bottom row the south, one column per image.
// A real panorama looks like an ordinary star field with nothing special at the
// centre. What you are looking for, and what a flat source produces, is a
// pinwheel of radial spokes converging on a vertex, and a hard straight wedge
// where the meridian lands.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Matches the scene. FOV is the WARP PEAK rather than the resting 45, because
// that is the widest the sky is ever seen and therefore the worst case;
// BRIGHTNESS is uSkyBrightness so the levels are the scene's.
const SIZE = 420
const FOV_DEGREES = 74
const BRIGHTNESS = 0.6
// Pure viewing exposure for this preview. The sky is dark by design and the
// artifact hides in the dark; this is not part of the pipeline.
const PREVIEW_GAIN = 2.4

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('sharp is not installed. Run:  npm i --no-save sharp')
  process.exit(1)
}

const inputs = process.argv.slice(2)
const files = inputs.length
  ? inputs
  : [join(ROOT, 'public/textures/sky-panorama.avif'), join(ROOT, 'public/textures/sky-panorama-narrow.avif')]

/** One pole, as the shell shader would sample it. `up` is +1 north, -1 south. */
async function poleView(file, up) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const out = Buffer.alloc(SIZE * SIZE * 3)
  const half = Math.tan((FOV_DEGREES * Math.PI) / 360)

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      // Camera down the pole axis; screen x -> world x, screen y -> world z.
      const dir = [((px + 0.5) / SIZE - 0.5) * 2 * half, up, ((py + 0.5) / SIZE - 0.5) * 2 * half]
      const len = Math.hypot(...dir)

      // The mapping from shell.frag.glsl, verbatim in intent.
      const u = Math.atan2(dir[2] / len, dir[0] / len) / (2 * Math.PI) + 0.5
      const v = Math.asin(Math.max(-1, Math.min(1, dir[1] / len))) / Math.PI + 0.5

      // NEAREST, on purpose. The texture ships without mipmaps and with a
      // LinearFilter minFilter, so the GPU point-samples here too; a smooth
      // sampler in the preview would hide the thing being looked for.
      const tx = Math.min(width - 1, Math.max(0, Math.round(u * (width - 1))))
      // flipY is on for TextureLoader, so v = 1 is the TOP row of the file.
      const ty = Math.min(height - 1, Math.max(0, Math.round((1 - v) * (height - 1))))

      const src = (ty * width + tx) * channels
      const dst = (py * SIZE + px) * 3
      for (let c = 0; c < 3; c++) {
        out[dst + c] = Math.min(255, Math.round(data[src + c] * BRIGHTNESS * PREVIEW_GAIN))
      }
    }
  }
  return sharp(out, { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toBuffer()
}

const GAP = 16
const tiles = []
for (const [column, file] of files.entries()) {
  for (const [row, up] of [1, -1].entries()) {
    tiles.push({
      input: await poleView(file, up),
      left: column * (SIZE + GAP),
      top: row * (SIZE + GAP),
    })
  }
  console.log(`  ${file}`)
}

const outFile = join(ROOT, 'node_modules', '.cache', 'sky-poles.png')
await sharp({
  create: {
    width: files.length * (SIZE + GAP) - GAP,
    height: 2 * (SIZE + GAP) - GAP,
    channels: 3,
    background: '#202024',
  },
})
  .composite(tiles)
  .png()
  .toFile(outFile)

// Under node_modules/.cache so a preview never lands in the repo or in the
// build. It is a thing you look at once, not an artifact.
console.log(`\nwrote ${outFile}`)
console.log('top row = north sky pole, bottom = south, one column per image, in the order above.')
console.log('A real panorama has nothing special at the centre. Spokes converging on a vertex,')
console.log('or a hard straight wedge, mean the source is not equirectangular.')
