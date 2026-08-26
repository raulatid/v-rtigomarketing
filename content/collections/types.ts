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
  source: SanitySourceSpec
  map: (raw: unknown, index: number) => MapResult<T>
  audit: (items: readonly T[]) => Problem[]
  emit: EmitSpec
}

/**
 * Where a collection's records come from, in Sanity's vocabulary.
 *
 * DELIBERATELY not vendor-neutral. `type` is a Sanity `_type`, `projection` is
 * GROQ and `orderBy` is a GROQ ordering expression — pretending otherwise would
 * buy an abstraction for a second CMS that does not exist and would not fit it
 * anyway. The abstraction that matters is downstream: the projection IS the
 * normalization layer, so nothing past `map` ever sees `_ref`, `_type`,
 * `slug.current` or a Sanity asset object.
 */
export interface SanitySourceSpec {
  /**
   * The Sanity document `_type`, which is also the fixture and seed file's base
   * name. One name for one collection everywhere.
   */
  type: string
  /**
   * The GROQ projection, braces included, concatenated into the query verbatim.
   * It must produce exactly the flat shape `map` reads: this is where a Sanity
   * document becomes an internal record, and it is the only place that knows
   * both vocabularies.
   */
  projection: string
  /**
   * A GROQ ordering expression, e.g. `slug.current asc`.
   *
   * Optional in the type, mandatory in practice: a collection that omits it gets
   * `_id asc` from the adapter, and `collections.test.ts` asserts every shipped
   * collection names its own. Byte-identical output for unchanged content is the
   * property the whole emitter is built around, and an implicit order gives it
   * up silently.
   *
   * NOTE: `fileSource` does not sort. A fixture's array order must already match
   * what this asks Sanity for, or the fixture build and the Sanity build emit
   * different arrays.
   */
  orderBy?: string
  /**
   * Record-relative dotted paths whose value is a CMS media URL to be mirrored
   * into the deployment and rewritten to a local path. Applied by
   * `withMediaMirror`, and only when the source is Sanity — fixtures and the
   * seed already carry local paths.
   *
   * Editorial imagery deliberately stays on the CMS CDN. Only media the
   * application draws itself, i.e. the brand logos that go into the WebGL
   * atlas, is brought in-house.
   */
  mirror?: string[]
  /**
   * Per-field format and geometry rules, keyed by the same dotted paths listed
   * in `mirror`. A field with no entry here is mirrored on the existing checks
   * alone — origin, https, filename, reachability, size.
   *
   * Separate from `mirror` rather than folded into it so that adding a rule to
   * an already-mirrored field is an additive change, and so a field can be
   * mirrored without anyone having to invent numbers for it.
   */
  mediaRules?: Record<string, MediaRule>
}

/**
 * What a mirrored image must be, beyond being fetchable.
 *
 * Every bound is read off the CMS URL — Sanity names its assets
 * `<hash>-1600x800.webp` — so nothing here decodes an image or shells out.
 *
 * These are the ERROR-tier numbers only. The Studio
 * (`sanity-studio/schemas/lib/brandMark.ts`) carries the same ones plus an
 * advisory tier, and the two are duplicated on purpose: the Studio is a separate
 * npm package and neither side may import the other, exactly as with the
 * isotype/logo pairing rule. `docs/earth/logo-spec.md` is the source both
 * copies follow.
 */
export interface MediaRule {
  /** Lower-case, no dot, e.g. `['png', 'webp']`. Anything else fails the build. */
  extensions: string[]
  minWidth: number
  minHeight: number
  /** width / height, inclusive bounds. */
  minAspect: number
  maxAspect: number
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
