import { describe, it, expect, vi } from 'vitest'
import { createDistrictState } from './districtState'

// The state rules plan 003 §22 spells out. They are asserted here rather than
// through the interaction because this is the whole source of truth: if wrapping
// or the detail reset is wrong, every consumer is wrong in the same way and none
// of them is where the fix belongs.

const open = (serviceCount = 5) => {
  const state = createDistrictState({ serviceCount })
  state.enterDistrict()
  return state
}

describe('createDistrictState', () => {
  it('starts closed', () => {
    expect(createDistrictState({ serviceCount: 5 }).get()).toEqual({
      districtActive: false,
      activeServiceIndex: 0,
      detailOpen: false,
    })
  })

  it('opens on the first service, never on an empty state', () => {
    const state = open()
    expect(state.get()).toEqual({
      districtActive: true,
      activeServiceIndex: 0,
      detailOpen: false,
    })
  })

  it('ignores navigation while closed', () => {
    const state = createDistrictState({ serviceCount: 5 })
    state.nextService()
    state.openDetail()
    expect(state.get()).toEqual({
      districtActive: false,
      activeServiceIndex: 0,
      detailOpen: false,
    })
  })

  it('wraps forwards', () => {
    const state = open(3)
    for (const expected of [1, 2, 0, 1]) {
      state.nextService()
      expect(state.get().activeServiceIndex).toBe(expected)
    }
  })

  it('wraps backwards', () => {
    const state = open(3)
    for (const expected of [2, 1, 0, 2]) {
      state.previousService()
      expect(state.get().activeServiceIndex).toBe(expected)
    }
  })

  it('closes the detail on every service change', () => {
    const state = open()
    state.openDetail()
    expect(state.get().detailOpen).toBe(true)
    state.nextService()
    expect(state.get()).toMatchObject({ activeServiceIndex: 1, detailOpen: false })
  })

  // A single-service district still has to close the detail on a "change" that
  // lands on the same index, or the control does nothing and looks broken.
  it('closes the detail even when the index does not move', () => {
    const state = open(1)
    state.openDetail()
    state.nextService()
    expect(state.get()).toMatchObject({ activeServiceIndex: 0, detailOpen: false })
  })

  it('does not emit when nothing changed', () => {
    const state = open(1)
    const listener = vi.fn()
    state.subscribe(listener)
    state.nextService()
    expect(listener).not.toHaveBeenCalled()
  })

  it('opens and closes the detail idempotently', () => {
    const state = open()
    const listener = vi.fn()
    state.subscribe(listener)

    state.openDetail()
    state.openDetail()
    expect(listener).toHaveBeenCalledTimes(1)

    state.closeDetail()
    state.closeDetail()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(state.get().detailOpen).toBe(false)
  })

  it('leaves the index alone on exit but clears the detail', () => {
    const state = open()
    state.nextService()
    state.nextService()
    state.openDetail()
    state.exitDistrict()
    expect(state.get()).toEqual({
      districtActive: false,
      activeServiceIndex: 2,
      detailOpen: false,
    })
  })

  it('re-enters deterministically on the first service', () => {
    const state = open()
    state.nextService()
    state.exitDistrict()
    state.enterDistrict()
    expect(state.get()).toMatchObject({ activeServiceIndex: 0, detailOpen: false })
  })

  it('stops notifying an unsubscribed listener', () => {
    const state = open()
    const listener = vi.fn()
    const off = state.subscribe(listener)
    state.nextService()
    off()
    state.nextService()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  // The reason `emit` iterates a copy. Without it this throws or silently skips
  // the next listener, and it only happens once a listener tears itself down —
  // which is exactly what disposal does.
  it('survives a listener unsubscribing itself mid-notification', () => {
    const state = open()
    const second = vi.fn()
    const off = state.subscribe(() => off())
    state.subscribe(second)
    expect(() => state.nextService()).not.toThrow()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('treats a zero service count as one, rather than dividing by it', () => {
    const state = createDistrictState({ serviceCount: 0 })
    state.enterDistrict()
    state.nextService()
    expect(state.get().activeServiceIndex).toBe(0)
  })
})
