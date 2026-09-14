import { describe, expect, it, vi } from 'vitest'
import { handleSubmission, type HandleDeps } from './handleSubmission'
import { createLimiter } from './rateLimit'
import type { MailConfig } from './config'
import type { RenderedEmail } from './renderEmail'
import type { SendOutcome } from './resend'
import { REVENUE_RANGES } from '../src/content/site'

/**
 * A typed stand-in for the transport. Typed rather than inferred so that
 * `send.mock.calls[0][1]` is known to be the recipient — an inferred `vi.fn`
 * has an empty argument tuple, and the assertions below would compile against
 * nothing.
 */
type Send = (message: RenderedEmail, to: string) => Promise<SendOutcome>

function sendSpy(outcome: SendOutcome = { ok: true, id: 'sent-1' }) {
  return vi.fn<Send>(async () => outcome)
}

/**
 * Everything the endpoint decides, decided here — where it can be tested
 * without a Request, a Response, a network or a Vercel runtime. `api/audit.ts`
 * and `api/contact.ts` are left with nothing but the translation between HTTP
 * and this function, which is why they carry no tests of their own: Vercel
 * deploys every file under `api/` as a route, so a test file there would answer
 * at a public URL.
 */

const NOW = 1_757_000_000_000
/** Long enough ago to look like a person filled it in. */
const STARTED_AT = NOW - 30_000

const sendConfig: MailConfig = {
  mode: 'send',
  apiKey: 're_test_key',
  from: 'Vértigo <no-reply@vertigomkt.com>',
  timeoutMs: 10_000,
  perIpPerHour: 5,
  perEmailPerHour: 3,
}

const dryRunConfig: MailConfig = {
  mode: 'dry-run',
  reason: 'no-key',
  timeoutMs: 10_000,
  perIpPerHour: 5,
  perEmailPerHour: 3,
}

const contactBody = {
  name: 'Nombre Prueba',
  email: 'prueba@example.com',
  message: 'Hola, me gustaría saber más.',
  empresa: '',
  startedAt: STARTED_AT,
}

const auditBody = {
  plan: 'auditoria-seo-completa',
  revenue: REVENUE_RANGES[0],
  budget: '2.000 - 5.000 EUR',
  name: 'Nombre Prueba',
  email: 'prueba@example.com',
  website: 'example.com',
  phone: '',
  empresa: '',
  startedAt: STARTED_AT,
}

function deps(overrides: Partial<HandleDeps> = {}): HandleDeps {
  return {
    config: sendConfig,
    limiter: createLimiter({ perIpPerHour: 5, perEmailPerHour: 3, now: () => NOW }),
    send: sendSpy(),
    now: () => NOW,
    cmsRecipient: () => 'contacto@vertigomkt.com',
    isProduction: false,
    ...overrides,
  }
}

describe('a submission that should arrive', () => {
  it('sends exactly one email and answers ok', async () => {
    const send = sendSpy()
    const result = await handleSubmission(
      { kind: 'contact', body: contactBody, ip: '1.2.3.4' },
      deps({ send }),
    )

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ ok: true })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('sends to the address the CMS carries', async () => {
    const send = sendSpy()
    await handleSubmission({ kind: 'contact', body: contactBody, ip: '1.2.3.4' }, deps({ send }))
    expect(send.mock.calls[0][1]).toBe('contacto@vertigomkt.com')
  })

  it('prefers the override, because the CMS address is undeliverable in sandbox', async () => {
    const send = sendSpy()
    await handleSubmission(
      { kind: 'contact', body: contactBody, ip: '1.2.3.4' },
      deps({ send, config: { ...sendConfig, toOverride: 'owner@example.com' } }),
    )
    expect(send.mock.calls[0][1]).toBe('owner@example.com')
  })

  it('carries the audit form\'s own fields', async () => {
    const send = sendSpy()
    await handleSubmission({ kind: 'audit', body: auditBody, ip: '1.2.3.4' }, deps({ send }))

    const message = send.mock.calls[0][0]
    expect(message.subject).toMatch(/auditor/i)
    // Normalised on the way through, so the recipient sees what was checked.
    expect(message.text).toContain('https://example.com/')
    // The whole point of the two business-context fields is that a person reads them,
    // so "it validated" is not the assertion that matters — "it arrived" is.
    // This is the end of the path the plan names: UI -> validation -> payload
    // -> server validation -> email.
    expect(message.text).toContain(auditBody.revenue)
    expect(message.text).toContain(auditBody.budget)
  })

  it('accepts a form somebody left open for an hour', async () => {
    // Refusing this would lose a real lead: a person opens the panel, thinks
    // about it, and comes back. The verdict is recorded, not enforced.
    const send = sendSpy()
    const result = await handleSubmission(
      { kind: 'contact', body: { ...contactBody, startedAt: NOW - 7_200_000 }, ip: '1.2.3.4' },
      deps({ send }),
    )
    expect(result.status).toBe(200)
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('a submission that should not', () => {
  it('answers 422 with a message per bad field, and sends nothing', async () => {
    const send = sendSpy()
    const result = await handleSubmission(
      { kind: 'contact', body: { ...contactBody, email: 'nope', name: '' }, ip: '1.2.3.4' },
      deps({ send }),
    )

    expect(result.status).toBe(422)
    expect(result.body).toMatchObject({ ok: false, code: 'invalid' })
    expect(Object.keys((result.body as { fields: Record<string, string> }).fields).sort()).toEqual([
      'email',
      'name',
    ])
    expect(send).not.toHaveBeenCalled()
  })

  it('answers 200 and sends nothing when the honeypot was filled', async () => {
    // BOTH halves matter. The 200 is what stops a bot learning which field gave
    // it away; the silence is what stops the inbox filling up. This is the one
    // place the "never report a success that did not happen" rule is bent, and
    // it is bent only for a caller that filled in an input no person can see.
    const send = sendSpy()
    const result = await handleSubmission(
      { kind: 'contact', body: { ...contactBody, empresa: 'Bot Industries' }, ip: '1.2.3.4' },
      deps({ send }),
    )

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ ok: true })
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses a form filled faster than a person could, and says so', async () => {
    // NOT a silent discard: a person who somehow trips this must be told, or
    // they are shown a receipt for a message nobody will read.
    const send = sendSpy()
    const result = await handleSubmission(
      { kind: 'contact', body: { ...contactBody, startedAt: NOW - 100 }, ip: '1.2.3.4' },
      deps({ send }),
    )

    expect(result.status).toBe(429)
    expect(result.body).toMatchObject({ ok: false, code: 'rate_limited' })
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses a submission carrying no start time', async () => {
    const result = await handleSubmission(
      { kind: 'contact', body: { ...contactBody, startedAt: undefined }, ip: '1.2.3.4' },
      deps(),
    )
    expect(result.status).toBe(429)
  })

  it('refuses once the sender is over their cap, and says how long to wait', async () => {
    const limiter = createLimiter({ perIpPerHour: 1, perEmailPerHour: 9, now: () => NOW })
    const shared = deps({ limiter })

    const first = await handleSubmission(
      { kind: 'contact', body: contactBody, ip: '1.2.3.4' },
      shared,
    )
    expect(first.status).toBe(200)

    const second = await handleSubmission(
      { kind: 'contact', body: contactBody, ip: '1.2.3.4' },
      shared,
    )
    expect(second.status).toBe(429)
    expect((second.body as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0)
  })

  it('does not spend an allowance on a submission it rejected', async () => {
    // An invalid payload must not count: otherwise three typos lock somebody
    // out of a form they never successfully sent.
    const limiter = createLimiter({ perIpPerHour: 1, perEmailPerHour: 9, now: () => NOW })
    const shared = deps({ limiter })

    await handleSubmission(
      { kind: 'contact', body: { ...contactBody, email: 'nope' }, ip: '1.2.3.4' },
      shared,
    )
    const good = await handleSubmission(
      { kind: 'contact', body: contactBody, ip: '1.2.3.4' },
      shared,
    )
    expect(good.status).toBe(200)
  })

  it('answers 502 when Resend refuses, rather than claiming success', async () => {
    const send = sendSpy({ ok: false, reason: 'upstream_failed', detail: 'resend answered 401' })
    const result = await handleSubmission(
      { kind: 'contact', body: contactBody, ip: '1.2.3.4' },
      deps({ send }),
    )

    expect(result.status).toBe(502)
    expect(result.body).toMatchObject({ ok: false, code: 'upstream_failed' })
  })

  it('never forwards what Resend said', async () => {
    const send = sendSpy({
      ok: false,
      reason: 'upstream_failed',
      detail: 'resend answered 401 for re_super_secret_value',
    })
    const result = await handleSubmission(
      { kind: 'contact', body: contactBody, ip: '1.2.3.4' },
      deps({ send }),
    )
    expect(JSON.stringify(result.body)).not.toContain('re_super_secret_value')
    expect(JSON.stringify(result.body)).not.toContain('401')
  })
})

describe('the dry run', () => {
  it('answers ok and sends nothing', async () => {
    const send = sendSpy()
    const result = await handleSubmission(
      { kind: 'contact', body: contactBody, ip: '1.2.3.4' },
      deps({ send, config: dryRunConfig }),
    )

    expect(result.status).toBe(200)
    expect(send).not.toHaveBeenCalled()
  })

  it('says it was a dry run, so the e2e suite can prove it is not mailing anyone', async () => {
    const result = await handleSubmission(
      { kind: 'contact', body: contactBody, ip: '1.2.3.4' },
      deps({ config: dryRunConfig }),
    )
    expect(result.body).toMatchObject({ ok: true, delivery: 'dry-run' })
  })

  it('says nothing about delivery in production', async () => {
    // The field is a development affordance. In production it would tell an
    // attacker whether the endpoint is configured.
    const result = await handleSubmission(
      { kind: 'contact', body: contactBody, ip: '1.2.3.4' },
      deps({ isProduction: true }),
    )
    expect(result.body).toEqual({ ok: true })
  })

  it('reports a discarded honeypot as discarded, outside production', async () => {
    const result = await handleSubmission(
      { kind: 'contact', body: { ...contactBody, empresa: 'Bot' }, ip: '1.2.3.4' },
      deps(),
    )
    expect(result.body).toMatchObject({ delivery: 'discarded' })
  })
})
