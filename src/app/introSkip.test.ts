import { describe, expect, it } from 'vitest'
import { PHASE_ORDER } from '../experiences/earth/config/introConfig'
import { TAIL_PHASES, canSkipTail } from './introSkip'

describe('when the intro may be skipped', () => {
  it('never while loading: the draw is the loading cover', () => {
    expect(canSkipTail('draw')).toBe(false)
  })

  it('never once landed: a press at site is the visitor using the page', () => {
    expect(canSkipTail('site')).toBe(false)
  })

  it('in every phase of the scripted tail', () => {
    for (const phase of ['shrink', 'warp', 'swap', 'corner', 'orbits'] as const) {
      expect(canSkipTail(phase), phase).toBe(true)
    }
  })

  it('names exactly the phases between the draw and site', () => {
    // If a phase is ever added to the timeline, this fails and the rule has to
    // be decided for it rather than inherited by accident.
    expect([...TAIL_PHASES]).toEqual(PHASE_ORDER.slice(1, -1))
  })
})
