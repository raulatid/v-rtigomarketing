import type { AnyCollection } from './types'
import { caseStudiesCollection } from './caseStudies.collection'
import { districtsCollection } from './districts.collection'
import { servicesCollection } from './services.collection'
import { legalDocsCollection } from './legalDocs.collection'
import { siteSettingsCollection } from './siteSettings.collection'

/**
 * Every content collection the site publishes.
 *
 * THE EXTENSION POINT. `scripts/build-content.ts` iterates this and knows no
 * collection by name, so the next section is an entry here, a type in
 * `src/content/types.ts`, a predicate set in `src/content/invariants.ts`, a
 * mapper beside these two, and a fixture. Nothing in the generator, the emitter,
 * the validator, the source adapters or the transaction changes.
 *
 * Order is the order the build reports in. Alphabetical would be arbitrary;
 * this is roughly the order a visitor meets the content.
 */
export const COLLECTIONS: readonly AnyCollection[] = [
  caseStudiesCollection,
  districtsCollection,
  servicesCollection,
  siteSettingsCollection,
  legalDocsCollection,
]
