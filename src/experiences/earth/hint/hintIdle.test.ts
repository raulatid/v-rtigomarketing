import { describe, expect, it } from 'vitest'
import { createIdleWatch } from './hintIdle'
import { HINT_CONFIG } from './hintConfig'

// The rule that replaced the arrival trigger: offered after a couple of seconds
// of stillness, gone the moment the viewer moves. Everything about WHAT counts
// as movement is the layer's business; this owns only the counting.

const DT = 1 / 60

/** Runs `seconds` of still frames and returns the last answer. */
function still(watch: ReturnType<typeof createIdleWatch>, seconds: number): boolean {
  let idle = false
  for (let t = 0; t < seconds; t += DT) idle = watch.tick(DT)
  return idle
}

describe('createIdleWatch', () => {
  it('is not idle before the threshold', () => {
    const watch = createIdleWatch({ idleSeconds: 2 })
    expect(still(watch, 1.5)).toBe(false)
  })

  it('becomes idle once the viewer has been still long enough', () => {
    const watch = createIdleWatch({ idleSeconds: 2 })
    expect(still(watch, 2.5)).toBe(true)
  })

  it('stays idle for as long as nothing happens', () => {
    // Reported as a STATE and not as an edge, so the caller can ask every frame
    // without having to remember what it was told last time.
    const watch = createIdleWatch({ idleSeconds: 2 })
    still(watch, 2.5)
    expect(still(watch, 30)).toBe(true)
  })

  it('is no longer idle the moment the viewer does something', () => {
    const watch = createIdleWatch({ idleSeconds: 2 })
    expect(still(watch, 2.5)).toBe(true)
    watch.poke()
    expect(watch.tick(DT)).toBe(false)
  })

  it('restarts the count from zero, so a nudge costs the whole wait again', () => {
    const watch = createIdleWatch({ idleSeconds: 2 })
    still(watch, 1.9)
    watch.poke()
    expect(still(watch, 1.9)).toBe(false)
    expect(still(watch, 0.2)).toBe(true)
  })

  it('can be poked while already moving without going backwards', () => {
    // A pointermove stream pokes this dozens of times a second.
    const watch = createIdleWatch({ idleSeconds: 2 })
    for (let i = 0; i < 200; i += 1) {
      watch.poke()
      expect(watch.tick(DT)).toBe(false)
    }
    expect(watch.quietSeconds()).toBeCloseTo(DT, 6)
  })

  it('ignores a delta that is zero or backwards', () => {
    const watch = createIdleWatch({ idleSeconds: 2 })
    still(watch, 1.0)
    const before = watch.quietSeconds()
    watch.tick(0)
    watch.tick(-5)
    watch.tick(Number.NaN)
    expect(watch.quietSeconds()).toBe(before)
  })

  it('is idle immediately when the threshold is zero', () => {
    const watch = createIdleWatch({ idleSeconds: 0 })
    expect(watch.tick(DT)).toBe(true)
  })

  it('ships a threshold a person would actually wait through', () => {
    // Long enough that it is not competing with someone who is still looking
    // around, short enough to feel like a response to stillness rather than a
    // timeout. Pinned so a retune is a decision rather than a drift.
    expect(HINT_CONFIG.presence.idleSeconds).toBe(2)
  })
})
