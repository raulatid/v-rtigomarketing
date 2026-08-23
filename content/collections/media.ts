import type { ImageMedia } from '../../src/content/types'
import { Report, matching, num, text } from '../lib/validate'

/**
 * Editorial images, normalized away from Sanity's asset shape.
 *
 * ── Not mirrored ──
 * Unlike a brand logo, these stay on `cdn.sanity.io`. The library grows without
 * bound, nothing renders them yet, and copying every blog image into every
 * deployment buys nothing until something displays them. When a renderer
 * arrives, `img-src` in `vercel.json` gains the CDN host — and that is the
 * moment to decide whether mirroring is worth it. See
 * `docs/content/sanity-media-contract.md`.
 *
 * ── alt is required ──
 * An image whose meaning is purely decorative does not belong in the CMS; it
 * belongs in the application's own assets. Making it optional here means it is
 * absent in practice, and nobody finds out until an audit.
 */

const CDN_ORIGIN = 'https://cdn.sanity.io'
const ALT_MAX = 200

/** Wide enough for a hero on a 4K display, narrow enough to catch a mistake. */
const DIMENSION_MAX = 8192

/**
 * The CDN url, parsed rather than pattern-matched. A media reference is the one
 * CMS field whose value becomes a request the visitor's browser makes.
 */
const CDN_URL = new RegExp('^' + CDN_ORIGIN.replace(/[.]/g, '\\.') + '/[\\w./%-]+$')

export function imageMedia(report: Report, path: string, raw: unknown): ImageMedia | undefined {
  if (raw === null || typeof raw !== 'object') {
    return report.fail(path, 'expected an image object')
  }
  const source = raw as Record<string, unknown>

  const src = matching(report, path + '.src', source.src, CDN_URL, 'a Sanity CDN image url')
  // An SVG is served at its own url, which makes it stored XSS for anyone who
  // opens it directly. Same rule the logo mirror enforces, same reason.
  if (src !== undefined && /\.svgz?$/i.test(src)) {
    report.fail(path + '.src', 'SVG is not an allowed image format')
  }
  const alt = text(report, path + '.alt', source.alt, { max: ALT_MAX })
  const width = num(report, path + '.width', source.width, { min: 1, max: DIMENSION_MAX })
  const height = num(report, path + '.height', source.height, { min: 1, max: DIMENSION_MAX })

  if (src === undefined || alt === undefined || width === undefined || height === undefined) {
    return undefined
  }
  if (/\.svgz?$/i.test(src)) return undefined
  return { src, alt, width, height }
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
