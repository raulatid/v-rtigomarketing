import { describe, expect, it } from 'vitest'
import { createHoverTutorial } from './hoverTutorial'
import type { HoverTutorialConfig, TutorialFrame, TutorialInput } from './hoverTutorial'
import { ORBIT_CONFIG } from './orbitConfig'

// The tutorial's sequence, in isolation from anything visual: rounds of two
// pulses of the real hover state, each announced by the cue, repeating until
// the viewer interacts. Every timing below is the shipped config, so a retune
// that broke the order — hover before the cue, a third pulse in a round, a cue
// under reduced motion — fails here before it reaches the scene.

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

/** One round's worth of frames, plus the arming beat and a margin. */
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

  it('plays the configured number of pulses in a round, then rests', () => {
    const tutorial = createHoverTutorial()
    const frames = run(tutorial, total())
    expect(rises(frames)).toBe(cfg.pulses)
    expect(tutorial.pulsesPlayed).toBe(cfg.pulses)
    expect(tutorial.roundsPlayed).toBe(1)
    expect(tutorial.phase).toBe('rest')
    // The round ended with nothing held.
    expect(frames.at(-1)).toEqual({ hover: false, cue: null })
  })

  it('offers again after the round gap, and keeps offering', () => {
    // The client's rule: it repeats until the viewer interacts. Nothing here
    // ends it — no timer, no pulse count.
    const tutorial = createHoverTutorial()
    const frames = run(tutorial, total() + cfg.roundGap + total() * 2)
    expect(tutorial.roundsPlayed).toBeGreaterThanOrEqual(3)
    expect(rises(frames)).toBe(tutorial.pulsesPlayed)
    expect(tutorial.pulsesPlayed).toBe(tutorial.roundsPlayed * cfg.pulses)
    expect(tutorial.phase).not.toBe('done')
  })

  it('rests longer between rounds than between the pulses of one', () => {
    const tutorial = createHoverTutorial()
    const frames = run(tutorial, total() + cfg.roundGap + total())
    // The quiet stretches between rises, in seconds.
    const quiet: number[] = []
    let run_ = 0
    let seen = false
    for (const f of frames) {
      if (f.hover) {
        if (run_ > 0 && seen) quiet.push(run_ * DT)
        run_ = 0
        seen = true
      } else if (seen) run_ += 1
    }
    const longest = Math.max(...quiet)
    const shortest = Math.min(...quiet)
    expect(longest).toBeGreaterThan(shortest * 1.5)
    expect(longest).toBeCloseTo(cfg.gap + cfg.roundGap + cfg.cueLead, 0)
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

  it('never gives up on its own, however long the target stays out of view', () => {
    // A hint that expired while the viewer was still puzzled would be a hint
    // that failed. It waits, and offers when it can be seen.
    const tutorial = createHoverTutorial()
    run(tutorial, 60, { settled: true, visible: false })
    expect(tutorial.phase).toBe('waiting')
    expect(tutorial.pulsesPlayed).toBe(0)

    run(tutorial, total())
    expect(tutorial.pulsesPlayed).toBe(cfg.pulses)
  })

  it('waits, rather than ending, if the target leaves the screen mid-pulse', () => {
    const tutorial = createHoverTutorial()
    run(tutorial, cfg.armDelay + cfg.cueLead * 0.5)
    expect(tutorial.phase).toBe('pulse')

    expect(tutorial.tick(DT, { settled: true, visible: false })).toEqual({
      hover: false,
      cue: null,
    })
    expect(tutorial.phase).toBe('waiting')

    // It comes back round, and the offer is made again from the top.
    run(tutorial, total())
    expect(tutorial.pulsesPlayed).toBe(cfg.pulses)
  })

  it('suspends and resumes: leaving the scene is not an interaction', () => {
    const tutorial = createHoverTutorial()
    run(tutorial, total())
    const before = tutorial.pulsesPlayed
    expect(before).toBeGreaterThan(0)

    tutorial.suspend()
    expect(tutorial.phase).toBe('waiting')
    // Nothing is held while suspended.
    expect(tutorial.tick(DT, { settled: false, visible: false })).toEqual({
      hover: false,
      cue: null,
    })

    run(tutorial, total())
    expect(tutorial.pulsesPlayed).toBe(before + cfg.pulses)
  })

  it('stays retired through a suspend', () => {
    const tutorial = createHoverTutorial()
    tutorial.retire()
    tutorial.suspend()
    expect(tutorial.phase).toBe('done')
    expect(rises(run(tutorial, total() * 2))).toBe(0)
  })

  it('under reduced motion plays one longer pulse per round, with no cue', () => {
    const tutorial = createHoverTutorial(cfg, { reducedMotion: true })
    const oneRound = cfg.armDelay + cfg.cueLead + cfg.hold * cfg.reducedMotionHoldScale + cfg.gap
    const frames = run(tutorial, oneRound + 0.5)
    expect(rises(frames)).toBe(1)
    expect(tutorial.roundsPlayed).toBe(1)
    expect(frames.every((f) => f.cue === null)).toBe(true)
    const on = frames.filter((f) => f.hover).length * DT
    expect(on).toBeCloseTo(cfg.hold * cfg.reducedMotionHoldScale, 1)

    // And it repeats, like the full version.
    run(tutorial, cfg.roundGap + oneRound)
    expect(tutorial.roundsPlayed).toBeGreaterThanOrEqual(2)
  })

  it('ignores retirement when asked to, for tuning only', () => {
    const tutorial = createHoverTutorial(cfg, { loop: true })
    run(tutorial, total())
    tutorial.retire()
    expect(tutorial.phase).not.toBe('done')
    expect(rises(run(tutorial, cfg.roundGap + total()))).toBeGreaterThan(0)
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
