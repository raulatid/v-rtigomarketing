import { describe, expect, it } from 'vitest'
import { ISOTYPE_GLOW, PULSE_REACH, PULSE_SECONDS, pulseAt } from '../sky/skyPulse'
import { NIGHT_EDGE, nightPulseAt, nightRevealedAt } from './nightPulse'

// The ground's ring is the sky's, measured along the ground as a share of the
// reach: the shader's reveal and ring are judged by eye, the clock and the
// shares by this.

describe('the pulse that brings the city night', () => {
  it('has not left before its time, and leaves the whole city in the day until it does', () => {
    const before = nightPulseAt(-0.2)
    expect(before.front).toBeLessThan(0)
    expect(before.coverage).toBe(0)
    expect(before.glow).toBe(0)
    expect(before.isotypeGlow).toBe(0)
    expect(nightRevealedAt(before, 0)).toBe(0)
  })

  it('runs out on the sky ring’s clock and curve', () => {
    for (const seconds of [0, 0.2, 0.5, 0.9, 1.3]) {
      const ground = nightPulseAt(seconds)
      const sky = pulseAt(seconds)
      expect(ground.glow).toBe(sky.glow)
      expect(ground.done).toBe(sky.done)
      expect(ground.front).toBeCloseTo(sky.front / PULSE_REACH, 9)
    }
    let last = -Infinity
    for (let seconds = 0; seconds <= PULSE_SECONDS + 0.1; seconds += 0.05) {
      const { front, coverage } = nightPulseAt(seconds)
      expect(front).toBeGreaterThanOrEqual(last)
      expect(coverage).toBeGreaterThanOrEqual(0)
      expect(coverage).toBeLessThanOrEqual(1)
      last = front
    }
  })

  it('has covered the reach once it has run out, and then the night is everywhere', () => {
    const done = nightPulseAt(PULSE_SECONDS)
    expect(done.done).toBe(true)
    expect(done.coverage).toBe(1)
    expect(nightRevealedAt(done, 3)).toBe(1)
    expect(nightPulseAt(Number.POSITIVE_INFINITY).coverage).toBe(1)
  })

  it('brings the night inside the front and leaves the day outside it', () => {
    const pulse = nightPulseAt(0.4)
    expect(nightRevealedAt(pulse, 0)).toBe(1)
    expect(nightRevealedAt(pulse, pulse.front + 0.01)).toBe(0)
    const inEdge = nightRevealedAt(pulse, pulse.front - NIGHT_EDGE / 2)
    expect(inEdge).toBeGreaterThan(0)
    expect(inEdge).toBeLessThan(1)
  })

  it('flashes the isotype as it leaves and settles to the ember the night keeps', () => {
    expect(nightPulseAt(0.05).isotypeGlow).toBeGreaterThan(ISOTYPE_GLOW.ember)
    expect(nightPulseAt(5).isotypeGlow).toBeCloseTo(ISOTYPE_GLOW.ember, 6)
    expect(nightPulseAt(Number.POSITIVE_INFINITY).isotypeGlow).toBeCloseTo(ISOTYPE_GLOW.ember, 6)
  })
})
