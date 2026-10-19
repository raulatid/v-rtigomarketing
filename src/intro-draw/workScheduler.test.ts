import { describe, it, expect } from 'vitest'
import { admitsDeferred, createWorkScheduler } from './workScheduler'
import type { Presentation, WorkKind } from './openingMachine'

const PRESENTATIONS: Presentation[] = ['draw', 'shrink', 'warp', 'swap', 'corner', 'orbits', 'site']
const KINDS: WorkKind[] = ['network', 'worker', 'main', 'gpu']

describe('admitsDeferred', () => {
  // ADR 016's table for work nothing waits for, stated per state rather than
  // derived: a presentation state inserted into the motion must be refused
  // main-thread work until someone decides otherwise.
  const MAIN: Record<Presentation, boolean> = {
    draw: false,
    shrink: false,
    warp: false,
    swap: false,
    corner: false,
    orbits: false,
    site: true,
  }

  it.each(PRESENTATIONS)('main-thread work in %s', (presentation) => {
    expect(admitsDeferred(presentation, 'main')).toBe(MAIN[presentation])
    // A program link counts as main thread.
    expect(admitsDeferred(presentation, 'gpu')).toBe(MAIN[presentation])
  })

  it('admits network and worker work everywhere but draw', () => {
    for (const presentation of PRESENTATIONS) {
      for (const kind of ['network', 'worker'] as const) {
        expect(admitsDeferred(presentation, kind)).toBe(presentation !== 'draw')
      }
    }
  })

  it('refuses everything in draw', () => {
    for (const kind of KINDS) expect(admitsDeferred('draw', kind)).toBe(false)
  })
})

describe('createWorkScheduler', () => {
  function record() {
    const started: string[] = []
    return { started, start: (name: string) => () => started.push(name) }
  }

  it('starts nothing before the presentation admits it', () => {
    const scheduler = createWorkScheduler()
    const { started, start } = record()
    scheduler.schedule('main', start('city'))

    for (const presentation of PRESENTATIONS.slice(0, -1)) scheduler.step(presentation)
    expect(started).toEqual([])

    scheduler.step('site')
    expect(started).toEqual(['city'])
  })

  it('starts off-thread work as soon as the motion begins, ahead of main-thread work', () => {
    const scheduler = createWorkScheduler()
    const { started, start } = record()
    scheduler.schedule('main', start('assemble'))
    scheduler.schedule('network', start('fetch'))
    scheduler.schedule('worker', start('decode'))

    scheduler.step('draw')
    expect(started).toEqual([])
    scheduler.step('shrink')
    expect(started).toEqual(['fetch', 'decode'])
    scheduler.step('site')
    expect(started).toEqual(['fetch', 'decode', 'assemble'])
  })

  it('starts each unit once', () => {
    const scheduler = createWorkScheduler()
    const { started, start } = record()
    scheduler.schedule('network', start('fetch'))

    scheduler.step('site')
    scheduler.step('site')
    expect(started).toEqual(['fetch'])
  })

  it('starts one main-thread unit per step, in the order queued', () => {
    const scheduler = createWorkScheduler()
    const { started, start } = record()
    scheduler.schedule('main', start('a'))
    scheduler.schedule('gpu', start('b'))
    scheduler.schedule('network', start('c'))

    scheduler.step('site')
    expect(started).toEqual(['a', 'c'])
    scheduler.step('site')
    expect(started).toEqual(['a', 'c', 'b'])
  })

  it('never starts a cancelled unit', () => {
    const scheduler = createWorkScheduler()
    const { started, start } = record()
    const cancel = scheduler.schedule('main', start('city'))

    cancel()
    scheduler.step('site')
    expect(started).toEqual([])
  })

  it('treats a cancel after the start as a no-op', () => {
    const scheduler = createWorkScheduler()
    const { started, start } = record()
    const cancel = scheduler.schedule('network', start('a'))
    scheduler.step('site')

    cancel()
    scheduler.schedule('network', start('b'))
    scheduler.step('site')
    expect(started).toEqual(['a', 'b'])
  })

  it('honours a cancel made by a start earlier in the same step', () => {
    const scheduler = createWorkScheduler()
    const { started, start } = record()
    let cancelSecond = () => {}
    scheduler.schedule('network', () => {
      started.push('first')
      cancelSecond()
    })
    cancelSecond = scheduler.schedule('network', start('second'))

    scheduler.step('site')
    expect(started).toEqual(['first'])
  })
})
