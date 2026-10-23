import { describe, expect, it } from 'vitest'
import { musicTargets } from './backgroundMusic'

describe('musicTargets', () => {
  it('plays the active world alone', () => {
    expect(musicTargets('earth')).toEqual({ earth: 1, murcia: 0 })
    expect(musicTargets('murcia')).toEqual({ earth: 0, murcia: 1 })
  })
})
