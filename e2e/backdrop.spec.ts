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
      mask: [page.locator('.audit-section')],
    })
  })

  test('narrow viewport uses the small panorama without banding', async ({ page }) => {
    // Below 767px a 2048-wide pair is served instead. Same image, different
    // file — and the smaller one is the more likely to show compression
    // blocking, since it is magnified further.
    await page.setViewportSize({ width: 420, height: 900 })
    await bootAndSettle(page)
    await expect(page).toHaveScreenshot('backdrop-narrow.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      mask: [page.locator('.audit-section')],
    })
  })
})

test('the site shows no third-party attribution', async ({ page }) => {
  // The inverse of the test that used to stand here, and it is a CLIENT
  // REQUIREMENT rather than a licence one: the site carries no third-party
  // credit anywhere a visitor can reach.
  //
  // This used to assert that "ESO/S. Brunier" was visible and readable, because
  // the sky panorama was CC BY 4.0 and the credit was the licence condition.
  // The panorama was replaced with a public domain image precisely so that
  // obligation would go away — see CREDITS.md. Keeping the assertion pointed the
  // other way is what stops a future asset swap from quietly reintroducing an
  // attribution nobody notices until the client does.
  //
  // The audit panel is checked specifically because that is where the credit
  // lived. It is behind a click — `.audit-overlay` is hidden until the
  // lead-capture panel opens — so a check at rest would pass vacuously.
  await bootAndSettle(page)

  const trigger = page.getByRole('button', { name: 'Auditoría' })
  await expect(trigger).toBeEnabled({ timeout: 30_000 })
  await trigger.click()

  // Wait for the panel's reveal to finish before concluding anything is absent.
  // The last group (`.audit-group--3`) transitions opacity over 380ms on a
  // 560ms delay, so an assertion fired immediately would pass against a panel
  // that had not rendered yet — proving nothing.
  await expect(page.locator('.audit-overlay')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible({ timeout: 15_000 })

  // The old credit, by name.
  await expect(page.locator('text=/ESO\\s*\\/\\s*S\\.\\s*Brunier/i')).toHaveCount(0)
  await expect(page.locator('.audit-credit')).toHaveCount(0)

  // And the general shape of one, so a DIFFERENT credit cannot slip in.
  // Narrowed from matching any ©: the client rule this guards is about
  // THIRD-PARTY attribution, and the site footer now carries the brand's own
  // © mark (src/content/site.ts), which is not a credit to anyone else.
  await expect(page.locator('text=/CC BY|Creative Commons/i')).toHaveCount(0)
  await expect(page.locator('a[href*="eso.org"]')).toHaveCount(0)
})
