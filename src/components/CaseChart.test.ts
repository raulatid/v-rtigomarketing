import { describe, expect, it } from 'vitest'
import { donutOpacity } from './CaseChart'

describe('donutOpacity', () => {
  it('keeps the 0.22 steps for up to four segments', () => {
    expect([0, 1, 2, 3].map((i) => donutOpacity(i, 4))).toEqual(
      [0.95, 0.73, 0.51, 0.29].map((v) => expect.closeTo(v, 10)),
    )
    expect(donutOpacity(1, 2)).toBeCloseTo(0.73, 10)
  })

  it('shares the same range among more segments, so none fades out', () => {
    for (const count of [5, 8, 16]) {
      const opacities = Array.from({ length: count }, (_, i) => donutOpacity(i, count))
      expect(opacities[0]).toBeCloseTo(0.95, 10)
      expect(opacities[count - 1]).toBeCloseTo(0.29, 10)
      for (let i = 1; i < count; i += 1) expect(opacities[i]).toBeLessThan(opacities[i - 1])
    }
  })
})
