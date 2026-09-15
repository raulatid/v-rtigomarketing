import { describe, expect, it } from 'vitest'
import { readSubmissionResponse } from './submissionResponse'

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('shared submission response protocol', () => {
  it.each([null, [], 'ok', 1, { ok: 'true' }, { ok: 1 }, { ok: false }])(
    'rejects a successful HTTP response without an explicit delivery confirmation: %j',
    async (body) => {
      await expect(readSubmissionResponse(response(200, body))).rejects.toMatchObject({ code: 'unknown' })
    },
  )

  it('prefers a recognized server code and keeps only string field messages', async () => {
    await expect(readSubmissionResponse(response(400, {
      code: 'invalid', fields: { email: 'Invalid email.', count: 3, nested: {} },
    }))).rejects.toMatchObject({ code: 'invalid', fields: { email: 'Invalid email.' } })
  })

  it.each([null, [], 'email', {}, { email: 42 }])('discards malformed or empty field maps: %j', async (fields) => {
    await expect(readSubmissionResponse(response(422, { fields })))
      .rejects.toMatchObject({ code: 'invalid', fields: undefined })
  })

  it.each([
    [422, 'invalid'], [429, 'rate_limited'], [500, 'not_configured'],
    [502, 'upstream_failed'], [503, 'upstream_failed'], [504, 'upstream_failed'], [418, 'unknown'],
  ])('uses status %i when the body is unreadable', async (status, code) => {
    await expect(readSubmissionResponse(new Response('Unavailable', { status: Number(status) })))
      .rejects.toMatchObject({ code })
  })

  it('does not accept ok from a failed HTTP request', async () => {
    await expect(readSubmissionResponse(response(503, { ok: true })))
      .rejects.toMatchObject({ code: 'upstream_failed' })
  })

  it('ignores unrecognized declared codes and consumes a success body once', async () => {
    await expect(readSubmissionResponse(response(429, { code: 'network' })))
      .rejects.toMatchObject({ code: 'rate_limited' })
    const accepted = response(201, { ok: true })
    await expect(readSubmissionResponse(accepted)).resolves.toBeUndefined()
    expect(accepted.bodyUsed).toBe(true)
  })
})
