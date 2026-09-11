import { describe, expect, it } from 'vitest'
import {
  SOUND_VERSION,
  musicStatus,
  musicTargets,
  parseSoundRecord,
  type MusicState,
  type SuppressReason,
} from './backgroundMusic'

function state(overrides: Partial<MusicState> = {}): MusicState {
  return {
    enabled: true,
    started: true,
    blocked: false,
    active: 'earth',
    suppressed: new Set<SuppressReason>(),
    ...overrides,
  }
}

describe('musicTargets', () => {
  it('plays the active world alone', () => {
    expect(musicTargets(state())).toEqual({ master: 1, earth: 1, murcia: 0 })
    expect(musicTargets(state({ active: 'murcia' }))).toEqual({ master: 1, earth: 0, murcia: 1 })
  })

  it('is silent before Earth is ready, while off, and while blocked', () => {
    expect(musicTargets(state({ started: false })).master).toBe(0)
    expect(musicTargets(state({ enabled: false })).master).toBe(0)
    expect(musicTargets(state({ blocked: true })).master).toBe(0)
  })

  it('is silent while any reason suppresses it, and keeps the world it will return to', () => {
    const blog = musicTargets(state({ active: 'murcia', suppressed: new Set(['blog']) }))
    expect(blog).toEqual({ master: 0, earth: 0, murcia: 1 })
    expect(musicTargets(state({ suppressed: new Set(['hidden']) })).master).toBe(0)
  })
})

describe('musicStatus', () => {
  it('reads a blocked start as off, so the toggle offers to start it', () => {
    expect(musicStatus(state(), true)).toBe('on')
    expect(musicStatus(state({ blocked: true }), true)).toBe('off')
    expect(musicStatus(state({ enabled: false }), true)).toBe('off')
  })

  it('stays on while merely suppressed — the visitor did not turn it off', () => {
    expect(musicStatus(state({ suppressed: new Set(['blog']) }), true)).toBe('on')
  })

  it('is unavailable without Web Audio', () => {
    expect(musicStatus(state(), false)).toBe('unavailable')
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
