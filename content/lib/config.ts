/**
 * The environment, decided once, as a value.
 *
 * A pure function of an env object rather than reads of `process.env` scattered
 * through the build script, so "a production build with no source named fails"
 * is a unit test rather than something someone remembers to try by hand. Every
 * message here is what an operator reads after the `[content] ` prefix.
 *
 * ── Strict by default, and the default is production ──
 * There is deliberately no "fall back to whatever is on disk". The fallbacks are
 * explicit sources you have to name. Fixtures are development and demo inputs;
 * a Vercel project with `SANITY_PROJECT_ID` missing, typo'd or scoped to Preview
 * only would otherwise produce a green production deployment serving them,
 * announced by nothing but one log line.
 */

export interface SanityContentConfig {
  mode: 'sanity'
  projectId: string
  dataset: string
  timeoutMs: number
  /** Absent for a public dataset, which is the preferred arrangement. */
  token?: string
}

export interface FileContentConfig {
  mode: 'fixture' | 'seed'
}

export type ContentConfig = SanityContentConfig | FileContentConfig

export type ConfigResult = { ok: true; config: ContentConfig } | { ok: false; message: string }

export type Env = Record<string, string | undefined>

const DEFAULT_TIMEOUT_MS = 15_000

function fail(message: string): ConfigResult {
  return { ok: false, message }
}

function clean(value: string | undefined): string {
  return (value ?? '').trim()
}

export function readConfig(env: Env): ConfigResult {
  const requested = clean(env.CONTENT_SOURCE).toLowerCase()

  if (requested.length > 0 && requested !== 'sanity' && requested !== 'fixture' && requested !== 'seed') {
    return fail('CONTENT_SOURCE must be one of sanity, fixture, seed — got "' + requested + '"')
  }

  // A leftover WordPress variable is a migration hazard, not a no-op: the
  // operator believes they named a source and would be told they did not. Say
  // what actually changed instead of letting them read the generic message.
  if (requested !== 'fixture' && requested !== 'seed' && clean(env.WP_CONTENT_BASE).length > 0) {
    return fail(
      'WP_CONTENT_BASE is no longer read — WordPress was replaced by Sanity (adr/011). ' +
        'Remove it and set SANITY_PROJECT_ID and SANITY_DATASET.',
    )
  }

  if (requested === 'fixture' || requested === 'seed') return { ok: true, config: { mode: requested } }

  if (requested === 'sanity' || clean(env.SANITY_PROJECT_ID).length > 0) return sanityConfig(env)

  // Production has to NAME its source. Preview and local keep the fixture
  // default: previews are the builds a client demo runs on.
  if (env.VERCEL_ENV === 'production') {
    return fail(
      'a production build must name its content source — set SANITY_PROJECT_ID and ' +
        'SANITY_DATASET (Sanity) or CONTENT_SOURCE=seed (committed snapshot) in the ' +
        'Vercel Production environment. Refusing to ship fixtures by omission.',
    )
  }

  return { ok: true, config: { mode: 'fixture' } }
}

function sanityConfig(env: Env): ConfigResult {
  const projectId = clean(env.SANITY_PROJECT_ID)
  if (projectId.length === 0) {
    return fail(
      'CONTENT_SOURCE=sanity requires SANITY_PROJECT_ID (Sanity → Project settings → Project ID)',
    )
  }

  // Required EVERYWHERE, not only in production. A default would let a local run
  // point at whatever dataset happened to be named `production` — which is the
  // client's live content — while looking like an offline build. One line in
  // `.env` is cheaper than that mistake.
  const dataset = clean(env.SANITY_DATASET)
  if (dataset.length === 0) {
    return fail('CONTENT_SOURCE=sanity requires SANITY_DATASET, e.g. production — refusing to guess one')
  }

  const raw = clean(env.SANITY_TIMEOUT_MS)
  let timeoutMs = DEFAULT_TIMEOUT_MS
  if (raw.length > 0) {
    const parsed = Number(raw)
    // An invalid value FAILS rather than falling back: a typo must not become
    // `setTimeout(fn, NaN)`, which fires immediately and reports every request
    // as "timed out after NaNms".
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fail('SANITY_TIMEOUT_MS must be a positive number of milliseconds — got "' + raw + '"')
    }
    timeoutMs = parsed
  }

  // Only a private dataset needs one. Never VITE_-prefixed — that would compile a
  // credential into the public bundle. Blank is treated as absent so an empty
  // Vercel variable cannot send a bare `Bearer `.
  const token = clean(env.SANITY_TOKEN)

  return {
    ok: true,
    config: { mode: 'sanity', projectId, dataset, timeoutMs, ...(token ? { token } : {}) },
  }
}
