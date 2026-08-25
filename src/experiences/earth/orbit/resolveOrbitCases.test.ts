import { describe, it, expect } from 'vitest'
import { resolveOrbitCases, OrbitAssignmentError } from './resolveOrbitCases'
import { orbitAssignments } from './orbitAssignments'
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

const study = (id: string): CaseStudy => ({
  id,
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
  // someone adds a case study, renames one, or edits the table, this fails here
  // rather than on the globe.
  it('resolves against the real presets and the real content', () => {
    expect(() => resolveOrbitCases(ORBIT_PRESETS, orbitAssignments, CASE_STUDIES)).not.toThrow()
  })

  it('fills every preset the design ships', () => {
    const resolved = resolveOrbitCases(ORBIT_PRESETS, orbitAssignments, CASE_STUDIES)
    expect(resolved).toHaveLength(ORBIT_PRESETS.length)
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
