import { describe, expect, it } from 'vitest'
import { BLOG_POSTS } from './generated/blogPosts'
import { CASE_STUDIES } from './generated/caseStudies'
import { DISTRICT_CONTENT } from './generated/districts'
import { SERVICES } from './generated/services'
import {
  blogPostProblems,
  caseStudyProblems,
  highlightedCaseProblems,
  collectionProblems,
  districtProblems,
} from './invariants'

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
    expect(highlightedCaseProblems(CASE_STUDIES, 'caseStudies')).toEqual([])
    expect(collectionProblems(DISTRICT_CONTENT, 'districts')).toEqual([])
  })

it('satisfies every blog-post invariant', () => {
    const problems = BLOG_POSTS.flatMap(blogPostProblems)
    expect(problems.map((p) => p.path + ': ' + p.message)).toEqual([])
  })

  it('gives every categorised post a topic that names a real service', () => {
    // THE CHECK THE MAPPER STRUCTURALLY CANNOT DO. `Collection.map` receives one
    // record at a time on purpose, so it can validate the shape of a category
    // but never that the service it names still exists. Sanity's reference
    // enforces it upstream; this is the assertion on what actually shipped, and
    // it is the reason the mapper is allowed to trust the dereference.
    const services = new Set(SERVICES.map((service) => service.id))
    for (const post of BLOG_POSTS) {
      if (post.category === null) continue
      expect(services, post.id + ' -> ' + post.category.id).toContain(post.category.id)
    }
  })

  it('gives every post a reading time and a resolved og:image', () => {
    // `BlogSeo.image` is never null by construction, which is what lets the
    // emitted blog shells require exactly one og:image rather than tolerating
    // its absence. Asserted on disk because that requirement is downstream.
    for (const post of BLOG_POSTS) {
      expect(post.readingTime, post.id).toBeGreaterThanOrEqual(1)
      expect(post.seo.title, post.id).not.toBe('')
      expect(post.seo.description, post.id).not.toBe('')
      expect(post.seo.image, post.id).toBeTruthy()
      expect(post.seo.image.src, post.id).not.toBe('')
    }
  })

  it('satisfies the collection-level invariants for the blog', () => {
    expect(collectionProblems(BLOG_POSTS, 'blogPosts')).toEqual([])
  })

  it('is actually populated, so an empty run cannot pass silently', () => {
    // Every assertion above holds trivially over an empty array. This is what
    // notices a generator that wrote a valid, empty module.
    expect(CASE_STUDIES.length).toBeGreaterThan(0)
    expect(DISTRICT_CONTENT.length).toBeGreaterThan(0)
    expect(BLOG_POSTS.length).toBeGreaterThan(0)
  })
})
