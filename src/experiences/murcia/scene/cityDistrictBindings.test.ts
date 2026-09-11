import { describe, it, expect } from 'vitest'
import { cityDistrictBindings } from './cityDistrictBindings'
import { DISTRICT_CONTENT } from '../../../content/generated/districts'
import { findDistrictContent } from '../../../content/lookup'
import { CAMPUS_ICONS } from '../campus/content/campusIcons'
import { FIGURE_KINDS } from '../campus/content/servicesContent'

// Scene-composition invariants. Split out of the district content test: a
// binding names shapes in the scene, copy names none of those, and they change
// for unrelated reasons.
//
// The referential checks below are the ones that span both. They stay on this
// side because the binding is what makes the claim — content does not know it
// is being pointed at.
//
// The per-service building, connection and accent assertions were deleted on
// 2026-09-06 with the rows they guarded: the export stopped shipping geometry
// per service, so there is no longer a table that can disagree with the content.
// The node names the services campus reads are asserted against the shipped
// GLB by `checks/city-asset.ts` §5, beside `campus/campusConfig.ts`.

describe('city district bindings', () => {
  it('resolves every id it declares against the shipped content', () => {
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
})

// The campus forms every service out of particles, and which shapes it takes
// is this table's claim. A service the CMS publishes with no row here would
// reject the whole campus document (`campusContent.ts`), so a new service in
// Sanity fails this test before it fails the section.
describe('service symbols', () => {
  for (const binding of cityDistrictBindings) {
    const content = findDistrictContent(DISTRICT_CONTENT, binding.contentId)

    it(`gives every published "${binding.contentId}" service exactly one row, and no row to a stranger`, () => {
      const published = (content?.services ?? []).map((service) => service.id).sort()
      const rows = binding.services.map((row) => row.serviceId)
      expect(new Set(rows).size, 'a service has two rows').toBe(rows.length)
      expect([...rows].sort()).toEqual(published)
    })

    it(`names only symbols the library has and figures the particles can draw`, () => {
      for (const row of binding.services) {
        expect(Object.keys(CAMPUS_ICONS), `${row.serviceId}: no icon "${row.icon}"`).toContain(row.icon)
        expect(FIGURE_KINDS, `${row.serviceId}: no figure "${row.figure}"`).toContain(row.figure)
      }
    })
  }
})
