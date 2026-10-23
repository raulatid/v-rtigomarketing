import { describe, expect, it } from 'vitest'
import * as boot from '../../../intro-draw/isotype'
import * as city from './cityMarkIsotype'

// The city stop keeps its own copy so the boot entry stays standalone; this is
// what keeps the copy the same mark.

describe('the isotype drawn over the city', () => {
  it('is the same geometry the boot draws', () => {
    expect(city.VIEWBOX).toEqual(boot.VIEWBOX)
    expect(city.CENTER).toEqual(boot.CENTER)
    expect(city.ARC_D).toBe(boot.ARC_D)
    expect(city.V_D).toBe(boot.V_D)
    expect(city.FILL_D).toBe(boot.FILL_D)
    expect(city.FIRST_VERTEX).toEqual(boot.FIRST_VERTEX)
    expect(city.ARC_START).toEqual(boot.ARC_START)
  })
})
