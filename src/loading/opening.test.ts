// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBootState, REQUIRED_IDS } from '../intro-draw/bootState'
import type { VertigoIntro } from '../intro-draw/boot'

/** A boot global with a drawing whose fill the test completes by hand. */
function fakeBoot(options: { returning?: boolean; reducedMotion?: boolean; done?: boolean } = {}) {
  const boot = createBootState()
  const listeners = new Set<() => void>()
  let done = options.done ?? false
  window.__vertigoIntro = {
    returning: options.returning ?? false,
    reducedMotion: options.reducedMotion ?? false,
    boot,
    handle: {
      isDone: () => done,
      subscribeComplete(fn: () => void) {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
    },
  } as unknown as VertigoIntro
  const fill = () => {
    done = true
    for (const fn of listeners) fn()
  }
  const ready = () => {
    for (const id of REQUIRED_IDS) boot.markDone(id)
  }
  return { boot, fill, ready }
}

/** A fresh module, so each case adopts its own boot. */
async function adopt() {
  vi.resetModules()
  return (await import('./opening')).getOpening()
}

afterEach(() => {
  delete window.__vertigoIntro
})

describe('getOpening', () => {
  it('is null without a boot entry', async () => {
    expect(await adopt()).toBeNull()
  })

  it('is one instance, on the way in the boot decided', async () => {
    fakeBoot({ returning: true })
    vi.resetModules()
    const { getOpening } = await import('./opening')
    expect(getOpening()).toBe(getOpening())
    expect(getOpening()!.current().way).toBe('returning')
  })

  it('follows readiness and the fill from then on', async () => {
    const boot = fakeBoot()
    const opening = (await adopt())!
    boot.fill()
    expect(opening.current().presentation).toBe('draw')
    boot.ready()
    boot.fill()
    expect(opening.current().presentation).toBe('shrink')
  })

  it('catches up on a boot that was ready and filled before the app arrived', async () => {
    const boot = fakeBoot({ done: true })
    boot.ready()
    expect((await adopt())!.current().presentation).toBe('shrink')
  })

  it('latches a fatal that happened before it', async () => {
    const boot = fakeBoot()
    boot.boot.markFatal('chunk:scene', 'test')
    expect((await adopt())!.current().readiness).toBe('fatal')
  })
})
