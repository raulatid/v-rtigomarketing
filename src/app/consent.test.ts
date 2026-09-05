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
    const written = a.writeConsent({ analytics: true })
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
    writeConsent({ analytics: false })
    expect(hasConsent('analytics')).toBe(false)
    writeConsent({ analytics: true })
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
    writeConsent({ analytics: true })
    expect(seen).toEqual([null, true])
    stop()
    writeConsent({ analytics: false })
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
    const written = writeConsent({ analytics: true })
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
