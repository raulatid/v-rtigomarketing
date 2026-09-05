/**
 * Which case study rides which orbit.
 *
 * ── Why this is code and not a CMS field ──
 * `CaseStudy` used to carry an `orbitId`, which made the assignment editorial
 * data. It is not. The orbits are six hand-placed presets whose radius,
 * inclination and phase were tuned against the camera's framing, and deciding
 * that a particular client occupies `orbit-03` is a composition decision about
 * the scene — the same kind of decision `cityDistrictBindings.ts` makes for
 * Murcia, and it lives beside the presets for the same reason.
 *
 * The practical consequence is the one that matters: the CMS may hold any
 * number of case studies, and publishing one does NOT create an orbit. The
 * Earth keeps a finite, art-directed set of slots, and filling a different slot
 * with a different client is a reviewable one-line edit here rather than
 * something that can happen in wp-admin while nobody is looking.
 *
 * ── Every entry must resolve ──
 * An assignment naming a case study that does not exist, a duplicate `orbitId`,
 * a duplicate `caseId`, or an `orbitId` with no matching preset are all
 * VALIDATION FAILURES, asserted in `resolveOrbitCases.test.ts` and by the
 * content build. They are not warnings and nothing is silently dropped: a
 * half-assigned globe shows the wrong company's numbers under the right
 * company's name, which is the one failure here that is worse than a crash.
 */
export interface OrbitAssignment {
  /** References an `OrbitPreset.id` in orbitConfig.ts. */
  orbitId: string
  /** References a `CaseStudy.id` in the content collection. */
  caseId: string
}

export const orbitAssignments: readonly OrbitAssignment[] = [
  { orbitId: 'orbit-01', caseId: 'satellite-01' },
  { orbitId: 'orbit-02', caseId: 'satellite-02' },
  { orbitId: 'orbit-03', caseId: 'satellite-03' },
  { orbitId: 'orbit-04', caseId: 'satellite-04' },
  { orbitId: 'orbit-05', caseId: 'satellite-05' },
  { orbitId: 'orbit-06', caseId: 'satellite-06' },
]

/**
 * The satellite whose halo breathes brighter in the overview — the worked
 * example that says "these are clickable" until the viewer has clicked one.
 *
 * Code, not a CMS field, for the reason the table above is: which client is
 * the example is a composition decision about the scene (the client chose
 * PcComponentes, 2026-09-05), and it must name a case that is actually on an
 * orbit — `resolveOrbitCases.test.ts` asserts that. See createSatelliteFocus
 * for when it is shown and when it retires.
 */
export const invitedCaseId = 'satellite-06'
