import { describe, expect, it } from 'vitest'
import { shiftsFor } from './auditView'

// The regression this file exists for: the camera stayed shifted right for the
// rest of the session after the audit panel was closed. `auditView.open` had
// three writers that disagreed, and the phase-keyed effect re-asserted `true` on
// the 'open' -> 'leaving' change that closing causes. Collapsing the decision
// into this function is what makes that impossible; the 'leaving' case below is
// the one that used to be wrong.

describe('shiftsFor', () => {
  it('shifts while the curtain is coming in and while it is open', () => {
    expect(shiftsFor('entering', true)).toBe(true)
    expect(shiftsFor('open', true)).toBe(true)
  })

  it('stops shifting the moment the panel starts leaving', () => {
    expect(shiftsFor('leaving', true)).toBe(false)
  })

  it('does not shift when closed', () => {
    expect(shiftsFor('closed', true)).toBe(false)
  })

  it('never shifts below the breakpoint — the panel is full-width there', () => {
    expect(shiftsFor('entering', false)).toBe(false)
    expect(shiftsFor('open', false)).toBe(false)
    expect(shiftsFor('leaving', false)).toBe(false)
    expect(shiftsFor('closed', false)).toBe(false)
  })
})
