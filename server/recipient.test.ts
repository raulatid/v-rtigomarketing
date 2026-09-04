import { describe, expect, it } from 'vitest'
import { readRecipient, cmsRecipient } from './recipient'

describe('the address the notification goes to', () => {
  it('accepts the address the CMS publishes', () => {
    const result = readRecipient('contacto@vertigomkt.com')
    expect(result.ok && result.to).toBe('contacto@vertigomkt.com')
  })

  it('trims it, because a trailing space in a CMS field is invisible', () => {
    const result = readRecipient('  contacto@vertigomkt.com  ')
    expect(result.ok && result.to).toBe('contacto@vertigomkt.com')
  })

  it('refuses an address nothing could be delivered to', () => {
    for (const raw of ['', '   ', 'contacto', 'contacto@', '@vertigomkt.com']) {
      const result = readRecipient(raw)
      expect(result.ok, JSON.stringify(raw)).toBe(false)
    }
  })

  it('names the CMS field in the failure, because that is where the fix is', () => {
    const result = readRecipient('nope')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/contactEmail|Sanity|ajustes/i)
  })
})

describe('the address this build actually carries', () => {
  it('is deliverable', () => {
    // A guard on the generated content rather than on this module: if the CMS
    // ever publishes an address the endpoint cannot use, the build that
    // produced it is the thing that should have failed, and this is the last
    // place to notice before a visitor does.
    expect(() => cmsRecipient()).not.toThrow()
    expect(cmsRecipient()).toMatch(/@/)
  })
})
