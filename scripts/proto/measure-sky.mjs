/**
 * Sky luminance, measured rather than eyeballed.
 *
 * "The nebula is too dark" is an opinion until it is a number. This samples a
 * region of a capture that contains only sky — no Earth, no orbit rings, no UI
 * chrome — and reports what is actually there, in the sRGB the screenshot
 * holds, so variants can be compared with each other and with the baseline.
 *
 * Usage: node scripts/proto/measure-sky.mjs <state> [variant ...]
 *        node scripts/proto/measure-sky.mjs --files <path.png> ...
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SHOTS = join('docs', 'plans', '005-sky-cubemap', 'shots')
const argv = process.argv.slice(2)
const fileMode = argv[0] === '--files'
const [state = 'overview', ...rest] = fileMode ? [] : argv
const variants = fileMode ? argv.slice(1) : rest.length ? rest : ['baseline', 'a', 'b', 'c', 'd']

// Bottom-left quadrant, inset from the edges: sky only in every one of the five
// camera states, and clear of the corner logo and the copyright line.
const REGION = { x: 60, y: 560, w: 620, h: 280 }

const browser = await chromium.launch()
const page = await browser.newPage()

console.log(`${fileMode ? 'files' : state}  region ${REGION.w}x${REGION.h} at ${REGION.x},${REGION.y}`)
console.log('name                     mean   p50   p95   max   %pixels>8/255')

for (const variant of variants) {
  const file = fileMode ? variant : join(SHOTS, `${state}-${variant}.png`)
  let bytes
  try {
    bytes = readFileSync(file)
  } catch {
    console.log(`${variant.padEnd(22)} (no ${file})`)
    continue
  }
  const dataUri = `data:image/png;base64,${bytes.toString('base64')}`
  const stats = await page.evaluate(
    async ({ uri, region }) => {
      const img = new Image()
      img.src = uri
      await img.decode()
      const c = document.createElement('canvas')
      c.width = region.w
      c.height = region.h
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, -region.x, -region.y)
      const { data } = ctx.getImageData(0, 0, region.w, region.h)
      const lum = []
      for (let i = 0; i < data.length; i += 4) {
        // Rec.709 on the stored sRGB values. Not a photometric quantity — a
        // consistent one, which is all a comparison needs.
        lum.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])
      }
      lum.sort((a, b) => a - b)
      const at = (q) => lum[Math.floor(q * (lum.length - 1))]
      return {
        mean: lum.reduce((a, b) => a + b, 0) / lum.length,
        p50: at(0.5),
        p95: at(0.95),
        max: lum[lum.length - 1],
        lit: (lum.filter((v) => v > 8).length / lum.length) * 100,
      }
    },
    { uri: dataUri, region: REGION },
  )
  const label = fileMode ? variant.split(/[\/]/).pop().replace('.png', '') : variant
  console.log(
    `${label.padEnd(22)} ${stats.mean.toFixed(2).padStart(5)} ${String(stats.p50).padStart(5)} ${String(stats.p95).padStart(5)} ${String(stats.max).padStart(5)}   ${stats.lit.toFixed(1)}%`,
  )
}

await browser.close()
