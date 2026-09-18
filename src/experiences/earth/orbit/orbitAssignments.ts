import type { CaseStudy } from '../../../content/types'

/**
 * Which case study rides which orbit.
 *
 * ── Why this is code and not a CMS field ──
 * `CaseStudy` used to carry an `orbitId`, which made the assignment editorial
 * data. It is not. The orbits are six hand-placed presets whose radius,
 * inclination and phase were tuned against the camera's framing, and deciding
 * which orbit a client occupies is a composition decision about the scene —
 * the same kind of decision `cityDistrictBindings.ts` makes for Murcia, and it
 * lives beside the presets for the same reason.
 *
 * ── Derived from the content, on one editorial input ──
 * This WAS a literal table naming six case ids. That made the CMS a mirror of
 * this file: the Studio had to hold exactly the ids written here, and the boot
 * failed the day it did not (2026-09-18, five cases published against a table
 * naming a sixth). The table is now derived from the published collection:
 *
 *  - The HIGHLIGHTED case — the Studio's «caso de éxito resaltado», exactly one
 *    by content-build invariant (`highlightedCaseProblems`) — always rides
 *    `HIGHLIGHTED_ORBIT_ID`. It is the satellite whose halo breathes brighter
 *    in the overview and the hover tutorial's target, so it has to ride the one
 *    orbit that is on screen the whole way round at every supported viewport:
 *    orbit-02 (measured from config and asserted by
 *    `satelliteVisibility.test.ts`, which is what found the 2026-09-07 problem
 *    of the target riding the widest, steepest orbit and being off screen in
 *    portrait at the exact frame the satellites settle).
 *  - Every other case fills the remaining presets in `ORBIT_FILL_ORDER`, in
 *    the collection's order — which is by id, because `caseStudies.collection.ts`
 *    orders its emit by slug. Cases past the last preset ride nothing: the Earth
 *    keeps a finite, art-directed set of slots, and publishing a seventh case
 *    does NOT create an orbit.
 *
 * What stays a composition decision here: which orbit is the highlighted one,
 * and the order the rest fill in. What an editor decides: which client is
 * highlighted. Nothing else about the globe is authored in the CMS.
 *
 * ── Every entry must resolve ──
 * `resolveOrbitCases` still validates the derived table exactly as it did the
 * literal one — duplicate orbit, duplicate case, unknown preset, unknown case —
 * and throws rather than dropping. The derivation cannot produce those by
 * construction, but the check is cheap and a half-assigned globe shows the
 * wrong company's numbers under the right company's name, which is the one
 * failure here that is worse than a crash.
 */
export interface OrbitAssignment {
  /** References an `OrbitPreset.id` in orbitConfig.ts. */
  orbitId: string
  /** References a `CaseStudy.id` in the content collection. */
  caseId: string
}

/**
 * Thrown by the derivation here and by `resolveOrbitCases`. Defined beside the
 * table rather than the resolver so the resolver can import the table's type
 * without the two modules importing each other (`check:architecture`).
 */
export class OrbitAssignmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OrbitAssignmentError'
  }
}

/** The orbit the highlighted case always rides. See the visibility argument above. */
export const HIGHLIGHTED_ORBIT_ID = 'orbit-02'

/**
 * The presets the other cases fill, in this order. `HIGHLIGHTED_ORBIT_ID` is
 * deliberately absent: the reveal staggers along preset order regardless
 * (`resolveOrbitCases` sorts by preset), so this only decides which clients get
 * a slot when there are more cases than free orbits.
 */
export const ORBIT_FILL_ORDER: readonly string[] = [
  'orbit-01',
  'orbit-03',
  'orbit-04',
  'orbit-05',
  'orbit-06',
]

/**
 * The id of the highlighted case, or a throw.
 *
 * Throws rather than returning null because the content build already refuses
 * a collection without exactly one — reaching here with zero or two means a
 * hand-edited generated module, and the overview would otherwise run with no
 * tutorial target and nothing to say so.
 */
export function invitedCaseIdFor(cases: readonly CaseStudy[]): string {
  const highlighted = cases.filter((entry) => entry.highlighted)
  if (highlighted.length !== 1) {
    throw new OrbitAssignmentError(
      highlighted.length === 0
        ? 'no case study is highlighted; exactly one must be'
        : 'more than one case study is highlighted: ' + highlighted.map((c) => c.id).join(', '),
    )
  }
  return highlighted[0].id
}

/** The assignment table for a published collection. See the module comment. */
export function orbitAssignmentsFor(cases: readonly CaseStudy[]): OrbitAssignment[] {
  const invited = invitedCaseIdFor(cases)
  const assignments: OrbitAssignment[] = [{ orbitId: HIGHLIGHTED_ORBIT_ID, caseId: invited }]
  const others = cases.filter((entry) => entry.id !== invited)
  for (let i = 0; i < others.length && i < ORBIT_FILL_ORDER.length; i += 1) {
    assignments.push({ orbitId: ORBIT_FILL_ORDER[i], caseId: others[i].id })
  }
  return assignments
}
