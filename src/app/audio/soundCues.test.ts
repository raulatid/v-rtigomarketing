import { describe, expect, it } from 'vitest'
import { cueForAudit, cueForCase, cueForClaim, cueForDistrict, cueForMenu } from './soundCues'

describe('cueForCase', () => {
  const a = { id: 'a' }
  const b = { id: 'b' }

  it('opens on a selection and on a case replacing another', () => {
    expect(cueForCase(null, a)).toBe('case-open')
    expect(cueForCase(a, b)).toBe('case-open')
  })

  it('closes on a deselection, and is quiet when nothing changed', () => {
    expect(cueForCase(a, null)).toBe('case-close')
    expect(cueForCase(a, a)).toBeNull()
    expect(cueForCase(null, null)).toBeNull()
  })
})

describe('the edge cues', () => {
  it('sound only on a change, never at mount', () => {
    expect(cueForAudit(false, false)).toBeNull()
    expect(cueForMenu('closed', 'closed')).toBeNull()
    expect(cueForClaim(false, false)).toBeNull()
    expect(cueForDistrict(false, false)).toBeNull()
  })

  it('name each direction', () => {
    expect(cueForAudit(false, true)).toBe('audit-open')
    expect(cueForAudit(true, false)).toBe('audit-close')
    expect(cueForDistrict(false, true)).toBe('district-enter')
    expect(cueForDistrict(true, false)).toBe('district-leave')
  })

  it('moves the menu card on open and closing, not on its arrival home', () => {
    expect(cueForMenu('closed', 'open')).toBe('menu-open')
    expect(cueForMenu('open', 'closing')).toBe('menu-close')
    expect(cueForMenu('closing', 'closed')).toBeNull()
  })

  it('offers the claim once, not again on its way out', () => {
    expect(cueForClaim(false, true)).toBe('claim-offer')
    expect(cueForClaim(true, false)).toBeNull()
  })
})
