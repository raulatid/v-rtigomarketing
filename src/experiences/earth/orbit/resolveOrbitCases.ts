import type { CaseStudy } from '../../../content/types'
import { OrbitAssignmentError, type OrbitAssignment } from './orbitAssignments'
import type { OrbitPreset } from './orbitConfig'

/**
 * One orbit, with the preset that shapes it and the case study that rides it.
 *
 * The pair is the unit everything downstream consumes: `createOrbitSystem`
 * builds one orbit line, one satellite and one atlas cell per entry, IN THIS
 * ORDER. That ordering is what makes "atlas cell index === pair index" true by
 * construction rather than by coincidence — the previous code built the atlas
 * from the case list and addressed cells by preset index, which agreed only
 * because both happened to be six items in the same order.
 */
export interface OrbitCase {
  preset: OrbitPreset
  satellite: CaseStudy
}

export { OrbitAssignmentError }

/**
 * Resolves the assignment table against the presets and the content collection.
 *
 * THROWS rather than dropping. Every structural problem here is a content-build
 * failure by design (see orbitAssignments.ts): the value of generating content
 * at build time is that invalid data is rejected before it is deployed, and a
 * best-effort resolution would trade a loud build error for a silent, plausible
 * wrong answer on a live marketing site.
 *
 * The one thing it does NOT require is that every preset is used. A design that
 * ships five of six orbits is a legitimate composition; a design that points two
 * orbits at one company, or at a company that does not exist, is not.
 *
 * Order follows `ORBIT_PRESETS`, not the assignment table and not the content
 * collection — the reveal staggers along it, so it must be the scene's order and
 * must not change when WordPress reorders its response.
 */
export function resolveOrbitCases(
  presets: readonly OrbitPreset[],
  assignments: readonly OrbitAssignment[],
  cases: readonly CaseStudy[],
): OrbitCase[] {
  const seenOrbit = new Set<string>()
  const seenCase = new Set<string>()

  for (const assignment of assignments) {
    if (seenOrbit.has(assignment.orbitId)) {
      throw new OrbitAssignmentError(
        `two assignments claim orbit "${assignment.orbitId}"`,
      )
    }
    seenOrbit.add(assignment.orbitId)

    if (seenCase.has(assignment.caseId)) {
      throw new OrbitAssignmentError(
        `case "${assignment.caseId}" is assigned to more than one orbit`,
      )
    }
    seenCase.add(assignment.caseId)

    if (!presets.some((preset) => preset.id === assignment.orbitId)) {
      throw new OrbitAssignmentError(
        `assignment names orbit "${assignment.orbitId}", which is not a preset`,
      )
    }
    if (!cases.some((entry) => entry.id === assignment.caseId)) {
      throw new OrbitAssignmentError(
        `assignment names case "${assignment.caseId}", which is not in the content`,
      )
    }
  }

  const byOrbit = new Map(assignments.map((a) => [a.orbitId, a.caseId]))
  const byCase = new Map(cases.map((entry) => [entry.id, entry]))

  const resolved: OrbitCase[] = []
  for (const preset of presets) {
    const caseId = byOrbit.get(preset.id)
    if (caseId === undefined) continue
    // Non-null by the loop above, which proved every assigned caseId is present.
    resolved.push({ preset, satellite: byCase.get(caseId)! })
  }
  return resolved
}
