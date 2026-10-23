import { describe, expect, it } from 'vitest'
import {
  SOUND_VERSION,
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
