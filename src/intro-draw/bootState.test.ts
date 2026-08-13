import { describe, it, expect, vi, afterEach } from 'vitest'
import { createBootState, REQUIRED_IDS, type StepId } from './bootState'

// Every case gets its own instance. The shipped `bootState` is a cross-chunk
// singleton on globalThis, and a readiness machine tested against a global has
// each case contaminating the next — `reset()` cannot undo a latched fatal.
const OPTIONAL: StepId[] = ['satellite:assets', 'murcia:model']

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the readiness walk', () => {
  it('starts at starting, with zero progress', () => {
    const boot = createBootState()
    expect(boot.readiness()).toBe('starting')
    expect(boot.progress()).toBe(0)
  })

  it('goes starting → loading → ready', () => {
    const boot = createBootState()
    boot.setStep('earth:textures', 0.2)
    expect(boot.readiness()).toBe('loading')

    for (const id of REQUIRED_IDS) boot.markDone(id)
    expect(boot.readiness()).toBe('ready')
  })

  it('is ready only when every required resource is COMPLETE', () => {
    // Not "has started", not "is nearly there": a resource at 0.999 leaves the
    // cut landing on an unshaded sphere.
    const boot = createBootState()
    for (const id of REQUIRED_IDS) boot.setStep(id, 0.999)
    expect(boot.readiness()).toBe('loading')
    for (const id of REQUIRED_IDS) boot.markDone(id)
    expect(boot.readiness()).toBe('ready')
  })
})

describe('optional resources', () => {
  it('never gate readiness, even at fraction 0', () => {
    // This is the whole point of the required/optional split: Murcia is
    // prefetched during the intro and must never be able to hold it back.
    const boot = createBootState()
    for (const id of REQUIRED_IDS) boot.markDone(id)
    expect(boot.readiness()).toBe('ready')
    expect(boot.pending()).toEqual(expect.arrayContaining(OPTIONAL))
  })

  it('still move visual progress', () => {
    // They contribute weight without contributing readiness — that is what
    // keeps the drawing honest about bytes while staying honest about the scene.
    const boot = createBootState()
    const before = boot.progress()
    boot.markDone('murcia:model')
    expect(boot.progress()).toBeGreaterThan(before)
    expect(boot.readiness()).not.toBe('ready')
  })

  it('warn rather than going fatal when they fail', () => {
    // An optional resource failing must never take the site down. It simply
    // never contributes its weight.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const boot = createBootState()
    boot.markFatal('satellite:assets', 'a 404')
    expect(boot.readiness()).not.toBe('fatal')
    expect(boot.fatalReason()).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('fatal is terminal', () => {
  it('ignores later progress', () => {
    // Nothing may talk the machine back out of fatal: the caption has already
    // told the visitor the experience could not be loaded.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const boot = createBootState()
    boot.markFatal('earth:textures', 'network down')
    expect(boot.readiness()).toBe('fatal')

    boot.setStep('earth:textures', 1)
    for (const id of REQUIRED_IDS) boot.markDone(id)
    expect(boot.readiness()).toBe('fatal')
  })

  it('keeps the first reason, not the last', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const boot = createBootState()
    boot.markFatal('earth:textures', 'first')
    boot.markFatal('gpu:warmup', 'second')
    expect(boot.fatalReason()).toContain('first')
    expect(boot.fatalReason()).not.toContain('second')
  })

  it('is cleared only by reset', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const boot = createBootState()
    boot.markFatal('earth:textures', 'network down')
    boot.reset()
    expect(boot.readiness()).toBe('starting')
    expect(boot.fatalReason()).toBeNull()
    expect(boot.progress()).toBe(0)
  })
})

describe('setStep is monotonic and idempotent', () => {
  it('ignores a regressed byte count', () => {
    // Real loaders do report backwards — a retried request restarts its counter.
    // The drawing must never run in reverse.
    const boot = createBootState()
    boot.setStep('earth:textures', 0.8)
    const high = boot.progress()
    boot.setStep('earth:textures', 0.2)
    expect(boot.progress()).toBe(high)
  })

  it('ignores the same milestone reported twice', () => {
    const boot = createBootState()
    boot.markDone('logo:assets')
    const once = boot.progress()
    boot.markDone('logo:assets')
    expect(boot.progress()).toBe(once)
  })

  it('clamps out-of-range fractions instead of skewing the total', () => {
    const boot = createBootState()
    boot.setStep('earth:textures', 5)
    expect(boot.progress()).toBeLessThanOrEqual(1)
    expect(boot.completed()).toContain('earth:textures')

    const negative = createBootState()
    negative.setStep('earth:textures', -3)
    expect(negative.progress()).toBe(0)
  })

  it('reaches exactly 1 when everything is done', () => {
    const boot = createBootState()
    for (const id of boot.pending().slice()) boot.markDone(id)
    expect(boot.progress()).toBeCloseTo(1, 10)
    expect(boot.pending()).toEqual([])
  })
})

describe('report', () => {
  it('does not divide by zero on a total of 0', () => {
    // A server that sends no content-length reports total 0, and NaN progress
    // would propagate into the drawing's playhead as a stuck or blank outline.
    const boot = createBootState()
    boot.report('earth:textures', 0, 0)
    expect(Number.isNaN(boot.progress())).toBe(false)
    expect(boot.progress()).toBe(0)
  })

  it('converts bytes to a fraction', () => {
    const boot = createBootState()
    boot.report('earth:textures', 50, 200)
    const quarter = boot.progress()
    boot.report('earth:textures', 200, 200)
    expect(boot.progress()).toBeGreaterThan(quarter)
    expect(boot.completed()).toContain('earth:textures')
  })
})

describe('subscribe', () => {
  it('notifies on change and stops after unsubscribe', () => {
    const boot = createBootState()
    const seen = vi.fn()
    const unsubscribe = boot.subscribe(seen)
    boot.setStep('earth:textures', 0.5)
    expect(seen).toHaveBeenCalled()

    unsubscribe()
    const count = seen.mock.calls.length
    boot.setStep('earth:textures', 0.9)
    expect(seen.mock.calls).toHaveLength(count)
  })

  it('does not notify when nothing actually changed', () => {
    // The subscriber re-renders the drawing's caption; firing on a no-op write
    // would put that work on every progress report rather than every change.
    const boot = createBootState()
    boot.setStep('earth:textures', 0.5)
    const seen = vi.fn()
    boot.subscribe(seen)
    boot.setStep('earth:textures', 0.4)
    expect(seen).not.toHaveBeenCalled()
  })
})

describe('the manifest itself', () => {
  it('marks the resources the first frame genuinely needs as required', () => {
    // Required means: without it the scene the warp cuts into is invalid.
    expect(REQUIRED_IDS).toEqual(
      expect.arrayContaining(['chunk:scene', 'earth:textures', 'gpu:warmup', 'orbits:build']),
    )
  })

  it('keeps the prefetched and late-arriving resources optional', () => {
    for (const id of OPTIONAL) expect(REQUIRED_IDS).not.toContain(id)
  })
})
