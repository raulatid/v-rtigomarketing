import { describe, expect, it } from 'vitest'
import {
  advanceDepartureAim,
  createDepartureAimState,
  resetDepartureAim,
} from './departureAim'

const PHI_MIN = 0.3
const PHI_MAX = 2.8

function run(
  from: { theta: number; phi: number },
  destination: (progress: number) => { theta: number; phi: number },
  steps = 60,
) {
  const state = createDepartureAimState()
  const out = { theta: 0, phi: 0 }
  const path: Array<{ theta: number; phi: number }> = []
  for (let i = 0; i <= steps; i++) {
    const p = i / steps
    const d = destination(p)
    advanceDepartureAim(state, p, from, d.theta, d.phi, PHI_MIN, PHI_MAX, out)
    path.push({ ...out })
  }
  return path
}

describe('advanceDepartureAim', () => {
  it('starts where the camera is, so the swing opens without a jump', () => {
    const path = run({ theta: 2, phi: 1 }, () => ({ theta: -1, phi: 1.4 }))
    expect(path[0]).toEqual({ theta: 2, phi: 1 })
  })

  it('lands on the destination exactly', () => {
    // Exactly, not nearly: the warp's dolly is radial and captures this orbit.
    const path = run({ theta: 2, phi: 1 }, () => ({ theta: -1, phi: 1.4 }))
    const last = path[path.length - 1]
    expect(last.theta).toBeCloseTo(-1, 12)
    expect(last.phi).toBeCloseTo(1.4, 12)
  })

  it('turns the short way across the ±PI seam', () => {
    // 3 -> -3 is 0.28 rad through the seam, or 6 rad the long way round.
    const path = run({ theta: 3, phi: 1 }, () => ({ theta: -3, phi: 1 }))
    expect(path[path.length - 1].theta).toBeCloseTo(-3 + Math.PI * 2, 12)
    for (const step of path) expect(step.theta).toBeGreaterThanOrEqual(3 - 1e-9)
  })

  it('starts from a wound orbit without unwinding it', () => {
    // A viewer who dragged the globe round twice is at theta + 4PI. The swing
    // must leave from there, not from the equivalent angle two turns away.
    const wound = 1 + Math.PI * 4
    const path = run({ theta: wound, phi: 1 }, () => ({ theta: 1.5, phi: 1 }))
    expect(path[path.length - 1].theta).toBeCloseTo(1.5 + Math.PI * 4, 12)
  })

  it('follows a destination that keeps spinning, and still lands on it', () => {
    const path = run({ theta: 0, phi: 1 }, (p) => ({ theta: 1 + 0.05 * p, phi: 1.2 }))
    expect(path[path.length - 1].theta).toBeCloseTo(1.05, 12)
  })

  it('does not change direction when a far destination drifts across the half turn', () => {
    // Start just short of half a turn away and let the goal drift past it. Picking
    // "the short way from the start" afresh each frame would flip to the other
    // side mid-swing; following the previous goal keeps the turn monotonic.
    const path = run({ theta: 0, phi: 1 }, (p) => ({ theta: Math.PI - 0.02 + 0.06 * p, phi: 1 }))
    for (let i = 1; i < path.length; i++) {
      expect(path[i].theta).toBeGreaterThanOrEqual(path[i - 1].theta - 1e-9)
    }
    expect(path[path.length - 1].theta).toBeCloseTo(Math.PI + 0.04, 12)
  })

  it('holds phi inside the orbit limits, because a destination near a pole is outside them', () => {
    const path = run({ theta: 0, phi: 1 }, () => ({ theta: 1, phi: 0.05 }))
    expect(path[path.length - 1].phi).toBeCloseTo(PHI_MIN, 12)
  })

  it('eases both ends, so neither the start nor the hand-over is a jolt', () => {
    const path = run({ theta: 0, phi: 1 }, () => ({ theta: 1, phi: 1 }), 100)
    const first = path[1].theta - path[0].theta
    const middle = path[51].theta - path[50].theta
    const last = path[100].theta - path[99].theta
    expect(first).toBeLessThan(middle / 10)
    expect(last).toBeLessThan(middle / 10)
  })

  it('captures a fresh start after a reset', () => {
    const state = createDepartureAimState()
    const out = { theta: 0, phi: 0 }
    advanceDepartureAim(state, 0.5, { theta: 0, phi: 1 }, 1, 1, PHI_MIN, PHI_MAX, out)
    resetDepartureAim(state)
    advanceDepartureAim(state, 0, { theta: 2, phi: 1.5 }, 1, 1, PHI_MIN, PHI_MAX, out)
    expect(out).toEqual({ theta: 2, phi: 1.5 })
  })
})
