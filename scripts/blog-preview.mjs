/**
 * The blog preview: a photograph of the built `/blog`, for the city's blog display.
 *
 * The display's panel wears the blog page during the approach, and this writes the
 * only representation of it that carries real content. Its other route is a NEUTRAL
 * PLATE — paper and a header bar, no copy — which exists precisely so that a build
 * without a capture degrades to something that cannot be out of date rather than to
 * a stale picture of last month's front page. See `blogDisplay/pageImage.ts`.
 *
 * ## The contract this script owes the build
 *
 * **A failure here must never fail a build.** Every path out of `main()` is exit 0.
 * If Playwright is not installed, if Chromium was never provisioned, if the preview
 * server does not come up, if the page never settles, if the encoder hands back the
 * wrong format — this warns, writes nothing, and the display falls back to a route
 * that was already known to work. There is no state of this world in which a broken
 * screenshot pipeline stops a deploy or blanks the panel.
 *
 * That is what earns a browser step a place in `build` at all, and it is why this
 * file has no `process.exit(1)` in it.
 *
 * ## Why nothing stale can survive
 *
 * A screenshot that no longer matches the content is worse than no screenshot: it is
 * confidently wrong, and it looks fine. Three things make staleness impossible
 * rather than merely unlikely:
 *
 *   1. `vite build` runs FIRST and `emptyOutDir` clears `dist/` as it starts, so a
 *      previous build's assets are already gone before this script opens.
 *   2. This script deletes `dist/generated/` before doing anything else. From that
 *      moment the build has no valid screenshot, and only a completed run gives it
 *      one back.
 *   3. Captures land in a temp directory and are promoted only if EVERY viewport
 *      succeeded, with the manifest written last.
 *
 * Point 2 is redundant after point 1 and is here on purpose: it makes the script
 * correct when run on its own against an existing `dist/`, which is how anyone
 * iterating on it will actually run it.
 *
 * ## Ordering, and why there is no second build
 *
 *   vite build  ->  vite preview  ->  capture  ->  write into dist/generated/
 *
 * The assets are added to a FINISHED `dist/`, so Vite never runs again. Capturing
 * against `vite dev` instead would be cheaper and would photograph an artifact
 * nobody deploys — different module graph, no minification, different asset URLs.
 * The point of a build-time screenshot is that it is a picture of the build.
 *
 * ## What this port changed from the lab's version of the same script
 *
 * The lab's `/blog` was a string module that set a readiness flag under `?capture=1`.
 * This one is the real React blog, and adding a capture-only query parameter to a
 * visitor-facing route to serve a build tool is not a trade worth making — so
 * readiness is established from OUT HERE, from signals the page already publishes.
 * Two of them did not exist over there and both silently produce a wrong picture:
 * the consent plate, and the header's 3D mark. See `settle()`.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * The viewports captured.
 *
 * Three rather than one because the blog REFLOWS — `blog.css` and `siteHeader.css`
 * both carry breakpoints that turn the hero row into a column and shrink the header
 * control. A desktop-only capture cover-fitted onto a phone would show a cropped
 * desktop layout: visibly not the page the visitor is about to land on. Three
 * captures span aspect 0.46 to 1.59 and cost one browser launch between them.
 */
const VIEWPORTS = [
  { width: 1400, height: 880 },
  { width: 820, height: 1000 },
  { width: 390, height: 844 },
];

/**
 * Matches `pageImage.ts`'s `TEXTURE_SCALE`.
 *
 * The two routes have to hand the display a canvas of the same dimensions for a
 * given viewport, or switching between them would change the texture's resolution
 * and, with it, how the panel reads at the end of the approach.
 */
const DEVICE_SCALE_FACTOR = 2;

/**
 * Lossy, and the numbers the lab measured to choose it — 1400x880 at scale 2:
 *
 *   quality 82     66 kB
 *   quality 90     79 kB
 *   quality 100   277 kB   (byte-for-byte what lossless produces)
 *   lossless      277 kB
 *   PNG           172 kB
 *
 * So omitting `quality` is not the safe default it looks like: lossless WebP on a
 * text page is 1.6x the size of the PNG it was meant to improve on.
 *
 * 90 rather than 82 because of ONE element. WebP lossy subsamples chroma, and the
 * damage landed exactly where that predicts: flat paper and body text sat inside the
 * noise floor while the saturated accent control came back at a channel delta of 73.
 */
const WEBP_QUALITY = 90;

/** How long to wait for the page to settle before giving up on the whole run. */
const SETTLE_TIMEOUT_MS = 15_000;

/**
 * How long to wait for the header's 3D mark, specifically, before going without it.
 *
 * Separate from `SETTLE_TIMEOUT_MS` and much shorter, because this one is ALLOWED to
 * expire. `BlogHeaderLogo` paints an SVG first and swaps to a live canvas when the
 * model compiles, so both are real states of the real page; a capture in either is
 * honest. What is not acceptable is a race — photographing whichever happened to
 * win — so the wait is explicit and its expiry is reported.
 */
const MARK_TIMEOUT_MS = 4_000;

/** Not 4173: that is what `playwright.config.ts` runs the e2e suite against. */
const PORT = 4320;

/**
 * `127.0.0.1` rather than `localhost`, and it is the network guard that needs it.
 *
 * `localhost` resolves to both ::1 and 127.0.0.1, and which one a request carries in
 * its URL is not something this script controls. The guard compares origins exactly,
 * so an origin that can be spelled two ways is an origin that will intermittently
 * fail to match itself.
 */
const ORIGIN = `http://127.0.0.1:${PORT}`;

const DIST_DIR = 'dist';
const OUT_DIR = join(DIST_DIR, 'generated');
const TMP_DIR = join(DIST_DIR, '.blog-preview-tmp');
const MANIFEST_PATH = join(OUT_DIR, 'blog-preview.json');

/** The URL the app fetches. Must agree with `pageImage.ts`'s `MANIFEST_URL`. */
const PUBLIC_PREFIX = '/generated';

/**
 * Consent, seeded so the first-visit plate is not what gets photographed.
 *
 * The same record `playwright.config.ts` seeds into its `storageState`, and for the
 * same reason: `ConsentBanner` mounts on a document that has never answered, and it
 * would sit across the bottom of every capture. Analytics stays false — this is a
 * build tool declining to be asked, not a build tool consenting on anyone's behalf.
 */
const CONSENT_KEY = 'vertigo:consent';
const CONSENT_VALUE = '{"v":1,"analytics":false,"at":"2026-01-01T00:00:00.000Z"}';

/**
 * Non-network schemes the page may legitimately use.
 *
 * These largely bypass `context.route` interception anyway; naming them makes the
 * allowance deliberate rather than incidental, so nobody later reads their absence
 * as a decision.
 */
const ALLOWED_SCHEMES = new Set(['data:', 'blob:', 'about:']);

/**
 * The one external origin that is blocked WITHOUT invalidating the capture.
 *
 * The featured card's cover photo is a Sanity CDN image, and blocking it is the
 * right answer rather than a compromise. The app renders it lazily and without
 * `priority`, so the destination's FIRST PAINT — the frame the seam actually has to
 * match — shows the `#ececea` decode ground rather than the photograph. Capturing
 * the ground is capturing what the visitor arrives to; the photo fading in afterwards
 * reads as a page loading, not as a seam.
 *
 * It also keeps the capture hermetic: an artifact that depends on a CDN being up is
 * an artifact that differs between two builds of identical content.
 */
const EXPECTED_EXTERNAL = 'https://cdn.sanity.io';

/**
 * What `EXPECTED_EXTERNAL` is answered with. See the guard for why not an abort.
 *
 * The classic 1x1 transparent GIF, and it was checked by looking rather than by
 * trusting the string: the first pixel tried here was a base64 blob that decodes
 * to solid GREEN, which stretched across the whole featured card and looked, at a
 * glance, exactly like a cover photo that had loaded.
 */
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

const warn = (message, error) => {
  // One line, prefixed, and never an `error`: a missing screenshot is a degraded
  // build, not a broken one, and dressing it as an error trains people to ignore it.
  console.warn(`[blog-preview] ${message}`);
  if (error) console.warn(`[blog-preview]   ${String(error).split('\n')[0]}`);
  console.warn('[blog-preview] the blog display will wear its neutral plate');
};

/**
 * Is this actually a WebP?
 *
 * Playwright does NOT infer the encoding from the filename — `page.screenshot()`
 * without an explicit `type` writes a PNG no matter what the path says. Browsers
 * sniff content rather than trusting extensions, so the resulting `.webp` decodes
 * perfectly and the mistake is completely invisible; the only symptom is an asset
 * several times larger than it should be, which nobody is watching.
 *
 * Checking the RIFF magic turns that into a caught failure.
 */
const isWebp = (buffer) =>
  buffer.length > 12 &&
  buffer.toString('ascii', 0, 4) === 'RIFF' &&
  buffer.toString('ascii', 8, 12) === 'WEBP';

/**
 * Starts `vite preview` and resolves once it answers. Killed by the caller.
 *
 * `node node_modules/vite/bin/vite.js`, NOT `npx vite` through a shell.
 *
 * A shell-wrapped child is a shell that has a child, and `child.kill()` kills the
 * shell. On Windows that reliably orphans the server: the port stays held, the next
 * run finds something answering on it, and the capture is silently taken from a
 * previous build. `--strictPort` so a survivor fails loudly here instead of being
 * photographed.
 */
async function startPreview() {
  const child = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--port',
      String(PORT),
      '--strictPort',
      // `--host 127.0.0.1` is REQUIRED, not tidiness. `vite preview` otherwise binds
      // the name `localhost`, which on some machines resolves to ::1 only. The guard
      // below compares origins exactly, so the server has to be listening on the
      // same spelling the requests will carry.
      '--host',
      '127.0.0.1',
    ],
    { stdio: 'ignore' },
  );

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${ORIGIN}/blog`);
      if (response.ok) return child;
    } catch {
      // not up yet
    }
    await sleep(250);
  }

  child.kill();
  throw new Error(`vite preview did not answer on :${PORT}`);
}

/**
 * Default-deny every request that is not this preview server.
 *
 * The capture must be a picture of THIS BUILD, not of this build plus whatever the
 * internet served that minute. An analytics beacon, a font CDN, a tracking pixel —
 * any of them makes the artifact non-reproducible, and one that changes what is on
 * screen makes it wrong in a way a diff would struggle to explain.
 *
 * `parsed.origin === ORIGIN` is an exact origin comparison and not a `startsWith`,
 * which `http://127.0.0.1:4320.example.com` would satisfy.
 *
 * An unexpected blocked request does not merely get aborted — it INVALIDATES the
 * capture. The screenshot is one of two routes, so the bar for accepting one can be
 * high: if something unforeseen reached into the page, the right answer is to not
 * ship a picture of it. `EXPECTED_EXTERNAL` is the single documented exception.
 */
async function guardNetwork(context, blocked) {
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      blocked.push(url);
      await route.abort();
      return;
    }

    if (ALLOWED_SCHEMES.has(parsed.protocol)) {
      await route.continue();
      return;
    }
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin === ORIGIN) {
      await route.continue();
      return;
    }
    if (parsed.origin === EXPECTED_EXTERNAL) {
      // FULFILLED transparent, not aborted, and the difference is visible in the
      // artifact. A blocked `<img>` renders its ALT TEXT, so aborting put the
      // words "imagen1" across the featured card's decode ground — a caption no
      // visitor ever sees, painted onto the panel. A transparent pixel leaves the
      // `#ececea` ground exactly as the real page's first paint shows it.
      await route.fulfill({ contentType: 'image/gif', body: TRANSPARENT_GIF });
      return;
    }

    blocked.push(url);
    await route.abort();
  });
}

/**
 * Waits until the page is worth photographing, and says what it waited for.
 *
 * Four signals, in the order they can be true, and each of them is a way the capture
 * silently comes out wrong if it is skipped:
 *
 *   the blog itself     `<LazyBlog>` is a lazy chunk with no Suspense fallback, so a
 *                       screenshot taken on `load` can be of an empty document.
 *
 *   the fonts           Both faces load with `font-display: swap`, so there is a
 *                       window in which the page is fully laid out, fully painted and
 *                       wearing the FALLBACK stack. A screenshot taken then is a
 *                       picture of the wrong typeface, and nothing about it looks
 *                       like a failure.
 *
 *   the 3D mark         `BlogHeaderLogo` paints an SVG and swaps to a canvas when the
 *                       model compiles, marking `[data-gl="ready"]`. Both are real,
 *                       so this wait is allowed to expire — what is not allowed is
 *                       for which one gets photographed to be a race.
 *
 *   two frames          The first is scheduled before the style and layout work the
 *                       mutations above imply; the second is the earliest callback
 *                       that runs after that work has been committed.
 *
 * Returns whether the mark made it, for the log. Throws only on the first two, which
 * are the ones that mean the page never arrived at all.
 */
async function settle(page) {
  await page.waitForSelector('.blog-root', { timeout: SETTLE_TIMEOUT_MS });

  await page.evaluate(async () => {
    try {
      await document.fonts.ready;
    } catch {
      // Deliberately not fatal. A capture in the fallback face is wrong, but hanging
      // the build until a timeout is worse, and the face is visible in the artifact
      // to anyone who looks at it.
    }
  });

  let markReady = true;
  try {
    await page.waitForSelector('.blog-topbar__stage[data-gl="ready"]', {
      timeout: MARK_TIMEOUT_MS,
    });
  } catch {
    markReady = false;
  }

  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)));
      }),
  );

  return markReady;
}

/** One viewport, captured into `TMP_DIR`. Throws to abandon the whole attempt. */
async function captureViewport(browser, { width, height }) {
  // Viewport at the CONTEXT, not via `page.setViewportSize`. Setting it after the
  // page exists means the first layout happens at the default size and is then
  // reflowed, which can leave transitions mid-flight and lazy work already resolved
  // against the wrong width.
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    storageState: {
      cookies: [],
      origins: [{ origin: ORIGIN, localStorage: [{ name: CONSENT_KEY, value: CONSENT_VALUE }] }],
    },
  });

  const blocked = [];
  try {
    await guardNetwork(context, blocked);

    const page = await context.newPage();
    await page.goto(`${ORIGIN}/blog`, { waitUntil: 'load' });

    const markReady = await settle(page);

    const buffer = await page.screenshot({
      // Explicit, always. See `isWebp`.
      type: 'webp',
      quality: WEBP_QUALITY,
      animations: 'disabled',
      caret: 'hide',
    });

    if (blocked.length > 0) {
      throw new Error(`the page requested ${blocked.length} unexpected resource(s): ${blocked[0]}`);
    }
    if (!isWebp(buffer)) {
      throw new Error('the screenshot is not WebP; `type` was probably dropped');
    }

    // Hashed from the BYTES, so the name changes if and only if the pixels do. That
    // is what makes `immutable` caching honest, and what makes two builds of
    // unchanged content produce an identical `dist/`.
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 8);
    const file = `blog-preview-${width}x${height}-${hash}.webp`;
    writeFileSync(join(TMP_DIR, file), buffer);

    return { src: `${PUBLIC_PREFIX}/${file}`, width, height, bytes: buffer.length, file, markReady };
  } finally {
    await context.close();
  }
}

/**
 * Reads a launch failure and says the useful thing about it.
 *
 * Having Playwright in `devDependencies` says nothing about whether the browser
 * binary exists — they are separate installs, and a missing browser is by far the
 * most likely way this fails on a machine that has never run it.
 */
function launchAdvice(error) {
  const text = String(error);
  if (text.includes("Executable doesn't exist") || text.includes('playwright install')) {
    return "Chromium is not provisioned for channel 'chromium' — run `npx playwright install chromium`";
  }
  return 'Chromium could not be launched';
}

async function main() {
  const started = Date.now();

  // 1. INVALIDATE, before anything can go wrong. From here the build has no valid
  //    screenshot, and only a completed run below gives it one back.
  //
  //    The whole directory, not just the manifest. Deleting the pointer alone would
  //    already be correct — nothing can reach an asset the manifest does not name —
  //    but it leaves orphaned .webp files behind on a standalone run, and then "did
  //    this build produce a screenshot?" stops being answerable by looking at the
  //    directory. Content-hashed names mean a re-run rewrites identical files
  //    anyway, so there is nothing to preserve.
  rmSync(OUT_DIR, { recursive: true, force: true });
  rmSync(TMP_DIR, { recursive: true, force: true });

  if (!existsSync(DIST_DIR)) {
    warn('there is no dist/ to capture — run `vite build` first');
    return;
  }

  // 2. Is Playwright even here?
  let chromium;
  try {
    ({ chromium } = await import('@playwright/test'));
  } catch (error) {
    warn('playwright is not installed', error);
    return;
  }

  // 3. PREFLIGHT IS THE LAUNCH.
  //
  //    Not a path probe. `chromium.executablePath()` takes no arguments, so it
  //    cannot be told about a channel and reports the DEFAULT bundled build's path,
  //    while `launch({ channel: 'chromium' })` resolves a different browser
  //    entirely. Probing it would validate a browser we then do not use.
  //
  //    `channel: 'chromium'` and never the default headless shell: measured in the
  //    lab, the shell disagreed with the DOM by 26,412 pixels on the same page where
  //    real Chromium disagreed by 153. It does not rasterise DOM text and SVG text
  //    alike, so a shot from it is a shot of a renderer no visitor has.
  let browser;
  const launchedAt = Date.now();
  try {
    browser = await chromium.launch({ channel: 'chromium' });
  } catch (error) {
    warn(launchAdvice(error), error);
    return;
  }
  const launchMs = Date.now() - launchedAt;

  let server = null;
  try {
    const serverAt = Date.now();
    server = await startPreview();
    const serverMs = Date.now() - serverAt;

    mkdirSync(TMP_DIR, { recursive: true });

    const captureAt = Date.now();
    const captured = [];
    for (const viewport of VIEWPORTS) {
      captured.push(await captureViewport(browser, viewport));
    }
    const captureMs = Date.now() - captureAt;

    // 4. PROMOTE. Every viewport succeeded or we are not here — a partial manifest
    //    is harder to reason about than a clean fall back to a route already known
    //    to work, and the manifest goes last so it never points at a file that is
    //    still being written.
    mkdirSync(OUT_DIR, { recursive: true });
    for (const variant of captured) {
      renameSync(join(TMP_DIR, variant.file), join(OUT_DIR, variant.file));
    }
    writeFileSync(
      MANIFEST_PATH,
      // No timestamp, deliberately: unchanged content must produce a byte-identical
      // manifest, or every build looks like a change to whatever reads the diff.
      `${JSON.stringify(
        { variants: captured.map(({ src, width, height }) => ({ src, width, height })) },
        null,
        2,
      )}\n`,
    );

    const totalMs = Date.now() - started;
    console.log(`[blog-preview] ${captured.length} variants -> ${OUT_DIR}`);
    for (const variant of captured) {
      const mark = variant.markReady ? '3D mark' : 'SVG mark (the model did not compile in time)';
      console.log(
        `[blog-preview]   ${variant.file}  ${(variant.bytes / 1024).toFixed(1)} kB  ${mark}`,
      );
    }
    console.log(
      `[blog-preview] launch ${launchMs} ms · preview ${serverMs} ms · capture ${captureMs} ms · total ${totalMs} ms`,
    );
  } catch (error) {
    warn('the capture did not complete', error);
  } finally {
    server?.kill();
    await browser.close();
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
}

// No `.catch(() => process.exit(1))`. Read the contract at the top of this file
// before adding one: a screenshot failure must never block a deployment.
await main();
