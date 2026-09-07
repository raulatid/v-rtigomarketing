import { describe, expect, it } from 'vitest'
import { createHoverTutorial } from './hoverTutorial'
import type { HoverTutorialConfig, TutorialFrame, TutorialInput } from './hoverTutorial'
import { ORBIT_CONFIG } from './orbitConfig'

// The tutorial's sequence, in isolation from anything visual: exactly two
// pulses of the real hover state, each announced by the cue, then done for
// good. Every timing below is the shipped config, so a retune that broke the
// order — hover before the cue, a third pulse, a cue under reduced motion —
// fails here before it reaches the scene.

const cfg = ORBIT_CONFIG.tutorial
const DT = 1 / 60
const READY: TutorialInput = { settled: true, visible: true }

/** Runs `seconds` of frames, recording every frame. */
function run(
  tutorial: ReturnType<typeof createHoverTutorial>,
  seconds: number,
  input: TutorialInput = READY,
): TutorialFrame[] {
  const frames: TutorialFrame[] = []
  for (let t = 0; t < seconds; t += DT) frames.push(tutorial.tick(DT, input))
  return frames
}

/** How many times `hover` went from false to true. */
function rises(frames: TutorialFrame[]): number {
  let count = 0
  let last = false
  for (const f of frames) {
    if (f.hover && !last) count += 1
    last = f.hover
  }
  return count
}

const total = (c: HoverTutorialConfig = cfg) =>
  c.armDelay + c.pulses * (c.cueLead + c.hold + c.gap) + 1

describe('the hover tutorial', () => {
  it('waits for the target to settle, then to be visible, before arming', () => {
    const tutorial = createHoverTutorial()
    run(tutorial, 5, { settled: false, visible: true })
    expect(tutorial.phase).toBe('waiting')
    run(tutorial, 5, { settled: true, visible: false })
    expect(tutorial.phase).toBe('waiting')
    tutorial.tick(DT, READY)
    expect(tutorial.phase).toBe('arming')
  })

  it('plays exactly the configured number of pulses, then is done', () => {
    const tutorial = createHoverTutorial()
    const frames = run(tutorial, total())
    expect(rises(frames)).toBe(cfg.pulses)
    expect(tutorial.pulsesPlayed).toBe(cfg.pulses)
    expect(tutorial.phase).toBe('done')
    // Nothing after: the last frames are at rest.
    expect(frames.at(-1)).toEqual({ hover: false, cue: null })
    expect(run(tutorial, 5).every((f) => !f.hover && f.cue === null)).toBe(true)
  })

  it('holds the beat before the first pulse', () => {
    const tutorial = createHoverTutorial()
    const frames = run(tutorial, cfg.armDelay * 0.9)
    expect(frames.every((f) => !f.hover && f.cue === null)).toBe(true)
  })

  it('announces each pulse with the cue, and the hover starts as it lands', () => {
    const tutorial = createHoverTutorial()
    const frames = run(tutorial, total())
    const firstCue = frames.findIndex((f) => f.cue !== null)
    const firstHover = frames.findIndex((f) => f.hover)
    expect(firstCue).toBeGreaterThanOrEqual(0)
    expect(firstCue).toBeLessThan(firstHover)
    // The cue is well under way when the hover begins: cueLead / cueDuration.
    expect(frames[firstHover]!.cue).toBeCloseTo(cfg.cueLead / cfg.cueDuration, 1)
    // The cue's progress only ever climbs within a pulse, from 0 toward 1.
    let last = -1
    for (const f of frames.slice(firstCue)) {
      if (f.cue === null) {
        last = -1
        continue
      }
      expect(f.cue).toBeGreaterThanOrEqual(0)
      expect(f.cue).toBeLessThanOrEqual(1)
      expect(f.cue).toBeGreaterThanOrEqual(last)
      last = f.cue
    }
  })

  it('holds the hover for the configured time, then rests for the gap', () => {
    const tutorial = createHoverTutorial()
    const frames = run(tutorial, total())
    const on = frames.filter((f) => f.hover).length * DT
    expect(on).toBeCloseTo(cfg.pulses * cfg.hold, 1)
  })

  it('retires cleanly mid-pulse and never rises again', () => {
    const tutorial = createHoverTutorial()
    let frame: TutorialFrame = { hover: false, cue: null }
    while (!frame.hover) frame = tutorial.tick(DT, READY)
    tutorial.retire()
    expect(tutorial.phase).toBe('done')
    expect(tutorial.tick(DT, READY)).toEqual({ hover: false, cue: null })
    expect(rises(run(tutorial, total()))).toBe(0)
    // Idempotent.
    tutorial.retire()
    expect(tutorial.phase).toBe('done')
  })

  it('gives up quietly if the target never comes on screen after settling', () => {
    const tutorial = createHoverTutorial()
    run(tutorial, cfg.maxWaitSeconds + 1, { settled: true, visible: false })
    expect(tutorial.phase).toBe('done')
    expect(tutorial.pulsesPlayed).toBe(0)
  })

  it('does not count time before the target has settled toward the wait', () => {
    const tutorial = createHoverTutorial()
    run(tutorial, cfg.maxWaitSeconds * 2, { settled: false, visible: false })
    expect(tutorial.phase).toBe('waiting')
  })

  it('ends if the target leaves the screen mid-pulse', () => {
    const tutorial = createHoverTutorial()
    run(tutorial, cfg.armDelay + cfg.cueLead * 0.5)
    expect(tutorial.phase).toBe('pulse')
    expect(tutorial.tick(DT, { settled: true, visible: false })).toEqual({
      hover: false,
      cue: null,
    })
    expect(tutorial.phase).toBe('done')
  })

  it('under reduced motion plays one longer pulse with no cue', () => {
    const tutorial = createHoverTutorial(cfg, { reducedMotion: true })
    const frames = run(tutorial, total() * cfg.reducedMotionHoldScale)
    expect(rises(frames)).toBe(1)
    expect(frames.every((f) => f.cue === null)).toBe(true)
    const on = frames.filter((f) => f.hover).length * DT
    expect(on).toBeCloseTo(cfg.hold * cfg.reducedMotionHoldScale, 1)
    expect(tutorial.phase).toBe('done')
  })

  it('loops and ignores retirement when asked to, for tuning only', () => {
    const tutorial = createHoverTutorial(cfg, { loop: true })
    const frames = run(tutorial, total() * 3)
    expect(rises(frames)).toBeGreaterThan(cfg.pulses)
    tutorial.retire()
    expect(tutorial.phase).not.toBe('done')
  })

  it('treats a frame that lies about time as no time at all', () => {
    const tutorial = createHoverTutorial()
    tutorial.tick(DT, READY)
    expect(tutorial.phase).toBe('arming')
    tutorial.tick(Number.NaN, READY)
    tutorial.tick(-1, READY)
    tutorial.tick(Number.POSITIVE_INFINITY, READY)
    expect(tutorial.phase).toBe('arming')
  })
})
