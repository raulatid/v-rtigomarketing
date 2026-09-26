import { describe, expect, it } from 'vitest'
import { VIEW_OPEN } from './config'
import { respondClaim, respondView } from './respond'
import type { ViewStore } from './store'

/** Fails the test on any store call: closed must cost the store nothing. */
const untouchable: ViewStore = {
  incr: () => Promise.reject(new Error('store touched')),
  exists: () => Promise.reject(new Error('store touched')),
  setIfAbsent: () => Promise.reject(new Error('store touched')),
  get: () => Promise.reject(new Error('store touched')),
}

function request(body: unknown): Request {
  return new Request('https://example.test/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe.runIf(!VIEW_OPEN)('with VIEW_OPEN off', () => {
  it('answers a view with a decoy without touching the store', async () => {
    const response = await respondView(request({ p: [0, 0, 0], f: [0, 0, -1], fov: 35 }), {}, { store: untouchable })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { t: string; f?: number }
    expect(body.t).toHaveLength(44)
    expect(body.f).toBeUndefined()
  })

  it('answers a claim as closed without touching the store', async () => {
    const response = await respondClaim(
      request({ t: 'x'.repeat(44), email: 'a@example.com', consent: true }),
      {},
      { store: untouchable },
    )
    expect(await response.json()).toEqual({ code: null, closed: true })
  })
})
