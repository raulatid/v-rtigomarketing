import path from 'node:path'
import { COLLECTIONS } from '../content/collections/index'
import { formatFailures, generate } from '../content/lib/generate'
import { SourceError, fileSource, wordPressSource, type ContentSource } from '../content/lib/source'

/**
 * The content build.
 *
 *   npm run content:build                 # fixtures, or WordPress if configured
 *   CONTENT_SOURCE=fixture npm run content:build
 *   CONTENT_SOURCE=seed    npm run content:build
 *
 * ── Strict by default, and the default is production ──
 * A sync that cannot reach or cannot validate the CMS EXITS NON-ZERO. On Vercel
 * that fails the build, which leaves the existing deployment serving. That is the
 * behaviour worth defending: a WordPress publish must never produce a green
 * deployment carrying yesterday's content, because a successful deploy is the
 * signal an editor reads as "my change is live".
 *
 * There is deliberately no "fall back to whatever is on disk" default. The
 * fallbacks are explicit sources you have to name.
 *
 * ── Choosing the source ──
 * From the environment rather than from a shell-interpolated flag, so it works
 * identically on Windows, on a Linux runner and in Vercel's build container —
 * this repo has been bitten by the equivalent assumption before, which is why
 * `debugTools` and `allowSpatialFallback` are threaded as parameters rather than
 * read from `import.meta.env`.
 *
 * `wp` requires `WP_CONTENT_BASE`; without it there is nothing to talk to, so
 * fixtures are the honest default for a developer machine — and ONLY there.
 * When Vercel says `VERCEL_ENV=production` and nothing names a source, the
 * build fails rather than shipping fixtures (see `chooseMode`).
 */

/**
 * The repo root, from the working directory rather than from this file's path.
 *
 * This module is bundled into `node_modules/.cache/` before it runs, exactly like
 * the six `check:*` harnesses, so `import.meta.dirname` is the cache directory
 * and not the repo. Those harnesses already resolve everything against the
 * working directory (`checks/architecture.ts` walks a bare `'src'`), and npm runs
 * a script from the package root, so this is the convention rather than a
 * shortcut.
 */
const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, 'src', 'content', 'generated')

type Mode = 'wp' | 'fixture' | 'seed'

function chooseMode(): Mode {
  const requested = (process.env.CONTENT_SOURCE ?? '').trim().toLowerCase()
  if (requested === 'wp' || requested === 'fixture' || requested === 'seed') return requested
  if (requested.length > 0) {
    fail('CONTENT_SOURCE must be one of wp, fixture, seed — got "' + requested + '"')
  }
  if (process.env.WP_CONTENT_BASE) return 'wp'

  // A PRODUCTION build never falls back to fixtures by omission. Fixtures are
  // development and demo inputs; a Vercel project with WP_CONTENT_BASE missing,
  // typo'd or scoped to Preview only would otherwise produce a green production
  // deployment serving them, announced by nothing but one log line. The seed
  // gets a banner for the same reason — this is the more likely mistake, and it
  // was silent. Production has to NAME its source. Preview and local keep the
  // fixture default: previews are the builds a client demo runs on.
  if (process.env.VERCEL_ENV === 'production') {
    fail(
      'a production build must name its content source — set WP_CONTENT_BASE ' +
        '(WordPress) or CONTENT_SOURCE=seed (committed snapshot) in the Vercel ' +
        'Production environment. Refusing to ship fixtures by omission.',
    )
  }
  return 'fixture'
}

/** `WP_TIMEOUT_MS`, or the default; a typo here must not become `setTimeout(fn, NaN)`,
 *  which fires immediately and aborts every request as "timed out after NaNms". */
function timeoutMs(): number {
  const raw = process.env.WP_TIMEOUT_MS
  if (raw === undefined || raw.trim() === '') return 15_000
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) fail('WP_TIMEOUT_MS must be a positive number of milliseconds — got "' + raw + '"')
  return n
}

function buildSource(mode: Mode): ContentSource {
  if (mode === 'fixture') return fileSource(path.join(ROOT, 'content', 'fixtures'), 'fixtures')
  if (mode === 'seed') {
    // Loud, and deliberately so. The seed is a committed snapshot that nothing
    // refreshes automatically, so it WILL drift — it exists only so that a
    // code-only hotfix can ship while WordPress is unavailable. A build that
    // used it should be obvious in the log a month later.
    console.warn('')
    console.warn('  ****************************************************************')
    console.warn('  *  BUILDING FROM THE COMMITTED SEED SNAPSHOT                   *')
    console.warn('  *  This content is NOT live. It drifts and nothing refreshes   *')
    console.warn('  *  it. Use only to ship a code change while the CMS is down.   *')
    console.warn('  ****************************************************************')
    console.warn('')
    return fileSource(path.join(ROOT, 'content', 'seed'), 'seed snapshot')
  }

  const base = process.env.WP_CONTENT_BASE
  if (!base) fail('CONTENT_SOURCE=wp requires WP_CONTENT_BASE, e.g. https://cms.example.com/wp-json/wp/v2')
  return wordPressSource({
    baseUrl: base,
    timeoutMs: timeoutMs(),
    // A read-only application password, supplied by the build environment. Never
    // VITE_-prefixed: that would compile it into the public bundle.
    authorization: process.env.WP_AUTHORIZATION,
  })
}

function fail(message: string): never {
  console.error('[content] ' + message)
  process.exit(1)
}

async function main(): Promise<void> {
  const mode = chooseMode()
  const source = buildSource(mode)

  let result
  try {
    result = await generate({
      collections: COLLECTIONS,
      source,
      outDir: OUT_DIR,
      log: (message) => console.log('[content] ' + message),
    })
  } catch (error) {
    if (error instanceof SourceError) {
      fail('could not read the content source — nothing was written.\n         ' + error.message)
    }
    throw error
  }

  if (!result.ok) {
    console.error('[content] content failed validation — nothing was written.')
    console.error(formatFailures(result))
    console.error('')
    console.error('[content] Fix the content at the source. The previous deployment stays live.')
    process.exit(1)
  }

  if (result.changed.length === 0) {
    console.log('[content] up to date — no file changed.')
  } else {
    console.log('[content] wrote ' + result.changed.join(', '))
  }
}

main().catch((error: unknown) => {
  console.error('[content] unexpected failure — nothing was written.')
  console.error(error)
  process.exit(1)
})
