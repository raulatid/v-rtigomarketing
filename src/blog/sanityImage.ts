import type { ImageMedia } from '../content/types'
import { SANITY_CDN_ORIGIN } from '../content/invariants'
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '../content/blogPolicy'

/**
 * Sanity CDN image URLs, built with the URL API.
 *
 * ── Why not string concatenation ──
 *
 * Because the input is a CMS value and the output is a request the visitor's
 * browser makes. `src + '?w=680'` is wrong the moment the stored URL already has
 * a query, and it cannot notice that the value is not on the CDN at all.
 * `searchParams` handles both, and the origin check is a PARSE rather than a
 * prefix match — SEC-1 in the security audit is exactly that mistake made once
 * already, and a prefix guard is bypassable with a backslash because the URL
 * parser treats `\` as `/`.
 *
 * ── Runtime, but pure ──
 *
 * No network, no DOM, no measurement. It lives here rather than in
 * `src/content/` because the widths depend on the layout slot and the `sizes`
 * string on the viewport — both facts about the blog's design, not about the
 * content model. The content build has no opinion about either.
 *
 * ── Never upscales ──
 *
 * The ladder is filtered against the asset's real width, so a 900px upload never
 * offers a 1360px variant that Sanity would produce by stretching it.
 */

/**
 * Where an image sits, which is what decides both the ladder and `sizes`.
 *
 * Derived from the approved artboards rather than invented: the article column
 * is 680px (`Main.dc.html`), the featured pair is half of the 1104px grid minus
 * its 48px gap, and a card is that grid in three columns with 32px gaps.
 */
export type ImageSlot = 'cover' | 'featured' | 'card' | 'body'

/**
 * 680 is the article column; 1360 is exactly twice it, which is what a 2x
 * display asks for and is also enough for a full-bleed 390px phone at 3x.
 * 400 and 960 bracket the card and featured widths.
 */
const LADDER = [400, 680, 960, 1360] as const

/** Higher for the two slots a reader looks at directly. */
const QUALITY: Record<ImageSlot, number> = {
  cover: 80,
  featured: 78,
  body: 78,
  card: 72,
}

export const SIZES: Record<ImageSlot, string> = {
  cover: '(max-width: 767px) 100vw, 680px',
  body: '(max-width: 767px) 100vw, 680px',
  featured: '(max-width: 767px) 100vw, 528px',
  card: '(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 346px',
}

/**
 * The CDN URL, or `null` for anything that is not one.
 *
 * `null` is not a failure. `ImageMedia.src` is documented as "absolute CMS CDN
 * url, OR a local path when the asset was mirrored", and the site-wide OG
 * default is exactly such a path — appending `?w=680` to `/og-default.png`
 * would be nonsense rather than an error.
 */
function cdnUrl(src: string): URL | null {
  let url: URL
  try {
    url = new URL(src)
  } catch {
    // A relative path: local, mirrored, or the OG default. Not ours to transform.
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.origin !== SANITY_CDN_ORIGIN) return null
  return url
}

function withTransform(url: URL, params: Record<string, string>): string {
  const next = new URL(url.href)
  for (const [key, value] of Object.entries(params)) next.searchParams.set(key, value)
  return next.href
}

/**
 * One variant at a given width.
 *
 * `fit=max` never upscales and preserves the aspect ratio; `auto=format` lets
 * the CDN answer with AVIF or WebP based on the browser's own `Accept` header,
 * which is strictly better than picking one here and is safe because a real
 * browser is asking.
 */
export function sanityImageSrc(image: ImageMedia, width: number, slot: ImageSlot): string {
  const url = cdnUrl(image.src)
  if (url === null) return image.src
  return withTransform(url, {
    w: String(width),
    fit: 'max',
    auto: 'format',
    q: String(QUALITY[slot]),
  })
}

/**
 * The `srcset`, or `undefined` when there is nothing to choose between.
 *
 * `undefined` rather than a one-entry set for a non-CDN image: an `srcset` with
 * a single candidate is noise in the markup and tells the browser nothing it
 * did not already know from `src`.
 */
export function sanityImageSrcSet(image: ImageMedia, slot: ImageSlot): string | undefined {
  if (cdnUrl(image.src) === null) return undefined
  // Never wider than the asset: Sanity honours a larger `w` by stretching, and
  // a browser on a big screen would then pick the stretched one.
  const widths = LADDER.filter((width) => width <= image.width)
  // Narrower than every rung. `src` alone already says everything a srcset could.
  if (widths.length === 0) return undefined
  return widths.map((width) => `${sanityImageSrc(image, width, slot)} ${width}w`).join(', ')
}

/**
 * The social-card image: absolute, fixed size, fixed format.
 *
 * DELIBERATELY NOT the responsive builder. A scraper is not a browser: it sends
 * no useful `Accept` header, so `auto=format` could hand it AVIF that Facebook
 * will not decode; it does not evaluate `srcset`; and it requires an absolute
 * URL because there is no document base to resolve against. `fit=crop` rather
 * than `max` because every consumer crops to 1.91:1 anyway, and cropping at the
 * CDN with the editor's hotspot beats letting Twitter guess.
 */
export function ogImageUrl(image: ImageMedia, origin: string): string {
  const url = cdnUrl(image.src)
  if (url === null) {
    // A local path — the site default, or a mirrored asset. Made absolute
    // against the production origin, because relative og:image is ignored.
    return new URL(image.src, origin).href
  }
  return withTransform(url, {
    w: String(OG_IMAGE_WIDTH),
    h: String(OG_IMAGE_HEIGHT),
    fit: 'crop',
    fm: 'jpg',
    q: '80',
  })
}
