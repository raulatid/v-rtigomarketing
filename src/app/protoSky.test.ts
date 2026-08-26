import { describe, expect, it } from 'vitest'
import { parseProtoSkyParams, protoSkyFaceUrls } from './protoSky'

// These tests are about ONE property above all others: with no `?sky=` in the
// URL, nothing this module reports can change what the app renders. The e2e
// baselines prove that at the pixel level; this proves it at the parser, where
// a regression is cheap to find.

describe('the prototype sky gate', () => {
  it('is inert with no query at all', () => {
    const p = parseProtoSkyParams('')
    expect(p.variant).toBeNull()
    expect(p.stars).toBeNull()
    expect(p.freezeEarth).toBe(false)
    expect(p.brightness).toBe(1)
    expect(p.contrast).toBe(1)
  })

  it('ignores the cubemap knobs when no variant was named', () => {
    // Otherwise a stray `?skyBrightness=4` in a shared URL would change the
    // shipped sky, which is exactly the class of accident the gate prevents.
    const p = parseProtoSkyParams('?skyBrightness=4&skyYaw=90&skyRes=512')
    expect(p.variant).toBeNull()
    expect(p.brightness).toBe(1)
    expect(p.yawDegrees).toBe(0)
    expect(p.resolution).toBe(4096)
  })

  it('still reads the capture knobs without a variant, because the baseline arm needs them', () => {
    // `baseline` is captured through the SHIPPED shell, and it has to be shot
    // under the same stopped spin and the same particle count as the variants
    // or it is not a comparison.
    const p = parseProtoSkyParams('?freezeEarth=1&stars=0')
    expect(p.variant).toBeNull()
    expect(p.freezeEarth).toBe(true)
    expect(p.stars).toBe(0)
  })

  it('reads a full variant request', () => {
    const p = parseProtoSkyParams(
      '?sky=c&skyRes=2048&skyBrightness=0.8&skyContrast=1.2&skyYaw=150&skyTilt=-20&stars=900&freezeEarth=1',
    )
    expect(p).toEqual({
      variant: 'c',
      resolution: 2048,
      brightness: 0.8,
      contrast: 1.2,
      yawDegrees: 150,
      tiltDegrees: -20,
      stars: 900,
      freezeEarth: true,
    })
  })

  it('distinguishes stars=0 from no stars parameter', () => {
    // 0 is the whole first capture pass, so collapsing it to "unset" would
    // silently run every shot with 3500 particles over the baked field.
    expect(parseProtoSkyParams('?sky=a&stars=0').stars).toBe(0)
    expect(parseProtoSkyParams('?sky=a').stars).toBeNull()
  })

  it('refuses a variant that is not a plain directory name', () => {
    // The name is concatenated into a fetch path. Dev-only or not, a path built
    // from a query parameter should never be the loose kind.
    for (const bad of ['../etc', 'a/b', '-lead', '', 'x'.repeat(33)]) {
      expect(parseProtoSkyParams(`?sky=${bad}`).variant).toBeNull()
    }
  })

  it('falls back rather than producing NaN from junk', () => {
    const p = parseProtoSkyParams('?sky=a&skyBrightness=abc&skyRes=')
    expect(p.brightness).toBe(1)
    expect(p.resolution).toBe(4096)
  })

  it('names the six faces in CubeTextureLoader order', () => {
    // px, nx, py, ny, pz, nz. This is also the editor's own export naming, in
    // the same order, which is why the export step renames nothing.
    expect(protoSkyFaceUrls('b', 4096)).toEqual([
      '/proto-sky/b/4096/posx.png',
      '/proto-sky/b/4096/negx.png',
      '/proto-sky/b/4096/posy.png',
      '/proto-sky/b/4096/negy.png',
      '/proto-sky/b/4096/posz.png',
      '/proto-sky/b/4096/negz.png',
    ])
  })
})
