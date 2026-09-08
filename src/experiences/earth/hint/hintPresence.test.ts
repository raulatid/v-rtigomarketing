import { describe, expect, it } from 'vitest'
import { createHintPresence } from './hintPresence'
import type { HintFrame } from './hintPresence'
import { HINT_CONFIG } from './hintConfig'

// The hint's own clock, with nothing visual attached. WHEN it is offered and
// when it goes is `createNavigationInput`'s business and is already tested
// there; this owns only what happens between those two moments — the figure
// gathers, holds for as long as it is wanted, and scatters.

const cfg = HINT_CONFIG.presence
const DT = 1 / 60

function run(
  presence: ReturnType<typeof createHintPresence>,
  seconds: number,
): HintFrame {
  let frame = presence.tick(0)
  for (let t = 0; t < seconds; t += DT) frame = presence.tick(DT)
  return frame
}

describe('createHintPresence', () => {
  it('draws nothing until it is offered', () => {
    const presence = createHintPresence()
    const frame = run(presence, 5)
    expect(frame.visible).toBe(false)
    expect(frame.progress).toBe(0)
  })

  it('gathers over the forming time and then holds', () => {
    const presence = createHintPresence()
    presence.setVisible(true)

    const early = run(presence, cfg.formSeconds * 0.5)
    expect(early.visible).toBe(true)
    expect(early.progress).toBeGreaterThan(0.3)
    expect(early.progress).toBeLessThan(0.7)

    const formed = run(presence, cfg.formSeconds)
    expect(formed.progress).toBe(1)
    expect(formed.exit).toBe(0)

    // Held means held: no drift, however long nobody touches anything.
    const later = run(presence, 30)
    expect(later.progress).toBe(1)
    expect(later.exit).toBe(0)
    expect(later.visible).toBe(true)
  })

  it('scatters when it is withdrawn, and is gone at the end of it', () => {
    const presence = createHintPresence()
    presence.setVisible(true)
    run(presence, cfg.formSeconds * 1.2)

    presence.setVisible(false)
    const going = run(presence, cfg.exitSeconds * 0.5)
    expect(going.visible).toBe(true)
    expect(going.exit).toBeGreaterThan(0.2)
    expect(going.exit).toBeLessThan(0.8)

    const gone = run(presence, cfg.exitSeconds)
    expect(gone.visible).toBe(false)
    expect(gone.exit).toBe(1)
  })

  it('forms again from nothing on the next arrival', () => {
    // A second world arrival re-offers the hint. It must gather again rather
    // than snap back to the formation it was holding when it left.
    const presence = createHintPresence()
    presence.setVisible(true)
    run(presence, cfg.formSeconds * 1.2)
    presence.setVisible(false)
    run(presence, cfg.exitSeconds * 1.2)

    presence.setVisible(true)
    const frame = presence.tick(DT)
    expect(frame.progress).toBeLessThan(0.1)
    expect(frame.exit).toBe(0)
  })

  it('comes back without a jump if it is re-offered mid-scatter', () => {
    // `canNavigate` can fall and rise again within a second — a panel opening
    // and closing does it. The figure must draw itself back in from where it
    // had got to, not restart.
    const presence = createHintPresence()
    presence.setVisible(true)
    run(presence, cfg.formSeconds * 1.2)
    presence.setVisible(false)
    const scattering = run(presence, cfg.exitSeconds * 0.4)
    expect(scattering.exit).toBeGreaterThan(0)

    presence.setVisible(true)
    const recovering = presence.tick(DT)
    expect(recovering.exit).toBeLessThan(scattering.exit)
    expect(recovering.progress).toBe(1)

    const recovered = run(presence, cfg.exitSeconds)
    expect(recovered.exit).toBe(0)
    expect(recovered.visible).toBe(true)
  })

  it('scatters from a half-gathered figure if it is withdrawn early', () => {
    const presence = createHintPresence()
    presence.setVisible(true)
    const half = run(presence, cfg.formSeconds * 0.4)
    presence.setVisible(false)
    const going = presence.tick(DT)
    expect(going.progress).toBeCloseTo(half.progress, 1)
    expect(going.exit).toBeGreaterThan(0)
  })

  it('is already formed under reduced motion, and still fades out', () => {
    // The house policy, from `hoverTutorial.ts`: same state, less motion, not a
    // second visual language. The travel is what a viewer asked to stop; the
    // fade is not, and `styles.css` makes the same split for the HTML hint
    // ("every fade and the rise may stay").
    const presence = createHintPresence({ reducedMotion: true })
    presence.setVisible(true)
    const frame = presence.tick(DT)
    expect(frame.progress).toBe(1)
    expect(frame.visible).toBe(true)

    presence.setVisible(false)
    const going = run(presence, cfg.exitSeconds * 0.5)
    expect(going.exit).toBeGreaterThan(0)
    expect(going.exit).toBeLessThan(1)
  })

  it('ignores a delta that is zero or backwards', () => {
    // The rig clamps frame deltas, but a machine that can be driven from a
    // harness should not rely on its caller for that.
    const presence = createHintPresence()
    presence.setVisible(true)
    run(presence, cfg.formSeconds * 0.5)
    const before = presence.tick(0)
    expect(presence.tick(0).progress).toBe(before.progress)
    expect(presence.tick(-1).progress).toBe(before.progress)
  })

  it('does not restart when it is offered twice', () => {
    const presence = createHintPresence()
    presence.setVisible(true)
    const first = run(presence, cfg.formSeconds * 0.5)
    presence.setVisible(true)
    expect(presence.tick(0).progress).toBe(first.progress)
  })

  it('reports progress and exit inside 0..1 at every step', () => {
    const presence = createHintPresence()
    presence.setVisible(true)
    for (let t = 0; t < cfg.formSeconds * 2; t += DT) {
      const f = presence.tick(DT)
      expect(f.progress).toBeGreaterThanOrEqual(0)
      expect(f.progress).toBeLessThanOrEqual(1)
      expect(f.exit).toBeGreaterThanOrEqual(0)
      expect(f.exit).toBeLessThanOrEqual(1)
    }
    presence.setVisible(false)
    for (let t = 0; t < cfg.exitSeconds * 2; t += DT) {
      const f = presence.tick(DT)
      expect(f.exit).toBeGreaterThanOrEqual(0)
      expect(f.exit).toBeLessThanOrEqual(1)
    }
  })
})
