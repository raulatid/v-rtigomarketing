import { describe, expect, it, vi } from 'vitest'
import { sendEmail, RESEND_ENDPOINT, type SendOptions } from './resend'
import type { RenderedEmail } from './renderEmail'

/**
 * The one call that leaves the building.
 *
 * `fetchImpl` is injected, exactly as `content/lib/sanity.ts` injects it, so the
 * whole transport is testable without a network and without an account. The
 * repository talks to Sanity over plain `fetch` rather than through a client
 * library, and this follows that: one dependency not added, one supply-chain
 * surface not taken on, for about forty lines.
 */

const message: RenderedEmail = {
  subject: 'Contacto · Nombre Prueba',
  text: 'Nuevo mensaje.',
  html: '<p>Nuevo mensaje.</p>',
  replyTo: 'prueba@example.com',
}

function options(overrides: Partial<SendOptions> = {}): SendOptions {
  return {
    apiKey: 're_super_secret_value',
    from: 'Vértigo <no-reply@vertigomkt.com>',
    to: 'contacto@vertigomkt.com',
    timeoutMs: 5_000,
    now: () => 1_757_000_000_000,
    ...overrides,
  }
}

/** A fetch that records what it was handed and answers however the test says. */
function fakeFetch(answer: Response | (() => Promise<Response>)) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return typeof answer === 'function' ? await answer() : answer
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

function accepted(id = 'a1b2c3'): Response {
  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function bodyOf(init: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

describe('the request', () => {
  it('posts the message to the Resend endpoint', async () => {
    const fetchImpl = fakeFetch(accepted())
    const outcome = await sendEmail(message, options({ fetchImpl: fetchImpl.impl }))

    expect(outcome.ok).toBe(true)
    expect(fetchImpl.calls).toHaveLength(1)
    expect(fetchImpl.calls[0].url).toBe(RESEND_ENDPOINT)
    expect(fetchImpl.calls[0].init.method).toBe('POST')
  })

  it('authorises with a bearer token', async () => {
    const fetchImpl = fakeFetch(accepted())
    await sendEmail(message, options({ fetchImpl: fetchImpl.impl }))

    const headers = new Headers(fetchImpl.calls[0].init.headers)
    expect(headers.get('authorization')).toBe('Bearer re_super_secret_value')
    expect(headers.get('content-type')).toContain('application/json')
  })

  it('carries the addresses, the subject and both bodies', async () => {
    const fetchImpl = fakeFetch(accepted())
    await sendEmail(message, options({ fetchImpl: fetchImpl.impl }))

    const body = bodyOf(fetchImpl.calls[0].init)
    expect(body.from).toBe('Vértigo <no-reply@vertigomkt.com>')
    expect(body.to).toEqual(['contacto@vertigomkt.com'])
    expect(body.subject).toBe(message.subject)
    expect(body.text).toBe(message.text)
    expect(body.html).toBe(message.html)
    // The field that makes the notification useful: reply goes to the enquirer.
    expect(body.reply_to).toBe('prueba@example.com')
  })

  it('returns the id Resend assigned, for the log', async () => {
    const fetchImpl = fakeFetch(accepted('idem-42'))
    const outcome = await sendEmail(message, options({ fetchImpl: fetchImpl.impl }))
    expect(outcome.ok && outcome.id).toBe('idem-42')
  })
})

describe('the idempotency key', () => {
  it('is the same for the same message in the same minute', async () => {
    // A double submit — a second click, a flaky connection retried by the
    // browser — must not put two identical enquiries in the inbox.
    const first = fakeFetch(accepted())
    const second = fakeFetch(accepted())
    await sendEmail(message, options({ fetchImpl: first.impl }))
    await sendEmail(message, options({ fetchImpl: second.impl }))

    const keyOf = (calls: typeof first.calls) =>
      new Headers(calls[0].init.headers).get('idempotency-key')
    expect(keyOf(first.calls)).toBe(keyOf(second.calls))
    expect(keyOf(first.calls)).toBeTruthy()
  })

  it('differs when any part of the message differs', async () => {
    const first = fakeFetch(accepted())
    const second = fakeFetch(accepted())
    await sendEmail(message, options({ fetchImpl: first.impl }))
    await sendEmail({ ...message, text: 'Otro mensaje.' }, options({ fetchImpl: second.impl }))

    const keyOf = (calls: typeof first.calls) =>
      new Headers(calls[0].init.headers).get('idempotency-key')
    expect(keyOf(first.calls)).not.toBe(keyOf(second.calls))
  })

  it('differs a minute later, so a genuine second enquiry still arrives', async () => {
    // The cost of keying on content alone would be a lost lead: somebody who
    // writes the same short message twice because nobody replied.
    const first = fakeFetch(accepted())
    const second = fakeFetch(accepted())
    await sendEmail(message, options({ fetchImpl: first.impl, now: () => 1_757_000_000_000 }))
    await sendEmail(message, options({ fetchImpl: second.impl, now: () => 1_757_000_120_000 }))

    const keyOf = (calls: typeof first.calls) =>
      new Headers(calls[0].init.headers).get('idempotency-key')
    expect(keyOf(first.calls)).not.toBe(keyOf(second.calls))
  })

  it('stays inside the length Resend accepts', async () => {
    const fetchImpl = fakeFetch(accepted())
    await sendEmail({ ...message, text: 'a'.repeat(5_000) }, options({ fetchImpl: fetchImpl.impl }))
    const key = new Headers(fetchImpl.calls[0].init.headers).get('idempotency-key') ?? ''
    expect(key.length).toBeLessThanOrEqual(256)
  })
})

describe('when it goes wrong', () => {
  it('reports a refusal without echoing what Resend said', async () => {
    // The upstream body can carry the address, the key prefix, or an internal
    // message. None of it belongs anywhere the client can see.
    const fetchImpl = fakeFetch(
      new Response(JSON.stringify({ message: 'API key is invalid: re_super_secret_value' }), {
        status: 401,
      }),
    )
    const outcome = await sendEmail(message, options({ fetchImpl: fetchImpl.impl }))

    expect(outcome.ok).toBe(false)
    expect(JSON.stringify(outcome)).not.toContain('re_super_secret_value')
    expect(JSON.stringify(outcome)).not.toContain('API key is invalid')
  })

  it('reports a rejection the same way whatever the status', async () => {
    for (const status of [400, 401, 403, 422, 429, 500, 503]) {
      const fetchImpl = fakeFetch(new Response('{}', { status }))
      const outcome = await sendEmail(message, options({ fetchImpl: fetchImpl.impl }))
      expect(outcome.ok, String(status)).toBe(false)
    }
  })

  it('gives up rather than hanging when Resend does not answer', async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const outcome = await sendEmail(
      message,
      options({ fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20 }),
    )
    expect(outcome.ok).toBe(false)
  })

  it('survives a network error rather than throwing at the caller', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const outcome = await sendEmail(
      message,
      options({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    )
    expect(outcome.ok).toBe(false)
  })

  it('treats a 200 that is not JSON as a failure', async () => {
    // A proxy or a captive portal answering 200 with an HTML page must not be
    // read as a delivered email.
    const fetchImpl = fakeFetch(new Response('<html>hello</html>', { status: 200 }))
    const outcome = await sendEmail(message, options({ fetchImpl: fetchImpl.impl }))
    expect(outcome.ok).toBe(false)
  })

  it('treats a 200 with no id as a failure', async () => {
    const fetchImpl = fakeFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const outcome = await sendEmail(message, options({ fetchImpl: fetchImpl.impl }))
    expect(outcome.ok).toBe(false)
  })
})

describe('what never leaves this module', () => {
  it('keeps the key out of anything it returns', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED to api.resend.com with re_super_secret_value')
    })
    const outcome = await sendEmail(
      message,
      options({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    )
    expect(JSON.stringify(outcome)).not.toContain('re_super_secret_value')
  })
})
