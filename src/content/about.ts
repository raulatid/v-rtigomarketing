// The Conócenos section's content — an adapter over the generated module, like
// `tower.ts` is for the screen.

import { ABOUT_SECTION } from './generated/aboutSection.js'
import type { AboutSectionContent, AboutStop } from './types.js'

export type { AboutSectionContent, AboutStop }

/**
 * The singleton, or null while it has not been published.
 *
 * `aboutSection.collection.ts`'s `audit` allows zero documents and fails on
 * two, so this is the one document or nothing. Null is a real state, not a
 * fault: the tower's base then names itself and goes nowhere, as it did before
 * the section existed. `about.test.ts` re-checks the shipped module.
 */
export const ABOUT_SECTION_CONTENT: AboutSectionContent | null = ABOUT_SECTION[0] ?? null
