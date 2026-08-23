import { describe, expect, it } from 'vitest'
import { readConfig, type Env, type SanityContentConfig } from './config'

/** The four variables that together select and address the Sanity source. */
const sanityEnv: Env = { CONTENT_SOURCE: 'sanity', SANITY_PROJECT_ID: 'p1abc234', SANITY_DATASET: 'production' }

/** Narrows an expected-good result to the Sanity branch, failing loudly if not. */
function sanityConfigOf(env: Env): SanityContentConfig {
  const result = readConfig(env)
  if (!result.ok) throw new Error('expected a valid config, got: ' + result.message)
  if (result.config.mode !== 'sanity') throw new Error('expected the sanity mode, got ' + result.config.mode)
  return result.config
}

function messageOf(env: Env): string {
  const result = readConfig(env)
  if (result.ok) throw new Error('expected a failure, got mode ' + result.config.mode)
  return result.message
}

describe('choosing a content source', () => {
  it('defaults a developer machine to fixtures', () => {
    const result = readConfig({})
    expect(result.ok && result.config.mode).toBe('fixture')
  })

  it('accepts a source name with stray case and whitespace', () => {
    const result = readConfig({ CONTENT_SOURCE: '  SEED  ' })
    expect(result.ok && result.config.mode).toBe('seed')
  })

  it('rejects a source name it does not recognise', () => {
    // `wp` is the regression guard: it used to be valid, and an operator who
    // still has it set must be told the vocabulary changed.
    expect(messageOf({ CONTENT_SOURCE: 'wp' })).toMatch(/sanity, fixture, seed/)
  })

  it('names WP_CONTENT_BASE rather than ignoring it', () => {
    // Without this branch a leftover Vercel variable produces "must name its
    // content source", which is technically correct and maximally confusing.
    expect(messageOf({ WP_CONTENT_BASE: 'https://cms.test/wp-json/wp/v2' })).toMatch(/no longer read/)
  })

  it('selects Sanity from the presence of a project id', () => {
    const result = readConfig({ SANITY_PROJECT_ID: 'p1abc234', SANITY_DATASET: 'production' })
    expect(result.ok && result.config.mode).toBe('sanity')
  })
})

describe('a production build', () => {
  it('fails when nothing names its source', () => {
    expect(messageOf({ VERCEL_ENV: 'production' })).toMatch(/must name its content source/)
  })

  it('accepts the committed seed as an explicit choice', () => {
    // The documented escape: a code-only hotfix while the CMS is unavailable.
    const result = readConfig({ VERCEL_ENV: 'production', CONTENT_SOURCE: 'seed' })
    expect(result.ok && result.config.mode).toBe('seed')
  })

  it('still requires a dataset when Sanity is named', () => {
    expect(
      messageOf({ VERCEL_ENV: 'production', CONTENT_SOURCE: 'sanity', SANITY_PROJECT_ID: 'p1abc234' }),
    ).toMatch(/SANITY_DATASET/)
  })
})

describe('addressing Sanity', () => {
  it('requires a project id', () => {
    expect(messageOf({ CONTENT_SOURCE: 'sanity' })).toMatch(/SANITY_PROJECT_ID/)
  })

  it('refuses to guess a dataset', () => {
    // A default of `production` means a half-filled .env reads the client's live
    // content while looking like an offline build.
    expect(messageOf({ CONTENT_SOURCE: 'sanity', SANITY_PROJECT_ID: 'p1abc234' })).toMatch(/SANITY_DATASET/)
  })

  it('carries the project id and dataset through', () => {
    const config = sanityConfigOf(sanityEnv)
    expect(config.projectId).toBe('p1abc234')
    expect(config.dataset).toBe('production')
  })
})

describe('the request deadline', () => {
  it('defaults when unset', () => {
    expect(sanityConfigOf(sanityEnv).timeoutMs).toBe(15_000)
  })

  it('defaults when blank', () => {
    expect(sanityConfigOf({ ...sanityEnv, SANITY_TIMEOUT_MS: '   ' }).timeoutMs).toBe(15_000)
  })

  it('accepts a positive number', () => {
    expect(sanityConfigOf({ ...sanityEnv, SANITY_TIMEOUT_MS: '2500' }).timeoutMs).toBe(2500)
  })

  it.each(['abc', '0', '-1', 'Infinity'])('fails rather than falling back on "%s"', (raw) => {
    // Falling back would turn a typo into `setTimeout(fn, NaN)`, which fires
    // immediately and reports every request as "timed out after NaNms".
    expect(messageOf({ ...sanityEnv, SANITY_TIMEOUT_MS: raw })).toMatch(/positive number/)
  })
})

describe('the Sanity token', () => {
  it('is absent when unset', () => {
    expect(sanityConfigOf(sanityEnv).token).toBeUndefined()
  })

  it('is absent when blank', () => {
    expect(sanityConfigOf({ ...sanityEnv, SANITY_TOKEN: '   ' }).token).toBeUndefined()
  })

  it('is trimmed when present', () => {
    expect(sanityConfigOf({ ...sanityEnv, SANITY_TOKEN: ' sk-x ' }).token).toBe('sk-x')
  })
})
