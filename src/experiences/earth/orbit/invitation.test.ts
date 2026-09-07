import { describe, expect, it } from 'vitest'
import { invitationPulse, invitationScale } from './invitation'
import { ORBIT_CONFIG } from './orbitConfig'

// The invitation is one satellite breathing so the overview says "clickable".
// One pulse feeds three surfaces — the field's halo, the emitter cone and the
// satellite's own scale — which is why it is computed here, once, rather than
// in each shader from its own clock: three breaths that drift apart read as
// three effects, not one object inhaling.

describe('invitationPulse', () => {
  it('is silent while the invitation is off', () => {
    expect(invitationPulse(0, 0, true)).toBe(0)
    expect(invitationPulse(0, 3.7, false)).toBe(0)
  })

  it('breathes between 0.6 and 1.0 at full invitation', () => {
    // The floor is deliberately above zero: the invited satellite must never
    // dip to the resting brightness mid-breath, or the eye loses which one it is.
    let min = Infinity
    let max = -Infinity
    for (let t = 0; t < 10; t += 0.05) {
      const pulse = invitationPulse(1, t, true)
      min = Math.min(min, pulse)
      max = Math.max(max, pulse)
    }
    expect(min).toBeGreaterThanOrEqual(0.6)
    expect(min).toBeLessThan(0.62)
    expect(max).toBeLessThanOrEqual(1)
    expect(max).toBeGreaterThan(0.98)
  })

  it('holds steady at the top of the breath under reduced motion', () => {
    for (const t of [0, 1.1, 2.9, 40]) {
      expect(invitationPulse(1, t, false)).toBe(1)
    }
  })

  it('scales with the invitation as it fades in and out', () => {
    // The ease in createHoloPanel gives a partial `invite`; the pulse must
    // follow it so the effect fades rather than switching.
    const t = 0.4
    expect(invitationPulse(0.5, t, true)).toBeCloseTo(invitationPulse(1, t, true) / 2, 10)
  })

  it('keeps NaN and out-of-range values out of the uniforms', () => {
    expect(invitationPulse(Number.NaN, 1, true)).toBe(0)
    expect(invitationPulse(1, Number.NaN, true)).toBe(0)
    expect(invitationPulse(2, 0, false)).toBe(1)
    expect(invitationPulse(-1, 0, false)).toBe(0)
  })
})

describe('invitationScale', () => {
  const cfg = ORBIT_CONFIG.satellite

  it('rests at 1 with no pulse', () => {
    expect(invitationScale(0, 0)).toBe(1)
  })

  it('swells to inviteScale at the top of the breath', () => {
    expect(invitationScale(1, 0)).toBeCloseTo(cfg.inviteScale, 10)
    expect(invitationScale(0.5, 0)).toBeCloseTo(1 + (cfg.inviteScale - 1) / 2, 10)
  })

  it('lets a full hover bump win outright, whatever the breath is doing', () => {
    // Hover must still read as "more" than the invitation, and it must not
    // wobble while the cursor is on the satellite.
    for (const pulse of [0, 0.3, 1]) {
      expect(invitationScale(pulse, 1)).toBe(cfg.highlightScale)
    }
  })

  it('travels from the breath to the bump as the hover strength rises', () => {
    // The strength is eased by the satellite; the scale must follow it
    // monotonically from wherever the breath has it, so a hover arriving
    // mid-breath grows from that size rather than snapping — and the tutorial
    // that flips the same target reads as the pointer does.
    for (const pulse of [0, 0.6, 1]) {
      let previous = invitationScale(pulse, 0)
      for (let strength = 0.1; strength <= 1; strength += 0.1) {
        const scale = invitationScale(pulse, strength)
        expect(scale).toBeGreaterThanOrEqual(previous)
        previous = scale
      }
      expect(invitationScale(pulse, 0.5)).toBeCloseTo(
        (invitationScale(pulse, 0) + cfg.highlightScale) / 2,
        10,
      )
    }
  })

  it('never grows past the hover bump', () => {
    expect(invitationScale(1, 0)).toBeLessThan(cfg.highlightScale)
    expect(invitationScale(1, 2)).toBe(cfg.highlightScale)
    expect(invitationScale(Number.NaN, 0)).toBe(1)
    expect(invitationScale(0, Number.NaN)).toBe(1)
  })
})
