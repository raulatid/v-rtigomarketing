import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLogoHold } from './logoHold'

// The logo of plate `index` lands when the test says so.
function setup() {
  const loads = new Map<number, () => void>()
  const requested: number[] = []
  const applied: Array<[string, boolean]> = []
  const hold = createLogoHold({
    request: (index) => {
      requested.push(index)
      return new Promise<void>((resolve) => loads.set(index, resolve))
    },
    apply: (id, on) => applied.push([id, on]),
    holdSeconds: 0.3,
  })
  const land = async (index: number) => {
    loads.get(index)?.()
    await Promise.resolve()
    await Promise.resolve()
  }
  return { hold, requested, applied, land }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the logo hold', () => {
  it('unfolds as soon as the logo lands', async () => {
    const { hold, requested, applied, land } = setup()
    hold.set('a', 2, true)
    expect(requested).toEqual([2])
    expect(applied).toEqual([])
    await land(2)
    expect(applied).toEqual([['a', true]])
    // The timer that was also waiting does not open it a second time.
    vi.advanceTimersByTime(1000)
    expect(applied).toEqual([['a', true]])
  })

  it('unfolds after the hold when the logo is slow, and only once', async () => {
    const { hold, applied, land } = setup()
    hold.set('a', 0, true)
    vi.advanceTimersByTime(299)
    expect(applied).toEqual([])
    vi.advanceTimersByTime(1)
    expect(applied).toEqual([['a', true]])
    await land(0)
    expect(applied).toEqual([['a', true]])
  })

  it('folds at once, and a deselect during the hold cancels the unfold', async () => {
    const { hold, applied, land } = setup()
    hold.set('a', 0, true)
    hold.set('a', 0, false)
    expect(applied).toEqual([['a', false]])
    vi.advanceTimersByTime(1000)
    await land(0)
    expect(applied).toEqual([['a', false]])
  })

  it('does not let an earlier selection open a later one early', () => {
    // Select, deselect, select again 0.2 s later: the first timer (0.3 s) must
    // not open the second selection, whose own hold runs to 0.5 s.
    const { hold, applied } = setup()
    hold.set('a', 0, true)
    vi.advanceTimersByTime(100)
    hold.set('a', 0, false)
    vi.advanceTimersByTime(100)
    hold.set('a', 0, true)
    vi.advanceTimersByTime(150) // t = 0.35 s: past the first timer
    expect(applied).toEqual([['a', false]])
    vi.advanceTimersByTime(150) // t = 0.5 s
    expect(applied).toEqual([['a', false], ['a', true]])
  })

  it('ignores a repeated answer, so re-applying the state restarts nothing', () => {
    const { hold, requested, applied } = setup()
    hold.set('a', 0, false)
    hold.set('a', 0, false)
    expect(applied).toEqual([['a', false]])
    hold.set('a', 0, true)
    vi.advanceTimersByTime(200)
    hold.set('a', 0, true)
    vi.advanceTimersByTime(100)
    expect(requested).toEqual([0])
    expect(applied).toEqual([['a', false], ['a', true]])
  })

  it('cancels every wait on reset, and takes a fresh answer afterwards', async () => {
    const { hold, applied, land } = setup()
    hold.set('a', 0, true)
    hold.reset()
    vi.advanceTimersByTime(1000)
    await land(0)
    expect(applied).toEqual([])
    hold.set('a', 0, true)
    vi.advanceTimersByTime(300)
    expect(applied).toEqual([['a', true]])
  })

  it('does nothing after dispose', async () => {
    const { hold, applied, land } = setup()
    hold.set('a', 0, true)
    hold.dispose()
    vi.advanceTimersByTime(1000)
    await land(0)
    hold.set('b', 1, false)
    expect(applied).toEqual([])
  })
})
