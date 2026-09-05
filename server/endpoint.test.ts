import { describe, expect, it, vi } from 'vitest'
import { respond, BODY_LIMIT_BYTES, resetLimiterForTests } from './endpoint'
import type { MailEnv } from './config'

/**
 * The HTTP shell, tested through the Web `Request`/`Response` pair rather than
 * through Vercel — which is exactly what makes it testable at all. The two
 * files under `api/` do nothing but hand this function a request, so this is
 * the last layer with any decisions left in it.
 *
 * `MAIL_DRY_RUN` is set in every case here: a unit test that could send mail is
 * a unit test nobody should run twice.
 */

const NOW = 1_757_000_000_000

const dryRun: MailEnv = { MAIL_DRY_RUN: '1' }

function body(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Nombre Prueba',
    email: 'prueba@example.com',
    message: 'Hola, me gustaría saber más.',
    empresa: '',
    startedAt: NOW - 30_000,
    ...overrides,
  }
}

function post(payload: unknown, init: RequestInit = {}) {
  // `init` is spread FIRST: spread last, its `headers` would replace the merged
  // object rather than extend it, and every case below would arrive without a
  // content-type and be refused as 415.
  return new Request('https://vertigomkt.com/api/contact', {
    ...init,
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  })
}

async function jsonOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

describe('the shape of the request', () => {
  it('refuses anything but POST, and says what it accepts', async () => {
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      const response = await respond(
        'contact',
        new Request('https://vertigomkt.com/api/contact', { method }),
        dryRun,
        { now: () => NOW },
      )
      expect(response.status, method).toBe(405)
      expect(response.headers.get('allow')).toBe('POST')
    }
  })

  it('answers OPTIONS without running anything', async () => {
    const response = await respond(
      'contact',
      new Request('https://vertigomkt.com/api/contact', { method: 'OPTIONS' }),
      dryRun,
      { now: () => NOW },
    )
    expect(response.status).toBe(204)
  })

  it('refuses a body that is not declared as JSON', async () => {
    const response = await respond(
      'contact',
      post(body(), { headers: { 'content-type': 'text/plain' } }),
      dryRun,
      { now: () => NOW },
    )
    expect(response.status).toBe(415)
  })

  it('refuses a body that is not JSON at all', async () => {
    const response = await respond('contact', post('not json'), dryRun, { now: () => NOW })
    expect(response.status).toBe(400)
    expect(await jsonOf(response)).toMatchObject({ ok: false, code: 'malformed' })
  })

  it('refuses a body past the cap without parsing it', async () => {
    // The cap is the point: a megabyte of JSON must not be parsed before being
    // rejected, and the parse is where the cost is.
    const huge = JSON.stringify({ ...body(), message: 'a'.repeat(BODY_LIMIT_BYTES) })
    const response = await respond('contact', post(huge), dryRun, { now: () => NOW })
    expect(response.status).toBe(400)
  })

  it('measures the cap in BYTES, not in characters', async () => {
    // A three-byte character per code unit is ordinary for CJK, so a body well
    // under the cap by `String.length` can be three times over it on the wire.
    // Built at a third of the cap plus one, which is under the limit as
    // characters and over it as bytes — the case the old check let through.
    const wide = '漢'.repeat(Math.ceil(BODY_LIMIT_BYTES / 3))
    const huge = JSON.stringify({ ...body(), message: wide })
    expect(huge.length).toBeLessThan(BODY_LIMIT_BYTES * 3)
    const response = await respond('contact', post(huge), dryRun, { now: () => NOW })
    expect(response.status).toBe(400)
  })

  it('refuses a lying content-length without reading the stream', async () => {
    const response = await respond(
      'contact',
      post(body(), { headers: { 'content-length': String(BODY_LIMIT_BYTES + 1) } }),
      dryRun,
      { now: () => NOW },
    )
    expect(response.status).toBe(400)
  })
})

describe('the answers it gives', () => {
  it('accepts a good submission and reports the dry run', async () => {
    resetLimiterForTests()
    const response = await respond('contact', post(body()), dryRun, { now: () => NOW })
    expect(response.status).toBe(200)
    expect(await jsonOf(response)).toMatchObject({ ok: true, delivery: 'dry-run' })
    expect(response.headers.get('content-type')).toContain('application/json')
  })

  it('answers 422 with the fields the client should mark', async () => {
    resetLimiterForTests()
    const response = await respond('contact', post(body({ email: 'nope' })), dryRun, {
      now: () => NOW,
    })
    expect(response.status).toBe(422)
    const payload = await jsonOf(response)
    expect(payload).toMatchObject({ ok: false, code: 'invalid' })
    expect(payload.fields).toHaveProperty('email')
  })

  it('sets Retry-After when it refuses for rate', async () => {
    resetLimiterForTests()
    const response = await respond('contact', post(body({ startedAt: NOW })), dryRun, {
      now: () => NOW,
    })
    expect(response.status).toBe(429)
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('answers 500 when the deployment is not configured to send', async () => {
    resetLimiterForTests()
    // Production with no key: the one arrangement that must never look ok.
    const response = await respond('contact', post(body()), { VERCEL_ENV: 'production' }, {
      now: () => NOW,
    })
    expect(response.status).toBe(500)
    expect(await jsonOf(response)).toMatchObject({ ok: false, code: 'not_configured' })
  })

  it('never lets a configuration message reach the caller', async () => {
    resetLimiterForTests()
    const response = await respond(
      'contact',
      post(body()),
      { VERCEL_ENV: 'production', RESEND_API_KEY: 're_super_secret_value' },
      { now: () => NOW },
    )
    // MAIL_FROM is missing, so this fails to configure. The message names the
    // variable and is logged; the body says nothing. Read ONCE: a Response body
    // is a stream, and the second read would throw rather than assert.
    expect(response.status).toBe(500)
    const payload = JSON.stringify(await jsonOf(response))
    expect(payload).not.toContain('re_super_secret_value')
    expect(payload).not.toContain('MAIL_FROM')
  })

  it('never caches an answer', async () => {
    resetLimiterForTests()
    const response = await respond('contact', post(body()), dryRun, { now: () => NOW })
    expect(response.headers.get('cache-control')).toMatch(/no-store/)
  })
})

describe('who it thinks is calling', () => {
  it('takes the first hop of x-forwarded-for', async () => {
    resetLimiterForTests()
    const log = vi.fn()
    // Two submissions from one address, a cap of one: the second is refused
    // only if the address was read the same way both times.
    const env: MailEnv = { ...dryRun, MAIL_RATE_PER_HOUR: '1' }
    const headers = { 'x-forwarded-for': '203.0.113.7, 70.41.3.18' }

    const first = await respond('contact', post(body(), { headers }), env, { now: () => NOW, log })
    const second = await respond(
      'contact',
      post(body({ email: 'otra@example.com' }), { headers }),
      env,
      { now: () => NOW, log },
    )

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
  })
})

describe('the audit endpoint', () => {
  it('reads the audit form\'s own fields', async () => {
    resetLimiterForTests()
    const response = await respond(
      'audit',
      post({
        plan: 'auditoria-seo-completa',
        revenue: '20k / 100k',
        budget: 'aprox. 3.000 al mes',
        name: 'Nombre Prueba',
        email: 'prueba@example.com',
        website: 'example.com',
        phone: '',
        empresa: '',
        startedAt: NOW - 30_000,
      }),
      dryRun,
      { now: () => NOW },
    )
    expect(response.status).toBe(200)
  })

  it('refuses an audit payload sent to it without a plan', async () => {
    resetLimiterForTests()
    const response = await respond('audit', post(body()), dryRun, { now: () => NOW })
    expect(response.status).toBe(422)
    expect((await jsonOf(response)).fields).toHaveProperty('plan')
  })
})
