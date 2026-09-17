import { describe, expect, it } from 'vitest'
import { caseSheetLayout } from './caseSheetLayout'

describe('logo-safe sheet heights', () => {
  it.each([320, 393, 500, 667, 844, 932])('never covers the logo at viewport height %i', (height) => {
    for (const top of [0, 30]) {
      for (const fraction of [0.1, 0.4, 0.6, 0.85]) {
        const bottom = top + height * fraction
        const { maximum, compact } = caseSheetLayout(top, height, bottom)
        expect(top + height - maximum).toBeGreaterThanOrEqual(bottom + 16)
        expect(compact).toBeGreaterThanOrEqual(0)
        expect(compact).toBeLessThan(maximum)
      }
    }
  })
  it('waits for a valid projection and room below the logo', () => {
    for (const bottom of [null, NaN, Infinity, 850]) {
      expect(caseSheetLayout(0, 800, bottom)).toEqual({ maximum: 0, compact: 0 })
    }
  })
  it('caps the sheet within the viewport when the logo is above the visible area', () => {
    expect(caseSheetLayout(40, 600, -100)).toEqual({ maximum: 510, compact: 240 })
  })
})
