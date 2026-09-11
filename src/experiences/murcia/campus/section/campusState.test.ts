import { describe, expect, it } from 'vitest'
import { createCampusState, type CampusSnapshot } from './campusState'

// The section is a ring: the intro plus one stop per service, walked without
// wrapping the position. These are the rules the camera and the particles are
// driven from, so they are pinned here rather than read off the screen.

describe('the campus section state', () => {
  it('starts in the overview and ignores stepping until it is entered', () => {
    const state = createCampusState(5)
    state.next()
    state.openDetail()
    expect(state.snapshot).toEqual({ stage: 'overview', index: 0, position: 0, detail: false })
    state.enter()
    expect(state.snapshot.stage).toBe('intro')
  })

  it('walks round the ring and comes back to the intro one lap on', () => {
    const state = createCampusState(5)
    state.enter()
    for (let i = 0; i < 5; i++) state.next()
    expect(state.snapshot).toMatchObject({ stage: 'service', index: 4, position: 5 })
    state.next()
    expect(state.snapshot).toMatchObject({ stage: 'intro', position: 6 })
  })

  it('walks backwards past the intro onto the last service', () => {
    const state = createCampusState(5)
    state.enter()
    state.previous()
    expect(state.snapshot).toMatchObject({ stage: 'service', index: 4, position: -1 })
  })

  it('opens a detail only on a service, and closes it by stepping', () => {
    const state = createCampusState(5)
    state.enter()
    state.openDetail()
    expect(state.snapshot.detail).toBe(false)
    state.next()
    state.openDetail()
    expect(state.snapshot.detail).toBe(true)
    state.next()
    expect(state.snapshot).toMatchObject({ index: 1, detail: false })
  })

  it('tells its listeners once per real change, with where it came from', () => {
    const state = createCampusState(2)
    const seen: Array<[CampusSnapshot, CampusSnapshot]> = []
    const stop = state.subscribe((next, previous) => seen.push([next, previous]))
    state.enter()
    state.enter()
    state.exit()
    stop()
    state.enter()
    expect(seen.map(([next, previous]) => [previous.stage, next.stage])).toEqual([
      ['overview', 'intro'],
      ['intro', 'overview'],
    ])
  })
})
