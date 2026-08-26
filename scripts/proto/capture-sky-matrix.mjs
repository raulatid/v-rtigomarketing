/**
 * The A/B matrix: every sky variant, under identical camera states, in the real
 * Earth scene.
 *
 * This is the deliverable of docs/plans/005-sky-cubemap-prototype.md, and it is
 * a deliverable because it has to be LOOKED AT. PROJECT_MEMORY records three
 * backdrop defects that survived design review, code review and 28 passing
 * numeric assertions, and were caught only by looking at the picture.
 *
 * Prerequisites:
 *   npm run pree2e                      # content + vite build
 *   npm run preview -- --port 4173
 *   node scripts/proto/export-skybox.mjs
 *
 * Usage:
 *   node scripts/proto/capture-sky-matrix.mjs [variant ...]
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  bootAndSettle,
  requireProtoHook,
  waitForCameraControl,
  setCameraChecked,
  waitForRestingPose,
  assertPose,
} from './lib/boot.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const APP_URL = process.env.APP_URL ?? 'http://localhost:4173/'
const SHOTS_DIR = join(ROOT, 'docs', 'plans', '005-sky-cubemap', 'shots')
const RESOLUTION = Number(process.env.SKY_RES ?? 4096)

// 1600x900 matches the existing e2e baselines, so these shots are directly
// comparable with the committed ones rather than merely similar.
const WIDTH = 1600
const HEIGHT = 900
const ASPECT = WIDTH / HEIGHT

/** `baseline` is the shipped panorama — the arm the variants have to beat. */
const VARIANTS = ['baseline', 'a', 'b', 'c', 'd']

const DEG = Math.PI / 180

/**
 * The camera states, identical across every variant.
 *
 * Chosen to span what a visitor actually reaches, not to flatter a sky:
 * the resting frame, the close-up composition, the warp's peak FOV, a
 * substantially different part of the sky, and the pole clamp — which is the
 * worst case for projection artifacts and is reachable by dragging today.
 */
const STATES = [
  { name: 'overview', radius: 14, theta: 0, phi: Math.PI / 2, fov: 45 },
  {
    name: 'case-study',
    radius: 5.6,
    theta: 0.6,
    phi: 1.35,
    fov: 45,
    // The shipped close-up composition, expressed the way closeUpFraming.ts
    // expresses it: a FRACTION of the frame's horizontal half-width, not a
    // distance in world units. At 16:9 and fov 45 that fraction (0.395) is
    // ~1.63 units, and stating it this way is what keeps the framing right if
    // the capture size ever changes.
    lateralOffset: 0.395 * Math.tan((45 * DEG) / 2) * 5.6 * ASPECT,
  },
  { name: 'warp', radius: 3.5, theta: 0, phi: Math.PI / 2, fov: 74 },
  { name: 'rotated', radius: 14, theta: 150 * DEG, phi: 1.0, fov: 45 },
  { name: 'pole', radius: 14, theta: 90 * DEG, phi: 0.15, fov: 45 },
]

/**
 * The second pass exists to test texel density honestly: the same 45-degree
 * frame over four times the pixels is where a magnified backdrop has nowhere
 * left to hide.
 *
 * It is `overview` ALONE, and that is a limitation rather than a choice. Above
 * ~5.8M pixels the app's phase never reaches `site` in headless chromium here,
 * so the focus rig never takes the camera and the four posed states cannot be
 * reached — see waitForRestingPose in lib/boot.mjs. `overview` survives because
 * it is exactly the pose the intro parks at on its own, which this pass asserts
 * rather than assumes. `warp` at 2x is NOT captured, and that gap is a finding.
 */
const DPR2_STATES = new Set(['overview'])

/**
 * The look-at, shifted sideways in SCREEN space.
 *
 * Moving the look-at right puts the subject left of centre, which is the
 * composition the case panel's right-hand dock is built around. "Right" is
 * perpendicular to the view axis and to world up, which is what the camera's
 * own basis would give — computed here rather than read back, so the pose is
 * fully determined by this file.
 */
function lookAtFor(state) {
  if (!state.lateralOffset) return [0, 0, 0]
  const { radius, theta, phi } = state
  const px = radius * Math.sin(phi) * Math.sin(theta)
  const py = radius * Math.cos(phi)
  const pz = radius * Math.sin(phi) * Math.cos(theta)
  // forward = origin - position
  const f = [-px, -py, -pz]
  const fl = Math.hypot(...f)
  const fn = f.map((v) => v / fl)
  // right = forward x up
  const r = [fn[2] * 0 - fn[1] * 1, fn[0] * 1 - fn[2] * 0, fn[1] * 0 - fn[0] * 1]
  const rl = Math.hypot(...r)
  return r.map((v) => (v / rl) * state.lateralOffset)
}

function urlFor(variant, dpr) {
  const params = new URLSearchParams({ freezeEarth: '1', stars: '0' })
  if (variant !== 'baseline') {
    params.set('sky', variant)
    params.set('skyRes', String(RESOLUTION))
  }
  void dpr
  return `${APP_URL}?${params}`
}

const selected = process.argv.slice(2).length ? process.argv.slice(2) : VARIANTS
mkdirSync(SHOTS_DIR, { recursive: true })

const browser = await chromium.launch()

for (const dpr of [1, 2]) {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: dpr,
  })

  for (const variant of selected) {
    const states = dpr === 1 ? STATES : STATES.filter((s) => DPR2_STATES.has(s.name))
    if (states.length === 0) continue

    const page = await context.newPage()
    page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`))

    console.log(`\n=== ${variant} @ DPR ${dpr} ===`)
    await bootAndSettle(page, urlFor(variant, dpr))
    await requireProtoHook(page)

    for (const state of states) {
      const suffix = dpr === 2 ? '@2x' : ''
      const path = join(SHOTS_DIR, `${state.name}-${variant}${suffix}.png`)
      let got

      if (dpr === 1) {
        // NOT the same moment as `completed`: CameraController keeps easing the
        // FOV and radius for several seconds afterwards, and a pose set before
        // the handoff is silently overwritten. See lib/boot.mjs.
        await waitForCameraControl(page)
        got = await setCameraChecked(page, {
          radius: state.radius,
          theta: state.theta,
          phi: state.phi,
          fov: state.fov,
          lookAt: lookAtFor(state),
        })
      } else {
        // The rig never takes the camera at this resolution, so this reads the
        // pose the intro parked at and CHECKS it is the one we wanted, rather
        // than assuming it.
        got = await waitForRestingPose(page)
        assertPose(got, state, `${variant} ${state.name} @2x`)
      }

      await page.screenshot({ path })
      console.log(
        `  ${state.name.padEnd(11)} fov=${got.fov} pos=[${got.position.map((v) => v.toFixed(1)).join(', ')}]`,
      )
    }
    await page.close()
  }
  await context.close()
}

await browser.close()
console.log('\ndone — now READ the PNGs in docs/plans/005-sky-cubemap/shots/')
