import { describe, expect, it } from 'vitest'
import { parseProtoSkyParams, protoSkyFaceUrls, protoSkyImageUrl } from './protoSky'

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
    expect(p.image).toBeNull()
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
      debug: 0,
      // Named no image, so the panorama path is untouched.
      image: null,
    })
  })

  it('reads the diagnostic overlay, and only for a named variant', () => {
    // It draws the CUBE's own structure, so it means nothing over the shipped
    // panorama — and a stray ?skyDebug in a shared URL must not be able to
    // paint the sky people actually see.
    expect(parseProtoSkyParams('?sky=c6&skyDebug=faces').debug).toBe(1)
    expect(parseProtoSkyParams('?sky=c6&skyDebug=mesh').debug).toBe(2)
    expect(parseProtoSkyParams('?sky=c6').debug).toBe(0)
    expect(parseProtoSkyParams('?skyDebug=faces').debug).toBe(0)
    // Unknown mode is off, not an error: this is capture scaffolding and a
    // typo should cost a re-run, not a blank screen with nothing to explain it.
    expect(parseProtoSkyParams('?sky=c6&skyDebug=edges').debug).toBe(0)
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

  // ── ?skyImage=, the candidate-audition override ──
  //
  // Separate from the cubemap entirely: it swaps the PANORAMA path's texture,
  // which is the arm with no `?sky=` variant. Its whole purpose is that a
  // candidate sky can be judged in the running scene at the scene's own
  // exposure, which is the step the 2026-08 screening round skipped.

  it('reads a scratch image with no variant named', () => {
    const p = parseProtoSkyParams('?skyImage=sky-test-001.png')
    expect(p.variant).toBeNull()
    expect(p.image).toBe('sky-test-001.png')
  })

  it('accepts every extension the texture loader can decode', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'avif']) {
      expect(parseProtoSkyParams(`?skyImage=sky-test-a.${ext}`).image).toBe(`sky-test-a.${ext}`)
    }
  })

  it('requires the sky-test- prefix, so a scratch file cannot be committed by accident', () => {
    // The prefix is what `.gitignore` matches. Without it the override would
    // happily load a real deliverable, and a 20 MB candidate PNG dropped into
    // public/textures/ would be staged by the next `git add`.
    expect(parseProtoSkyParams('?skyImage=sky-panorama.avif').image).toBeNull()
    expect(parseProtoSkyParams('?skyImage=anything.png').image).toBeNull()
  })

  it('refuses to build a path out of a traversal attempt', () => {
    // The pattern contains no slash, so this cannot escape public/textures/
    // anyway. Asserted because a URL parameter that becomes a fetch path should
    // never be the loose kind, dev-only or not.
    expect(parseProtoSkyParams('?skyImage=../../etc/passwd').image).toBeNull()
    expect(parseProtoSkyParams('?skyImage=sky-test-../x.png').image).toBeNull()
    expect(parseProtoSkyParams('?skyImage=sky-test-a.png/../../x').image).toBeNull()
  })

  it('rejects a name with no extension, rather than fetching a directory', () => {
    expect(parseProtoSkyParams('?skyImage=sky-test-001').image).toBeNull()
    // A literal dot, not "any character" — the escape in the pattern is real.
    expect(parseProtoSkyParams('?skyImage=sky-test-001xpng').image).toBeNull()
  })

  it('treats an empty value as absent', () => {
    expect(parseProtoSkyParams('?skyImage=').image).toBeNull()
  })

  it('puts a scratch image beside the files it is auditioning to replace', () => {
    expect(protoSkyImageUrl('sky-test-001.png')).toBe('/textures/sky-test-001.png')
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
