import { test, expect, type Page } from '@playwright/test'

/**
 * Screenshot baselines for the things numbers are blind to.
 *
 * PROJECT_MEMORY is explicit about why these exist: three backdrop defects
 * survived design review, code review AND 28 passing numeric assertions, and
 * were caught only by looking — noise frequency producing fog, dust lanes
 * crazing the sky, and a smooth analytic band reading as a searchlight beam.
 * Every assertion was true. Numbers prove the mechanism; only a picture judges
 * the result.
 *
 * What a baseline can and cannot do, stated so the next reader does not expect
 * too much: it catches a CHANGE, not a defect. It would have caught none of
 * those three when they were introduced, because there was no earlier image to
 * differ from. What it does is stop a fixed defect from coming back, and make a
 * change to the sky visible in review instead of on the deployed site.
 *
 * Baselines are committed. Regenerate deliberately with `npm run e2e:update`
 * and look at the diff — an updated baseline is a decision, not a chore.
 */

const SETTLE_MS = 2_000

async function bootAndSettle(page: Page) {
  await page.goto('/')
  await expect
    .poll(() => page.evaluate(() => window.__vertigoIntro?.boot.readiness() ?? 'absent'), {
      timeout: 75_000,
    })
    .toBe('ready')

  // Wait for the intro to hand over, then let the scene settle. The Earth spins
  // at 0.035 rad/s, so a screenshot taken at a wall-clock delay is a screenshot
  // of a different rotation each run — the surface spin is stopped below rather
  // than waited out.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        void window.__vertigoIntro!.completed.then(() => resolve())
      }),
  )
  await page.waitForTimeout(SETTLE_MS)
}

test.describe('the resting backdrop', () => {
  // This baseline also carries the wrap-seam guard, which used to be a second
  // test — `backdrop-seam.png`, same boot, same default viewport, same camera,
  // same masks. It captured this identical picture under a different filename:
  // nothing between the two changed what was on screen, so it asserted the same
  // pixels twice, cost a second 936 KB baseline, and had to be regenerated on
  // every legitimate sky change.
  //
  // The seam knowledge is worth keeping even though the test was not
  // (PROJECT_MEMORY): a stitched panorama's two vertical edges rarely match
  // photometrically, and under a perspective camera a great circle projects to
  // a STRAIGHT line — so the step reads as a ruler drawn across the sky. The
  // fix is a per-row offset ramped across the full width. Where the seam falls
  // in this view, this baseline notices it reopening; where it does not, the
  // deleted test did not cover it either, since it framed the same view.
  //
  // A genuine seam test would have to aim the camera at the seam, which needs a
  // camera-control hook this suite does not have. Worth adding when there is
  // one — as a test that can fail differently from this one.
  test('sky and star shell, wide', async ({ page }) => {
    await bootAndSettle(page)

    // Masked rather than cropped: the audit panel carries the ESO credit, which
    // is a licence obligation and must not be hidden — but its text is content
    // that will change, and a copy edit should not fail a sky baseline.
    await expect(page).toHaveScreenshot('backdrop-wide.png', {
      // The Earth rotates continuously; a small tolerance keeps the diff about
      // the sky rather than about which continent is facing the camera.
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      mask: [page.locator('.audit-section'), page.locator('.geo-tag')],
    })
  })

  test('narrow viewport uses the small panorama without banding', async ({ page }) => {
    // Below 767px a 3072-wide pair is served instead. Same image, different
    // file — and the smaller one is the more likely to show compression
    // blocking, since it is magnified further.
    await page.setViewportSize({ width: 420, height: 900 })
    await bootAndSettle(page)
    await expect(page).toHaveScreenshot('backdrop-narrow.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      mask: [page.locator('.audit-section'), page.locator('.geo-tag')],
    })
  })
})

test('the ESO credit is reachable and readable in the audit panel', async ({ page }) => {
  // CC BY 4.0 requires the credit be clearly readable and not hidden. This is a
  // licence obligation, not a nicety — do not reword it, hide it at a
  // breakpoint, or fade it further. See CREDITS.md and DECISIONS section 19.
  //
  // NOTE, and it is worth a decision rather than a test: the credit is NOT
  // visible at rest. It lives inside `.audit-overlay`, which is hidden until a
  // visitor opens the lead-capture panel, so DECISIONS' description of that
  // panel as "the only PERSISTENT text surface the site has" overstates what
  // ships — persistent it is not. A credits panel is normally accepted as
  // attribution "in a reasonable manner", so this asserts what actually exists
  // rather than failing on a legal judgement that is not the harness's to make.
  await bootAndSettle(page)

  const trigger = page.getByRole('button', { name: 'Auditoría' })
  await expect(trigger).toBeEnabled({ timeout: 30_000 })
  await trigger.click()

  const credit = page.locator('text=/ESO\\s*\\/\\s*S\\.\\s*Brunier/i')
  await expect(credit.first()).toBeVisible({ timeout: 15_000 })

  // Readable, not merely present: a credit faded to near-nothing satisfies the
  // DOM and not the licence.
  //
  // POLLED, not read once. The credit lives in `.audit-group--4`, which the
  // panel reveals with a 380ms opacity transition on a 760ms delay — so for the
  // first ~1.1s after the click it is legitimately at opacity 0. Playwright
  // counts an opacity-0 element as visible (it has a box and is not
  // `visibility: hidden`), so `toBeVisible` resolving says nothing about
  // whether the reveal has run. Reading once immediately after it made this
  // test a race that happened to be won by however many React renders the
  // component did in the meantime; a refactor that removed one lost it.
  await expect
    .poll(
      () =>
        credit.first().evaluate((el) => {
          let node: HTMLElement | null = el as HTMLElement
          let effective = 1
          while (node) {
            effective *= Number(getComputedStyle(node).opacity)
            node = node.parentElement
          }
          return effective
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0.5)

  // The wording is the licence condition and must stay exact.
  await expect(credit.first()).toHaveText(/ESO\/S\. Brunier/)
})
