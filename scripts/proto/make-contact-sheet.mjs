/**
 * The reviewable copy of the comparison matrix, small enough to live in git.
 *
 * The full captures are 25 MB and gitignored: a clone would pay for them
 * forever, for images that regenerate from the scene JSON with one command.
 * But a comparison nobody can open is not a deliverable either, so this writes
 * a downscaled WebP of every shot — the same matrix at about a twentieth of the
 * weight.
 *
 * The crops are the exception and are copied at FULL size. They exist to show
 * texel density at native pixels; resampling them would destroy the one thing
 * they were cut to prove, so they are re-encoded losslessly rather than scaled.
 *
 * Encoding runs through a headless browser canvas, the same trick
 * scripts/proto/crop-shot.mjs uses, because this repo has no image library and
 * adding one for a prototype's contact sheet would be the wrong trade.
 *
 * Usage: node scripts/proto/make-contact-sheet.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'

const SHOTS = join('docs', 'plans', '005-sky-cubemap', 'shots')
const OUT = join('docs', 'plans', '005-sky-cubemap', 'contact')

/** Wide enough to judge composition and colour; too small to judge sharpness. */
const WIDTH = 640
const QUALITY = 0.72

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path))
    else if (entry.name.endsWith('.png')) out.push(path)
  }
  return out
}

const files = walk(SHOTS).sort()
if (files.length === 0) throw new Error(`no PNGs under ${SHOTS} — run capture-sky-matrix.mjs first`)

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage()

let total = 0
for (const file of files) {
  // `crops/` keeps its native pixels; everything else is scaled to WIDTH.
  // Tested with relative() rather than a regex on the raw path: this runs on
  // Windows, where join() emits backslashes and a `[/]` character class
  // silently matches nothing — which downscaled the crops on the first run.
  const isCrop = relative(SHOTS, file).startsWith('crops')
  const source = readFileSync(file)
  const dataUri = `data:image/png;base64,${source.toString('base64')}`

  const encoded = await page.evaluate(
    async ({ uri, width, quality, native }) => {
      const img = new Image()
      img.src = uri
      await img.decode()
      const scale = native ? 1 : Math.min(1, width / img.naturalWidth)
      const c = document.createElement('canvas')
      c.width = Math.round(img.naturalWidth * scale)
      c.height = Math.round(img.naturalHeight * scale)
      const ctx = c.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, c.width, c.height)
      return c.toDataURL('image/webp', native ? 0.9 : quality).split(',')[1]
    },
    { uri: dataUri, width: WIDTH, quality: QUALITY, native: isCrop },
  )

  const rel = relative(SHOTS, file).replace(/\.png$/, '.webp')
  const dest = join(OUT, rel)
  mkdirSync(join(dest, '..'), { recursive: true })
  const bytes = Buffer.from(encoded, 'base64')
  writeFileSync(dest, bytes)
  total += bytes.length
  console.log(`  ${rel.padEnd(38)} ${(source.length / 1024).toFixed(0)}K -> ${(bytes.length / 1024).toFixed(0)}K${isCrop ? '  (native)' : ''}`)
}

await browser.close()
console.log(`\n${files.length} images, ${(total / 1048576).toFixed(2)} MB total`)
