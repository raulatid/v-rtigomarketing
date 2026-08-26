/**
 * Booting the app the same way e2e/backdrop.spec.ts boots it.
 *
 * Copied in behaviour from `bootAndSettle` there, deliberately rather than
 * imported: that file is a Playwright test module and these are plain node
 * scripts. If the two ever disagree about what "ready" means, the screenshots
 * stop being comparable with the committed baselines, so the poll and the
 * settle below are kept identical on purpose.
 */
const SETTLE_MS = 2_000

export async function bootAndSettle(page, url) {
  await page.goto(url)
  const started = Date.now()
  for (;;) {
    const readiness = await page.evaluate(
      () => window.__vertigoIntro?.boot.readiness() ?? 'absent',
    )
    if (readiness === 'ready') break
    if (Date.now() - started > 75_000) {
      throw new Error(`boot never reached "ready" (last: ${readiness}) at ${url}`)
    }
    await page.waitForTimeout(250)
  }

  await page.evaluate(
    () =>
      new Promise((resolve) => {
        void window.__vertigoIntro.completed.then(() => resolve())
      }),
  )
  await page.waitForTimeout(SETTLE_MS)
}

/** Fails loudly rather than silently screenshotting an unhooked build. */
export async function requireProtoHook(page) {
  const present = await page.evaluate(() => typeof window.__vertigoProto !== 'undefined')
  if (!present) {
    throw new Error(
      'window.__vertigoProto is absent — is this a production build? ' +
        'DEBUG_TOOLS_ENABLED gates the hook off there.',
    )
  }
}

/**
 * Waits until the focus rig actually owns the camera.
 *
 * `__vertigoIntro.completed` is NOT that moment. CameraController keeps driving
 * for several seconds after it — measured at ~5.5s here — easing the FOV down
 * to 45 and the radius to 14, and only then does InteractionLayer call
 * rig.activate(). setCamera before that writes the rig's state and the
 * controller overwrites the camera on the next frame, which produces a
 * screenshot of the resting pose no matter what pose was asked for. That is
 * exactly the failure this waits out, and it is silent without the check.
 *
 * The budget is generous because the handoff is not on a fixed timer — it is
 * whenever the intro's own camera timeline finishes, which at DPR 2 (four times
 * the pixels) is measurably later than at DPR 1. 30s was enough for one and not
 * the other.
 */
export async function waitForCameraControl(page, timeoutMs = 120_000) {
  const started = Date.now()
  for (;;) {
    if (await page.evaluate(() => window.__vertigoProto.getCamera().active)) return
    if (Date.now() - started > timeoutMs) {
      throw new Error('the focus rig never took control of the camera')
    }
    await page.waitForTimeout(200)
  }
}

/**
 * Sets a pose and asserts it took, rather than trusting that it did.
 *
 * The rig snaps, so one frame is enough; the wait is for the render, not for an
 * ease. The tolerance is loose because `phi` is clamped to [phiMin, phiMax] on
 * the way in — the `pole` state asks for exactly phiMin — and because a
 * lookAt-only change moves nothing else.
 */
export async function setCameraChecked(page, pose) {
  await page.evaluate((p) => window.__vertigoProto.setCamera(p), pose)
  await page.waitForTimeout(300)
  const got = await page.evaluate(() => window.__vertigoProto.getCamera())

  const near = (a, b, eps) => Math.abs(a - b) <= eps
  const wrong = []
  if (pose.radius !== undefined && !near(got.radius, pose.radius, 1e-3)) {
    wrong.push(`radius ${got.radius} != ${pose.radius}`)
  }
  if (pose.theta !== undefined && !near(got.theta, pose.theta, 1e-3)) {
    wrong.push(`theta ${got.theta} != ${pose.theta}`)
  }
  if (pose.fov !== undefined && !near(got.fov, pose.fov, 1e-3)) {
    wrong.push(`fov ${got.fov} != ${pose.fov}`)
  }
  if (wrong.length) throw new Error(`camera did not take the pose: ${wrong.join('; ')}`)
  return got
}

/**
 * Waits for the intro to park the camera and hold still, without needing the
 * focus rig.
 *
 * There is a reason to want this. Above roughly 5.8 million pixels — DPR 2 at
 * 1600x900, and equally 3200x1800 at DPR 1 — the intro's camera timeline still
 * completes and still leaves the camera at the resting pose, but the phase
 * never advances to `site`, so InteractionLayer never calls rig.activate() and
 * setCamera has nothing to write through. Measured, not inferred: the camera
 * was observed sitting at exactly [0, 0, 14] with fov 45 for 143 seconds with
 * `active` still false, in headless chromium on this machine.
 *
 * That resting pose IS the `overview` state of the capture matrix, so the
 * high-resolution arm can be taken here instead — and the caller asserts the
 * pose rather than assuming it, so the shot is still the same camera as its
 * DPR 1 sibling. The other four states genuinely need the rig, and cannot be
 * captured at this resolution until the handoff is understood.
 */
export async function waitForRestingPose(page, timeoutMs = 240_000) {
  const started = Date.now()
  let last = null
  let stableFor = 0
  let hasMoved = false
  let first = null

  for (;;) {
    const c = await page.evaluate(() => window.__vertigoProto.getCamera())
    const key = `${c.position.map((v) => v.toFixed(3)).join(',')}|${c.fov.toFixed(3)}`
    if (first === null) first = key
    // The camera HOLDS STILL at the starfield pose for the first ~12s before
    // the intro's flight begins, so stillness alone is not arrival — an earlier
    // version of this returned radius 200 and the pose assertion caught it.
    // Movement has to happen first.
    if (key !== first) hasMoved = true

    stableFor = key === last ? stableFor + 1 : 0
    last = key
    // Six consecutive identical reads over ~3s, after motion. The Earth's spin
    // is frozen and nothing else moves once the timeline ends, so "unchanged"
    // here really is "done".
    if (hasMoved && stableFor >= 5) return c
    if (Date.now() - started > timeoutMs) {
      throw new Error(`the camera never settled (moved=${hasMoved}, last ${key})`)
    }
    await page.waitForTimeout(500)
  }
}

/** Asserts a settled pose matches an expected state, so a shot is comparable. */
export function assertPose(got, expected, label) {
  const wrong = []
  const near = (a, b, eps) => Math.abs(a - b) <= eps
  const radius = Math.hypot(...got.position)
  if (expected.radius !== undefined && !near(radius, expected.radius, 0.05)) {
    wrong.push(`radius ${radius.toFixed(3)} != ${expected.radius}`)
  }
  if (expected.fov !== undefined && !near(got.fov, expected.fov, 0.05)) {
    wrong.push(`fov ${got.fov} != ${expected.fov}`)
  }
  if (wrong.length) throw new Error(`${label}: settled pose is not the expected one — ${wrong.join('; ')}`)
}
