/**
 * Bakes the sky-cubemap prototype's scenes into cube faces, by driving the
 * BinaryConstruct Skybox editor in a browser.
 *
 * The editor is used STRICTLY as a tool and is never modified — it is MIT and
 * this is client art direction. It has no CLI and does not expose bakeExport()
 * on window, so the only headless entry point is its own UI: the Script tab
 * takes the whole scene as v2 JSON and applies it live.
 *
 * Prerequisites, in the editor's repo (../space-brackground-playtest):
 *   npx playwright install chromium     # .npmrc:13 skips the browser download
 *   npm run build && npm run preview -- --port 4189 --strictPort
 *
 * Usage:
 *   node scripts/proto/export-skybox.mjs [variant ...]
 *
 * Output lands in public/proto-sky/<variant>/<resolution>/posx.png … negz.png,
 * which is gitignored — six 4096^2 PNGs per variant is well over a hundred
 * megabytes. The scene JSON is the deliverable; the faces are derived.
 */
import { chromium } from 'playwright'
import { unzipSync } from 'fflate'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const EDITOR_URL = process.env.EDITOR_URL ?? 'http://localhost:4189/'
const RESOLUTION = Number(process.env.SKY_RES ?? 4096)
const SCENES_DIR = join(ROOT, 'docs', 'plans', '005-sky-cubemap', 'scenes')
const SHOTS_DIR = join(ROOT, 'docs', 'plans', '005-sky-cubemap', 'shots')

/** Scene file -> variant name, which is also the `?sky=` value in the app. */
const VARIANTS = {
  a: 'a-minimal.json',
  b: 'b-nebula.json',
  c: 'c-cinematic.json',
  d: 'd-asymmetric.json',
  // Refinements of C, the direction that won the first pass. See
  // docs/plans/005-sky-cubemap-prototype.md and the scene files themselves.
  c2: 'c2-carved.json',
  c3: 'c3-filament.json',
  c4: 'c4-aurora.json',
  c5: 'c5-aurora.json',
  c6: 'c6-aurora.json',
}

const wanted = process.argv.slice(2)
const selected = wanted.length ? wanted : Object.keys(VARIANTS)

const browser = await chromium.launch()
// 1400x900 is the editor's own verification viewport. It is NOT the app's
// capture size and does not need to be: what matters here is that the viewport
// FOV stays at its default 80, because star size is expressed in destination
// FACE pixels scaled by that FOV — a single wheel event would silently rescale
// every star in the bake. So this script never scrolls the viewport.
const page = await browser.newPage({
  viewport: { width: 1400, height: 900 },
  acceptDownloads: true,
})
page.on('pageerror', (e) => console.log('  [editor pageerror]', e.message))

mkdirSync(SHOTS_DIR, { recursive: true })

for (const variant of selected) {
  const file = VARIANTS[variant]
  if (!file) throw new Error(`unknown variant "${variant}" — known: ${Object.keys(VARIANTS).join(', ')}`)

  const scene = readFileSync(join(SCENES_DIR, file), 'utf8')
  JSON.parse(scene) // fail here rather than inside the editor
  console.log(`\n=== ${variant} (${file}) at ${RESOLUTION}/face ===`)

  await page.goto(EDITOR_URL)
  await page.waitForTimeout(2_500) // let the first bake settle

  // ── apply the scene ──
  // `exact` because the sidebar has colliding labels ('Stars' vs '+stars'), and
  // the stars tab renders as 'PCG'.
  await page.getByRole('button', { name: 'Script', exact: true }).click()
  await page.locator('textarea.script-text').fill(scene)
  await page.waitForTimeout(2_000)

  // The Script tab shows a red border and line-precise errors on invalid JSON.
  // Catching it here is the difference between a bad scene and six black faces.
  const scriptError = await page
    .locator('.script-error, .script-text.invalid, [class*="error"]')
    .first()
    .textContent()
    .catch(() => null)
  if (scriptError && scriptError.trim()) {
    // The editor's validator is authoritative and line-precise. Baking past it
    // produces six plausible black faces and a finding about nothing.
    throw new Error(`${variant}: the editor rejected the scene — ${scriptError.trim().slice(0, 400)}`)
  }

  // The live viewport, captured BEFORE the export. Step 4 compares it against
  // the in-scene render to validate the SRGBColorSpace decode: the editor
  // renders linear with no tone mapping, so its pixels are literally what the
  // scene was authored to look like.
  await page.locator('.viewport canvas').screenshot({
    path: join(SHOTS_DIR, `editor-${variant}.png`),
  })

  // ── export ──
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.locator('.export-panel select').selectOption(String(RESOLUTION))

  // Checkbox order is [faces, equirect, hdr, exr, per-layer] and NONE of them
  // is label-associated, so they can only be reached positionally. Faces stay
  // on; the three equirect/HDR targets come off.
  const boxes = page.locator('.export-panel input[type=checkbox]')
  for (const i of [1, 2, 3]) await boxes.nth(i).uncheck()

  const downloads = []
  const collect = (d) => downloads.push(d)
  page.on('download', collect)

  // Scoped to the panel: `.export-go` is also the class on three PCG buttons in
  // the Stars tab, so the bare selector is ambiguous.
  //
  // Fired from a timeout INSIDE the page, and awaited by nobody.
  //
  // The 4096 bake occupies the main thread for minutes. Every Playwright call
  // is a round trip through that same thread, so click(), dispatchEvent() and
  // even a plain evaluate() that clicks all block until the bake finishes and
  // then time out — the work starts, the driver gives up on it, and the
  // downloads are never collected. Scheduling the click on the next macrotask
  // lets evaluate() return first, so the driver is free while the page bakes.
  await page.evaluate(() => {
    const go = document.querySelector('.export-panel button.export-go')
    if (!go) throw new Error('export button missing')
    setTimeout(() => go.click(), 0)
  })

  // The bake is a real GPU job at 4096; one click can also fire several
  // downloads. Wait for quiet rather than for a fixed count.
  let lastCount = -1
  for (let waited = 0; waited < 300_000; waited += 1_000) {
    await page.waitForTimeout(1_000)
    if (downloads.length > 0 && downloads.length === lastCount) break
    lastCount = downloads.length
  }
  page.off('download', collect)

  if (downloads.length === 0) throw new Error(`${variant}: the editor produced no download`)
  console.log(`  ${downloads.length} download(s)`)

  // ── unpack ──
  const outDir = join(ROOT, 'public', 'proto-sky', variant, String(RESOLUTION))
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  let faces = 0
  for (const download of downloads) {
    const name = download.suggestedFilename()
    const tmp = join(outDir, `_${name}`)
    await download.saveAs(tmp)
    if (!name.endsWith('.zip')) {
      console.log(`  (kept ${name} as-is)`)
      continue
    }
    const entries = unzipSync(new Uint8Array(readFileSync(tmp)))
    for (const [entry, bytes] of Object.entries(entries)) {
      // The editor names faces posx/negx/posy/negy/posz/negz, which is already
      // CubeTextureLoader's [px, nx, py, ny, pz, nz] order — nothing to remap.
      const face = entry.match(/(pos|neg)[xyz]/i)?.[0]?.toLowerCase()
      if (!face || !entry.endsWith('.png')) continue
      writeFileSync(join(outDir, `${face}.png`), Buffer.from(bytes))
      faces++
    }
    rmSync(tmp, { force: true })
  }

  if (faces !== 6) throw new Error(`${variant}: expected 6 faces, unpacked ${faces}`)
  console.log(`  -> public/proto-sky/${variant}/${RESOLUTION}/ (6 faces)`)
}

await browser.close()
console.log('\ndone')
