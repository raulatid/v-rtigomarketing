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
 * Usage: node scripts/proto/sweep-brightness.mjs <variant> [state] [values...]
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
const values = rest.length ? rest.map(Number) : [1, 2, 3, 4, 6, 8]
const state = STATES[stateName]
if (!state) throw new Error(`unknown state "${stateName}" — ${Object.keys(STATES).join(', ')}`)

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })

for (const brightness of values) {
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`))
  const params = new URLSearchParams({
    sky: variant,
    freezeEarth: '1',
    stars: '0',
    skyBrightness: String(brightness),
  })
  await bootAndSettle(page, `${APP_URL}?${params}`)
  await requireProtoHook(page)
  await waitForCameraControl(page)
  await setCameraChecked(page, { ...state, lookAt: [0, 0, 0] })
  await page.screenshot({ path: join(OUT, `${variant}-${stateName}-b${brightness}.png`) })
  console.log(`  ${variant} ${stateName} brightness ${brightness}`)
  await page.close()
}

await context.close()
await browser.close()
console.log('done')
