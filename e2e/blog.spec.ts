import { test, expect, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * The blog, and the two things about it that only a browser can prove.
 *
 * ## Deliberately two tests, not a suite
 *
 * Almost all of this feature is pure logic and is unit-tested: route parsing and
 * `?tema=` round-tripping, the `indexDelta` history arithmetic, the topic filter
 * and its accent folding, the Portable Text serializer's seven block kinds, the
 * Sanity image URLs, reading time, and the emitted-shell verifier. None of those
 * needs a browser, and running them in one would be slower and vaguer.
 *
 * What is left is exactly what a browser is for: whether the 3D scene survives a
 * round trip through the blog, and whether a cold `/blog` really costs nothing.
 * Both are single journeys with several assertions along the way, because the
 * setup — reach `site`, gesture into Murcia, tap a building — is the expensive
 * part and re-running it per assertion is the waste.
 *
 * ## Images are intercepted
 *
 * The suite must not depend on `cdn.sanity.io` being reachable. Fulfilling from
 * a fixture keeps it hermetic and offline-capable, and makes the assertion
 * sharper: what is checked is the URL this code generated, not that some image
 * somewhere loaded.
 */

/** A 2x1 grey PNG. Small enough to inline, real enough to decode. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEklEQVR4nGP8//8/AzJgYkAFRPMBz2wDGgBjNhAAAAAASUVORK5CYII=',
  'base64',
)

async function interceptImages(page: Page) {
  await page.route('https://cdn.sanity.io/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  )
}

function collect(page: Page) {
  const errors: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  return errors
}

/** True once Murcia is the experience being drawn. Its UI host is the tell. */
async function inMurcia(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const host = document.querySelector('.murcia-ui')
    return host ? getComputedStyle(host).display !== 'none' : false
  })
}

/**
 * Whether the scene wrapper is hidden behind the blog.
 *
 * NOT `inMurcia`, and the difference IS the design: the scene is hidden with
 * `visibility`, never `display: none` — a collapsed box would make R3F measure
 * 0x0 and reallocate the drawing buffer. So Murcia stays the active experience
 * for the whole time the blog is open and `.murcia-ui` keeps its `display`.
 * What changes is the wrapper.
 */
async function sceneHidden(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.querySelector('.app__scene')?.getAttribute('data-hidden') === 'true',
  )
}

async function reachSite(page: Page) {
  await page.waitForSelector('.audit-trigger', { timeout: 75_000 })
  await page.waitForTimeout(400)
}

/**
 * A wheel stream paced from inside the page — see the note in
 * `navigation.spec.ts` on why these are dispatched rather than driven through
 * the mouse.
 */
async function wheelStream(page: Page, deltaY: number, count: number, gapMs = 16) {
  await page.evaluate(
    ([dy, n, gap]) =>
      new Promise<void>((resolve) => {
        let sent = 0
        const tick = () => {
          window.dispatchEvent(
            new WheelEvent('wheel', { deltaY: dy, deltaMode: 0, bubbles: true, cancelable: true }),
          )
          if (++sent >= n) return resolve()
          setTimeout(tick, gap)
        }
        tick()
      }),
    [deltaY, count, gapMs] as const,
  )
}

/** The GL probe SceneCanvas installs under DEBUG_TOOLS_ENABLED. */
async function gl(page: Page) {
  return page.evaluate(() => {
    const probe = (window as unknown as Record<string, unknown>).__vertigoGl
    return typeof probe === 'function'
      ? (probe as () => { geometries: number; textures: number; frame: number })()
      : null
  })
}

/**
 * Taps the blog building where it actually is.
 *
 * The position comes from the scene rather than from a constant in this file:
 * it depends on the camera pose and the GLB, and hardcoding it would turn a test
 * of the blog's behaviour into a test of the city's layout that breaks on the
 * next re-export.
 */
async function tapBlogBuilding(page: Page, drag = 0): Promise<void> {
  const point = await page.evaluate(() => {
    const probe = (window as unknown as Record<string, unknown>).__vertigoBlogBuildingPoint
    return typeof probe === 'function'
      ? (probe as () => { x: number; y: number } | null)()
      : null
  })
  expect(point, 'the blog building must be on screen for the CTA to be tappable').not.toBeNull()
  await page.mouse.move(point!.x, point!.y)
  await page.mouse.down()
  if (drag > 0) await page.mouse.move(point!.x + drag, point!.y, { steps: 8 })
  await page.mouse.up()
}

test.describe('the blog', () => {
  // The longest journey in the suite: a full boot, a gesture into Murcia, a tap
  // into the blog, an article, and two presses back out. The default 90s is the
  // budget for a single interaction, and `reachSite` alone allows 75s of it on a
  // software renderer.
  test.setTimeout(240_000)

  test('a warm round trip freezes the scene and never rebuilds it', async ({ page }) => {
    const errors = collect(page)
    await interceptImages(page)
    await page.goto('/')
    await reachSite(page)

    // Into Murcia, the way a visitor gets there.
    await wheelStream(page, 120, 14)
    await expect.poll(() => inMurcia(page), { timeout: 10_000 }).toBe(true)

    // Stamps that a page load would destroy. `__e2eLoadId` lives in module
    // scope; the data attributes live on nodes a rebuild would replace.
    await page.evaluate(() => {
      ;(window as unknown as Record<string, unknown>).__e2eLoadId = Math.random()
      document.querySelector('.murcia-ui')?.setAttribute('data-e2e-probe', 'murcia')
      document.querySelector('canvas')?.setAttribute('data-e2e-probe', 'canvas')
    })
    const scrollRestorationBefore = await page.evaluate(() => history.scrollRestoration)
    const bodyFontBefore = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
    const before = await gl(page)
    expect(before, 'the DEBUG_TOOLS_ENABLED gl probe must be present in a preview build').not.toBeNull()
    // A real scene, so the equalities below are not comparing zero to zero.
    expect(before!.geometries).toBeGreaterThan(0)

    // ── A drag across the building is not a tap ──
    // Same press-measured guard the district uses: the release of a drag across
    // the city must not be read as a choice about whatever it ends over.
    await tapBlogBuilding(page, 120)
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => location.pathname)).toBe('/')

    // ── Into the blog, through the building in the city ──
    await tapBlogBuilding(page)
    await expect.poll(() => page.evaluate(() => location.pathname), { timeout: 10_000 }).toBe('/blog')
    await page.waitForSelector('.blog-root')

    // ── The scene is frozen, not merely hidden ──
    // The only assertion in the suite that watches the render loop, and the
    // whole reason the feature exists: a reader parked on an article must not
    // be paying for a rAF loop and a post-processing chain.
    const suspendedA = await gl(page)
    await page.waitForTimeout(1000)
    const suspendedB = await gl(page)
    expect(suspendedB!.frame, 'frameloop="never" must stop the render loop').toBe(suspendedA!.frame)

    // Nothing is allocated or freed while it sits there. Compared across the
    // SUSPENDED window rather than against the pre-blog snapshot: interacting
    // with the city legitimately allocates — a hover proxy, a highlight — so an
    // equality against `before` would be asserting that nothing happened before
    // the blog opened, which is neither true nor the property under test.
    expect(suspendedB!.geometries).toBe(suspendedA!.geometries)
    expect(suspendedB!.textures).toBe(suspendedA!.textures)

    // GSAP is quiescent, which is why nothing needed pausing. If this ever
    // fails, pause THAT timeline on the blog edge — never the global one.
    const activeTweens = await page.evaluate(() => {
      const g = (window as unknown as { gsap?: { globalTimeline: { getChildren: (a: boolean, b: boolean, c: boolean) => { isActive: () => boolean }[] } } }).gsap
      if (!g) return 0
      return g.globalTimeline.getChildren(true, true, false).filter((t) => t.isActive()).length
    })
    expect(activeTweens).toBe(0)

    // ── An article, then back to the index, then back to the scene ──
    await page.locator('.blog-card').first().click()
    await expect.poll(() => page.evaluate(() => location.pathname)).toMatch(/^\/blog\/.+/)

    // First press: back to the INDEX, with the scene still suspended.
    await page.locator('.blog-back').click()
    await expect.poll(() => page.evaluate(() => location.pathname), { timeout: 5000 }).toBe('/blog')
    await expect(page.locator('.blog-root')).toBeVisible()
    expect(await sceneHidden(page), 'the scene stays hidden between blog pages').toBe(true)
    // Murcia is still the ACTIVE experience throughout — it was frozen, not
    // swapped away from. That is exactly what makes the return free.
    expect(await inMurcia(page)).toBe(true)

    // Second press: out to Murcia. THE REGRESSION THIS GUARDS — pushing a fresh
    // /blog entry instead of unwinding would land this press on the article.
    await page.locator('.blog-back').click()
    await expect.poll(() => sceneHidden(page), { timeout: 10_000 }).toBe(false)
    await expect(page.locator('.blog-root')).toHaveCount(0)
    expect(await inMurcia(page)).toBe(true)

    // ── Nothing was rebuilt, and nothing reloaded ──
    const after = await page.evaluate(() => ({
      loadId: typeof (window as unknown as Record<string, unknown>).__e2eLoadId,
      navigations: performance.getEntriesByType('navigation').length,
      murciaProbe: document.querySelector('.murcia-ui')?.getAttribute('data-e2e-probe') ?? null,
      canvasProbe: document.querySelector('canvas')?.getAttribute('data-e2e-probe') ?? null,
      builds: (window as unknown as Record<string, number>).__vertigoMurciaBuilds ?? 0,
      scrollRestoration: history.scrollRestoration,
      bodyFont: getComputedStyle(document.body).fontFamily,
    }))

    expect(after.loadId, 'a reload would clear module scope').toBe('number')
    expect(after.navigations).toBe(1)
    expect(after.murciaProbe, 'a rebuilt Murcia layer would be a different node').toBe('murcia')
    expect(after.canvasProbe, 'a remounted Canvas would be a different node').toBe('canvas')
    expect(after.builds, 'the city must be built exactly once per document').toBe(1)

    // Borrowed, not claimed: leaving `manual` on would silently change scrolling
    // for the rest of the 3D session.
    expect(after.scrollRestoration).toBe(scrollRestorationBefore)

    // The blog's stylesheet is live in this document now. Its font families are
    // named for the blog precisely so registering them cannot restyle the site.
    expect(after.bodyFont).toBe(bodyFontBefore)

    // Nothing was disposed across the round trip. A teardown-and-rebuild could
    // in principle land on the same count, which is why this sits alongside the
    // DOM identity and build-counter assertions above rather than replacing them.
    expect((await gl(page))!.geometries).toBeGreaterThanOrEqual(suspendedA!.geometries)

    // And the loop is running again.
    const resumedA = await gl(page)
    await page.waitForTimeout(500)
    expect((await gl(page))!.frame).toBeGreaterThan(resumedA!.frame)

    expect(errors).toEqual([])
  })

  test('a cold /blog pays for no 3D at all', async ({ page }) => {
    const errors = collect(page)
    await interceptImages(page)

    const requested: string[] = []
    page.on('request', (request) => requested.push(request.url()))

    await page.goto('/blog')
    await page.waitForSelector('.blog-card')

    // Not merely "no canvas": the point of the second document is that none of
    // this is even on the page, as a fact about the module graph rather than a
    // set of guards that could regress one at a time.
    expect(await page.locator('canvas').count()).toBe(0)
    expect(
      await page.evaluate(() => typeof (window as unknown as Record<string, unknown>).__vertigoIntro),
      'the intro drawing must never execute on a reading page',
    ).toBe('undefined')

    const threeD = requested.filter((url) =>
      /three-|SceneCanvas|MurciaExperience|city-prototype|\/earth\/|\/draco\/|basis|\.glb|\.ktx2/.test(url),
    )
    expect(threeD, 'a cold blog must request nothing belonging to the 3D application').toEqual([])

    // Leaving a cold blog is a real navigation: there is no scene behind this
    // document to return to, so nothing is lost by loading one.
    await page.evaluate(() => {
      ;(window as unknown as Record<string, unknown>).__e2eLoadId = Math.random()
    })
    await page.locator('.blog-back').click()
    await expect.poll(() => page.evaluate(() => location.pathname), { timeout: 15_000 }).toBe('/')
    expect(
      await page.evaluate(() => typeof (window as unknown as Record<string, unknown>).__e2eLoadId),
      'exiting a cold blog must be a document navigation',
    ).toBe('undefined')

    expect(errors).toEqual([])
  })
})
