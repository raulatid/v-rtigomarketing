import { describe, expect, it } from 'vitest'
import { createIdleWatch } from './hintIdle'

// The presence rule, as one counter. The hint STANDS unless the viewer is busy:
// it is there on arrival, it lasts a grace period into a burst of activity, and
// it comes back once they have been still for the idle threshold. Everything
// about WHAT counts as activity is the layer's business; this owns the counting.

const DT = 1 / 60
const RULE = { idleSeconds: 2, graceSeconds: 5 }

/** Runs `seconds` of still frames and returns the last answer. */
function still(watch: ReturnType<typeof createIdleWatch>, seconds: number): boolean {
  let show = false
  for (let t = 0; t < seconds; t += DT) show = watch.tick(DT)
  return show
}

/** Runs `seconds` of frames with the viewer acting on every one of them. */
function busy(watch: ReturnType<typeof createIdleWatch>, seconds: number): boolean {
  let show = false
  for (let t = 0; t < seconds; t += DT) {
    watch.poke()
    show = watch.tick(DT)
  }
  return show
}

describe('createIdleWatch', () => {
  it('shows on arrival, before anything at all has happened', () => {
    // The viewer arrives still. This is the change from the rule that ran until
    // 2026-09-23, where the hint was earned by two seconds of doing nothing.
    const watch = createIdleWatch(RULE)
    expect(watch.tick(DT)).toBe(true)
  })

  it('keeps showing for a viewer who acts once and then stops', () => {
    // The grace outlives the act, and the idle threshold arrives first anyway:
    // a single nudge must never make the sentence flicker.
    const watch = createIdleWatch(RULE)
    watch.poke()
    expect(watch.tick(DT)).toBe(true)
    expect(still(watch, 3)).toBe(true)
  })

  it('stands for the grace period once the viewer starts acting', () => {
    const watch = createIdleWatch(RULE)
    expect(busy(watch, 4.5)).toBe(true)
  })

  it('steps aside once the viewer has been acting longer than the grace', () => {
    const watch = createIdleWatch(RULE)
    expect(busy(watch, 5.5)).toBe(false)
  })

  it('stays away for as long as the viewer keeps acting', () => {
    const watch = createIdleWatch(RULE)
    busy(watch, 5.5)
    expect(busy(watch, 30)).toBe(false)
  })

  it('comes back once the viewer has been still for the idle threshold', () => {
    const watch = createIdleWatch(RULE)
    busy(watch, 5.5)
    expect(still(watch, 1.5)).toBe(false)
    expect(still(watch, 0.7)).toBe(true)
  })

  it('hands back the whole grace to a burst that starts from stillness', () => {
    // Otherwise the second burst of a session would be cut short by the first.
    const watch = createIdleWatch(RULE)
    busy(watch, 5.5)
    still(watch, 2.5)
    expect(busy(watch, 4.5)).toBe(true)
    expect(busy(watch, 1.5)).toBe(false)
  })

  it('does not hand the grace back to a poke that lands mid-burst', () => {
    // A wheel stream pokes this dozens of times a second; if each poke reset the
    // grace, the hint would sit over a viewer who is plainly busy forever.
    const watch = createIdleWatch(RULE)
    busy(watch, 3)
    still(watch, 1)
    expect(busy(watch, 2.5)).toBe(false)
  })

  it('ignores a delta that is zero or backwards', () => {
    const watch = createIdleWatch(RULE)
    still(watch, 1.0)
    const before = watch.quietSeconds()
    watch.tick(0)
    watch.tick(-5)
    watch.tick(Number.NaN)
    expect(watch.quietSeconds()).toBe(before)
  })

  it('never steps aside when the grace is the whole of the wait', () => {
    // A degenerate config must fail towards the sentence being readable.
    const watch = createIdleWatch({ idleSeconds: 0, graceSeconds: 5 })
    expect(busy(watch, 30)).toBe(true)
  })
})
