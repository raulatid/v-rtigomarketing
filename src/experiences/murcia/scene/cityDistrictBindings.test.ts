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

/** Characters GLTFLoader strips from node names (blender-export-contract §2). */
const RESERVED = /[[\].:/]/

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

  it('gives every service in the content exactly one building', () => {
    // The failure this exists for: a service added in Sanity with no row here
    // would otherwise simply never appear in the city, with nothing to say so.
    for (const binding of cityDistrictBindings) {
      const content = findDistrictContent(DISTRICT_CONTENT, binding.contentId)
      if (!content) continue
      for (const service of content.services) {
        const rows = binding.buildings.filter((b) => b.serviceId === service.id)
        expect(rows.length, `service "${service.id}" has ${rows.length} building(s)`).toBe(1)
      }
    }
  })

  it('points every building at a service that exists', () => {
    for (const binding of cityDistrictBindings) {
      const content = findDistrictContent(DISTRICT_CONTENT, binding.contentId)
      if (!content) continue
      const known = new Set(content.services.map((s) => s.id))
      for (const building of binding.buildings) {
        expect(known.has(building.serviceId), `"${building.serviceId}" is not a service`).toBe(true)
      }
    }
  })

  it('names each node once, non-empty, and free of characters the loader strips', () => {
    for (const binding of cityDistrictBindings) {
      // Buildings and connections share one namespace: they are objects in the
      // same export, so a name colliding across the two kinds would be just as
      // wrong as one colliding within them.
      const names = binding.buildings.flatMap((b) => [b.nodeName, b.connectionNodeName])
      expect(new Set(names).size).toBe(names.length)
      for (const name of names) {
        expect(name.trim().length, `empty node name`).toBeGreaterThan(0)
        expect(RESERVED.test(name), `"${name}" contains a reserved character`).toBe(false)
      }
    }
  })

  it('gives every service a distinct accent inside the 24-bit range', () => {
    // The accent identifies a service in the world — the ring and its
    // connection both take it on selection — so two services sharing one would
    // make them indistinguishable exactly when one is chosen. Out-of-range
    // values do not throw: THREE.Color.setHex masks them, so a typo'd literal
    // would silently render as some other colour.
    for (const binding of cityDistrictBindings) {
      const accents = binding.buildings.map((b) => b.accent)
      expect(new Set(accents).size, 'two services share an accent').toBe(accents.length)
      for (const accent of accents) {
        expect(Number.isInteger(accent)).toBe(true)
        expect(accent).toBeGreaterThanOrEqual(0)
        expect(accent).toBeLessThanOrEqual(0xffffff)
      }
    }
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
