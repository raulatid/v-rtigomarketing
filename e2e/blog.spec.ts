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
 * Clicks the blog's display where it actually is.
 *
 * The position comes from the scene rather than from a constant in this file: it
 * depends on the camera pose and the GLB, and hardcoding it would turn a test of
 * the blog's behaviour into a test of the city's layout that breaks on the next
 * re-export.
 *
 * Since plan 022 this is the ONLY way into the blog from the city. The tap on the
 * `blog_edificios` cluster that used to sit under this panel was removed with
 * `BlogBuilding.ts`, rather than left beside it — two ways in over one part of
 * the scene, one instant and one with a three-second flight, is a coin toss
 * decided by which mesh a ray reaches first.
 */
async function clickBlogDisplay(page: Page, drag = 0): Promise<void> {
  const point = await page.evaluate(() => {
    const probe = (window as unknown as Record<string, unknown>).__vertigoBlogDisplayPoint
    return typeof probe === 'function'
      ? (probe as () => { x: number; y: number } | null)()
      : null
  })
  expect(point, 'the blog display must be on screen for the blog to be reachable').not.toBeNull()
  await page.mouse.move(point!.x, point!.y)
  await page.mouse.down()
  if (drag > 0) await page.mouse.move(point!.x + drag, point!.y, { steps: 8 })
  await page.mouse.up()
}

/**
 * How long to allow for the approach.
 *
 * `BLOG_TRANSITION.duration` is three seconds of camera move before the route
 * changes at all, and this runs on a software renderer where the frame loop that
 * advances the clock is the slowest thing in the process.
 */
const APPROACH_TIMEOUT_MS = 20_000

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
    // 28 notches: the whole journey is the 1200px band plus the 600px push
    // (DECISIONS §44) — 14 was sized for the journey before it doubled.
    await wheelStream(page, 120, 28)
    await expect.poll(() => inMurcia(page), { timeout: 10_000 }).toBe(true)

    // Stamps that a page load would destroy. `__e2eLoadId` lives in module
    // scope; the data attributes live on nodes a rebuild would replace.
    await page.evaluate(() => {
      ;(window as unknown as Record<string, unknown>).__e2eLoadId = Math.random()
      document.querySelector('.murcia-ui')?.setAttribute('data-e2e-probe', 'murcia')
      document.querySelector('.scene-canvas canvas')?.setAttribute('data-e2e-probe', 'canvas')
    })
    const scrollRestorationBefore = await page.evaluate(() => history.scrollRestoration)
    const bodyFontBefore = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
    const before = await gl(page)
    expect(before, 'the DEBUG_TOOLS_ENABLED gl probe must be present in a preview build').not.toBeNull()
    // A real scene, so the equalities below are not comparing zero to zero.
    expect(before!.geometries).toBeGreaterThan(0)

    // ── The old cluster tap is gone, not merely quiet ──
    // Its debug seam went with its listener. If this ever comes back, so has a
    // second way into the blog that skips the transition entirely.
    expect(
      await page.evaluate(
        () => typeof (window as unknown as Record<string, unknown>).__vertigoBlogBuildingPoint,
      ),
      'the cluster tap was removed with plan 022; its seam must go with it',
    ).toBe('undefined')

    // ── A drag across the display is not a click ──
    // Murcia is a free pan, so a drag that begins and ends over the panel is the
    // COMMON case. Waited out past the whole approach rather than for a moment:
    // the route only changes at the END, so a short wait would pass even if the
    // flight had started.
    await clickBlogDisplay(page, 120)
    await page.waitForTimeout(4500)
    expect(await page.evaluate(() => location.pathname)).toBe('/')

    // ── Into the blog, through the display above the city ──
    await clickBlogDisplay(page)
    await expect
      .poll(() => page.evaluate(() => location.pathname), { timeout: APPROACH_TIMEOUT_MS })
      .toBe('/blog')
    await page.waitForSelector('.blog-root')

    // The cover the approach raised is gone once the blog has painted. It sits
    // BELOW `.blog-root`, so a survivor would not hide the page — but it would be
    // a full-screen element nothing owns, and its DOM failsafe firing later is
    // reported rather than silent.
    await expect(page.locator('img[data-blog-overlay="handoff"]')).toHaveCSS(
      'visibility',
      'hidden',
      { timeout: 10_000 },
    )

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

    // ── The warm blog gets the same 3D mark the cold one does ──
    //
    // "Both hosts, identically" is the whole reason the header logo lives in
    // BlogRoute rather than in either entry, and it is invisible to the cold
    // test. It also pins the claim the ADR amendment makes about cost: a warm
    // document holds TWO contexts, the scene's frozen one and the header's, and
    // the assertions above have just proven the first is still frozen with the
    // second running beside it.
    await expect(page.locator('.blog-topbar__mark canvas')).toHaveCount(1, { timeout: 20_000 })
    expect(
      await page.locator('canvas').count(),
      'a warm blog has exactly two canvases: the suspended scene, and the mark',
    ).toBe(2)

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
      canvasProbe: document.querySelector('.scene-canvas canvas')?.getAttribute('data-e2e-probe') ?? null,
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

  /**
   * The way back out, through the gesture the blog's own control does not own.
   *
   * `handleExitBlog` is one of several ways the route falls back to the scene, and
   * the return flight is hung off the ROUTE rather than off that callback for
   * exactly this case: the browser's Back button goes through `popstate`, never
   * through the control, so hooking the control alone would leave Back landing the
   * visitor nose-against the display it flew them into.
   */
  test('the browser Back button flies back out, not just the blog control', async ({ page }) => {
    const errors = collect(page)
    await interceptImages(page)
    await page.goto('/')
    await reachSite(page)

    // 28 notches: the whole journey is the 1200px band plus the 600px push
    // (DECISIONS §44) — 14 was sized for the journey before it doubled.
    await wheelStream(page, 120, 28)
    await expect.poll(() => inMurcia(page), { timeout: 10_000 }).toBe(true)

    await clickBlogDisplay(page)
    await expect
      .poll(() => page.evaluate(() => location.pathname), { timeout: APPROACH_TIMEOUT_MS })
      .toBe('/blog')
    await page.waitForSelector('.blog-root')

    // ── A resize while the reader is on the page ──
    // The panel's shape and the page laid out for it are both stale now, and the
    // scene is frozen — so neither may be rebuilt here. What this asserts is the
    // outcome of the queue: whatever the return does with it, nothing is allocated
    // while `frameloop` is `never`.
    const suspendedA = await gl(page)
    await page.setViewportSize({ width: 1100, height: 900 })
    await page.waitForTimeout(600)
    const suspendedB = await gl(page)
    expect(suspendedB!.frame, 'a resize must not restart the frame loop').toBe(suspendedA!.frame)
    expect(
      suspendedB!.geometries,
      'a queued resize must not rebuild the panel while the scene is suspended',
    ).toBe(suspendedA!.geometries)
    expect(suspendedB!.textures).toBe(suspendedA!.textures)

    // ── Back, by the browser rather than by the page ──
    await page.goBack()
    await expect.poll(() => sceneHidden(page), { timeout: 15_000 }).toBe(false)
    await expect(page.locator('.blog-root')).toHaveCount(0)
    expect(await inMurcia(page)).toBe(true)

    // The return is covered while it runs and uncovered when it lands. Polled to
    // the END STATE rather than sampled mid-flight: how far along the flight is at
    // any given wall-clock moment is a property of the software renderer's frame
    // rate, not of this feature.
    await expect(page.locator('img[data-blog-overlay="handoff"]')).toHaveCSS(
      'visibility',
      'hidden',
      { timeout: 20_000 },
    )

    // Nothing reloaded, and the city was never rebuilt.
    const after = await page.evaluate(() => ({
      navigations: performance.getEntriesByType('navigation').length,
      builds: (window as unknown as Record<string, number>).__vertigoMurciaBuilds ?? 0,
    }))
    expect(after.navigations).toBe(1)
    expect(after.builds).toBe(1)

    expect(errors).toEqual([])
  })

  test('a cold /blog pays for the mark and nothing else', async ({ page }) => {
    const errors = collect(page)
    await interceptImages(page)

    const requested: string[] = []
    page.on('request', (request) => requested.push(request.url()))

    await page.goto('/blog')
    await page.waitForSelector('.blog-card')

    expect(
      await page.evaluate(() => typeof (window as unknown as Record<string, unknown>).__vertigoIntro),
      'the intro drawing must never execute on a reading page',
    ).toBe('undefined')

    // ── Then the mark arrives, and it is the ONLY thing that does ──
    //
    // The old assertion here was `canvas count === 0` and a blanket ban on
    // anything 3D. The blog's header draws the real logo now (adr/013, amended
    // 2026-09-04), so the ban narrowed from "3D" to "the 3D APPLICATION" — and
    // it is stated in both directions, because a ban alone can be widened later
    // without anyone noticing what walked in behind it.
    await expect(page.locator('.blog-topbar__mark canvas')).toHaveCount(1, { timeout: 20_000 })
    expect(
      await page.locator('canvas').count(),
      'the mark is the only WebGL surface a reading page may have',
    ).toBe(1)

    const scene = requested.filter((url) =>
      /SceneCanvas|MurciaExperience|city-prototype|\/earth\/|sky-panorama|\/audio\/|\.mp3/.test(url),
    )
    expect(scene, 'a cold blog must request nothing belonging to the 3D application').toEqual([])

    // The positive half: every heavy request is one the mark itself needs.
    const heavy = requested.filter((url) => /three-|\.glb$|\.ktx2$|\/draco\/|basis/.test(url))
    const allowed = /\/three-[^/]*\.js$|\/models\/vertigo-isotipo-3d\.glb$|\/textures\/logoBake\.ktx2$|\/draco\/|\/basis/
    expect(
      heavy.filter((url) => !allowed.test(url)),
      'only the corner logo\'s own dependencies may be fetched on a reading page',
    ).toEqual([])
    expect(
      heavy.some((url) => url.endsWith('/models/vertigo-isotipo-3d.glb')),
      'and the mark must actually be the 3D one, or the assertions above pass on an SVG',
    ).toBe(true)

    // ── Deferred, stated as ORDER, which is the only form a network log can
    //    actually prove ──
    //
    // Not "nothing 3D has been requested yet", which was the first attempt and
    // was a race: `.blog-card` is in the prerendered shell, so it resolves in the
    // same idle period the mark's own callback can fire in. What the promise
    // really is — the reader's bytes go to the text first — compares positions
    // in the log instead. The mark waits for `load`, so everything the article
    // itself asked for is already behind it.
    const firstIndexOf = (re: RegExp) => requested.findIndex((url) => re.test(url))
    const firstThreeD = firstIndexOf(/three-|\.glb$|\.ktx2$|\/draco\/|basis/)
    expect(firstThreeD).toBeGreaterThan(-1)
    expect(
      firstIndexOf(/\/assets\/BlogRoute-/),
      'the blog UI must be requested before anything three-dimensional',
    ).toBeLessThan(firstThreeD)
    expect(
      firstIndexOf(/cdn\.sanity\.io/),
      "the article's own imagery must be requested before the mark it decorates",
    ).toBeLessThan(firstThreeD)

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
