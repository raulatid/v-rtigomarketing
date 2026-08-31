/**
 * The blog's machine-readable policy values.
 *
 * ONE DEFINITION for everything that has more than one consumer on this side of
 * the CMS boundary: the content build reads these while mapping, and the blog UI
 * reads them while rendering. `invariants.ts` is the model for the arrangement
 * and the reason — a bound written twice is a bound that gets relaxed once.
 *
 * ── What is deliberately NOT here ──
 *
 * The Studio's advisory lengths for `seoTitle` (60) and `metaDescription` (160).
 * They live in `sanity-studio/schemas/blogPost.ts` and nowhere else, because
 * after `adr/013` the build does not check them at all: they are where Google
 * truncates, not where content becomes invalid, so exceeding one is a warning to
 * the editor and never a failed deployment. A value with exactly one consumer
 * does not need a shared home, and giving it one would imply the build enforces
 * something it deliberately does not.
 *
 * The set of categories. A category IS a service (`category` is a reference in
 * the Studio), so the list is CMS-owned and there is nothing to enumerate here.
 *
 * ── Why this does not cross into the Studio ──
 *
 * `content/collections/types.ts` states the boundary: the Studio is a separate
 * npm package and neither side may import the other. `MediaRule` duplicates its
 * numbers for that reason and says so. Nothing in this file is duplicated over
 * there, which is the better answer than duplicating it carefully.
 *
 * Pure by rule, like `invariants.ts`: no imports, no Node, no DOM.
 */

/**
 * Spanish prose, rounded to something a reader recognises. The figure is a
 * convention rather than a measurement — the honest claim a "4 min de lectura"
 * label makes is "short", not "243 seconds".
 */
export const BLOG_WORDS_PER_MINUTE = 200

/**
 * A post is never "0 min de lectura". Two sentences still cost the reader the
 * decision to open it, and a zero reads as missing data rather than as brevity.
 */
export const BLOG_READING_MINUTES_MIN = 1

/**
 * Where the excerpt is cut when it stands in for an absent `metaDescription`.
 *
 * Applied ONLY to that fallback, never to the excerpt itself: the excerpt has
 * its own 300-character bound and is rendered in full on the card. Cutting
 * happens at a word boundary, because a description ending mid-word looks like a
 * bug in the site rather than a limit in the search result.
 */
export const BLOG_META_DESCRIPTION_FALLBACK_MAX = 160

/**
 * The social image every post falls back to when it has neither an `ogImage` nor
 * a `cover`.
 *
 * Same-origin and committed, not a CDN transform: it must resolve for a scraper
 * that will not run JavaScript, will not follow a redirect chain, and has no
 * opinion about `Accept`. 1200x630 is what every consumer crops from.
 *
 * Resolved in the content build so `BlogSeo.image` is never null, which is what
 * lets the shell verifier in `vite.config.ts` require exactly one `og:image`
 * rather than tolerating its absence.
 */
export const DEFAULT_OG_IMAGE_PATH = '/og-default.png'

/** Open Graph's expected geometry. Both consumers crop to it. */
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630
