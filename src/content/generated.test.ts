import { describe, expect, it } from 'vitest'
import { CASE_STUDIES } from './generated/caseStudies'
import { DISTRICT_CONTENT } from './generated/districts'
import { caseStudyProblems, collectionProblems, districtProblems } from './invariants'

/**
 * The guard on the guard.
 *
 * `caseStudies.test.ts` and `districts.test.ts` assert specific bounds in the
 * vocabulary of the thing being rendered. This one asserts that the SHIPPED
 * modules satisfy the same predicate objects the content build runs before it
 * writes — so the two can never drift into disagreeing about what valid means.
 *
 * It is deliberately not the same code path as the generator: the generator
 * validates what it is ABOUT to write, in Node, before the file exists. This
 * validates what is actually on disk and about to be bundled. A generator that
 * silently stopped validating would still pass its own tests; it would fail here.
 */

describe('the generated content on disk', () => {
  it('satisfies every case-study invariant', () => {
    const problems = CASE_STUDIES.flatMap(caseStudyProblems)
    expect(problems.map((p) => p.path + ': ' + p.message)).toEqual([])
  })

  it('satisfies every district invariant', () => {
    const problems = DISTRICT_CONTENT.flatMap(districtProblems)
    expect(problems.map((p) => p.path + ': ' + p.message)).toEqual([])
  })

  it('satisfies the collection-level invariants', () => {
    expect(collectionProblems(CASE_STUDIES, 'caseStudies')).toEqual([])
    expect(collectionProblems(DISTRICT_CONTENT, 'districts')).toEqual([])
  })

  it('is actually populated, so an empty run cannot pass silently', () => {
    // Every assertion above holds trivially over an empty array. This is what
    // notices a generator that wrote a valid, empty module.
    expect(CASE_STUDIES.length).toBeGreaterThan(0)
    expect(DISTRICT_CONTENT.length).toBeGreaterThan(0)
  })
})
