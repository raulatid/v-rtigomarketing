import { describe, expect, it } from 'vitest'
import { ABOUT_SECTION } from './generated/aboutSection'
import { aboutSectionProblems } from './invariants'
import { ABOUT_SECTION_CONTENT } from './about'

/**
 * A guard on the guard, as `tower.test.ts` is for the screen: the shipped
 * module holds to what the build asserted.
 */
describe('the shipped Conócenos section', () => {
  it('is at most one record, read as the singleton or null', () => {
    expect(ABOUT_SECTION.length).toBeLessThanOrEqual(1)
    expect(ABOUT_SECTION_CONTENT).toBe(ABOUT_SECTION[0] ?? null)
  })

  it('satisfies the same invariants the build asserted', () => {
    expect(ABOUT_SECTION.flatMap(aboutSectionProblems)).toEqual([])
  })

  it('names its slides apart from the tower screen\'s, so the screen can hold both', () => {
    for (const slide of ABOUT_SECTION_CONTENT?.slides ?? []) expect(slide.id).toMatch(/^about-\d+$/)
  })
})
