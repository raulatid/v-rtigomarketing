import type { EmitSpec } from '../lib/emit'
import type { Problem } from '../lib/validate'

/**
 * One content collection, described once.
 *
 * This is the extension point. `scripts/build-content.ts` is a loop over
 * `COLLECTIONS` and contains no per-collection knowledge at all, so adding the
 * next section — team, testimonials, whatever it turns out to be — is a new
 * entry here plus a type and a mapper. The generator, the emitter, the
 * validator, the source adapters and the transaction do not change.
 *
 * The three responsibilities are deliberately separate:
 *
 *   `source`  where the records come from, in the source adapter's vocabulary
 *   `map`     one raw record -> one validated entity, or a list of problems
 *   `audit`   what only the whole collection can see (uniqueness, emptiness)
 *
 * `map` cannot check uniqueness and `audit` cannot repair an entity. Keeping
 * them apart is what stops "this id is duplicated" from being reported once per
 * record.
 */
export interface Collection<T extends { id: string }> {
  /** Stable key, used for fixtures, logging and the temp directory. */
  key: string
  source: SourceSpec
  map: (raw: unknown, index: number) => MapResult<T>
  audit: (items: readonly T[]) => Problem[]
  emit: EmitSpec
}

export interface SourceSpec {
  /**
   * The WordPress post type, which is also the REST route segment and the
   * fixture file's base name. One name for one collection everywhere.
   */
  postType: string
  /**
   * Fields to request, so a response carrying an entire rendered post body is
   * not downloaded to extract four strings. Passed to REST as `_fields`.
   */
  fields?: string[]
}

export type MapResult<T> = { ok: true; value: T } | { ok: false; problems: Problem[] }

/**
 * Erases the entity type so the generator can hold a heterogeneous list.
 *
 * `Collection<CaseStudy>` and `Collection<DistrictContent>` have no common
 * supertype that keeps `map` and `audit` callable together, and the generator
 * genuinely does not care what `T` is — it maps, audits, and hands the result to
 * `emitModule`, which takes `unknown`. The cast is contained to this one
 * function rather than spread through the loop.
 */
export type AnyCollection = Collection<{ id: string }>

export function collection<T extends { id: string }>(spec: Collection<T>): AnyCollection {
  return spec as unknown as AnyCollection
}
