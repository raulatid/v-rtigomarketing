import { blogPost } from './blogPost'
import { caseStudy } from './caseStudy'
import { district } from './district'
import { legalDoc } from './legalDoc'
import { embedMedia, imageMedia, videoMedia } from './objects/media'
import { blogBody, legalBody } from './objects/richText'
import { service } from './service'
import { siteSettings } from './siteSettings'

/**
 * ── Icons are imported from their SUBPATH, never from the package root ──
 * `@sanity/icons` 5.x exports each icon at `@sanity/icons/<Name>`; the package
 * root exports only a lazy icon map. Its root `.d.ts` still declares the old
 * named exports, so `import { CogIcon } from '@sanity/icons'` is tsc-clean and
 * a runtime SyntaxError the first time Vite serves it. That is not a style
 * choice to tidy up — it was found by watching the Studio fail to load.
 */

/**
 * Every type the Studio knows.
 *
 * These are written against the GROQ projections in
 * `content/collections/*.collection.ts`, and THOSE are the contract: the build
 * validates what arrives and fails if it is wrong. A field added here that no
 * projection selects is invisible to the site; a field a projection selects and
 * this does not define arrives as null and fails the build. Change them
 * together.
 */
export const schemaTypes = [
  caseStudy,
  service,
  district,
  blogPost,
  siteSettings,
  legalDoc,
  imageMedia,
  videoMedia,
  embedMedia,
  legalBody,
  blogBody,
]
