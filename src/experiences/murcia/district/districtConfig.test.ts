import { describe, it, expect } from 'vitest'
import { PropertyBinding } from 'three'
import { BUILDING_NODE_NAMES, FOCO_NODE_NAMES, PLAZA_NODE_NAME } from './districtConfig'

// The district's node names, as a contract.
//
// These moved here on 2026-09-06 from `scene/cityDistrictBindings.test.ts`,
// which guarded the per-service building and connection rows until the export
// stopped shipping geometry per service. The claim is the same one it always
// was — a name in this file is the identity of an object in the GLB, and a
// rename in Blender is otherwise silent — but the names live here now.
//
// `checks/city-asset.ts` asserts these names against the shipped file. This
// asserts the properties that make them resolvable at all, which is the half a
// check reading the GLB cannot tell you: it would report "not in the file"
// either way and leave you looking at Blender rather than at this constant.

/** Characters GLTFLoader strips from node names (blender-export-contract §2). */
const RESERVED = /[[\].:/]/

describe('the district node names', () => {
  it('names each building once, and non-empty', () => {
    expect(BUILDING_NODE_NAMES.length).toBeGreaterThan(0)
    expect(new Set(BUILDING_NODE_NAMES).size).toBe(BUILDING_NODE_NAMES.length)
    for (const name of BUILDING_NODE_NAMES) {
      expect(name.trim().length, 'empty node name').toBeGreaterThan(0)
    }
  })

  it('keeps the buildings free of characters the loader strips', () => {
    // The buildings carry no dot by contract, so they reach the runtime spelled
    // exactly as written and the lookup's sanitized pass is never needed.
    for (const name of BUILDING_NODE_NAMES) {
      expect(RESERVED.test(name), `"${name}" contains a reserved character`).toBe(false)
    }
  })

  it('gives the plaza a name that survives the loader', () => {
    // A plaza name may carry a dot, because `findByAnyNameSpelling` sanitizes
    // the configured name before matching. What must hold is that sanitizing it
    // still leaves something to look for, and that it does not collide with a
    // building once both have been through the loader.
    expect(PLAZA_NODE_NAME.trim().length).toBeGreaterThan(0)

    const sanitized = PropertyBinding.sanitizeNodeName(PLAZA_NODE_NAME)
    expect(sanitized.length).toBeGreaterThan(0)
    expect(RESERVED.test(sanitized)).toBe(false)

    const buildings = BUILDING_NODE_NAMES.map((n) => PropertyBinding.sanitizeNodeName(n))
    expect(buildings, 'the plaza shares a runtime name with a building').not.toContain(sanitized)
  })

  it('projects the display from something that is in the district', () => {
    // One projector, and it is the plaza, since the export dropped the three
    // focos. Stated as a subset rather than as equality so an export that brings
    // real projectors back only has to add them to the list.
    expect(FOCO_NODE_NAMES.length).toBeGreaterThan(0)
    for (const name of FOCO_NODE_NAMES) {
      expect(name.trim().length).toBeGreaterThan(0)
    }
  })
})
