import { describe, expect, it } from 'vitest'
import type { ViewStage } from './config'
import { evaluatePose, measure, type ViewSample } from './solution'

const STAGE: ViewStage = {
  position: [100, 50, 0],
  forward: [-2 / Math.sqrt(5), -1 / Math.sqrt(5), 0],
  fov: 35,
  tolerance: { positionUnits: 5, angleDegrees: 2, fovDegrees: 0.5 },
}

/** Exactly at the stage, to be perturbed per case. */
function atStage(): ViewSample {
  return { position: [...STAGE.position], forward: [...STAGE.forward], fov: STAGE.fov }
}

/** The stage's forward turned about world Y. */
function turned(degrees: number): ViewSample['forward'] {
  const a = (degrees * Math.PI) / 180
  const [x, y, z] = STAGE.forward
  return [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)]
}

describe('evaluatePose', () => {
  it('accepts a camera inside every tolerance', () => {
    expect(evaluatePose({ position: [103, 50, 0], forward: turned(1.5), fov: 35.3 }, STAGE)).toBe(true)
  })

  it('rejects a camera outside the position tolerance', () => {
    expect(evaluatePose({ ...atStage(), position: [100, 55.5, 0] }, STAGE)).toBe(false)
  })

  it('rejects the right position with the wrong orientation', () => {
    expect(evaluatePose({ ...atStage(), forward: turned(2.5) }, STAGE)).toBe(false)
  })

  it('rejects the right orientation with the wrong lens', () => {
    expect(evaluatePose({ ...atStage(), fov: 40 }, STAGE)).toBe(false)
  })

  it('does not need the reported forward normalised', () => {
    expect(evaluatePose({ ...atStage(), forward: [-20, -10, 0] }, STAGE)).toBe(true)
  })

  it('rejects a zero forward rather than dividing by it', () => {
    expect(evaluatePose({ ...atStage(), forward: [0, 0, 0] }, STAGE)).toBe(false)
  })

  it('measures the margin it judged by', () => {
    const d = measure({ ...atStage(), position: [103, 54, 0] }, STAGE)
    expect(d.distance).toBeCloseTo(5, 6)
    expect(d.angleDegrees).toBeCloseTo(0, 3)
  })
})
