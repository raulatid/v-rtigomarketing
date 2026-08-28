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

  it.each([
    '/\evil.example/x.glb',
    '/%5Cevil.example/x.glb',
    '//evil.example/x.glb',
    'https://evil.example/x.glb',
    '/models/../assets/x.glb',
    '/textures/x.glb',
  ])('ignores %s', (model) => {
    expect(override(model)).toBeNull()
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
