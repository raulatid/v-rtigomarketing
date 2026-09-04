import { describe, expect, it } from 'vitest'
import { readMailConfig, type MailEnv, type SendingMailConfig } from './config'

/**
 * THE HONESTY RULE, moved. This file is the successor to the case
 * `src/app/auditSubmission.test.ts` used to carry — "production transport
 * rejects: no backend exists, so success would be a lie".
 *
 * The backend exists now, so the lie changed shape. It is no longer "a stub
 * pretending to send"; it is "a production deployment that quietly stopped
 * sending because one environment variable was dropped, while every visitor
 * still reads `Solicitud recibida`". A dry run is a DEVELOPMENT AFFORDANCE
 * THAT PRODUCTION MAY NOT HAVE, and that sentence is what most of the cases
 * below pin down.
 *
 * Shaped after `content/lib/config.test.ts`: a pure function of an env object,
 * so every rule is a unit test rather than something someone remembers to try.
 */

/** Enough to reach the sending branch: a key and a sender on a real domain. */
const sending: MailEnv = {
  RESEND_API_KEY: 're_test_key',
  MAIL_FROM: 'Vértigo <no-reply@vertigomkt.com>',
}

function configOf(env: MailEnv) {
  const result = readMailConfig(env)
  if (!result.ok) throw new Error('expected a valid config, got: ' + result.message)
  return result.config
}

function sendingConfigOf(env: MailEnv): SendingMailConfig {
  const config = configOf(env)
  if (config.mode !== 'send') throw new Error('expected the send mode, got ' + config.mode)
  return config
}

function messageOf(env: MailEnv): string {
  const result = readMailConfig(env)
  if (result.ok) throw new Error('expected a failure, got mode ' + result.config.mode)
  return result.message
}

describe('deciding whether the endpoint may send', () => {
  it('dry-runs a developer machine that has configured nothing', () => {
    // Cloning the repo and running `npm run dev` must exercise the whole form
    // without an account, a key or a .env — otherwise the first thing a new
    // contributor meets is a 500 on a form that used to work.
    const config = configOf({})
    expect(config.mode).toBe('dry-run')
  })

  it('fails a production build with no key rather than dry-running', () => {
    // The heart of it. A silent fall back to dry-run here is exactly the
    // "success is a lie" failure the deleted transport test existed to prevent,
    // except worse: it looks green from the outside.
    expect(messageOf({ ...sending, RESEND_API_KEY: undefined, VERCEL_ENV: 'production' })).toMatch(
      /RESEND_API_KEY/,
    )
  })

  it('dry-runs a preview build with no key', () => {
    // Preview is where the client clicks around. It must not need a key, and it
    // must not send real mail from a branch.
    expect(configOf({ VERCEL_ENV: 'preview' }).mode).toBe('dry-run')
  })

  it('treats a blank key as absent, never as a bare Bearer', () => {
    // An empty Vercel variable is not an unset one. `content/lib/config.ts`
    // learnt this for SANITY_TOKEN; the same trap sends `Authorization: Bearer `
    // and reads as a 401 from Resend rather than as a misconfiguration.
    expect(configOf({ RESEND_API_KEY: '   ' }).mode).toBe('dry-run')
    expect(messageOf({ RESEND_API_KEY: '   ', VERCEL_ENV: 'production' })).toMatch(/RESEND_API_KEY/)
  })

  it('refuses a forced dry run in production', () => {
    // The MAIL_DRY_RUN escape hatch is for a developer inspecting the payload.
    // In production it is a switch that turns every enquiry into a green
    // receipt nobody receives — the `CONTENT_SOURCE=fixture` precedent (SEC-7).
    expect(messageOf({ ...sending, MAIL_DRY_RUN: '1', VERCEL_ENV: 'production' })).toMatch(
      /MAIL_DRY_RUN/,
    )
  })

  it('honours a forced dry run outside production', () => {
    const config = configOf({ ...sending, MAIL_DRY_RUN: '1' })
    expect(config.mode).toBe('dry-run')
  })

  it('refuses the state where VERCEL is set but VERCEL_ENV is not', () => {
    // SEC-9, mirrored from content/lib/config.ts and vite.config.ts. Without the
    // system-variables toggle every deployment reads as development, and the
    // production guards above could never fire.
    expect(messageOf({ ...sending, VERCEL: '1' })).toMatch(/VERCEL_ENV/)
  })
})

describe('the sender', () => {
  it('is never guessed', () => {
    // A wrong From address produces a 403 from Resend that reads like an
    // outage. Refusing to invent one is cheaper than diagnosing that.
    expect(messageOf({ RESEND_API_KEY: 're_test_key' })).toMatch(/MAIL_FROM/)
  })

  it('is not required to dry-run, because nothing is addressed', () => {
    expect(configOf({ MAIL_DRY_RUN: '1' }).mode).toBe('dry-run')
  })

  it('refuses a sandbox sender with no recipient override', () => {
    // Resend's onboarding sender delivers ONLY to the account owner. Pointed at
    // the CMS address it 422s on every submission, and the first anyone hears
    // of it is a visitor's enquiry that never arrived.
    const message = messageOf({ ...sending, MAIL_FROM: 'Vértigo <onboarding@resend.dev>' })
    expect(message).toMatch(/resend\.dev/)
    expect(message).toMatch(/MAIL_TO_OVERRIDE/)
  })

  it('accepts a sandbox sender once a recipient override is given', () => {
    const config = sendingConfigOf({
      ...sending,
      MAIL_FROM: 'Vértigo <onboarding@resend.dev>',
      MAIL_TO_OVERRIDE: 'owner@example.com',
    })
    expect(config.toOverride).toBe('owner@example.com')
  })
})

describe('the recipient override', () => {
  it('is absent by default, so the CMS address is used', () => {
    expect(sendingConfigOf(sending).toOverride).toBeUndefined()
  })

  it('is blank-tolerant, so an emptied Vercel variable means the CMS address', () => {
    expect(sendingConfigOf({ ...sending, MAIL_TO_OVERRIDE: '  ' }).toOverride).toBeUndefined()
  })

  it('refuses an override that is not an address', () => {
    expect(messageOf({ ...sending, MAIL_TO_OVERRIDE: 'not-an-address' })).toMatch(/MAIL_TO_OVERRIDE/)
  })
})

describe('the numeric settings', () => {
  it('have defaults, so nothing has to be set to run', () => {
    const config = sendingConfigOf(sending)
    expect(config.timeoutMs).toBeGreaterThan(0)
    expect(config.perIpPerHour).toBeGreaterThan(0)
    expect(config.perEmailPerHour).toBeGreaterThan(0)
  })

  it('are read when given', () => {
    const config = sendingConfigOf({
      ...sending,
      MAIL_TIMEOUT_MS: '2500',
      MAIL_RATE_PER_HOUR: '9',
      MAIL_RATE_EMAIL_PER_HOUR: '4',
    })
    expect(config.timeoutMs).toBe(2500)
    expect(config.perIpPerHour).toBe(9)
    expect(config.perEmailPerHour).toBe(4)
  })

  it('fail on a typo rather than becoming NaN', () => {
    // `setTimeout(fn, NaN)` fires immediately and reports every request as
    // "timed out after NaNms" — the literal precedent at content/lib/config.ts.
    expect(messageOf({ ...sending, MAIL_TIMEOUT_MS: 'soon' })).toMatch(/MAIL_TIMEOUT_MS/)
    expect(messageOf({ ...sending, MAIL_RATE_PER_HOUR: '-1' })).toMatch(/MAIL_RATE_PER_HOUR/)
    expect(messageOf({ ...sending, MAIL_RATE_EMAIL_PER_HOUR: '0' })).toMatch(
      /MAIL_RATE_EMAIL_PER_HOUR/,
    )
  })
})

describe('what the config never carries', () => {
  it('keeps the key out of every failure message', () => {
    // A message is logged, and a log is read by more people than an env var is.
    const message = messageOf({
      RESEND_API_KEY: 're_super_secret_value',
      MAIL_FROM: 'Vértigo <onboarding@resend.dev>',
    })
    expect(message).not.toContain('re_super_secret_value')
  })
})
