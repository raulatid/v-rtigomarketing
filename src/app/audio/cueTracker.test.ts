import { describe, expect, it } from 'vitest'
import { createCueTracker, edgeCue } from './cueTracker'

describe('edgeCue', () => {
  const cueFor = edgeCue('open', 'close')

  it('names each direction, and nothing without a change', () => {
    expect(cueFor(false, true)).toBe('open')
    expect(cueFor(true, false)).toBe('close')
    expect(cueFor(false, false)).toBeNull()
    expect(cueFor(true, true)).toBeNull()
  })

  it('is silent on the falling edge when it has no cue for it', () => {
    expect(edgeCue('offer')(true, false)).toBeNull()
  })
})

describe('createCueTracker', () => {
  function track(initial: boolean) {
    const played: string[] = []
    const tracker = createCueTracker(initial, edgeCue('open', 'close'), (cue) => played.push(cue))
    return { tracker, played }
  }

  it('never sounds for the value it starts from', () => {
    const { tracker, played } = track(true)
    tracker.update(true)
    expect(played).toEqual([])
  })

  it('sounds each change once, against the last value it saw', () => {
    const { tracker, played } = track(false)
    tracker.update(true)
    tracker.update(true)
    tracker.update(false)
    expect(played).toEqual(['open', 'close'])
  })

  it('takes a reset as the new baseline without a sound', () => {
    const { tracker, played } = track(true)
    tracker.reset(false)
    tracker.update(false)
    expect(played).toEqual([])
    tracker.update(true)
    expect(played).toEqual(['open'])
  })
})
