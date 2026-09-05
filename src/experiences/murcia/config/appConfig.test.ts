import { describe, expect, it } from 'vitest'
import { applyQueryOverrides, createAppConfig } from './appConfig'

/**
 * `?model=` hands a string straight to GLTFLoader, so the guard on it is the
 * one query parameter that is a security boundary rather than a convenience.
 * SEC-1 (docs/audits/reports/cybersecurity-project-security-2026-08-20.md): the
 * previous pattern check accepted a backslash in the second position, which the
 * WHATWG parser treats as a slash — `/\evil.example/x.glb` resolved off-origin.
 */
describe('?model= override', () => {
  const base = createAppConfig()
  const override = (model: string) =>
    applyQueryOverrides(base, '?model=' + encodeURIComponent(model), true).modelPathOverride

  it('accepts a root-relative path under /models/', () => {
    expect(override('/models/x.glb')).toBe('/models/x.glb')
  })

  // THE BACKSLASH HAS TO BE A REAL ONE, and for a while it was not. Two of
  // these cases were written as '/\evil.example/x.glb' and
  // '/%5Cevil.example/x.glb'. Neither carried a backslash: in a single-quoted
  // string `\e` is simply `e`, and a literal `%5C` is percent-encoded a second
  // time by the helper above before anything parses it. The regression test for
  // SEC-1 could not fail for the reason it was written. Spelled `\\` now, with
  // the two cases below asserting that it is what it claims to be.
  it.each([
    '/\\evil.example/x.glb',
    '\\\\evil.example/x.glb',
    '/\\/evil.example/x.glb',
    '//evil.example/x.glb',
    'https://evil.example/x.glb',
    'HTTPS://evil.example/x.glb',
    'https:/\\evil.example/x.glb',
    '/models/../assets/x.glb',
    '/models/..%2fassets/x.glb',
    '/models/..%5Cassets/x.glb',
    '/textures/x.glb',
    'javascript:alert(1)',
    'data:model/gltf+json,{}',
    '/Models/x.glb',
  ])('ignores %s', (model) => {
    expect(override(model)).toBeNull()
  })

  it('is testing a backslash and not the letter after it', () => {
    expect('/\\evil.example/x.glb'.charCodeAt(1)).toBe(0x5c)
  })

  it('resolves a backslash authority off-origin, which is what makes it dangerous', () => {
    // The property the guard rests on, stated rather than assumed: the WHATWG
    // parser reads a backslash as a slash, so a check on the leading character
    // sees a root-relative path where the loader would see another host.
    expect(new URL('/\\evil.example/x.glb', 'https://model.invalid').origin).toBe(
      'https://evil.example',
    )
  })

  it('normalises a relative path that stays under /models/', () => {
    // Resolved against the origin, so what GLTFLoader receives is always the
    // absolute path — never something the page URL could re-resolve.
    expect(override('models/x.glb')).toBe('/models/x.glb')
  })

  it('ignores everything when the tools are disabled', () => {
    expect(applyQueryOverrides(base, '?model=/models/x.glb', false).modelPathOverride).toBeNull()
  })
})
