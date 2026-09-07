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
  // SWAPPED with orbit-06 on 2026-09-07, so the invited satellite (below)
  // rides the one orbit that is on screen the whole way round at every
  // supported viewport. orbit-06 is the widest and steepest of the six, and in
  // portrait it is OFF SCREEN at the exact frame the satellites settle and
  // in frame only ~70% of a revolution — measured from config, and asserted
  // by `satelliteVisibility.test.ts` so this cannot be quietly undone.
  { orbitId: 'orbit-02', caseId: 'satellite-06' },
  { orbitId: 'orbit-03', caseId: 'satellite-03' },
  { orbitId: 'orbit-04', caseId: 'satellite-04' },
  { orbitId: 'orbit-05', caseId: 'satellite-05' },
  { orbitId: 'orbit-06', caseId: 'satellite-02' },
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
 *
 * It is also the hover TUTORIAL's target (createSatelliteFocus, hoverTutorial),
 * which is why its orbit has to be visible the whole way round on a phone —
 * see the swap in the table above and `satelliteVisibility.test.ts`.
 */
export const invitedCaseId = 'satellite-06'
