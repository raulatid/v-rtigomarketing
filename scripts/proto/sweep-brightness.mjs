/**
 * What `uSkyBrightness` each variant actually wants.
 *
 * The shipped shell runs at 0.60 against a photograph, and research part 3 §5
 * is explicit that the pair does not transfer: a baked sky has its own
 * exposure. Every variant is therefore authored and captured at 1.0 first, and
 * this sweep is how the real value is found — measured against the Earth beside
 * it, in the composer, through the same ACES tone map, rather than guessed in
 * the editor where there is no tone mapping and no Earth.
 *
 * Values are `brightness` or `brightness:contrast`. Contrast matters more than
 * it looks: the shader applies pow(sky, contrast) BEFORE brightness, so a
 * contrast above 1 crushes dim gas toward black while leaving bright filaments
 * nearly untouched. That is a coverage control, and it is the fastest way to
 * find the transfer curve a scene's colour ramp should be authored to — a
 * sweep here is seconds against ten minutes for a re-bake.
 *
 * Usage: node scripts/proto/sweep-brightness.mjs <variant> [state] [b|b:c ...]
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootAndSettle, requireProtoHook, waitForCameraControl, setCameraChecked } from './lib/boot.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'docs', 'plans', '005-sky-cubemap', 'shots', 'brightness')
const APP_URL = process.env.APP_URL ?? 'http://localhost:4173/'
const DEG = Math.PI / 180

const STATES = {
  overview: { radius: 14, theta: 0, phi: Math.PI / 2, fov: 45 },
  rotated: { radius: 14, theta: 150 * DEG, phi: 1.0, fov: 45 },
}

const [variant, stateName = 'overview', ...rest] = process.argv.slice(2)
if (!variant) throw new Error('usage: sweep-brightness.mjs <variant> [state] [values...]')
const values = (rest.length ? rest : ['1', '2', '3', '4', '6', '8']).map((v) => {
  const [b, c = '1'] = String(v).split(':')
  return { brightness: Number(b), contrast: Number(c) }
})
const state = STATES[stateName]
if (!state) throw new Error(`unknown state "${stateName}" — ${Object.keys(STATES).join(', ')}`)

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })

for (const { brightness, contrast } of values) {
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`))
  const params = new URLSearchParams({
    sky: variant,
    freezeEarth: '1',
    stars: '0',
    skyBrightness: String(brightness),
    skyContrast: String(contrast),
  })
  await bootAndSettle(page, `${APP_URL}?${params}`)
  await requireProtoHook(page)
  await waitForCameraControl(page)
  await setCameraChecked(page, { ...state, lookAt: [0, 0, 0] })
  const tag = `b${brightness}-c${contrast}`
  await page.screenshot({ path: join(OUT, `${variant}-${stateName}-${tag}.png`) })
  console.log(`  ${variant} ${stateName} ${tag}`)
  await page.close()
}

await context.close()
await browser.close()
console.log('done')
