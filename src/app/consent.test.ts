// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The module caches the record and holds its subscribers at module level (the
// cursorSignal shape), so every test imports a fresh copy: what one test wrote
// must not be what the next one reads.
async function fresh() {
  vi.resetModules()
  return import('./consent')
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('readConsent', () => {
  it('is null when nothing has been stored', async () => {
    const { readConsent } = await fresh()
    expect(readConsent()).toBeNull()
  })

  it('returns what writeConsent stored, across a fresh import', async () => {
    const a = await fresh()
    const written = a.writeConsent({ analytics: true, preferences: false })
    expect(written.analytics).toBe(true)
    expect(written.v).toBe(a.CONSENT_VERSION)

    const b = await fresh()
    expect(b.readConsent()).toEqual(written)
  })

  it('is null for malformed JSON', async () => {
    localStorage.setItem('vertigo:consent', '{not json')
    const { readConsent } = await fresh()
    expect(readConsent()).toBeNull()
  })

  it('is null for a record of another version, so the visitor is asked again', async () => {
    localStorage.setItem(
      'vertigo:consent',
      JSON.stringify({ v: 0, analytics: true, at: '2026-01-01T00:00:00.000Z' }),
    )
    const { readConsent } = await fresh()
    expect(readConsent()).toBeNull()
  })

  it('is null when a field is missing or of the wrong type', async () => {
    const { readConsent, CONSENT_VERSION } = await fresh()
    localStorage.setItem('vertigo:consent', JSON.stringify({ v: CONSENT_VERSION, at: 'x' }))
    expect(readConsent()).toBeNull()
    localStorage.setItem(
      'vertigo:consent',
      JSON.stringify({ v: CONSENT_VERSION, analytics: 'yes', at: 'x' }),
    )
    expect(readConsent()).toBeNull()
  })
})

describe('hasConsent', () => {
  it('is false with no record and true only after analytics was accepted', async () => {
    const { hasConsent, writeConsent } = await fresh()
    expect(hasConsent('analytics')).toBe(false)
    writeConsent({ analytics: false, preferences: false })
    expect(hasConsent('analytics')).toBe(false)
    writeConsent({ analytics: true, preferences: false })
    expect(hasConsent('analytics')).toBe(true)
  })
})

describe('subscribeConsent', () => {
  it('calls back immediately with the current record', async () => {
    const { subscribeConsent } = await fresh()
    const seen: unknown[] = []
    subscribeConsent((r) => seen.push(r))
    expect(seen).toEqual([null])
  })

  it('notifies on write and stops after unsubscribe', async () => {
    const { subscribeConsent, writeConsent } = await fresh()
    const seen: unknown[] = []
    const stop = subscribeConsent((r) => seen.push(r?.analytics ?? null))
    writeConsent({ analytics: true, preferences: false })
    expect(seen).toEqual([null, true])
    stop()
    writeConsent({ analytics: false, preferences: false })
    expect(seen).toEqual([null, true])
  })
})

describe('when storage is unavailable', () => {
  it('keeps the choice for the session and still notifies', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    const { readConsent, writeConsent, subscribeConsent } = await fresh()
    const seen: unknown[] = []
    subscribeConsent((r) => seen.push(r?.analytics ?? null))
    const written = writeConsent({ analytics: true, preferences: false })
    expect(written.analytics).toBe(true)
    expect(readConsent()).toEqual(written)
    expect(seen).toEqual([null, true])
  })

  it('reads null when getItem throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    const { readConsent } = await fresh()
    expect(readConsent()).toBeNull()
  })
})

describe('granular choices and withdrawal', () => {
  it('requires a new choice for the old global consent', async () => {
    localStorage.setItem('vertigo:consent', JSON.stringify({ v: 1, analytics: true, at: '2026-01-01' }))
    localStorage.setItem('vertigo:intro', JSON.stringify({ v: 1, seen: true }))
    const { readConsent } = await fresh()
    expect(readConsent()).toBeNull()
    expect(localStorage.getItem('vertigo:intro')).toBeNull()
  })

  it('allows experience preferences independently and removes their storage on withdrawal', async () => {
    const { writeConsent, hasConsent } = await fresh()
    writeConsent({ preferences: true, analytics: false })
    expect(hasConsent('preferences')).toBe(true)
    expect(hasConsent('analytics')).toBe(false)
    localStorage.setItem('vertigo:intro', 'seen')
    writeConsent({ preferences: false, analytics: true })
    expect(localStorage.getItem('vertigo:intro')).toBeNull()
    expect(hasConsent('analytics')).toBe(true)
  })

  it('notifies subscribers when another tab changes or clears consent', async () => {
    const { subscribeConsent, readConsent } = await fresh()
    const listener = vi.fn()
    const stop = subscribeConsent(listener)
    const record = { v: 4, preferences: true, analytics: false, at: '2026-09-15' }
    localStorage.setItem('vertigo:consent', JSON.stringify(record))
    window.dispatchEvent(new StorageEvent('storage', { key: 'vertigo:consent' }))
    expect(readConsent()).toEqual(record)
    expect(listener).toHaveBeenLastCalledWith(record)
    localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(listener).toHaveBeenLastCalledWith(null)
    stop()
  })
})
