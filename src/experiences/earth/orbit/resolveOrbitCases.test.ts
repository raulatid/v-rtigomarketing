import { describe, it, expect } from 'vitest'
import { resolveOrbitCases, OrbitAssignmentError } from './resolveOrbitCases'
import {
  HIGHLIGHTED_ORBIT_ID,
  ORBIT_FILL_ORDER,
  invitedCaseIdFor,
  orbitAssignmentsFor,
} from './orbitAssignments'
import { ORBIT_PRESETS } from './orbitConfig'
import { CASE_STUDIES } from '../../../content/generated/caseStudies'
import type { CaseStudy } from '../../../content/types'
import type { OrbitPreset } from './orbitConfig'

const preset = (id: string): OrbitPreset => ({
  id,
  radius: 1.5,
  inclination: 0,
  rotationY: 0,
  speed: 0.03,
  phase: 0,
})

const study = (id: string, highlighted = false): CaseStudy => ({
  id,
  highlighted,
  label: id.toUpperCase(),
  name: id,
  isotype: null,
  logo: null,
  brandColor: '#ffffff',
  sector: 'sector',
  location: 'location',
  year: '2025',
  summary: 'summary',
  details: [],
  metrics: [
    { label: 'a', value: '1' },
    { label: 'b', value: '2' },
  ],
  chart: { type: 'line', title: 'chart', values: [1, 2] },
})

const PRESETS = [preset('orbit-01'), preset('orbit-02'), preset('orbit-03')]
const CASES = [study('a'), study('b'), study('c')]

describe('the shipped assignment table', () => {
  // The whole point of resolving by id is that this cannot drift silently. If
  // the content or the derivation changes, this fails here rather than on the
  // globe.
  const orbitAssignments = orbitAssignmentsFor(CASE_STUDIES)

  it('resolves against the real presets and the real content', () => {
    expect(() => resolveOrbitCases(ORBIT_PRESETS, orbitAssignments, CASE_STUDIES)).not.toThrow()
  })

  it('fills one preset per published case, up to the presets the design ships', () => {
    const resolved = resolveOrbitCases(ORBIT_PRESETS, orbitAssignments, CASE_STUDIES)
    expect(resolved).toHaveLength(Math.min(ORBIT_PRESETS.length, CASE_STUDIES.length))
  })

  it('invites a case that is actually on an orbit, and it rides the highlighted orbit', () => {
    // Dropping the invited case would leave the overview with no example and
    // nothing to say so; moving it off orbit-02 would put the tutorial's target
    // off screen in portrait (satelliteVisibility.test.ts).
    const resolved = resolveOrbitCases(ORBIT_PRESETS, orbitAssignments, CASE_STUDIES)
    const invited = invitedCaseIdFor(CASE_STUDIES)
    const ride = resolved.find((r) => r.satellite.id === invited)
    expect(ride?.preset.id).toBe(HIGHLIGHTED_ORBIT_ID)
  })
})

describe('orbitAssignmentsFor', () => {
  const cases = [study('a'), study('b', true), study('c'), study('d')]

  it('puts the highlighted case on the highlighted orbit', () => {
    expect(orbitAssignmentsFor(cases)[0]).toEqual({ orbitId: HIGHLIGHTED_ORBIT_ID, caseId: 'b' })
    expect(invitedCaseIdFor(cases)).toBe('b')
  })

  it('fills the other orbits with the other cases, in collection order', () => {
    expect(orbitAssignmentsFor(cases).slice(1)).toEqual([
      { orbitId: ORBIT_FILL_ORDER[0], caseId: 'a' },
      { orbitId: ORBIT_FILL_ORDER[1], caseId: 'c' },
      { orbitId: ORBIT_FILL_ORDER[2], caseId: 'd' },
    ])
  })

  it('never names an orbit twice, so the fill order cannot include the highlighted orbit', () => {
    expect(ORBIT_FILL_ORDER).not.toContain(HIGHLIGHTED_ORBIT_ID)
    expect(new Set(ORBIT_FILL_ORDER).size).toBe(ORBIT_FILL_ORDER.length)
  })

  it('leaves cases past the last preset without an orbit rather than inventing one', () => {
    const many = [study('h', true), ...'abcdefg'.split('').map((id) => study(id))]
    const table = orbitAssignmentsFor(many)
    expect(table).toHaveLength(1 + ORBIT_FILL_ORDER.length)
    expect(table.map((a) => a.caseId)).not.toContain('g')
  })

  it('throws when no case is highlighted', () => {
    expect(() => orbitAssignmentsFor([study('a'), study('b')])).toThrow(OrbitAssignmentError)
  })

  it('throws when two cases are highlighted, naming both', () => {
    expect(() => orbitAssignmentsFor([study('a', true), study('b', true)])).toThrow(/a, b/)
  })
})

describe('resolveOrbitCases', () => {
  it('pairs each preset with the case assigned to it', () => {
    const resolved = resolveOrbitCases(PRESETS, [
      { orbitId: 'orbit-01', caseId: 'a' },
      { orbitId: 'orbit-02', caseId: 'b' },
    ], CASES)
    expect(resolved.map((r) => [r.preset.id, r.satellite.id])).toEqual([
      ['orbit-01', 'a'],
      ['orbit-02', 'b'],
    ])
  })

  it('follows preset order, not the order of the assignment table', () => {
    // The reveal staggers along this order, so it must be the scene's. A CMS
    // reordering its response, or someone rearranging the table, must not change
    // which orbit draws first.
    const resolved = resolveOrbitCases(PRESETS, [
      { orbitId: 'orbit-03', caseId: 'c' },
      { orbitId: 'orbit-01', caseId: 'a' },
    ], CASES)
    expect(resolved.map((r) => r.preset.id)).toEqual(['orbit-01', 'orbit-03'])
  })

  it('allows a preset to go unassigned', () => {
    // Shipping fewer orbits than presets is a composition decision, not an error.
    const resolved = resolveOrbitCases(PRESETS, [{ orbitId: 'orbit-02', caseId: 'b' }], CASES)
    expect(resolved).toHaveLength(1)
    expect(resolved[0].preset.id).toBe('orbit-02')
  })

  it('allows a case study that no orbit features', () => {
    // The CMS may hold any number of cases; the globe shows the featured ones.
    const resolved = resolveOrbitCases(PRESETS, [{ orbitId: 'orbit-01', caseId: 'a' }], CASES)
    expect(resolved).toHaveLength(1)
  })

  it('resolves an empty table to no orbits rather than throwing', () => {
    expect(resolveOrbitCases(PRESETS, [], CASES)).toEqual([])
  })

  it('throws when two assignments claim the same orbit', () => {
    expect(() =>
      resolveOrbitCases(PRESETS, [
        { orbitId: 'orbit-01', caseId: 'a' },
        { orbitId: 'orbit-01', caseId: 'b' },
      ], CASES),
    ).toThrow(OrbitAssignmentError)
  })

  it('throws when one case is assigned to two orbits', () => {
    // Otherwise the same company appears twice on the globe, which reads as a
    // rendering bug rather than as a content mistake.
    expect(() =>
      resolveOrbitCases(PRESETS, [
        { orbitId: 'orbit-01', caseId: 'a' },
        { orbitId: 'orbit-02', caseId: 'a' },
      ], CASES),
    ).toThrow(OrbitAssignmentError)
  })

  it('throws when an assignment names an orbit that does not exist', () => {
    expect(() =>
      resolveOrbitCases(PRESETS, [{ orbitId: 'orbit-99', caseId: 'a' }], CASES),
    ).toThrow(OrbitAssignmentError)
  })

  it('throws when an assignment names a case that is not in the content', () => {
    // The one a CMS causes: unpublishing a featured case study must fail loudly
    // at build time, not leave a satellite with no data on a live site.
    expect(() =>
      resolveOrbitCases(PRESETS, [{ orbitId: 'orbit-01', caseId: 'deleted' }], CASES),
    ).toThrow(OrbitAssignmentError)
  })

  it('names the offending id in the message', () => {
    expect(() =>
      resolveOrbitCases(PRESETS, [{ orbitId: 'orbit-01', caseId: 'deleted' }], CASES),
    ).toThrow(/deleted/)
  })
})
