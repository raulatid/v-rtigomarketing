import { describe, it, expect } from 'vitest'
import { DISTRICT_CONTENT } from './generated/districts'
import { findDistrictContent } from './lookup'

// These are content invariants, not scene invariants: they hold for whatever
// collection is in this module, whether hand-written or emitted by the content
// build. The generator's validator asserts the same bounds before it writes, so
// a failure here means either a bad hand edit or a validator that let something
// through — and both are worth failing `npm run check` over.
//
// The assertions that involve `cityDistrictBindings` moved out to
// `experiences/murcia/scene/cityDistrictBindings.test.ts`. A binding is scene
// composition, not copy, and the two change for unrelated reasons.

describe('district content', () => {
  it('gives every district a distinct id', () => {
    const ids = DISTRICT_CONTENT.map((district) => district.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every service inside a district a distinct id', () => {
    // The id wires `aria-controls` to the accordion region, so a duplicate
    // points two headers at one panel. Invisible unless you use a screen
    // reader, which is exactly why it is asserted rather than reviewed.
    for (const district of DISTRICT_CONTENT) {
      const ids = district.services.map((service) => service.id)
      expect(new Set(ids).size, `duplicate service id in ${district.id}`).toBe(ids.length)
    }
  })

  it('never ships an empty string where the panel expects text', () => {
    for (const district of DISTRICT_CONTENT) {
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
    for (const district of DISTRICT_CONTENT) {
      expect(district.summary.length, `${district.id} summary is too long to peek`).toBeLessThanOrEqual(140)
    }
  })

  it('opens with a section, since the first one is open on arrival', () => {
    // All-collapsed reads as a menu rather than as content; buildSections()
    // opens section 0, and a district with no services would open nothing.
    for (const district of DISTRICT_CONTENT) {
      expect(district.services.length).toBeGreaterThan(0)
    }
  })
})

describe('findDistrictContent', () => {
  it('resolves an id present in the list it was given', () => {
    const first = DISTRICT_CONTENT[0]
    expect(findDistrictContent(DISTRICT_CONTENT, first.id)).toBe(first)
  })

  it('returns null for an unknown id rather than throwing', () => {
    expect(findDistrictContent(DISTRICT_CONTENT, 'no-such-district')).toBeNull()
  })

  it('resolves against the list it is handed, not a module-scope one', () => {
    // The signature takes the collection because the content is generated and a
    // caller may hold a specific one. Searching a different list must not find
    // an entry that only exists in the module's own export.
    expect(findDistrictContent([], 'servicios')).toBeNull()
  })
})
