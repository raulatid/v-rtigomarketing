import type { ImageMedia } from '../../src/content/types'
import { SANITY_CDN_ORIGIN } from '../../src/content/invariants'
import { Report, matching, num, text } from '../lib/validate'

/**
 * Editorial images, normalized away from Sanity's asset shape.
 *
 * ── Not mirrored, and that question is now settled ──
 * Unlike a brand logo, these stay on `cdn.sanity.io`. This comment used to end
 * "when a renderer arrives, that is the moment to decide whether mirroring is
 * worth it". The renderer arrived with `adr/013` and the answer was to keep
 * hotlinking: the library grows without bound, and the CDN's own transforms are
 * what give the blog responsive images at all — mirroring would mean generating
 * and shipping every width of every image on every deploy. `vercel.json`'s
 * `img-src` gained the CDN host in the same change. See
 * `docs/content/sanity-media-contract.md`.
 *
 * ── alt is required ──
 * An image whose meaning is purely decorative does not belong in the CMS; it
 * belongs in the application's own assets. Making it optional here means it is
 * absent in practice, and nobody finds out until an audit.
 */

const ALT_MAX = 200

/**
 * Same bound as ALT_MAX, and the same reasoning: room for a real sentence,
 * short enough to catch a whole paragraph pasted into the wrong field.
 *
 * A local const rather than a shared module because it has exactly one
 * consumer. serviceBounds.ts exists only because two mappers build a service.
 */
const CAPTION_MAX = 200

/** Wide enough for a hero on a 4K display, narrow enough to catch a mistake. */
const DIMENSION_MAX = 8192

/**
 * The CDN url, parsed rather than pattern-matched. A media reference is the one
 * CMS field whose value becomes a request the visitor's browser makes.
 */
const CDN_URL = new RegExp('^' + SANITY_CDN_ORIGIN.replace(/[.]/g, '\\.') + '/[\\w./%-]+$')

/**
 * True when nothing the projection resolves from the asset came back.
 *
 * Sanity keeps `{_type: 'imageMedia', alt: '…'}` in the document when an editor
 * writes the description and never uploads the file, or removes one later, so
 * the projection returns an object whose asset-derived members are all null
 * rather than the null it returns for a field that was never touched.
 */
function assetless(source: Record<string, unknown>): boolean {
  return (
    (source.src === null || source.src === undefined) &&
    (source.width === null || source.width === undefined) &&
    (source.height === null || source.height === undefined)
  )
}

export function imageMedia(report: Report, path: string, raw: unknown): ImageMedia | undefined {
  if (raw === null || typeof raw !== 'object') {
    return report.fail(path, 'expected an image object')
  }
  const source = raw as Record<string, unknown>

  // Reported ONCE, at the field, rather than as three "expected a string, got
  // null" lines about `src`, `width` and `height`. Whoever reads a content
  // failure is whoever edits the CMS, and those three are not fields they have
  // ever seen — they are derived from the upload. A dangling asset reference
  // lands here too, and the same sentence is the right thing to say about it.
  if (assetless(source)) {
    return report.fail(
      path,
      'no image was uploaded — upload one, or clear the whole field in the Studio',
    )
  }

  const src = matching(report, path + '.src', source.src, CDN_URL, 'a Sanity CDN image url')
  // An SVG is served at its own url, which makes it stored XSS for anyone who
  // opens it directly. Same rule the logo mirror enforces, same reason.
  if (src !== undefined && /\.svgz?$/i.test(src)) {
    report.fail(path + '.src', 'SVG is not an allowed image format')
  }
  const alt = text(report, path + '.alt', source.alt, { max: ALT_MAX })
  const width = num(report, path + '.width', source.width, { min: 1, max: DIMENSION_MAX })
  const height = num(report, path + '.height', source.height, { min: 1, max: DIMENSION_MAX })

  // Optional, and OMITTED rather than empty when unset. An empty <figcaption>
  // is a visible gap under the image, and a `caption === ''` sentinel would make
  // every consumer test for it. A blank string from the CMS means "no caption".
  let caption: string | undefined
  if (source.caption !== null && source.caption !== undefined && source.caption !== '') {
    caption = text(report, path + '.caption', source.caption, { max: CAPTION_MAX })
    if (caption === undefined) return undefined
  }

  if (src === undefined || alt === undefined || width === undefined || height === undefined) {
    return undefined
  }
  if (/\.svgz?$/i.test(src)) return undefined
  return caption === undefined
    ? { src, alt, width, height }
    : { src, alt, width, height, caption }
}

/** `null` for an absent image, without failing. Not every post has a cover. */
export function optionalImageMedia(
  report: Report,
  path: string,
  raw: unknown,
): ImageMedia | null | undefined {
  if (raw === null || raw === undefined) return null
  return imageMedia(report, path, raw)
}
