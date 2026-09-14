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
 * If Playwright is not installed, if Chromium was never provisioned, if the server
 * does not come up, if the page never settles, if the encoder hands back the
 * wrong format — this warns, writes nothing, and the display falls back to a route
 * that was already known to work. There is no state of this world in which a broken
 * screenshot pipeline stops a deploy or blanks the panel.
 *
 * That is what earns a browser step a place in `build` at all, and it is why this
 * file has no `process.exit(1)` in it.
 *
 * ## What the browser may touch (2026-09-14)
 *
 * Vercel's build machine never had Chromium, so production shipped the plate from
 * the day this landed. It now installs one — see `installChromium` — and a browser
 * running where every build secret sits in the environment is CONFINED rather than
 * trusted:
 *
 *   - it is served by a STATIC server inside this process: files from `dist/`, GET
 *     and HEAD only, never `/api`. Not `vite preview`, which evaluates
 *     `vite.config.ts` and mounts the real form handler with `process.env`;
 *   - every request a page makes is routed before the page exists — this origin's
 *     files fetched with redirects refused, or nothing (`hardenContext`);
 *   - the browser gets an allowlisted environment, its sandbox, and two separate
 *     deadlines, one for installing it and one for the capture, that CLOSE it
 *     rather than wait on it.
 *
 * Routing is DevTools-protocol interception, not a firewall: DNS lookups,
 * speculative preconnects and the browser's own background traffic are outside it.
 * What it does cover, and what was tested, is recorded in DECISIONS §42.
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
 *      succeeded, with the manifest written last — and never after the capture
 *      deadline has fired.
 *
 * Point 2 is redundant after point 1 and is here on purpose: it makes the script
 * correct when run on its own against an existing `dist/`, which is how anyone
 * iterating on it will actually run it.
 *
 * ## Ordering, and why there is no second build
 *
 *   vite build  ->  static server on dist/  ->  capture  ->  write into dist/generated/
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
import {
  createReadStream,
  existsSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

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

/**
 * The bounds on everything else, each one a place the capture could otherwise wait
 * forever.
 *
 * The two DEADLINES are deliberately separate. Installing a browser is a download
 * whose speed is somebody else's network; photographing a local page is not, and
 * one clock for both would either starve the capture after a slow download or give
 * a hung capture three minutes it has no use for. Worst case the script ends within
 * one failed launch + install + capture + cleanup: ~30 + 180 + 120 + 15 s.
 */
const INSTALL_DEADLINE_MS = 180_000;
const CAPTURE_DEADLINE_MS = 120_000;
/** Chromium's own start. Playwright's default, stated so it is a decision. */
const LAUNCH_TIMEOUT_MS = 30_000;
/** Every Playwright call that takes a timeout: goto, waits, screenshot. */
const STEP_TIMEOUT_MS = 15_000;
/** One asset from the local server. It is on this machine; five seconds is generous. */
const ROUTE_FETCH_TIMEOUT_MS = 5_000;
/**
 * In-page waits. `page.evaluate` has NO timeout option of its own, so a promise the
 * page never settles would hold it until the capture deadline — these race a timer
 * inside the page instead.
 */
const IN_PAGE_WAIT_MS = 5_000;
/** Cleanup is bounded too: a close that never returns must not hold the build. */
const BROWSER_CLOSE_BOUND_MS = 10_000;
const SERVER_CLOSE_BOUND_MS = 2_000;

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
const HOST = '127.0.0.1';
const ORIGIN = `http://${HOST}:${PORT}`;

const DIST_DIR = 'dist';
const OUT_DIR = join(DIST_DIR, 'generated');
const TMP_DIR = join(DIST_DIR, '.blog-preview-tmp');
const MANIFEST_PATH = join(OUT_DIR, 'blog-preview.json');

/** The URL the app fetches. Must agree with `pageImage.ts`'s `MANIFEST_URL`. */
const PUBLIC_PREFIX = '/generated';

/**
 * The locked Playwright's own CLI, run with this Node rather than through `npx` or a
 * shell — so the browser it installs is exactly the revision the lockfile's
 * `@playwright/test` expects, and there is no shell between us and the process.
 */
const PLAYWRIGHT_CLI = join('node_modules', '@playwright', 'test', 'cli.js');

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
 * an artifact that differs between two builds of identical content. It is answered
 * HERE, from memory — no request to that host ever leaves the machine.
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

/**
 * What the static server will hand out, by extension. Anything else is a 404.
 *
 * A fixed map rather than a guess: module scripts are refused by the browser unless
 * they arrive as JavaScript, and an unknown extension is a file this page has no
 * business loading.
 */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.ktx2': 'image/ktx2',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
};

/**
 * What each subprocess may see of this one's environment.
 *
 * Node hands a child the WHOLE of `process.env` unless told otherwise, and on Vercel
 * that is every build secret — the CMS token, the mail key, the deployment's own
 * credentials. Chromium needs a path, a home, a temp dir and a locale; the installer
 * needs those plus Playwright's cache location and any proxy the network requires.
 * Nothing else goes. The Windows names are what a local run needs to start a
 * process at all.
 */
const WINDOWS_ENV = ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'LOCALAPPDATA', 'USERPROFILE'];
const CHROMIUM_ENV = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', ...WINDOWS_ENV];
const CHROMIUM_ENV_PREFIXES = ['FONTCONFIG_'];
const INSTALL_ENV = [
  'PATH',
  'HOME',
  'TMPDIR',
  'PLAYWRIGHT_BROWSERS_PATH',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
  ...WINDOWS_ENV,
];

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

/** Only the named variables, matched case-insensitively (Windows spells them freely). */
export function pickEnv(source, names, prefixes = []) {
  const wanted = new Set(names.map((name) => name.toUpperCase()));
  const picked = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const upper = key.toUpperCase();
    if (wanted.has(upper) || prefixes.some((prefix) => upper.startsWith(prefix))) {
      picked[key] = value;
    }
  }
  return picked;
}

export const chromiumEnv = (source = process.env) =>
  pickEnv(source, CHROMIUM_ENV, CHROMIUM_ENV_PREFIXES);

export const installEnv = (source = process.env) => pickEnv(source, INSTALL_ENV);

/**
 * `/api` in any spelling, including percent-encoded and doubled slashes.
 *
 * Refused at BOTH layers — the browser's route and the server — because in
 * production that prefix is the form handlers, and nothing about a photograph of a
 * blog should ever reach one. Undecodable paths count as `/api`: a path this cannot
 * read is not one it will vouch for.
 */
export function isApiPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  const normal = decoded.toLowerCase().replace(/[\\/]+/g, '/');
  return normal === '/api' || normal.startsWith('/api/');
}

const pathnameOf = (rawUrl) => (rawUrl ?? '/').split('#')[0].split('?')[0];

/**
 * The file a request may be answered with, or null.
 *
 * `/blog` is the one rewrite, and it is `blogRouting`'s preview rule from
 * `vite.config.ts`: the prerendered shell when the build wrote one, else the SPA
 * document. Everything else must be a regular file, with a known extension, whose
 * REAL path is inside `dist/` — so neither `..`, nor its encodings, nor a symlink
 * can walk the server out of the build.
 */
export function resolveStaticPath(distRoot, rawUrl) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathnameOf(rawUrl));
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  if (decoded.split(/[\\/]+/).some((segment) => segment === '..')) return null;

  let relative = decoded;
  if (decoded.replace(/\/+$/, '') === '/blog') {
    relative = existsSync(join(distRoot, 'blog', 'index.html')) ? '/blog/index.html' : '/blog.html';
  }

  const candidate = resolve(distRoot, '.' + relative);
  if (!candidate.startsWith(distRoot + sep)) return null;

  let real;
  try {
    if (!statSync(candidate).isFile()) return null;
    real = realpathSync(candidate);
  } catch {
    return null;
  }
  if (!real.startsWith(distRoot + sep)) return null;
  if (MIME[extname(real).toLowerCase()] === undefined) return null;
  return real;
}

/** Resolves true if `promise` settled within `ms`, false if the bound won. Never rejects. */
async function withinBound(promise, ms) {
  let timer;
  const bound = new Promise((resolveBound) => {
    timer = setTimeout(() => resolveBound(false), ms);
  });
  try {
    return await Promise.race([promise.then(() => true, () => true), bound]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Serves `dist/` on 127.0.0.1, and nothing else.
 *
 * In this process rather than `vite preview`, for three reasons that are each
 * sufficient: Vite would evaluate `vite.config.ts` and mount `apiRouting`, which
 * answers `/api/*` with the real form handler and `process.env`; a child process
 * inherits every build secret; and a child that fails to bind leaves the port to
 * whatever already holds it, which would then be photographed. Here a taken port is
 * an `EADDRINUSE` thrown before a browser ever opens.
 *
 * The counters are the second layer behind the browser's route: anything the route
 * should have stopped and did not arrives here, is refused, and is counted — and a
 * nonzero count discards the capture.
 */
export async function startStaticServer({ root = DIST_DIR, host = HOST, port = PORT } = {}) {
  const distRoot = realpathSync(resolve(root));
  const counters = { method: 0, api: 0, serviceWorker: 0, missing: 0 };

  const server = createServer((request, response) => {
    const method = request.method ?? '';
    if (method !== 'GET' && method !== 'HEAD') {
      counters.method += 1;
      response.writeHead(405, { allow: 'GET, HEAD' });
      response.end();
      return;
    }
    // A service worker's script is fetched with `Service-Worker: script`, and it can
    // only ever come from this origin. The context's `serviceWorkers: 'block'` is
    // the first layer — in the locked Playwright it is an init script that replaces
    // `navigator.serviceWorker.register` with a no-op — and this is the second: if
    // that stub were ever bypassed, the script still would not be served, because a
    // registered worker's own requests are ones the browser's route is not
    // documented to see.
    if (request.headers['service-worker'] !== undefined) {
      counters.serviceWorker += 1;
      response.writeHead(404);
      response.end();
      return;
    }
    if (isApiPath(pathnameOf(request.url))) {
      counters.api += 1;
      response.writeHead(404);
      response.end();
      return;
    }
    const file = resolveStaticPath(distRoot, request.url);
    if (file === null) {
      counters.missing += 1;
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()],
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    if (method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(file)
      .on('error', () => response.destroy())
      .pipe(response);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  let closing = null;
  return {
    origin: `http://${host}:${port}`,
    counters,
    /** Bounded: resolves within `SERVER_CLOSE_BOUND_MS` whatever the sockets do. */
    close() {
      closing ??= (async () => {
        const closed = new Promise((resolveClose) => server.close(() => resolveClose()));
        server.closeAllConnections();
        if (!(await withinBound(closed, SERVER_CLOSE_BOUND_MS))) {
          console.warn('[blog-preview] the local server did not close in time');
        }
      })();
      return closing;
    },
  };
}

/**
 * Default-deny every request that is not a static file from this server, before
 * any page exists.
 *
 * The capture must be a picture of THIS BUILD, not of this build plus whatever the
 * internet served that minute — and, on a build machine, a browser must not be a
 * way out of it. So, in order:
 *
 *   - WebSockets are routed and closed without ever connecting. `vite preview` had
 *     no HMR socket and this server has none either, so any socket is unexpected.
 *   - Anything not this exact origin (scheme, host AND port) is aborted. An exact
 *     origin comparison, not a `startsWith`, which `http://127.0.0.1:4320.example.com`
 *     would satisfy. `EXPECTED_EXTERNAL` is the single documented exception, and it
 *     is answered from memory.
 *   - This origin gets GET and HEAD only, and never `/api`.
 *   - What remains is fetched with `maxRedirects: 0`. Whether a route handler sees
 *     each hop of a redirect is not something Playwright's documentation states, so
 *     nothing here depends on it: a 3xx is refused outright, and the browser never
 *     follows a redirect anywhere.
 *   - A second page in the context — a popup — is closed on sight.
 *
 * An unexpected request does not merely get stopped — it INVALIDATES the capture.
 * The screenshot is one of two routes, so the bar for accepting one can be high: if
 * something unforeseen reached into the page, the right answer is to not ship a
 * picture of it.
 *
 * Exported for the boundary tests, which run it against a second local server that
 * counts every hit it receives.
 */
export async function hardenContext(context, { origin = ORIGIN, blocked }) {
  await context.routeWebSocket(/.*/, (socket) => {
    blocked.push(`websocket ${socket.url()}`);
    socket.close().catch(() => {});
  });

  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    try {
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
      if (parsed.origin === EXPECTED_EXTERNAL) {
        // FULFILLED transparent, not aborted, and the difference is visible in the
        // artifact. A blocked `<img>` renders its ALT TEXT, so aborting put the
        // words "imagen1" across the featured card's decode ground — a caption no
        // visitor ever sees, painted onto the panel. A transparent pixel leaves the
        // `#ececea` ground exactly as the real page's first paint shows it.
        await route.fulfill({ contentType: 'image/gif', body: TRANSPARENT_GIF });
        return;
      }
      if (parsed.origin !== origin) {
        blocked.push(url);
        await route.abort();
        return;
      }
      const method = request.method();
      if (method !== 'GET' && method !== 'HEAD') {
        blocked.push(`${method} ${url}`);
        await route.abort();
        return;
      }
      if (isApiPath(parsed.pathname)) {
        blocked.push(url);
        await route.abort();
        return;
      }

      const response = await route.fetch({ maxRedirects: 0, timeout: ROUTE_FETCH_TIMEOUT_MS });
      const status = response.status();
      if (status >= 300 && status < 400) {
        blocked.push(`redirect ${status} ${url} -> ${response.headers().location ?? '(none)'}`);
        await route.abort();
        return;
      }
      await route.fulfill({ response });
    } catch (error) {
      // A route can outlive its context — the deadline closes the browser under an
      // in-flight fetch. That is cancellation, not a new failure; anything else is
      // recorded, so it still discards the capture.
      if (!String(error).includes('closed')) blocked.push(`${url} (${String(error).split('\n')[0]})`);
      await route.abort().catch(() => {});
    }
  });

  let pages = 0;
  context.on('page', (page) => {
    pages += 1;
    // The first page is the one `captureViewport` creates; it is also the first
    // anything could open, because nothing runs before it exists.
    if (pages > 1) {
      blocked.push(`page ${page.url()}`);
      page.close().catch(() => {});
    }
  });
}

/** A deadline as an `AbortSignal`, with a reason that says which one fired. */
export function deadline(ms, label) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`the ${label} deadline (${ms / 1000} s) was reached`)),
    ms,
  );
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/** Closes a browser within `BROWSER_CLOSE_BOUND_MS`, whatever state it is in. */
export async function closeBrowser(browser) {
  if (!browser) return;
  if (!(await withinBound(browser.close(), BROWSER_CLOSE_BOUND_MS))) {
    console.warn('[blog-preview] the browser did not close in time');
  }
}

/**
 * `chromium.launch()`, cancellable.
 *
 * Cancellation cannot interrupt a launch already in flight, so it does the next
 * best thing: stops trusting it, and closes the browser if one arrives anyway. A
 * browser that finished starting a moment after the deadline is otherwise the one
 * thing nothing holds a reference to — it would outlive the script.
 *
 * That close is AWAITED before the cancellation is rethrown, so when this returns
 * the cleanup is done rather than scheduled. It is bounded by the launch's own
 * timeout plus the close bound.
 */
export async function launchBrowser(chromium, options, signal) {
  signal.throwIfAborted();
  const pending = chromium.launch(options);

  let onAbort;
  const aborted = new Promise((_, rejectAbort) => {
    onAbort = () => rejectAbort(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  aborted.catch(() => {});

  try {
    const browser = await Promise.race([pending, aborted]);
    if (signal.aborted) {
      await closeBrowser(browser);
      signal.throwIfAborted();
    }
    return browser;
  } catch (error) {
    if (signal.aborted) {
      await withinBound(
        pending.then((late) => closeBrowser(late), () => {}),
        LAUNCH_TIMEOUT_MS + BROWSER_CLOSE_BOUND_MS,
      );
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Fetches the locked Playwright's Chromium. Resolves whether it succeeded; never throws.
 *
 * The ONE external download this script permits, and it happens in a Node process
 * before any browser exists — it is not browser traffic and the capture's routing
 * does not apply to it. `--no-shell` because the capture uses full Chromium
 * (`channel: 'chromium'`) and refuses the headless shell.
 *
 * No shell, and a minimal environment. `detached` makes the child the leader of its
 * own process group on Linux, which is what lets the deadline kill the WHOLE group:
 * Node documents that killing a parent does not kill its children, and the
 * installer downloads in a child of its own.
 *
 * `argv` is injectable for the boundary tests, which install nothing.
 */
export function installChromium({
  argv = [PLAYWRIGHT_CLI, 'install', 'chromium', '--no-shell'],
  timeoutMs = INSTALL_DEADLINE_MS,
} = {}) {
  return new Promise((resolveInstall) => {
    const groupKill = process.platform !== 'win32';
    let child;
    try {
      child = spawn(process.execPath, argv, {
        detached: groupKill,
        stdio: ['ignore', 'inherit', 'inherit'],
        env: installEnv(),
        windowsHide: true,
      });
    } catch (error) {
      warn('the browser install could not start', error);
      resolveInstall(false);
      return;
    }

    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveInstall(ok);
    };

    const timer = setTimeout(() => {
      console.warn(`[blog-preview] the browser install passed its ${timeoutMs / 1000} s deadline`);
      try {
        if (groupKill) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        // Already gone, which is what was wanted.
      }
      finish(false);
    }, timeoutMs);

    child.once('error', () => finish(false));
    child.once('exit', (code) => finish(code === 0));
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
 * The two in-page waits race a timer INSIDE the page, because `page.evaluate` has
 * no timeout of its own.
 *
 * Returns what made it, for the log. Throws only if the blog never arrived at all.
 */
async function settle(page) {
  await page.waitForSelector('.blog-root', { timeout: SETTLE_TIMEOUT_MS });

  const fontsReady = await page.evaluate(
    (ms) =>
      Promise.race([
        document.fonts.ready.then(
          () => true,
          // Deliberately not fatal. A capture in the fallback face is wrong, but
          // hanging the build is worse, and the face is visible in the artifact to
          // anyone who looks at it.
          () => false,
        ),
        new Promise((resolveWait) => setTimeout(() => resolveWait(false), ms)),
      ]),
    IN_PAGE_WAIT_MS,
  );

  let markReady = true;
  try {
    await page.waitForSelector('.blog-topbar__stage[data-gl="ready"]', {
      timeout: MARK_TIMEOUT_MS,
    });
  } catch {
    markReady = false;
  }

  await page.evaluate(
    (ms) =>
      new Promise((resolveFrames) => {
        const timer = setTimeout(resolveFrames, ms);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            clearTimeout(timer);
            resolveFrames(undefined);
          }),
        );
      }),
    IN_PAGE_WAIT_MS,
  );

  return { fontsReady, markReady };
}

/** One viewport, captured into `TMP_DIR`. Throws to abandon the whole attempt. */
async function captureViewport(browser, { width, height }, signal) {
  signal.throwIfAborted();
  // Viewport at the CONTEXT, not via `page.setViewportSize`. Setting it after the
  // page exists means the first layout happens at the default size and is then
  // reflowed, which can leave transitions mid-flight and lazy work already resolved
  // against the wrong width.
  //
  // A fresh context each time, from a `launch()` (never a persistent profile), so
  // nothing — no cookie, no cache, no stored session — carries between captures or
  // in from anywhere. Service workers are BLOCKED because the route below does not
  // see requests a service worker intercepts, and downloads are refused.
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    serviceWorkers: 'block',
    acceptDownloads: false,
    storageState: {
      cookies: [],
      origins: [{ origin: ORIGIN, localStorage: [{ name: CONSENT_KEY, value: CONSENT_VALUE }] }],
    },
  });

  const blocked = [];
  try {
    context.setDefaultTimeout(STEP_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(STEP_TIMEOUT_MS);
    await hardenContext(context, { origin: ORIGIN, blocked });

    const page = await context.newPage();
    await page.goto(`${ORIGIN}/blog`, { waitUntil: 'load', timeout: STEP_TIMEOUT_MS });

    const { fontsReady, markReady } = await settle(page);

    const buffer = await page.screenshot({
      // Explicit, always. See `isWebp`.
      type: 'webp',
      quality: WEBP_QUALITY,
      animations: 'disabled',
      caret: 'hide',
      timeout: STEP_TIMEOUT_MS,
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
    signal.throwIfAborted();
    writeFileSync(join(TMP_DIR, file), buffer);

    return {
      src: `${PUBLIC_PREFIX}/${file}`,
      width,
      height,
      bytes: buffer.length,
      file,
      fontsReady,
      markReady,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Reads a launch failure and says the useful thing about it.
 *
 * Having Playwright in `devDependencies` says nothing about whether the browser
 * binary exists — they are separate installs, and a missing browser is by far the
 * most likely way this fails on a machine that has never run it.
 */
const isMissingBrowser = (error) => {
  const text = String(error);
  return text.includes("Executable doesn't exist") || text.includes('playwright install');
};

function launchAdvice(error) {
  const text = String(error);
  if (isMissingBrowser(error)) {
    return "Chromium is not provisioned for channel 'chromium' — run `npx playwright install chromium`";
  }
  // Playwright rewrites a sandbox failure's log into "Chromium sandboxing failed!",
  // and Chromium's own words for it are "No usable sandbox!". There is no fallback
  // to `--no-sandbox` here on purpose — see `launchOptions`.
  if (/sandboxing failed|No usable sandbox|crbug\.com\/(357670|638180)/.test(text)) {
    return "Chromium's sandbox cannot run on this machine, and the capture does not run without it";
  }
  if (/error while loading shared libraries|missing dependencies/i.test(text)) {
    return 'Chromium is missing system libraries on this machine';
  }
  return 'Chromium could not be launched';
}

/**
 * The browser's own account of a failed launch, which is where the CAUSE is.
 *
 * Playwright's launch error is one line of symptom — "Target page, context or
 * browser has been closed" — followed by the browser's log: the command line, its
 * stderr, and how it exited. `warn` prints only the first line, which is how the
 * one Vercel build log that could have said why Chromium died said nothing.
 *
 * The TAIL, because the cause sits next to the exit rather than after the long
 * launch command, and bounded, because the log is the browser's and its length is
 * not ours to trust. It carries no build secrets: Chromium only ever saw the
 * allowlisted environment, and the log prints its arguments, not its environment.
 */
const LAUNCH_LOG_LINES = 40;
const LAUNCH_LOG_LINE_CHARS = 300;

function printLaunchLog(error) {
  const lines = String(error)
    .split('\n')
    .slice(1)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
  if (lines.length === 0) return;
  console.warn('[blog-preview] the browser said:');
  if (lines.length > LAUNCH_LOG_LINES) {
    console.warn(`[blog-preview]   … ${lines.length - LAUNCH_LOG_LINES} earlier line(s)`);
  }
  for (const line of lines.slice(-LAUNCH_LOG_LINES)) {
    console.warn(`[blog-preview]   ${line.slice(0, LAUNCH_LOG_LINE_CHARS)}`);
  }
}

/**
 * `channel: 'chromium'` and never the default headless shell: measured in the lab,
 * the shell disagreed with the DOM by 26,412 pixels on the same page where real
 * Chromium disagreed by 153. It does not rasterise DOM text and SVG text alike, so a
 * shot from it is a shot of a renderer no visitor has.
 *
 * `chromiumSandbox: true` because Playwright's default is FALSE — it passes
 * `--no-sandbox` unless told otherwise. There is deliberately no fallback to it: if
 * the sandbox cannot run somewhere, the capture fails there and the plate stays,
 * and loosening the browser is a decision for a person, not for this script. No
 * `args` are added; Playwright talks to the browser over a pipe, not a port.
 */
const launchOptions = () => ({
  channel: 'chromium',
  chromiumSandbox: true,
  timeout: LAUNCH_TIMEOUT_MS,
  env: chromiumEnv(),
});

/**
 * The capture. `options` exists for the boundary tests, which shorten the deadlines;
 * the build calls this with none.
 */
export async function main({
  captureDeadlineMs = CAPTURE_DEADLINE_MS,
  installDeadlineMs = INSTALL_DEADLINE_MS,
} = {}) {
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
  //    On Vercel, and only there, a missing browser is installed and the launch
  //    retried ONCE. The install has its own deadline, and the retry starts a fresh
  //    capture deadline, so a slow download never eats the capture's time.
  let capture = deadline(captureDeadlineMs, 'capture');
  let browser = null;
  let server = null;
  const launchedAt = Date.now();
  try {
    try {
      browser = await launchBrowser(chromium, launchOptions(), capture.signal);
    } catch (error) {
      if (!isMissingBrowser(error) || process.env.VERCEL !== '1' || capture.signal.aborted) {
        warn(launchAdvice(error), error);
        printLaunchLog(error);
        return;
      }
      capture.clear();
      console.log('[blog-preview] installing the locked Playwright Chromium for this build');
      if (!(await installChromium({ timeoutMs: installDeadlineMs }))) {
        warn('the browser install did not complete');
        return;
      }
      capture = deadline(captureDeadlineMs, 'capture');
      try {
        browser = await launchBrowser(chromium, launchOptions(), capture.signal);
      } catch (retryError) {
        warn(launchAdvice(retryError), retryError);
        printLaunchLog(retryError);
        return;
      }
    }
    const launchMs = Date.now() - launchedAt;

    // A deadline must STOP the work, not just stop waiting for it: closing the
    // browser rejects every Playwright call in flight, and closing the server
    // fails any request that was still being answered.
    const { signal } = capture;
    signal.addEventListener(
      'abort',
      () => {
        void closeBrowser(browser);
        void server?.close();
      },
      { once: true },
    );

    signal.throwIfAborted();
    const serverAt = Date.now();
    server = await startStaticServer();
    const serverMs = Date.now() - serverAt;

    mkdirSync(TMP_DIR, { recursive: true });

    const captureAt = Date.now();
    const captured = [];
    for (const viewport of VIEWPORTS) {
      captured.push(await captureViewport(browser, viewport, signal));
    }
    const captureMs = Date.now() - captureAt;

    // The server's refusals are the second layer: anything counted here got past
    // the route, and a capture something got past is not shipped.
    const { method, api, serviceWorker, missing } = server.counters;
    if (method + api + serviceWorker + missing > 0) {
      throw new Error(
        `the local server refused ${method} method(s), ${api} /api, ` +
          `${serviceWorker} service-worker script(s) and ${missing} missing path(s)`,
      );
    }

    // 4. PROMOTE. Every viewport succeeded or we are not here — a partial manifest
    //    is harder to reason about than a clean fall back to a route already known
    //    to work, and the manifest goes last so it never points at a file that is
    //    still being written.
    //
    //    Checked against the deadline one last time, and then entirely SYNCHRONOUS:
    //    no `await` from here to the manifest, so a deadline timer cannot fire in the
    //    middle and a cancelled run never publishes.
    signal.throwIfAborted();
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
      const fonts = variant.fontsReady ? '' : ', FALLBACK FONTS (the faces did not load in time)';
      console.log(
        `[blog-preview]   ${variant.file}  ${(variant.bytes / 1024).toFixed(1)} kB  ${mark}${fonts}`,
      );
    }
    console.log(
      `[blog-preview] launch ${launchMs} ms · server ${serverMs} ms · capture ${captureMs} ms · total ${totalMs} ms`,
    );
  } catch (error) {
    warn(
      capture.signal.aborted ? 'the capture was cancelled' : 'the capture did not complete',
      capture.signal.aborted ? capture.signal.reason : error,
    );
  } finally {
    capture.clear();
    await closeBrowser(browser);
    await server?.close();
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
}

/**
 * Run only when invoked as a script, so the boundary tests can import the helpers
 * above without starting a capture.
 *
 * No `.catch(() => process.exit(1))`. Read the contract at the top of this file
 * before adding one: a screenshot failure must never block a deployment.
 */
const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (same(import.meta.url, invokedPath)) {
  await main();
}
