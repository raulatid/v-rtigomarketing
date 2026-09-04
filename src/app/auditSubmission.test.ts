import { describe, expect, it } from 'vitest'
import { createAuditTransport, AUDIT_ENDPOINT, type AuditRequest } from './auditSubmission'
import { SubmissionError } from './submissionError'

/**
 * THE HONESTY RULE, now that there is a backend.
 *
 * This file used to pin the opposite claim: "production transport rejects: no
 * backend exists, so success would be a lie". That premise is gone — the
 * endpoint is real — but the rule it protected is not, and it has become
 * sharper rather than softer:
 *
 *   THE FORM MAY ONLY REACH `success` AFTER A REQUEST THAT GENUINELY SUCCEEDED.
 *
 * Everything below is that one sentence, taken apart. The last case is the
 * whole of it in one line: every status this endpoint can answer with, except a
 * 2xx that actually says `ok`, must REJECT. A green tick in front of somebody
 * who filled in their email address, for a message nobody will read, is the
 * failure this file exists to make impossible.
 *
 * The server half of the same rule — that production may never quietly dry-run
 * — lives in `server/config.test.ts`.
 */

const payload: AuditRequest = {
  plan: 'completa',
  name: 'Nombre Prueba',
  email: 'prueba@example.com',
  website: 'https://example.com',
  phone: '',
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * A fetch that records the call and answers with whatever the case needs.
 *
 * It HONOURS THE ABORT SIGNAL, because the real one does. A fake that ignored
 * it would let the timeout case hang for the whole test timeout and then report
 * a failure that looks like a bug in the transport rather than in the fake.
 */
function fakeFetch(answer: Response | (() => Promise<Response>)) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const impl = (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const answered = Promise.resolve(typeof answer === 'function' ? answer() : answer)
    const signal = init?.signal
    if (signal === undefined || signal === null) return answered
    return Promise.race([
      answered,
      new Promise<Response>((_resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'))
          return
        }
        signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
      }),
    ])
  }
  return { impl: impl as unknown as typeof fetch, calls }
}

function transportWith(answer: Response | (() => Promise<Response>), timeoutMs?: number) {
  const fetchImpl = fakeFetch(answer)
  const submit = createAuditTransport({
    fetchImpl: fetchImpl.impl,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  })
  return { submit, calls: fetchImpl.calls }
}

async function codeOfRejection(promise: Promise<void>): Promise<string> {
  try {
    await promise
  } catch (error) {
    return error instanceof SubmissionError ? error.code : 'not-a-submission-error'
  }
  throw new Error('expected the submission to reject, and it resolved')
}

describe('what it sends', () => {
  it('posts the payload as JSON to the audit endpoint', async () => {
    const { submit, calls } = transportWith(jsonResponse(200, { ok: true }))
    await submit(payload)

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(AUDIT_ENDPOINT)
    expect(calls[0].init.method).toBe('POST')
    expect(new Headers(calls[0].init.headers).get('content-type')).toContain('application/json')

    const sent = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>
    expect(sent).toMatchObject(payload)
  })

  it('carries the honeypot and the time the panel opened', async () => {
    // Both are the server's cheap bot checks. A transport that dropped them
    // would make every genuine submission look automated.
    const { submit, calls } = transportWith(jsonResponse(200, { ok: true }))
    await submit(payload)

    const sent = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>
    expect(sent).toHaveProperty('empresa')
    expect(typeof sent.startedAt).toBe('number')
  })

  it('is a same-origin path, so the CSP needs no third-party origin', async () => {
    expect(AUDIT_ENDPOINT.startsWith('/')).toBe(true)
  })
})

describe('when it may resolve', () => {
  it('resolves on a 2xx that says ok', async () => {
    const { submit } = transportWith(jsonResponse(200, { ok: true }))
    await expect(submit(payload)).resolves.toBeUndefined()
  })

  it('rejects a 200 whose body does not say ok', async () => {
    // The direct successor to the deleted "production rejects" case. A proxy,
    // a captive portal or a misrouted rewrite can all answer 200 with
    // something that is not this endpoint's answer.
    expect(await codeOfRejection(transportWith(jsonResponse(200, { ok: false })).submit(payload)))
      .toBe('unknown')
  })

  it('rejects a 200 that is not JSON at all', async () => {
    const html = new Response('<!doctype html><title>hello</title>', { status: 200 })
    expect(await codeOfRejection(transportWith(html).submit(payload))).toBe('unknown')
  })

  it('rejects a 200 with an empty body', async () => {
    expect(await codeOfRejection(transportWith(new Response('', { status: 200 })).submit(payload)))
      .toBe('unknown')
  })
})

describe('how a failure reaches the form', () => {
  it('maps 422 to invalid, and carries the fields the server named', async () => {
    const answer = jsonResponse(422, {
      ok: false,
      code: 'invalid',
      fields: { email: 'El formato del email no es válido.' },
    })
    const { submit } = transportWith(answer)

    try {
      await submit(payload)
      throw new Error('expected a rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(SubmissionError)
      const submission = error as SubmissionError
      expect(submission.code).toBe('invalid')
      expect(submission.fields?.email).toBe('El formato del email no es válido.')
    }
  })

  it('maps 429 to rate_limited', async () => {
    const answer = jsonResponse(429, { ok: false, code: 'rate_limited', retryAfterSeconds: 60 })
    expect(await codeOfRejection(transportWith(answer).submit(payload))).toBe('rate_limited')
  })

  it('maps 500 and 502 to their own codes', async () => {
    expect(
      await codeOfRejection(
        transportWith(jsonResponse(500, { ok: false, code: 'not_configured' })).submit(payload),
      ),
    ).toBe('not_configured')
    expect(
      await codeOfRejection(
        transportWith(jsonResponse(502, { ok: false, code: 'upstream_failed' })).submit(payload),
      ),
    ).toBe('upstream_failed')
  })

  it('maps a request that never arrived to network', async () => {
    const { submit } = transportWith(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await codeOfRejection(submit(payload))).toBe('network')
  })

  it('gives up on its own clock rather than leaving the form spinning', async () => {
    const hangs = () => new Promise<Response>(() => {})
    const { submit } = transportWith(hangs, 20)
    expect(await codeOfRejection(submit(payload))).toBe('network')
  })

  it('falls back to a code even when the error body is unreadable', async () => {
    // A 500 from the platform rather than from our handler has no JSON body.
    const { submit } = transportWith(new Response('Internal Server Error', { status: 500 }))
    expect(await codeOfRejection(submit(payload))).toBe('not_configured')
  })
})

describe('the rule, stated once', () => {
  it('NEVER resolves on any status but a 2xx that says ok', async () => {
    // One line carrying what the deleted production-rejects case carried: there
    // is no status, and no body, that puts "Solicitud recibida" in front of a
    // person without a delivered request behind it.
    const statuses = [400, 401, 403, 404, 405, 415, 422, 429, 500, 502, 503, 504]
    for (const status of statuses) {
      const { submit } = transportWith(jsonResponse(status, { ok: false, code: 'whatever' }))
      await expect(submit(payload), 'status ' + status).rejects.toBeInstanceOf(SubmissionError)
    }
  })

  it('does not swallow a rejection into a resolution anywhere', async () => {
    // Guard on the guard: if `submit` ever returned a resolved promise for a
    // thrown transport, every case above would pass vacuously.
    const { submit } = transportWith(async () => {
      throw new Error('boom')
    })
    const settled = await submit(payload).then(
      () => 'resolved',
      () => 'rejected',
    )
    expect(settled).toBe('rejected')
  })
})

describe('the default transport the application binds', () => {
  it('exists and is a function of one argument', async () => {
    // It reads the real `fetch`, so it is not called here. What matters is that
    // the module still exports one, since App and BlogRoute never pass their own.
    const { submitAuditRequest } = await import('./auditSubmission')
    expect(typeof submitAuditRequest).toBe('function')
    expect(submitAuditRequest).toHaveLength(1)
  })

  it('no longer depends on the build flag', async () => {
    // The demo/production split moved to the SERVER, which is what lets a
    // preview deployment exercise the real handler in dry-run instead of a
    // stub. `buildFlags` must not come back here.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/app/auditSubmission.ts', 'utf8'),
    )
    expect(source).not.toContain('buildFlags')
    expect(source).not.toContain('DEBUG_TOOLS_ENABLED')
  })
})

