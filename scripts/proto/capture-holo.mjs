// Plan 007 checkpoint captures: the six holograms in the real Earth scene, pinned
// at three expansions through the `?holo=` gate, plus a real selection.
//
// Prerequisites: `npm run pree2e` then `npm run preview -- --port 4173`.
// Usage: node scripts/proto/capture-holo.mjs [outDir]   (PINNED_ONLY=1 skips the selection)
//
// Runs on swiftshader, which is slow: readiness lands well before the orbits
// finish revealing, hence the long settle after the intro hands over.
import { chromium } from "@playwright/test"
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'docs/plans/007-split-plate/shots'
mkdirSync(OUT, { recursive: true })
const APP = 'http://localhost:4173/'

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })

async function boot(query) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 3 })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  await page.goto(APP + query)
  await page.waitForFunction(() => window.__vertigoIntro !== undefined, undefined, { timeout: 60_000 })
  await page.evaluate(() => new Promise((r) => window.__vertigoIntro.completed.then(() => r())))
  // Orbit reveal ≈ 3.5 s after the timeline hands over; wait for all six to idle.
  await page.waitForFunction(() => window.__vertigoIntro.boot.readiness() === "ready", undefined, { timeout: 120_000 })
  await page.waitForFunction(() => { const s = document.querySelector("svg.intro-svg"); return !s || getComputedStyle(s).visibility === "hidden" || getComputedStyle(s).display === "none" || getComputedStyle(s).opacity === "0" }, undefined, { timeout: 120_000 })
  // Wait for the SATELLITES, not for a stopwatch. Readiness lands long before
  // they are on screen — the orbit lines draw, a head rides each to its end,
  // then the satellite fades up in its place — and under swiftshader that tail
  // can outlast any delay that looks generous. The 28 s wait this replaces lost
  // the race often enough to produce checkpoint shots with no satellites in
  // them, which is how a rejected design came to look accepted.
  await page.waitForFunction(() => window.__vertigoProto?.satellitesIdle() === true, undefined, { timeout: 180_000 })
  // The panels fade in with the satellite's entrance; let the last one land.
  await page.waitForTimeout(1500)
  return { page, ctx, errors }
}

for (const expand of ['0', '0.5', '1']) {
  const { page, ctx, errors } = await boot(`?holo=1&holoExpand=${expand}&holoFreeze=1`)
  await page.screenshot({ path: `${OUT}/overview-expand-${expand}.png` })
  await page.screenshot({ path: `${OUT}/zoom-expand-${expand}.png`, clip: { x: 450, y: 130, width: 700, height: 600 } })
  console.log(`overview ${expand}: errors=${errors.length}`, errors.slice(0, 3))
  await ctx.close()
}

if (process.env.PINNED_ONLY) { await browser.close(); process.exit(0) }
// A real selection: sweep a grid until the canvas cursor turns to pointer.
{
  const { page, ctx, errors } = await boot('')
  let hit = null
  outer: for (let y = 100; y < 800 && !hit; y += 20) {
    for (let x = 200; x < 1400; x += 20) {
      await page.mouse.move(x, y)
      await page.waitForTimeout(40)
      const cursor = await page.evaluate(() => document.querySelector('canvas')?.style.cursor)
      if (cursor === 'pointer') { hit = { x, y }; break outer }
    }
  }
  console.log('hover hit', hit)
  if (hit) {
    await page.screenshot({ path: `${OUT}/hover.png` })
    await page.mouse.click(hit.x, hit.y)
    await page.waitForTimeout(150)
    await page.screenshot({ path: `${OUT}/selected-mid.png` })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${OUT}/selected.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(120)
    await page.screenshot({ path: `${OUT}/closing-mid.png` })
  }
  console.log(`selection: errors=${errors.length}`, errors.slice(0, 3))
  await ctx.close()
}
await browser.close()
