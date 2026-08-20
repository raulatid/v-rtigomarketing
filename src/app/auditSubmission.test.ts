import { describe, expect, it } from 'vitest'
import { createAuditTransport } from './auditSubmission'

// The audit form's submission transport. There is no backend yet — that is a
// deliberate stage of development — so the contract these tests pin down is
// honesty: a demo build may resolve (so the client can see the success UX),
// but a production build must NEVER pretend a network submission succeeded.

const REQUEST = {
  plan: 'completa',
  name: 'Nombre Prueba',
  email: 'prueba@example.com',
  website: 'https://example.com',
  phone: '',
}

describe('createAuditTransport', () => {
  it('demo transport resolves, so the success flow can be demonstrated', async () => {
    const submit = createAuditTransport(true, 0)
    await expect(submit(REQUEST)).resolves.toBeUndefined()
  })

  it('production transport rejects: no backend exists, so success would be a lie', async () => {
    const submit = createAuditTransport(false, 0)
    await expect(submit(REQUEST)).rejects.toThrow(/no.*transport|not implemented|sin backend/i)
  })

  it('demo transport waits its configured delay before resolving', async () => {
    // Real timers on a tiny delay: the point is only that resolution is
    // asynchronous (the form must pass through 'submitting'), not the length.
    const submit = createAuditTransport(true, 30)
    let settled = false
    const pending = submit(REQUEST).then(() => {
      settled = true
    })
    expect(settled).toBe(false)
    await pending
    expect(settled).toBe(true)
  })
})
