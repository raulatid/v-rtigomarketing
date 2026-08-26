/**
 * Crops a region out of a capture at NATIVE pixels.
 *
 * The DPR 2 shots are 3200x1800. Viewed whole they are downscaled back to
 * something like DPR 1, which throws away exactly the information they were
 * taken to show — so the texel-density comparison has to be made on a crop that
 * is never resampled.
 *
 * Usage: node scripts/proto/crop-shot.mjs <in.png> <out.png> <x> <y> <w> <h>
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [input, output, x, y, w, h] = process.argv.slice(2)
if (!output) throw new Error('usage: crop-shot.mjs <in.png> <out.png> <x> <y> <w> <h>')

const dataUri = `data:image/png;base64,${readFileSync(resolve(input)).toString('base64')}`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } })
await page.setContent(
  `<body style="margin:0;background:#000">
     <img src="${dataUri}" style="position:absolute;left:${-x}px;top:${-y}px;image-rendering:pixelated">
   </body>`,
)
await page.waitForTimeout(300)
await page.screenshot({ path: output })
await browser.close()
console.log(`${output} <- ${input} @ ${x},${y} ${w}x${h}`)
