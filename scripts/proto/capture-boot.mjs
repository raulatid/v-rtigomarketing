// Plan 008 Phase 1: does a white frame actually exist during boot?
//
// A CDP screencast of the whole boot, one entry per presented frame, each
// reduced to a mean and a 95th-percentile luminance. That turns "the screen
// flashes white" from an impression into a number that can be compared before
// and after a change — which a screenshot at a guessed moment cannot do, because
// the flash is intermittent and lasts a frame or two.
//
// Prerequisites: `npm run pree2e` then `npm run preview -- --port 4173`.
// Usage: node scripts/proto/capture-boot.mjs [outDir] [--arms=local,fast4g,slow4g]
//
// The frames are decoded in a blank tab of the same browser rather than by a
// node image library: `sharp` is deliberately not a dependency of this project
// (see prepare-earth-textures.mjs), and createImageBitmap in a page we already
// have open costs nothing and adds no install step.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = process.argv.find((a) => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1])
  ?? 'docs/plans/008-boot/capture'
const APP = process.env.APP_URL ?? 'http://localhost:4173/'
const armArg = process.argv.find((a) => a.startsWith('--arms='))
const WANTED = (armArg?.slice('--arms='.length) ?? 'local,fast4g,slow4g').split(',')

mkdirSync(OUT, { recursive: true })

// #050507 is luma 5.5, and the intro's white isotype on black lifts the mean
// only into the low twenties. Anything above this is a large pale area, which
// is not something this design ever draws.
const BRIGHT = 60

// The audit's own profiles, so these figures sit next to its table rather than
// beside it. Fast 4G = 9 Mbit/s / 60 ms RTT; Slow 4G = 1.6 Mbit/s / 150 ms.
const ARMS = {
  local: { cpu: 1, net: null },
  fast4g: {
    cpu: 4,
    net: { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (9 * 1024 * 1024) / 8 },
  },
  slow4g: {
    cpu: 4,
    net: { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  },
}

/**
 * Mean and p95 luminance per frame, 0..255, computed in a blank tab.
 *
 * p95 as well as the mean because they answer different questions: a full white
 * viewport moves both, while the intro's own white isotype on black moves only
 * the tail. A flash is the mean rising; the drawing is not.
 */
async function measureFrames(browser, frames) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const out = []
  // Batched: one evaluate per frame would pay the round trip hundreds of times.
  const BATCH = 40
  for (let i = 0; i < frames.length; i += BATCH) {
    const slice = frames.slice(i, i + BATCH)
    const values = await page.evaluate(async (datas) => {
      const canvas = new OffscreenCanvas(160, 90)
      const g = canvas.getContext('2d', { willReadFrequently: true })
      const results = []
      for (const data of datas) {
        const blob = await (await fetch(`data:image/jpeg;base64,${data}`)).blob()
        const bmp = await createImageBitmap(blob)
        g.drawImage(bmp, 0, 0, 160, 90)
        bmp.close()
        const { data: px } = g.getImageData(0, 0, 160, 90)
        const n = px.length / 4
        const ys = new Float64Array(n)
        let sum = 0
        for (let k = 0; k < n; k += 1) {
          // Rec. 709 luma — perceived brightness, not a raw channel sum.
          const y = 0.2126 * px[k * 4] + 0.7152 * px[k * 4 + 1] + 0.0722 * px[k * 4 + 2]
          ys[k] = y
          sum += y
        }
        ys.sort()
        results.push({ mean: sum / n, p95: ys[Math.floor(n * 0.95)] })
      }
      return results
    }, slice.map((f) => f.data))

    values.forEach((v, k) => out.push({ at: slice[k].at, ...v }))
  }
  await ctx.close()
  return out
}

async function runArm(name, { reload = false } = {}) {
  const arm = ARMS[name]
  if (!arm) throw new Error(`unknown arm "${name}" — have ${Object.keys(ARMS).join(', ')}`)

  // GPU by default. The other capture scripts pin swiftshader for determinism,
  // and that is right for a screenshot baseline — but this script is looking for
  // a one-frame compositing artifact, and a software rasteriser is exactly the
  // kind of thing that can invent or hide one. SWIFTSHADER=1 runs the other arm.
  const browser = await chromium.launch({
    args: process.env.SWIFTSHADER
      ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
      : [],
  })
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  const page = await ctx.newPage()
  const client = await ctx.newCDPSession(page)

  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

  // The waterfall, on the same timeline as the frames. `initialPriority` is
  // Chrome's own — the column audit P1-D reads, and the one Phase 4 changes.
  const requests = []
  await client.send('Network.enable')
  const byId = new Map()
  client.on('Network.requestWillBeSent', (e) => {
    const row = {
      url: e.request.url.replace(APP, '/'),
      priority: e.request.initialPriority,
      startedAt: e.timestamp,
    }
    byId.set(e.requestId, row)
    requests.push(row)
  })
  client.on('Network.loadingFinished', (e) => {
    const row = byId.get(e.requestId)
    if (row) {
      row.finishedAt = e.timestamp
      row.bytes = e.encodedDataLength
    }
  })

  // Long tasks, installed before any application code runs.
  await page.addInitScript(() => {
    window.__bootLongTasks = []
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__bootLongTasks.push({ at: entry.startTime, duration: entry.duration })
        }
      }).observe({ type: 'longtask', buffered: true })
    } catch {
      // A browser without the longtask entry type still captures frames.
    }
  })

  await client.send('Emulation.setCPUThrottlingRate', { rate: arm.cpu })
  if (arm.net) await client.send('Network.emulateNetworkConditions', arm.net)

  // Cold: no disk cache, so the arm measures a first visit rather than a reload.
  await client.send('Network.setCacheDisabled', { cacheDisabled: true })

  const frames = []
  const t0 = Date.now()
  client.on('Page.screencastFrame', async (frame) => {
    const at = Date.now() - t0
    // Ack immediately; a slow decode must not throttle the capture itself.
    void client.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {})
    frames.push({ at, data: frame.data })
  })

  // The distinction the whole capture turns on.
  //
  // The browser starts on about:blank, which is WHITE — so frames before the
  // navigation commits are white for a reason that has nothing to do with this
  // site, and counting them would manufacture the very bug being investigated.
  // What is genuinely ours is the window between commit and first paint: in it
  // the browser paints the new document's BASE background, and that colour is
  // what `color-scheme` decides. `tCommit` below is what makes that window
  // measurable instead of guessed.
  //
  // `reload: true` runs the other real case — the previous page is this dark
  // site rather than a blank tab, which is what a visitor pressing F5 sees.
  if (reload) {
    await page.goto(APP)
    await page.waitForFunction(() => window.__vertigoIntro !== undefined, undefined, { timeout: 120_000 })
    await page.evaluate(() => new Promise((r) => void window.__vertigoIntro.completed.then(() => r())))
  }

  await client.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 })
  const tStart = Date.now() - t0

  if (reload) await page.reload({ waitUntil: 'commit' })
  else await page.goto(APP, { waitUntil: 'commit' })
  const tCommit = Date.now() - t0

  // Until the intro has handed over AND the scene has drawn a few seconds of
  // real frames — the window the report is about.
  await page.waitForFunction(() => window.__vertigoIntro !== undefined, undefined, { timeout: 120_000 })
  await page.evaluate(
    () => new Promise((r) => void window.__vertigoIntro.completed.then(() => r())),
  )
  await page.waitForTimeout(3_000)
  await client.send('Page.stopScreencast')

  // The marks boot.ts already emits, plus paint and long tasks.
  const timings = await page.evaluate(() => {
    const mark = (n) => performance.getEntriesByName(n, 'mark')[0]?.startTime ?? null
    return {
      marks: {
        bootStart: mark('vertigo:boot-start'),
        introVisible: mark('vertigo:intro-visible'),
        sceneReady: mark('vertigo:scene-ready'),
        introComplete: mark('vertigo:intro-complete'),
      },
      paint: performance.getEntriesByType('paint').map((e) => ({ name: e.name, at: e.startTime })),
      nav: performance.getEntriesByType('navigation').map((e) => ({
        responseStart: e.responseStart,
        domContentLoaded: e.domContentLoadedEventStart,
      }))[0] ?? null,
      longTasks: window.__bootLongTasks ?? [],
      pipeLog: window.__pipeLog ?? [],
    }
  })

  // The layer stack, read rather than assumed — the question is which element
  // is opaque at each moment, and every one of these could be the answer.
  const layers = await page.evaluate(() => {
    const bg = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const s = getComputedStyle(el)
      return { background: s.backgroundColor, colorScheme: s.colorScheme, zIndex: s.zIndex, opacity: s.opacity, visibility: s.visibility }
    }
    const canvas = document.querySelector('canvas')
    return {
      html: bg('html'),
      body: bg('body'),
      root: bg('#root'),
      app: bg('.app'),
      introRoot: bg('.intro-root'),
      introSvg: bg('svg.intro-svg'),
      canvas: bg('canvas'),
      contextAttributes: canvas?.getContext('webgl2')?.getContextAttributes?.() ?? 'unavailable',
    }
  })

  const measured = await measureFrames(browser, frames)

  await ctx.close()
  await browser.close()
  // Frames the browser painted for THIS document, i.e. after the navigation
  // committed. Anything earlier belongs to whatever was on screen before.
  const ours = measured.filter((f) => f.at >= tCommit)

  // Every bright frame is written out with its two neighbours. A luminance
  // number says a flash happened; only the image says what flashed, and the
  // frame lasts 16 ms — there is no catching it by hand.
  for (const f of ours.filter((x) => x.mean > BRIGHT)) {
    for (const n of frames.filter((x) => Math.abs(x.at - f.at) < 400)) {
      const tag = n.at === f.at ? 'FLASH' : 'ctx'
      writeFileSync(`${OUT}/${name}${reload ? '-reload' : ''}-${String(n.at).padStart(6, '0')}ms-${tag}.jpg`, Buffer.from(n.data, 'base64'))
    }
  }
  const fcp = timings.paint.find((e) => e.name === 'first-contentful-paint')?.at ?? null

  return {
    arm: name,
    via: reload ? 'reload' : 'fresh',
    tStart,
    tCommit,
    fcp,
    frames: measured,
    ownFrames: ours,
    timings,
    layers,
    errors,
    requests,
  }
}

const report = {}
for (const spec of WANTED) {
  const [name, mode] = spec.split(':')
  const reload = mode === 'reload'
  const key = reload ? `${name}:reload` : name
  process.stdout.write(`
── ${key} ──
`)
  const result = await runArm(name, { reload })
  report[key] = result

  const bright = result.ownFrames.filter((f) => f.mean > BRIGHT)
  const brightest = result.ownFrames.reduce((a, b) => (b.mean > a.mean ? b : a), result.ownFrames[0])
  const m = result.timings.marks
  console.log(`frames        ${result.frames.length} total, ${result.ownFrames.length} after commit`)
  console.log(`commit        ${result.tCommit} ms (capture clock) · fcp ${result.fcp?.toFixed(0) ?? '—'} ms (page clock)`)
  console.log(`first own     ${result.ownFrames[0]?.at} ms at mean ${result.ownFrames[0]?.mean.toFixed(1)}`)
  console.log(`brightest own mean ${brightest?.mean.toFixed(1)} / p95 ${brightest?.p95.toFixed(1)} at ${brightest?.at} ms`)
  console.log(`mean > ${BRIGHT}     ${bright.length} frame(s)${bright.length ? ': ' + bright.map((f) => `${f.at}ms (mean ${f.mean.toFixed(0)})`).join(', ') : ''}`)
  console.log(`marks         intro-visible ${m.introVisible?.toFixed(0)} · scene-ready ${m.sceneReady?.toFixed(0)} · intro-complete ${m.introComplete?.toFixed(0)} ms`)
  console.log(`paint         ${result.timings.paint.map((e) => `${e.name} ${e.at.toFixed(0)}ms`).join(' · ')}`)
  console.log(`color-scheme  html=${result.layers.html?.colorScheme} body=${result.layers.body?.colorScheme}`)
  console.log(`backgrounds   body=${result.layers.body?.background} root=${result.layers.root?.background} intro=${result.layers.introRoot?.background} canvas=${result.layers.canvas?.background}`)
  console.log(`gl alpha      ${result.layers.contextAttributes?.alpha}`)
  const longest = [...result.timings.longTasks].sort((a, b) => b.duration - a.duration).slice(0, 3)
  console.log(`long tasks    ${result.timings.longTasks.length}, longest ${longest.map((t) => `${t.duration.toFixed(0)}ms@${t.at.toFixed(0)}`).join(', ')}`)
  if (result.errors.length) console.log(`errors        ${result.errors.slice(0, 3).join(' | ')}`)
}

writeFileSync(`${OUT}/boot-capture.json`, JSON.stringify(report, null, 1))
console.log(`\nwrote ${OUT}/boot-capture.json`)
