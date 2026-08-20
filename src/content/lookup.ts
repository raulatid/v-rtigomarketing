import type { DistrictContent } from './types'

/**
 * Lookups over a content collection.
 *
 * Hand-written and separate from the collections themselves, which are generated
 * and overwritten on every content sync. A helper living in a generated file
 * would be deleted by the next build.
 */

/**
 * Finds a district by id within a given list.
 *
 * Takes the list rather than closing over the generated export: the caller may
 * hold a specific collection — `MurciaExperience` uses what it was constructed
 * with — and a lookup that ignored its argument would silently resolve against
 * the module's own data instead.
 */
export function findDistrictContent(
  list: readonly DistrictContent[],
  id: string,
): DistrictContent | null {
  return list.find((entry) => entry.id === id) ?? null
}
