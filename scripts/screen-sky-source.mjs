// Answers ONE question about a candidate sky image, before anything is
// prepared, shipped, or judged: is it actually an equirectangular panorama?
//
//   npm i --no-save sharp
//   node scripts/screen-sky-source.mjs <image> [image ...]
//
// READ-ONLY. It writes nothing, touches nothing in public/, and does not care
// where the file lives — point it straight at a download.
//
// ── Why this exists ──
// The space background has been reworked four times and the same defect was
// reported three times in nearly the same words: "it's zoomed", "you can see
// the edge of the image", "the collapse point, where the sphere closes". There
// is one root cause behind all of it. `shell.frag.glsl` maps
// v = asin(dir.y)/PI + 0.5, so the image's TOP ROW IS THE ZENITH — one point of
// sky stretched across every column. That mapping is correct. What has never
// been true is the assumption it rests on: every image shipped through it has
// been a flat 2:1 picture rather than an equirectangular panorama.
//
// The only projection guard the pipeline ever had was `width === height * 2`.
// ASPECT RATIO IS NOT PROJECTION. All six CC0 candidates screened in 2026-08
// pass that guard and not one of them is a panorama. The screen those six went
// through checked wrapping and whether a galactic plane was present; nothing
// looked at a pole.
//
// ── This is a SCREEN, not a proof ──
// DECISIONS.md 19 records two separate occasions where a number moved the right
// way while the rendered picture stayed broken — once reading too low, once too
// high. Everything printed here is a reason to LOOK, or a reason not to bother
// looking. The looking happens in the running scene:
//
//   cp <image> public/textures/sky-test-001.png
//   npm run dev
//   http://localhost:5173/?skyImage=sky-test-001.png&stars=0&freezeEarth=1
//
// See the header of scripts/prepare-sky-panorama.mjs for what happens next.

import { resolve } from 'node:path'
import { poleRatios, seamMetrics } from './lib/sky-metrics.mjs'

// The GAP, not a tuned edge. A real panorama measures 0.029 top / 0.152 bottom
// (ESO's eso0932a.tif, which this project used to ship); the flat source
// shipping today measures 0.670 / 0.383, and the worst screened candidate
// 0.838. 0.20 sits in the empty space between the two populations with margin
// on both sides.
//
// Do NOT tighten this toward 0.05 to feel safer — that would reject the
// reference panorama itself on its own bottom pole.
const MAX_EQUIRECT_POLE_RATIO = 0.2
// Between the two, the metric is not deciding anything and should not pretend
// to. Render the pole view before trusting it either way.
const AMBIGUOUS_POLE_RATIO = 0.3

// Above ~3 the two vertical edges hold DIFFERENT SKY: the image is a crop, not
// a 360-degree wrap, and no correction of any kind closes it. This is a
// separate rejection from the pole test and neither one rescues the other.
// Measured: sky-panorama-003 0.5 (synthetic, wraps), -001 2.0 (shipped),
// -002 5-7, -006 8-30 (rejected on exactly this).
const MAX_WRAP_SPREAD = 3

// What the standing decision expects a space background to be. Under this is a
// warning rather than a rejection: the preparation script would upscale.
const EXPECTED_WIDTH = 4096

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error(
    'usage: node scripts/screen-sky-source.mjs <image> [image ...]\n\n' +
      'Read-only. Reports whether each image is a real equirectangular panorama.\n',
  )
  process.exit(1)
}

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('sharp is not installed. Run:\n\n  npm i --no-save sharp\n')
  process.exit(1)
}

const f3 = (n) => n.toFixed(3).padStart(6)
const f1 = (n) => n.toFixed(1)

/** Decoded at NATIVE resolution and otherwise untouched — see poleRatios. */
async function screen(file) {
  const path = resolve(file)
  const { data, info } = await sharp(path)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  const poles = poleRatios(data, width, height, channels)
  const seam = seamMetrics(data, width, height, channels)
  const worstPole = Math.max(poles.top, poles.bottom)
  const worstSpread = Math.max(...seam.map((s) => s.spread))

  const reasons = []
  console.log(`\n${file}`)
  console.log(`  ${width} x ${height}`)

  // Aspect. Necessary and nowhere near sufficient, which is the whole point.
  if (width !== height * 2) {
    console.log('    aspect       NOT 2:1 — reject')
    reasons.push('not 2:1')
  } else {
    console.log('    aspect       2:1 ok (necessary, and not remotely sufficient)')
  }
  if (width < EXPECTED_WIDTH) {
    console.log(`    resolution   under ${EXPECTED_WIDTH} — the prepare script would upscale it`)
  }

  // The projection test.
  console.log(
    `    pole ratio   top ${f3(poles.top)}  bottom ${f3(poles.bottom)}` +
      `   (threshold ${MAX_EQUIRECT_POLE_RATIO})`,
  )
  if (worstPole < MAX_EQUIRECT_POLE_RATIO) {
    console.log('                 EQUIRECTANGULAR — consistent with a real panorama')
  } else if (worstPole < AMBIGUOUS_POLE_RATIO) {
    console.log('                 AMBIGUOUS — render the pole view before trusting this')
    reasons.push('ambiguous poles')
  } else {
    console.log('                 NOT EQUIRECTANGULAR — same failure class as the shipped source')
    console.log('                 (0.670 / 0.383). The top row carries as much detail as the')
    console.log('                 middle, so mapping it to a sphere smears one row into a point.')
    console.log('                 That is missing data. No shader, filter or texture setting')
    console.log('                 recovers a zenith that was never photographed.')
    reasons.push('not equirectangular')
  }

  // The wrap test, independent of the above.
  console.log(
    `    wrap spread  ${seam.map((s) => f1(s.spread)).join(' / ')}` +
      `   (reject over ${MAX_WRAP_SPREAD})`,
  )
  console.log(
    `    wrap offset  ${seam.map((s) => f1(s.offset)).join(' / ')}` +
      '   levelSeam removes this',
  )
  if (worstSpread > MAX_WRAP_SPREAD) {
    console.log('                 CROP — the two vertical edges hold different sky. Not a wrap.')
    reasons.push('does not wrap')
  }

  const usable = reasons.length === 0
  console.log(
    usable
      ? '    VERDICT      usable — load it with ?skyImage= and look at BOTH poles'
      : `    VERDICT      reject — ${reasons.join(', ')}`,
  )
  return usable
}

let anyUsable = false
for (const file of files) {
  try {
    if (await screen(file)) anyUsable = true
  } catch (error) {
    console.log(`\n${file}\n    could not be read: ${error.message}`)
  }
}

console.log(
  '\nA number is a reason to look, never a substitute for looking. Judge the' +
    '\nwinner in the running scene at the scene\'s own exposure — and drag' +
    "\nskyBrightness / skyContrast in /debug before deciding an image is wrong.\n",
)
process.exit(anyUsable ? 0 : 1)
