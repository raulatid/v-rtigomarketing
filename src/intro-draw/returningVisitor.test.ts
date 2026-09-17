// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { isReturningVisitor } from './returningVisitor'
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  hasConsent,
} from '../app/consent'
import { INTRO_STORAGE_KEY, INTRO_VERSION, readIntroSeen } from '../app/introSeen'

// The boot entry cannot import the two modules that OWN these records, so it
// restates their shapes. This file is what keeps the restatement honest: the
// same storage, read by the owners and by the boot reader, must get one answer.

const consent = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    v: CONSENT_VERSION,
    preferences: true,
    analytics: false,
    at: '2026-01-01T00:00:00.000Z',
    ...over,
  })
const intro = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ v: INTRO_VERSION, seen: true, ...over })

beforeEach(() => window.localStorage.clear())

describe('isReturningVisitor agrees with the records’ owners', () => {
  const cases: Array<[string, string | null, string | null]> = [
    ['both records, as written', consent(), intro()],
    ['no records at all', null, null],
    ['the intro record without any consent', null, intro()],
    ['consent without the intro record', consent(), null],
    ['preferences refused', consent({ preferences: false }), intro()],
    ['a consent record from another version', consent({ v: CONSENT_VERSION + 1 }), intro()],
    ['a consent record missing its timestamp', consent({ at: undefined }), intro()],
    ['a consent record with a non-boolean analytics', consent({ analytics: 'yes' }), intro()],
    ['an intro record from another version', consent(), intro({ v: INTRO_VERSION + 1 })],
    ['an intro record that says not seen', consent(), intro({ seen: false })],
    ['malformed JSON in the consent record', '{nope', intro()],
    ['malformed JSON in the intro record', consent(), '{nope'],
    ['a JSON null where a record should be', 'null', 'null'],
  ]

  it.each(cases)('%s', (_name, consentRaw, introRaw) => {
    if (consentRaw !== null) window.localStorage.setItem(CONSENT_STORAGE_KEY, consentRaw)
    if (introRaw !== null) window.localStorage.setItem(INTRO_STORAGE_KEY, introRaw)
    // The boot reader goes FIRST: the consent module removes the intro record
    // when preferences are not granted, as a side effect of being read.
    const atBoot = isReturningVisitor(window.localStorage)
    // The owner caches its record for the page; this is its own way of being
    // told the storage changed underneath it.
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(atBoot).toBe(hasConsent('preferences') && readIntroSeen())
  })

  it('is a returning visitor exactly when both records say so', () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, consent())
    window.localStorage.setItem(INTRO_STORAGE_KEY, intro())
    expect(isReturningVisitor(window.localStorage)).toBe(true)
  })
})

describe('storage that cannot be read is a first visit', () => {
  it('when getItem throws, as a browser blocking site data does', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
    }
    expect(isReturningVisitor(blocked)).toBe(false)
  })
})
