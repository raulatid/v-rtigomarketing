import { blogPost } from './blogPost'
import { caseStudy } from './caseStudy'
import { district } from './district'
import { legalDoc } from './legalDoc'
import { embedMedia, imageMedia, videoMedia } from './objects/media'
import { blogBody, legalBody } from './objects/richText'
import { service } from './service'
import { siteSettings } from './siteSettings'

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
