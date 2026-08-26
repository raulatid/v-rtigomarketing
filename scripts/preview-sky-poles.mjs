// Renders what the camera actually sees when it looks straight at the sky's
// poles, and writes it to a PNG you open and look at.
//
// A one-off asset tool like `prepare-sky-panorama.mjs`, and `sharp` is not a
// project dependency for the same reason:
//
//   npm i --no-save sharp
//   node scripts/preview-sky-poles.mjs [image ...]
//
// With no arguments it renders the two shipped AVIFs. Pass paths to compare a
// candidate source, or the ESO original if it is still cached, against them.
//
//   --cap-strength 0,0.4,0.7,1.0    sweep a constant and emit a contact sheet
//   --cap-start / --cap-full / --cap-azimuth / --grain   same, one at a time
//
// The sweep is the point of the tool now: pick a constant by looking at four
// pole views side by side, not by dragging a slider twenty times in a browser.
//
// ── Why this exists as a tool rather than as a check ──
// `prepare-sky-panorama.mjs` prints a `poles` number and that number is a good
// SOURCE SCREEN — a real equirectangular panorama scores near 0.03, a flat 2:1
// image scores 0.3 and up. It is NOT a verification of the correction, and
// treating it as one cost a full wrong fix on 2026-08-19: the band-limit pass
// drove it from 0.54 to 0.015 and the picture was visually identical, because a
// pole ratio near zero says the pole ROW is constant and says nothing about the
// ring one degree out. The fade that actually fixed it does not move the number
// at all.
//
// So: screen sources with the number, verify corrections with this. See
// `docs/audits/reports/sky-panorama-projection-2026-08-19.md`.
//
// ── And it is now only HALF the verification ──
// As of 2026-08-25 the poles are repaired at RUNTIME rather than in the asset,
// so this script no longer looks at the shipped picture — it looks at a
// reimplementation of `shell.frag.glsl` in JavaScript. That makes it the more
// useful tool and the more dangerous one: if it drifts from the shader it will
// keep producing confident, wrong pictures.
//
// FOUR THINGS MUST AGREE with src/experiences/earth/shaders/sky/shell.frag.glsl
// and its config, and there is nothing that enforces it but this comment:
//
//   1. `equirect()`                       — the mapping itself
//   2. CAP_* below                        — SPACE_CONFIG.sky + introConfig
//   3. the sRGB <-> linear round trip     — see LINEAR below
//   4. the cap is applied BEFORE contrast and brightness, as it is there
//
// Never sign a change off on this picture alone. It has no bloom, no ACES, no
// star shell and no composer; the scene screenshot is the verification and this
// is the fast loop that gets you to a candidate worth screenshotting.
//
// ── Reading the output ──
// Top row is the north sky pole, bottom row the south, one column per image (or
// per swept value). What you are looking for, and what a flat source produces
// untreated, is a pinwheel of radial spokes converging on a vertex with a hard
// straight wedge where the meridian lands. What the 2026-08-19 asset-side fix
// left instead is the OPPOSITE failure and the one this now targets: a
// perfectly smooth, perfectly radially symmetric gradient converging on a dark
// centre — a funnel. A repaired cap has neither: ordinary gas, no vertex, and
// no ring where the blend starts.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Matches the scene. FOV is the WARP PEAK rather than the resting 45, because
// that is the widest the sky is ever seen and therefore the worst case;
// BRIGHTNESS is uSkyBrightness so the levels are the scene's.
const SIZE = 420
const FOV_DEGREES = 74
const BRIGHTNESS = 0.6
// Pure viewing exposure for this preview. The sky is dark by design and the
// artifact hides in the dark; this is not part of the pipeline.
const PREVIEW_GAIN = 2.4

// ── Mirrors of the shader's constants. See the header: these MUST agree. ──
// SPACE_CONFIG.sky.capAzimuth / capLevel / capClamp / grainCellDegrees
const CAP_AZIMUTH = 15
const CAP_LEVEL = { north: 0.036286, south: 0.011333 }
const CAP_CLAMP = { min: 0.25, max: 3.0 }
const GRAIN_CELL_DEGREES = 0.1
// DEFAULT_APP_CONFIG.skyCapStart / skyCapFull / skyCapStrength / skyGrain
const CAP_START = 68
const CAP_FULL = 84
const CAP_STRENGTH = 0.35
const GRAIN = 0.12

// The one thing this script did NOT used to do, and the largest drift hazard in
// it. The shader works in LINEAR — three converts on sampling because the
// texture is tagged SRGBColorSpace — and the cap is a ratio, which is only
// meaningful in linear. Doing it in 8-bit sRGB, as this script did while the
// poles were an asset-side concern, would put the cap at the wrong level
// everywhere and the picture would disagree with the scene for a reason that
// looks like a strength that needs dragging.
const LINEAR = new Float64Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function toSrgb(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(c * 255)))
}

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('sharp is not installed. Run:  npm i --no-save sharp')
  process.exit(1)
}

// ── Arguments: image paths, plus at most one `--flag a,b,c` sweep ──
const argv = process.argv.slice(2)
const SWEEPS = {
  '--cap-strength': 'capStrength',
  '--cap-start': 'capStart',
  '--cap-full': 'capFull',
  '--cap-azimuth': 'capAzimuth',
  '--grain': 'grain',
}
const inputs = []
let sweepKey = null
let sweepValues = null
for (let i = 0; i < argv.length; i++) {
  const field = SWEEPS[argv[i]]
  if (!field) {
    inputs.push(argv[i])
    continue
  }
  if (sweepKey) {
    console.error('one sweep at a time — a grid of two is not a thing you can read')
    process.exit(1)
  }
  sweepKey = field
  sweepValues = (argv[++i] ?? '').split(',').map(Number)
  if (!sweepValues.length || sweepValues.some(Number.isNaN)) {
    console.error(`${argv[i - 1]} wants a comma-separated list of numbers`)
    process.exit(1)
  }
}

const files = inputs.length
  ? inputs
  : [join(ROOT, 'public/textures/sky-panorama.avif'), join(ROOT, 'public/textures/sky-panorama-narrow.avif')]

const BASE = {
  capStart: CAP_START,
  capFull: CAP_FULL,
  capStrength: CAP_STRENGTH,
  capAzimuth: CAP_AZIMUTH,
  grain: GRAIN,
}

/**
 * The mapping from shell.frag.glsl. Kept as its own function for the same
 * reason it is one there: the cap sample must use EXACTLY this, and two copies
 * drifting apart would show up as a seam rather than as anything named.
 */
function equirect(d) {
  const len = Math.hypot(d[0], d[1], d[2])
  return [
    Math.atan2(d[2] / len, d[0] / len) / (2 * Math.PI) + 0.5,
    Math.asin(Math.max(-1, Math.min(1, d[1] / len))) / Math.PI + 0.5,
  ]
}

/**
 * `skyCapRotation` from src/experiences/earth/scene/space/galaxyBand.ts, as a
 * function rather than a matrix: the minimal rotation taking +Y to the given
 * azimuth on the equator, which is exactly 90 degrees because the target is on
 * the equator. Rodrigues at 90 degrees collapses to `(k x d) + k (k.d)`.
 */
function capRotation(azimuthDegrees) {
  const a = (azimuthDegrees * Math.PI) / 180
  const target = [Math.cos(a), 0, Math.sin(a)]
  // axis = normalize(+Y x target); unit already, both being unit and orthogonal
  const axis = [target[2], 0, -target[0]]
  const l = Math.hypot(...axis)
  const k = [axis[0] / l, axis[1] / l, axis[2] / l]
  return (d) => {
    const kd = k[0] * d[0] + k[1] * d[1] + k[2] * d[2]
    return [
      k[1] * d[2] - k[2] * d[1] + k[0] * kd,
      k[2] * d[0] - k[0] * d[2] + k[1] * kd,
      k[0] * d[1] - k[1] * d[0] + k[2] * kd,
    ]
  }
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function hash13(p) {
  const f = (v) => v - Math.floor(v)
  let x = f(p[0] * 0.1031),
    y = f(p[1] * 0.1031),
    z = f(p[2] * 0.1031)
  const dot = x * (z + 31.32) + y * (y + 31.32) + z * (x + 31.32)
  x += dot
  y += dot
  z += dot
  return f((x + y) * z)
}

function valueNoise(p) {
  const i = p.map(Math.floor)
  const fr = p.map((v, n) => v - i[n])
  const f = fr.map((v) => v * v * (3 - 2 * v))
  const at = (dx, dy, dz) => hash13([i[0] + dx, i[1] + dy, i[2] + dz])
  const lerp = (a, b, t) => a + (b - a) * t
  return lerp(
    lerp(lerp(at(0, 0, 0), at(1, 0, 0), f[0]), lerp(at(0, 1, 0), at(1, 1, 0), f[0]), f[1]),
    lerp(lerp(at(0, 0, 1), at(1, 0, 1), f[0]), lerp(at(0, 1, 1), at(1, 1, 1), f[0]), f[1]),
    f[2],
  )
}

const LUMA = [0.2126, 0.7152, 0.0722]

/** One pole, as the shell shader would sample it. `up` is +1 north, -1 south. */
async function poleView(file, up, cfg) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const out = Buffer.alloc(SIZE * SIZE * 3)
  const half = Math.tan((FOV_DEGREES * Math.PI) / 360)
  const rotate = capRotation(cfg.capAzimuth)
  const band = [
    Math.sin((cfg.capStart * Math.PI) / 180),
    Math.sin((Math.max(cfg.capFull, cfg.capStart + 0.5) * Math.PI) / 180),
  ]
  const grainFrequency = 1 / ((GRAIN_CELL_DEGREES * Math.PI) / 180)

  // NEAREST, on purpose. The texture ships without mipmaps and with a
  // LinearFilter minFilter, so the GPU point-samples here too; a smooth
  // sampler in the preview would hide the thing being looked for.
  const sample = (d) => {
    const [u, v] = equirect(d)
    // wrapS is RepeatWrapping, so u wraps; wrapT is ClampToEdge, so v does not.
    const tx = ((Math.round(u * (width - 1)) % width) + width) % width
    // flipY is on for TextureLoader, so v = 1 is the TOP row of the file.
    const ty = Math.min(height - 1, Math.max(0, Math.round((1 - v) * (height - 1))))
    const src = (ty * width + tx) * channels
    return [LINEAR[data[src]], LINEAR[data[src + 1]], LINEAR[data[src + 2]]]
  }

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      // Camera down the pole axis; screen x -> world x, screen y -> world z.
      const raw = [((px + 0.5) / SIZE - 0.5) * 2 * half, up, ((py + 0.5) / SIZE - 0.5) * 2 * half]
      const len = Math.hypot(...raw)
      const dir = [raw[0] / len, raw[1] / len, raw[2] / len]

      const sky = sample(dir)

      const cap = smoothstep(band[0], band[1], Math.abs(dir[1])) * cfg.capStrength
      if (cap > 0) {
        const borrowed = sample(rotate(dir))
        const level = dir[1] > 0 ? CAP_LEVEL.north : CAP_LEVEL.south
        const ratio = (LUMA[0] * borrowed[0] + LUMA[1] * borrowed[1] + LUMA[2] * borrowed[2]) / level
        const factor = 1 + (Math.min(CAP_CLAMP.max, Math.max(CAP_CLAMP.min, ratio)) - 1) * cap
        for (let c = 0; c < 3; c++) sky[c] *= factor
      }

      // uSkyContrast is 1.00 on the shipped source, so the shader's pow() is
      // the identity and is omitted rather than silently assumed — if the
      // contrast slider ever leaves 1, add it here before trusting this.
      for (let c = 0; c < 3; c++) sky[c] *= BRIGHTNESS

      if (cfg.grain > 0) {
        const n = 1 + cfg.grain * (valueNoise(dir.map((v) => v * grainFrequency)) * 2 - 1)
        for (let c = 0; c < 3; c++) sky[c] *= n
      }

      const dst = (py * SIZE + px) * 3
      for (let c = 0; c < 3; c++) out[dst + c] = toSrgb(sky[c] * PREVIEW_GAIN)
    }
  }
  return sharp(out, { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toBuffer()
}

const GAP = 16
const columns = sweepKey
  ? sweepValues.map((v) => ({ file: files[0], cfg: { ...BASE, [sweepKey]: v }, label: `${sweepKey} ${v}` }))
  : files.map((file) => ({ file, cfg: BASE, label: file }))

const tiles = []
for (const [column, col] of columns.entries()) {
  for (const [row, up] of [1, -1].entries()) {
    tiles.push({
      input: await poleView(col.file, up, col.cfg),
      left: column * (SIZE + GAP),
      top: row * (SIZE + GAP),
    })
  }
  console.log(`  ${col.label}`)
}

const outFile = join(ROOT, 'node_modules', '.cache', 'sky-poles.png')
await sharp({
  create: {
    width: columns.length * (SIZE + GAP) - GAP,
    height: 2 * (SIZE + GAP) - GAP,
    channels: 3,
    background: '#202024',
  },
})
  .composite(tiles)
  .png()
  .toFile(outFile)

// Under node_modules/.cache so a preview never lands in the repo or in the
// build. It is a thing you look at once, not an artifact.
console.log(`\nwrote ${outFile}`)
console.log('top row = north sky pole, bottom = south, one column per image or swept value.')
console.log('A repaired cap has ordinary gas, no convergence vertex, and no ring at the blend')
console.log('start. Spokes mean the source is not equirectangular and the asset-side fix is off;')
console.log('a smooth symmetric funnel means the asset-side fix is on and the CAP is off or weak.')
