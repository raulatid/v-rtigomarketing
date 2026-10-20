import { describe, expect, it } from 'vitest'
import { chooseLightmapResolution } from './lightmapManifest'

describe('the resolution a device gets', () => {
  const desktop = { narrow: false, coarse: false, touchCapable: false, lowMemory: false }

  it('is the small atlas on a phone-width or touch-first viewport, the full one elsewhere', () => {
    expect(chooseLightmapResolution(desktop)).toBe(2048)
    expect(chooseLightmapResolution({ ...desktop, narrow: true })).toBe(1024)
    expect(chooseLightmapResolution({ ...desktop, coarse: true })).toBe(1024)
  })

  it('is the small atlas on a touch screen behind a fine pointer, like an iPad with a trackpad', () => {
    expect(chooseLightmapResolution({ ...desktop, touchCapable: true })).toBe(1024)
  })

  it('is the small atlas on a device reporting 4 GB of memory or less', () => {
    expect(chooseLightmapResolution({ ...desktop, lowMemory: true })).toBe(1024)
  })
})
