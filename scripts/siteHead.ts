import type { PageSeo } from '../src/content/types'
import { ogImageUrl } from '../src/blog/sanityImage'
import { SEO_END, SEO_START, escapeHtmlAttribute, escapeHtmlText, type ShellUrls } from './blogShell'

/**
 * The `<head>` of the two documents that are not blog posts, `/` and `/blog`,
 * written from «Ajustes del sitio» at build time.
 *
 * A sibling of `postHead()` rather than a branch of it: the same escaping and
 * the same markers, but no article dates and no structured data. Kept out of
 * `vite.config.ts` for the reason `blogShell.ts` gives, since this also writes
 * CMS-authored strings into HTML and deserves tests with hostile input.
 */

/** Every tag a page's share card and search result are built from. */
export function pageHead(page: PageSeo, { origin }: ShellUrls): string {
  const t = escapeHtmlAttribute(page.title)
  const d = escapeHtmlAttribute(page.description)
  const s = escapeHtmlAttribute(page.shareDescription)
  return [
    `<title>${escapeHtmlText(page.title)}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${s}" />`,
    ...(page.image === undefined
      ? []
      : [`<meta property="og:image" content="${escapeHtmlAttribute(ogImageUrl(page.image, origin))}" />`]),
    // The large card only with an image to fill it: a large card without one
    // renders as a blank rectangle, which is why the home page claimed `summary`.
    `<meta name="twitter:card" content="${page.image === undefined ? 'summary' : 'summary_large_image'}" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${s}" />`,
  ]
    .map((line) => '    ' + line)
    .join('\n')
}

/**
 * The seo region of `blog.html`, rewritten with its markers kept.
 *
 * Kept because the blog shell is also the template every post's head is cut
 * from: `blogDocuments()` replaces this same region again, per post, after this
 * has run. The index at `/blog` is the shell unchanged, so what is written here
 * is the index's head. The markers are stripped with every other comment by the
 * publication hygiene pass at the end.
 */
export function blogIndexRegion(page: PageSeo, urls: ShellUrls): string {
  return `${SEO_START}\n${pageHead(page, urls)}\n    ${SEO_END}`
}

/**
 * The one `<link rel="icon">` each source document declares, however it is
 * formatted. `scripts/favicon.test.ts` holds the source to exactly one.
 */
const ICON_LINK = /<link\s+rel="icon"\s+href="[^"]*"\s*\/?>/g

/**
 * Swaps the inline isotype for the favicon uploaded in the CMS.
 *
 * Throws unless exactly one icon link is found, like `replaceExactlyOnce`: a
 * swap that silently matched nothing ships the old icon and looks fine. The
 * same PNG serves as the touch icon; browsers scale it down, and one upload is
 * what an editor can reasonably be asked for.
 */
export function replaceFavicon(html: string, href: string, what: string): string {
  const matches = html.match(ICON_LINK) ?? []
  if (matches.length !== 1) {
    throw new Error(`[site head] ${what}: expected exactly one <link rel="icon">, found ${matches.length}`)
  }
  const h = escapeHtmlAttribute(href)
  return html.replace(
    matches[0],
    () => `<link rel="icon" type="image/png" href="${h}" />\n    <link rel="apple-touch-icon" href="${h}" />`,
  )
}
