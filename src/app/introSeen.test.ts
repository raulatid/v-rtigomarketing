// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  INTRO_STORAGE_KEY,
  INTRO_VERSION,
  clearIntroSeen,
  markIntroSeen,
  parseIntroRecord,
  readIntroSeen,
} from './introSeen'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('the intro-seen record is read tolerantly', () => {
  it('accepts only the current version with seen: true', () => {
    expect(parseIntroRecord({ v: INTRO_VERSION, seen: true })).toBe(true)
  })

  it.each([
    null,
    undefined,
    'seen',
    42,
    {},
    { v: INTRO_VERSION },
    { v: INTRO_VERSION, seen: false },
    { v: INTRO_VERSION, seen: 'yes' },
    { v: INTRO_VERSION + 1, seen: true },
  ])('treats %o as not seen', (raw) => {
    expect(parseIntroRecord(raw)).toBe(false)
  })
})

describe('reading and marking', () => {
  it('reads not seen on a first visit', () => {
    expect(readIntroSeen()).toBe(false)
  })

  it('reads seen after it is marked', () => {
    markIntroSeen()
    expect(window.localStorage.getItem(INTRO_STORAGE_KEY)).toBe(
      JSON.stringify({ v: INTRO_VERSION, seen: true }),
    )
    expect(readIntroSeen()).toBe(true)
  })

  it('reads a malformed value as not seen rather than throwing', () => {
    window.localStorage.setItem(INTRO_STORAGE_KEY, '{not json')
    expect(readIntroSeen()).toBe(false)
  })

  it('treats unavailable storage as a first visit, and marking as a no-op', () => {
    // Safari private mode throws on setItem; blocked site data throws on access.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readIntroSeen()).toBe(false)
    expect(() => markIntroSeen()).not.toThrow()
  })
})

describe('clearing — what a refused or withdrawn consent asks for', () => {
  it('removes the record, so the next visit is a first visit again', () => {
    markIntroSeen()
    clearIntroSeen()
    expect(window.localStorage.getItem(INTRO_STORAGE_KEY)).toBeNull()
    expect(readIntroSeen()).toBe(false)
  })

  it('is a no-op when nothing is stored or storage is unavailable', () => {
    expect(() => clearIntroSeen()).not.toThrow()
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => clearIntroSeen()).not.toThrow()
  })
})
