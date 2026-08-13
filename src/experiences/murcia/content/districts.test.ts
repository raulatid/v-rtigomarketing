import { describe, it, expect } from 'vitest'
import { districtContent, findDistrictContent } from './districts'
import { cityDistrictBindings } from '../scene/cityDistrictBindings'

describe('district content', () => {
  it('gives every district a distinct id', () => {
    const ids = districtContent.map((district) => district.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every service inside a district a distinct id', () => {
    // The id wires `aria-controls` to the accordion region, so a duplicate
    // points two headers at one panel. Invisible unless you use a screen
    // reader, which is exactly why it is asserted rather than reviewed.
    for (const district of districtContent) {
      const ids = district.services.map((service) => service.id)
      expect(new Set(ids).size, `duplicate service id in ${district.id}`).toBe(ids.length)
    }
  })

  it('never ships an empty string where the panel expects text', () => {
    for (const district of districtContent) {
      expect(district.label.trim().length).toBeGreaterThan(0)
      expect(district.summary.trim().length).toBeGreaterThan(0)
      expect(district.intro.trim().length).toBeGreaterThan(0)
      for (const service of district.services) {
        expect(service.title.trim().length).toBeGreaterThan(0)
        expect(service.body.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('keeps the summary short enough to survive the mobile peek stop', () => {
    // It has to read at the 40% sheet height, which is the whole reason summary
    // and intro are separate fields. A bound, not a judgement about the prose.
    for (const district of districtContent) {
      expect(district.summary.length, `${district.id} summary is too long to peek`).toBeLessThanOrEqual(140)
    }
  })

  it('opens with a section, since the first one is open on arrival', () => {
    // All-collapsed reads as a menu rather than as content; buildSections()
    // opens section 0, and a district with no services would open nothing.
    for (const district of districtContent) {
      expect(district.services.length).toBeGreaterThan(0)
    }
  })
})

describe('findDistrictContent', () => {
  it('resolves every id declared by a scene binding', () => {
    // The binding names content by id, and a typo on either side leaves the
    // district inert with no error — the panel simply never opens.
    for (const binding of cityDistrictBindings) {
      expect(findDistrictContent(binding.contentId), `binding ${binding.contentId}`).not.toBeNull()
    }
  })

  it('returns null for an unknown id rather than throwing', () => {
    expect(findDistrictContent('no-such-district')).toBeNull()
  })
})

describe('city district bindings', () => {
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
