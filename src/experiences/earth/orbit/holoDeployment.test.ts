import { describe, expect, it } from 'vitest'
import { DEPLOYMENT_STAGES, deploymentFrom } from './holoDeployment'

const WING = 0.46

describe('the deployment stages', () => {
  it('are all zero at rest and all one when deployed', () => {
    expect(deploymentFrom(0, WING)).toEqual({
      activation: 0,
      deploy: 0,
      resolve: 0,
      fieldAspect: 1,
      wingExtent: 0,
    })
    expect(deploymentFrom(1, WING)).toEqual({
      activation: 1,
      deploy: 1,
      resolve: 1,
      fieldAspect: 2,
      wingExtent: WING,
    })
  })

  it('read in order: activation leads, deployment follows, resolve lands last', () => {
    // Plan 007 phase 6. At the end of activation the wings have barely begun and
    // the logo has not started; at the end of deployment the logo is still
    // arriving. The ranges overlap on purpose — the stages must not read as
    // three separate animations.
    const early = deploymentFrom(DEPLOYMENT_STAGES.activation[1], WING)
    expect(early.activation).toBe(1)
    expect(early.deploy).toBeLessThan(0.05)
    expect(early.resolve).toBe(0)

    const mid = deploymentFrom(DEPLOYMENT_STAGES.deploy[1], WING)
    expect(mid.deploy).toBe(1)
    expect(mid.resolve).toBeLessThan(0.2)
  })

  it('is monotonic and continuous, so a reversal simply runs it backwards', () => {
    // Phase 13: the stages are remaps of ONE eased value, so the forward
    // sequence sampled in reverse IS the closing sequence. No jumps either way.
    // Smoothstep peaks at slope 1.5 over its range; the shortest range is 0.2,
    // so one 1/200 step can move a stage by at most 0.0375. Anything larger is
    // a jump, not a slope.
    const MAX_STEP = 0.04
    let previous = deploymentFrom(0, WING)
    for (let i = 1; i <= 200; i += 1) {
      const next = deploymentFrom(i / 200, WING)
      for (const key of ['activation', 'deploy', 'resolve', 'fieldAspect', 'wingExtent'] as const) {
        expect(next[key], key).toBeGreaterThanOrEqual(previous[key])
        expect(next[key] - previous[key], key).toBeLessThan(MAX_STEP)
      }
      previous = next
    }
  })

  it('derives the wing extent and the field aspect from the same stage', () => {
    // The artwork field widens exactly as the wings travel — the logo can never
    // be contain-fitted into a field the structure has not opened yet.
    const d = deploymentFrom(0.5, WING)
    expect(d.wingExtent).toBeCloseTo(WING * d.deploy, 10)
    expect(d.fieldAspect).toBeCloseTo(1 + d.deploy, 10)
  })

  it('clamps out-of-range and non-finite input', () => {
    expect(deploymentFrom(-1, WING)).toEqual(deploymentFrom(0, WING))
    expect(deploymentFrom(2, WING)).toEqual(deploymentFrom(1, WING))
    expect(deploymentFrom(Number.NaN, WING)).toEqual(deploymentFrom(0, WING))
  })
})
