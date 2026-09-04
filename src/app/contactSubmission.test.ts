import { describe, expect, it } from 'vitest'
import { createContactTransport, CONTACT_ENDPOINT, type ContactRequest } from './contactSubmission'
import { SubmissionError } from './submissionError'

/**
 * The contact form's half of the honesty rule, and a file that did not exist
 * before: the contact transport shipped with no tests at all while it was a
 * stub. It has a real backend now, so it gets the same treatment its sibling
 * has — and deliberately its OWN file, mirroring the duplication the two
 * transports are built on rather than sharing a suite that would quietly
 * couple them.
 *
 * `auditSubmission.test.ts` carries the long-form reasoning.
 */

const payload: ContactRequest = {
  name: 'Nombre Prueba',
  email: 'prueba@example.com',
  message: 'Hola, me gustaría saber más.',
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

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
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }),
    ])
  }
  return { impl: impl as unknown as typeof fetch, calls }
}

function transportWith(answer: Response | (() => Promise<Response>), timeoutMs?: number) {
  const fetchImpl = fakeFetch(answer)
  const submit = createContactTransport({
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
  it('posts to its OWN endpoint, not the audit one', () => {
    // The one assertion that would catch a copy-paste between the two files.
    expect(CONTACT_ENDPOINT).toBe('/api/contact')
  })

  it('posts the three fields, the honeypot and the start time', async () => {
    const { submit, calls } = transportWith(jsonResponse(200, { ok: true }))
    await submit(payload)

    expect(calls[0].url).toBe(CONTACT_ENDPOINT)
    const sent = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>
    expect(sent).toMatchObject(payload)
    expect(sent).toHaveProperty('empresa')
    expect(typeof sent.startedAt).toBe('number')
    // The audit form's fields have no business here.
    expect(sent).not.toHaveProperty('website')
    expect(sent).not.toHaveProperty('plan')
  })
})

describe('when it may resolve', () => {
  it('resolves on a 2xx that says ok', async () => {
    const { submit } = transportWith(jsonResponse(200, { ok: true }))
    await expect(submit(payload)).resolves.toBeUndefined()
  })

  it('rejects a 200 that does not say ok', async () => {
    expect(await codeOfRejection(transportWith(jsonResponse(200, {})).submit(payload))).toBe(
      'unknown',
    )
  })

  it('NEVER resolves on any status but a 2xx that says ok', async () => {
    for (const status of [400, 401, 403, 404, 405, 415, 422, 429, 500, 502, 503, 504]) {
      const { submit } = transportWith(jsonResponse(status, { ok: false }))
      await expect(submit(payload), 'status ' + status).rejects.toBeInstanceOf(SubmissionError)
    }
  })
})

describe('how a failure reaches the dialog', () => {
  it('maps 422 to invalid, with the fields the server named', async () => {
    const answer = jsonResponse(422, {
      ok: false,
      code: 'invalid',
      fields: { message: 'Cuéntanos en qué podemos ayudarte.' },
    })
    try {
      await transportWith(answer).submit(payload)
      throw new Error('expected a rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(SubmissionError)
      expect((error as SubmissionError).fields?.message).toMatch(/ayudarte/)
    }
  })

  it('maps 429 to rate_limited', async () => {
    const answer = jsonResponse(429, { ok: false, code: 'rate_limited' })
    expect(await codeOfRejection(transportWith(answer).submit(payload))).toBe('rate_limited')
  })

  it('maps a dead network and a timeout to network', async () => {
    const dead = transportWith(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await codeOfRejection(dead.submit(payload))).toBe('network')

    const hangs = transportWith(() => new Promise<Response>(() => {}), 20)
    expect(await codeOfRejection(hangs.submit(payload))).toBe('network')
  })
})

describe('the default transport the application binds', () => {
  it('exists, takes one argument, and does not read the build flag', async () => {
    const { submitContactRequest } = await import('./contactSubmission')
    expect(typeof submitContactRequest).toBe('function')
    expect(submitContactRequest).toHaveLength(1)

    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/app/contactSubmission.ts', 'utf8'),
    )
    expect(source).not.toContain('DEBUG_TOOLS_ENABLED')
  })
})
