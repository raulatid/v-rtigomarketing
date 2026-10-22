import { describe, it, expect } from 'vitest'
import { createOpeningStore } from './openingStore'

describe('createOpeningStore', () => {
  it('moves through the machine and tells its listeners', () => {
    const store = createOpeningStore({ returning: false, reducedMotion: false })
    const seen: string[] = []
    store.subscribe(() => seen.push(store.current().presentation))

    store.send({ type: 'readiness', readiness: 'ready' })
    store.send({ type: 'fill' })
    store.send({ type: 'elapsed' })
    expect(seen).toEqual(['draw', 'shrink', 'warp'])
  })

  it('tells nobody about an event that changed nothing', () => {
    const store = createOpeningStore({ returning: false, reducedMotion: false })
    let calls = 0
    store.subscribe(() => calls++)
    store.send({ type: 'fill' })
    store.send({ type: 'elapsed' })
    expect(calls).toBe(0)
  })

  it('stops telling a listener that unsubscribed', () => {
    const store = createOpeningStore({ returning: false, reducedMotion: false })
    let calls = 0
    const unsubscribe = store.subscribe(() => calls++)
    unsubscribe()
    store.send({ type: 'readiness', readiness: 'ready' })
    expect(calls).toBe(0)
  })
})
