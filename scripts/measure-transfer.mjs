// Measures what a full desktop visit transfers, and estimates what Vercel would.
//
// A measuring tool, NOT part of the build or of `npm run check`. Run it by hand
// against a fresh production `dist/`:
//
//   VITE_VERCEL_ENV=production npx vite build && npm run blog:preview
//   node scripts/measure-transfer.mjs [--runs 2] [--out report.json] [--stay]
//
// It starts its own `vite preview` on port 4180 (so it never grades a server
// someone else left open on 4173), drives Chromium with Playwright and a cold
// cache, and prints two totals:
//
//   - measured: the sum of Resource Timing `transferSize` (navigation + every
//     resource), as served by `vite preview`. That server compresses with GZIP
//     only, and only `text|javascript|json|xml` content types (Vite 5.4,
//     `@polka/compression`), so this figure is pessimistic for the text.
//   - Vercel estimate: the same entries, with each body replaced by the Brotli
//     q11 size of its `dist/` file when Vercel would compress that content type
//     (its documented list includes html, js, css, json, svg, wasm, ttf/otf,
//     ico; not woff2, glb, ktx2, images or audio), plus the header bytes the run
//     measured. Brotli quality on Vercel is undocumented: q11 is the bound the
//     2026-11-18 weight reports used, so the figures stay comparable.
//
// The visit is the one those reports defined: 1600x900, 25 s on the Earth,
// reject cookies (the gesture unlocks the music), travel with `.nav-control`,
// wait 20 s. `--stay` measures the visit without travelling (40 s).
//
// Requests made from inside a worker do not reach the page's Resource Timing
// buffer. The script lists any request Playwright saw that Resource Timing did
// not, so a gap in the total is visible rather than silent.

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { brotliCompressSync, constants as zlib } from 'node:zlib'
import { chromium } from '@playwright/test'

const DIST = resolve('dist')
const PORT = 4180
const ORIGIN = `http://localhost:${PORT}`

// Extensions whose content type is on Vercel's compression list
// (https://vercel.com/docs/how-vercel-cdn-works/compression, read 2026-11-22).
const VERCEL_COMPRESSES = new Set([
  '.html', '.js', '.mjs', '.css', '.json', '.svg', '.wasm', '.txt', '.xml',
  '.ttf', '.otf', '.ico', '.bmp', '.csv', '.md', '.vtt', '.map',
])

function parseArgs(argv) {
  const args = { runs: 1, out: null, stay: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--runs') args.runs = Number(argv[++i])
    else if (argv[i] === '--out') args.out = argv[++i]
    else if (argv[i] === '--stay') args.stay = true
    else throw new Error(`unknown argument ${argv[i]}`)
  }
  if (!Number.isInteger(args.runs) || args.runs < 1) throw new Error('--runs must be a positive integer')
  return args
}

async function startPreview() {
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout.on('data', (d) => (log += d))
  child.stderr.on('data', (d) => (log += d))
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`vite preview exited:\n${log}`)
    try {
      const res = await fetch(ORIGIN + '/', { method: 'HEAD' })
      if (res.ok) return child
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  child.kill()
  throw new Error(`vite preview did not answer on ${ORIGIN}:\n${log}`)
}

/** The `dist/` file a same-origin URL is served from, or null. */
function distFile(url) {
  const u = new URL(url)
  if (u.origin !== ORIGIN) return null
  let path = decodeURIComponent(u.pathname)
  if (path === '/' || path === '/debug') path = '/index.html'
  const file = join(DIST, path)
  return existsSync(file) && statSync(file).isFile() ? file : null
}

const brotliCache = new Map()
function brotliSize(file) {
  if (!brotliCache.has(file)) {
    const out = brotliCompressSync(readFileSync(file), {
      params: { [zlib.BROTLI_PARAM_QUALITY]: 11, [zlib.BROTLI_PARAM_SIZE_HINT]: statSync(file).size },
    })
    brotliCache.set(file, out.length)
  }
  return brotliCache.get(file)
}

function group(url) {
  const u = new URL(url)
  if (u.origin !== ORIGIN) return `external (${u.host})`
  const path = u.pathname
  const ext = extname(path).toLowerCase()
  if (path === '/' || ext === '.html') return 'html'
  if (ext === '.js' || ext === '.css') return 'js + css'
  if (path.includes('lightmap')) return 'murcia lightmaps'
  if (ext === '.glb' && path.includes('murcia')) return 'murcia glb'
  if (ext === '.glb' || ext === '.gltf' || ext === '.bin') return 'other models'
  if (path.startsWith('/earth/')) return 'earth textures'
  if (path.startsWith('/draco/') || path.startsWith('/libs/')) return 'decoders'
  if (path.startsWith('/audio/')) return 'audio'
  if (path.startsWith('/fonts/')) return 'fonts'
  if (['.webp', '.png', '.jpg', '.jpeg', '.avif', '.svg', '.ico'].includes(ext)) return 'images'
  return 'other'
}

async function visit(browser, { stay }) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  const page = await context.newPage()
  await page.addInitScript(() => performance.setResourceTimingBufferSize(10000))

  const seen = new Map()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  context.on('requestfinished', (req) => {
    if (!req.url().startsWith('data:') && !req.url().startsWith('blob:')) seen.set(req.url(), req.resourceType())
  })

  await page.goto(ORIGIN + '/', { waitUntil: 'load' })
  let travelled = null
  if (stay) {
    await page.waitForTimeout(40_000)
  } else {
    await page.waitForTimeout(25_000)
    await page.getByRole('button', { name: 'Rechazar todas' }).click({ timeout: 10_000 })
    // The control refuses input while `.nav` is `suppressed`, which lasts a few
    // seconds after the consent choice; a press before `idle` is silently lost
    // and the visit would never reach Murcia (or pay for its music).
    await page.waitForSelector('.nav[data-state="idle"]', { state: 'attached', timeout: 30_000 })
    const control = page.locator('.nav-control')
    const before = await control.getAttribute('aria-label')
    await control.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(
      () => document.querySelector('.nav-control')?.getAttribute('aria-label') === 'Volver a la Tierra',
      null,
      { timeout: 10_000 },
    )
    await page.waitForTimeout(20_000)
    travelled = { before, after: await control.getAttribute('aria-label') }
  }

  const entries = await page.evaluate(() =>
    [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')].map((e) => ({
      url: e.name,
      type: e.entryType === 'navigation' ? 'navigation' : e.initiatorType,
      transferSize: e.transferSize,
      encodedBodySize: e.encodedBodySize,
      decodedBodySize: e.decodedBodySize,
    })),
  )
  await context.close()

  const timed = new Set(entries.map((e) => e.url))
  const missing = [...seen.keys()].filter((url) => !timed.has(url))
  return { entries, missing, errors, travelled }
}

function summarise({ entries }) {
  const rows = entries.map((e) => {
    const file = distFile(e.url)
    const headers = Math.max(0, e.transferSize - e.encodedBodySize)
    const compressible = file !== null && VERCEL_COMPRESSES.has(extname(file).toLowerCase())
    // A cache hit or a cross-origin entry without Timing-Allow-Origin reports 0.
    const body = e.transferSize === 0 ? 0 : compressible ? brotliSize(file) : e.decodedBodySize
    return { ...e, group: group(e.url), vercel: e.transferSize === 0 ? 0 : headers + body }
  })
  const sum = (list, key) => list.reduce((n, r) => n + r[key], 0)
  const groups = new Map()
  for (const r of rows) {
    const g = groups.get(r.group) ?? { group: r.group, count: 0, transferSize: 0, vercel: 0, decodedBodySize: 0 }
    g.count++
    g.transferSize += r.transferSize
    g.vercel += r.vercel
    g.decodedBodySize += r.decodedBodySize
    groups.set(r.group, g)
  }
  return {
    count: rows.length,
    transferSize: sum(rows, 'transferSize'),
    vercel: sum(rows, 'vercel'),
    decodedBodySize: sum(rows, 'decodedBodySize'),
    zeroTransfer: rows.filter((r) => r.transferSize === 0).map((r) => r.url),
    groups: [...groups.values()].sort((a, b) => b.vercel - a.vercel),
    rows,
  }
}

const mb = (n) => (n / 1e6).toFixed(3).padStart(8)

function print(run, i, s) {
  console.log(`\nrun ${i + 1}: ${s.count} entries, ${run.errors.length} pageerror`)
  if (run.travelled) console.log(`  .nav-control: "${run.travelled.before}" -> "${run.travelled.after}"`)
  console.log(`  ${'group'.padEnd(30)} ${'n'.padStart(4)} ${'measured'.padStart(8)} ${'vercel*'.padStart(8)} ${'decoded'.padStart(8)}  (MB)`)
  for (const g of s.groups) {
    console.log(`  ${g.group.padEnd(30)} ${String(g.count).padStart(4)} ${mb(g.transferSize)} ${mb(g.vercel)} ${mb(g.decodedBodySize)}`)
  }
  console.log(`  ${'TOTAL'.padEnd(30)} ${String(s.count).padStart(4)} ${mb(s.transferSize)} ${mb(s.vercel)} ${mb(s.decodedBodySize)}`)
  if (s.zeroTransfer.length) console.log(`  transferSize 0 (cache or cross-origin): ${s.zeroTransfer.join(', ')}`)
  if (run.missing.length) console.log(`  seen by Playwright, absent from Resource Timing: ${run.missing.join(', ')}`)
  for (const e of run.errors) console.log(`  pageerror: ${e}`)
}

const args = parseArgs(process.argv.slice(2))
if (!existsSync(join(DIST, 'index.html'))) throw new Error('no dist/index.html: build first (see the header)')
const preview = await startPreview()
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const results = []
try {
  for (let i = 0; i < args.runs; i++) {
    const run = await visit(browser, args)
    const summary = summarise(run)
    print(run, i, summary)
    results.push({ ...run, summary })
  }
} finally {
  await browser.close()
  preview.kill()
}
console.log('\n* vercel = estimate: measured headers + Brotli q11 of the dist/ file for types Vercel compresses.')
if (args.out) {
  writeFileSync(args.out, JSON.stringify({ at: new Date().toISOString(), stay: args.stay, results }, null, 2))
  console.log(`wrote ${args.out}`)
}
