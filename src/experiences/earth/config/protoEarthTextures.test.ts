import { describe, expect, it } from 'vitest'
import { parseProtoEarthTextureParams, protoEarthTextureUrls } from './protoEarthTextures'

// With no `?earthTex=` nothing this module reports can change what the scene
// loads. That is the property that matters; the rest is path hygiene.

describe('the AVIF surface-map prototype gate', () => {
  it('is inert with no query', () => {
    expect(parseProtoEarthTextureParams('').variant).toBeNull()
    expect(parseProtoEarthTextureParams('?sky=c&freezeEarth=1').variant).toBeNull()
  })

  it('reads a variant name', () => {
    expect(parseProtoEarthTextureParams('?earthTex=r1').variant).toBe('r1')
  })

  it('rejects anything that is not a directory name', () => {
    for (const raw of ['../etc', 'a/b', '', '-x', 'x'.repeat(33), '%2e%2e']) {
      expect(parseProtoEarthTextureParams(`?earthTex=${raw}`).variant).toBeNull()
    }
  })

  it('builds the tier-specific paths', () => {
    expect(protoEarthTextureUrls('r1', false)).toEqual({
      day: '/proto-earth/r1/day.avif',
      night: '/proto-earth/r1/night.avif',
    })
    expect(protoEarthTextureUrls('r1', true)).toEqual({
      day: '/proto-earth/r1/day-narrow.avif',
      night: '/proto-earth/r1/night-narrow.avif',
    })
  })
})
