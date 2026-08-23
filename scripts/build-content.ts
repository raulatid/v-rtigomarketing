import path from 'node:path'
import { COLLECTIONS } from '../content/collections/index'
import { readConfig, type ContentConfig } from '../content/lib/config'
import { formatFailures, generate } from '../content/lib/generate'
import { SourceError, fileSource, type ContentSource } from '../content/lib/source'
import { sanitySource } from '../content/lib/sanity'

/**
 * The content build.
 *
 *   npm run content:build                    # fixtures, or Sanity if configured
 *   CONTENT_SOURCE=fixture npm run content:build
 *   CONTENT_SOURCE=seed    npm run content:build
 *   CONTENT_SOURCE=sanity  npm run content:build
 *
 * ── Strict by default, and the default is production ──
 * A sync that cannot reach or cannot validate the CMS EXITS NON-ZERO. On Vercel
 * that fails the build, which leaves the existing deployment serving. That is the
 * behaviour worth defending: a Sanity publish must never produce a green
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
 * The decision itself lives in `content/lib/config.ts` as a pure function, so
 * every fail-closed rule below is a unit test rather than something someone
 * remembers to try by hand.
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

function buildSource(config: ContentConfig): ContentSource {
  if (config.mode !== 'sanity') {
    if (config.mode === 'fixture') return fileSource(path.join(ROOT, 'content', 'fixtures'), 'fixtures')
    // Loud, and deliberately so. The seed is a committed snapshot that nothing
    // refreshes automatically, so it WILL drift — it exists only so that a
    // code-only hotfix can ship while the CMS is unavailable. A build that used
    // it should be obvious in the log a month later.
    console.warn('')
    console.warn('  ****************************************************************')
    console.warn('  *  BUILDING FROM THE COMMITTED SEED SNAPSHOT                   *')
    console.warn('  *  This content is NOT live. It drifts and nothing refreshes   *')
    console.warn('  *  it. Use only to ship a code change while the CMS is down.   *')
    console.warn('  ****************************************************************')
    console.warn('')
    return fileSource(path.join(ROOT, 'content', 'seed'), 'seed snapshot')
  }

  return sanitySource({
    projectId: config.projectId,
    dataset: config.dataset,
    timeoutMs: config.timeoutMs,
    token: config.token,
  })
}

function fail(message: string): never {
  console.error('[content] ' + message)
  process.exit(1)
}

async function main(): Promise<void> {
  const parsed = readConfig(process.env)
  if (!parsed.ok) fail(parsed.message)

  let result
  try {
    // buildSource is INSIDE the try: sanitySource() validates the project id and
    // dataset shape and throws SourceError, and a malformed environment variable
    // deserves the same one-line message as an unreachable CMS, not a stack.
    const source = buildSource(parsed.config)
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
