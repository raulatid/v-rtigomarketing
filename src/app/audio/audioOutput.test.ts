import { describe, expect, it } from 'vitest'
import {
  SOUND_VERSION,
  isActivationKey,
  parseSoundRecord,
  soundAudible,
  soundStatus,
  type SoundState,
  type SuppressReason,
} from './audioOutput'

function state(overrides: Partial<SoundState> = {}): SoundState {
  return {
    enabled: true,
    started: true,
    blocked: false,
    suppressed: new Set<SuppressReason>(),
    ...overrides,
  }
}

describe('soundAudible', () => {
  it('opens the master once Earth is ready, on, and unblocked', () => {
    expect(soundAudible(state())).toBe(true)
  })

  it('is silent before Earth is ready, while off, and while blocked', () => {
    expect(soundAudible(state({ started: false }))).toBe(false)
    expect(soundAudible(state({ enabled: false }))).toBe(false)
    expect(soundAudible(state({ blocked: true }))).toBe(false)
  })

  it('is silent while any reason suppresses it', () => {
    expect(soundAudible(state({ suppressed: new Set(['blog']) }))).toBe(false)
    expect(soundAudible(state({ suppressed: new Set(['hidden']) }))).toBe(false)
  })
})

describe('soundStatus', () => {
  it('reads a blocked start as off, so the toggle offers to start it', () => {
    expect(soundStatus(state(), true)).toBe('on')
    expect(soundStatus(state({ blocked: true }), true)).toBe('off')
    expect(soundStatus(state({ enabled: false }), true)).toBe('off')
  })

  it('stays on while merely suppressed — the visitor did not turn it off', () => {
    expect(soundStatus(state({ suppressed: new Set(['blog']) }), true)).toBe('on')
  })

  it('is unavailable without Web Audio', () => {
    expect(soundStatus(state(), false)).toBe('unavailable')
  })
})

describe('parseSoundRecord', () => {
  it('honours a well-formed record', () => {
    expect(parseSoundRecord({ v: SOUND_VERSION, on: false })).toBe(false)
    expect(parseSoundRecord({ v: SOUND_VERSION, on: true })).toBe(true)
  })

  it('treats anything else as no record', () => {
    expect(parseSoundRecord(null)).toBeNull()
    expect(parseSoundRecord('off')).toBeNull()
    expect(parseSoundRecord({ v: SOUND_VERSION + 1, on: false })).toBeNull()
    expect(parseSoundRecord({ v: SOUND_VERSION, on: 'false' })).toBeNull()
  })
})

// Accessibility audit 2026-11-18, D5: the first Tab started the music over a
// screen reader. Only a key that activates something counts as the gesture.
describe('the keys that may start the sound', () => {
  const key = (k: string, mods: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey', boolean>> = {}) => ({
    key: k,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...mods,
  })

  it('are Enter and Space', () => {
    expect(isActivationKey(key('Enter'))).toBe(true)
    expect(isActivationKey(key(' '))).toBe(true)
  })

  it('are not the keys that move around the page or belong to a screen reader', () => {
    for (const k of ['Tab', 'ArrowDown', 'ArrowRight', 'Escape', 'Shift', 'Control', 'Insert', 'CapsLock', 'PageDown', 'h']) {
      expect(isActivationKey(key(k)), k).toBe(false)
    }
    expect(isActivationKey(key('Enter', { ctrlKey: true }))).toBe(false)
  })
})
