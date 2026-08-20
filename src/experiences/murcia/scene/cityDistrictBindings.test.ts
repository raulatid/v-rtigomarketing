import { describe, it, expect } from 'vitest'
import { cityDistrictBindings } from './cityDistrictBindings'
import { DISTRICT_CONTENT } from '../../../content/generated/districts'
import { findDistrictContent } from '../../../content/lookup'

// Scene-composition invariants. Split out of the district content test: a
// binding names Blender nodes and camera framing, copy names none of those, and
// they change for unrelated reasons.
//
// The referential check below is the one that spans both. It stays on this side
// because the binding is what makes the claim — content does not know it is
// being pointed at.

describe('city district bindings', () => {
  it('resolves every id it declares against the shipped content', () => {
    // A typo on either side leaves the district inert with no error: the
    // building is still there, it simply never opens.
    for (const binding of cityDistrictBindings) {
      expect(
        findDistrictContent(DISTRICT_CONTENT, binding.contentId),
        `binding ${binding.contentId} resolves to no content`,
      ).not.toBeNull()
    }
  })

  it('binds each content id at most once', () => {
    const ids = cityDistrictBindings.map((binding) => binding.contentId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the spatial fallback off, since it is a development crutch', () => {
    // `allowSpatialFallback` is a field on the binding rather than a read of
    // import.meta.env, because checks/ bundles this module for Node. Shipping it
    // enabled would resolve districts by world rectangle — which drifts the
    // moment the model is re-exported, silently.
    for (const binding of cityDistrictBindings) {
      expect(binding.allowSpatialFallback).toBe(false)
    }
  })

  it('gives every binding at least one way to resolve', () => {
    for (const binding of cityDistrictBindings) {
      const resolvable =
        binding.tag.trim().length > 0 ||
        binding.nodeNames.length > 0 ||
        binding.allowSpatialFallback
      expect(resolvable, `${binding.contentId} can never resolve`).toBe(true)
    }
  })

  it('keeps each fallback rect non-degenerate and the right way round', () => {
    for (const binding of cityDistrictBindings) {
      const rect = binding.fallbackRect
      if (!rect) continue
      expect(rect.maxX).toBeGreaterThan(rect.minX)
      expect(rect.maxZ).toBeGreaterThan(rect.minZ)
    }
  })
})
