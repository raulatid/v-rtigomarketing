import { describe, it, expect } from 'vitest'
import { cityDistrictBindings } from './cityDistrictBindings'
import { DISTRICT_CONTENT } from '../../../content/generated/districts'
import { findDistrictContent } from '../../../content/lookup'
import { murciaConfig } from '../config/murciaConfig'

// Scene-composition invariants. Split out of the district content test: a
// binding names Blender nodes and camera framing, copy names none of those, and
// they change for unrelated reasons.
//
// The referential checks below are the ones that span both. They stay on this
// side because the binding is what makes the claim — content does not know it
// is being pointed at.
//
// The per-service building, connection and accent assertions were deleted on
// 2026-09-06 with the rows they guarded: the export stopped shipping geometry
// per service, so there is no longer a table that can disagree with the content.
// What survived of them — node names must be unique, non-empty and resolvable —
// moved to `district/districtConfig.test.ts`, beside the names it now guards.

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

  it('keeps every focus distance inside the proven range', () => {
    // Below the floor the ground footprint outgrows the terrain skirt; above 1
    // was never checked (checks/footprint.ts). Null means "keep the default".
    const floor = murciaConfig.focusFlight.minDistanceScale
    // One scale per district, not per building: the camera settles on the plaza
    // once and the display does the rest (plan 003 §5).
    const scales = cityDistrictBindings.map((binding) => binding.focusDistanceScale)
    for (const scale of scales) {
      if (scale == null) continue
      expect(scale).toBeGreaterThanOrEqual(floor)
      expect(scale).toBeLessThanOrEqual(1)
    }
  })
})
