import { describe, it, expect } from 'vitest'
import { cityDistrictBindings } from './cityDistrictBindings'
import { DISTRICT_CONTENT } from '../../../content/generated/districts'
import { findDistrictContent } from '../../../content/lookup'

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
//
// The per-service SYMBOL assertions went the same way on 2026-09-21, and it is
// worth saying why, because they looked like they were doing more than they
// were. They demanded one row per published service and compared the two as
// SETS OF IDENTIFIERS — so they failed the build the day an editor published a
// service the table did not list, and passed happily while four other services
// had their copy rewritten under their existing identifiers and went on drawing
// figures chosen for copy that no longer existed. Loud about the harmless case,
// silent about the harmful one.
//
// The shapes are Studio fields now. What replaced these assertions:
//   - `content/collections/collections.test.ts` — a published value the campus
//     cannot draw fails the content build, naming the service;
//   - `campus/content/campusIcons.test.ts` — the artwork implements every
//     symbol name the editor is offered.

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
