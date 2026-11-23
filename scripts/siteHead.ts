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

/** The region of `index.html` the home page's h1 is written into, inside `#root`. */
export const HEADLINE_START = '<!--vertigo:headline:start-->'
export const HEADLINE_END = '<!--vertigo:headline:end-->'

/**
 * The home page's h1 and its supporting line, as static HTML (plan 029a §4).
 *
 * Inside `#root`, so React's first commit clears it and `HomeHeadline` puts the
 * same two strings back, inside `.app__scene`: there is exactly one h1 at every
 * moment. Static so it exists for a crawler, without JavaScript and without
 * WebGL, and costs the app entry nothing. Visually hidden by an inline rule in
 * `index.html`: the drawing owns the screen until React mounts.
 */
export function homeHeadline({ headline, subheadline }: { headline: string; subheadline: string }): string {
  return [
    `<div class="home-headline-static">`,
    `  <h1>${escapeHtmlText(headline)}</h1>`,
    `  <p>${escapeHtmlText(subheadline)}</p>`,
    `</div>`,
  ]
    .map((line) => '    ' + line)
    .join('\n')
}

/**
 * Replaces the headline region of `index.html`, markers included.
 *
 * Throws rather than skip, like `replaceRegion`: a build that silently matched
 * nothing would ship the fallback h1 under the client's head and look fine.
 */
export function replaceHeadline(html: string, region: string, what: string): string {
  const start = html.indexOf(HEADLINE_START)
  const end = html.indexOf(HEADLINE_END)
  if (start < 0 || end < start) {
    throw new Error(`[site head] ${what}: the headline markers are missing or out of order`)
  }
  if (html.indexOf(HEADLINE_START, start + 1) >= 0 || html.indexOf(HEADLINE_END, end + 1) >= 0) {
    throw new Error(`[site head] ${what}: the headline markers appear more than once`)
  }
  return html.slice(0, start) + region.trimStart() + html.slice(end + HEADLINE_END.length)
}

export const NOSCRIPT_START = '<!--vertigo:noscript:start-->'
export const NOSCRIPT_END = '<!--vertigo:noscript:end-->'

/**
 * What a reader or a crawler without JavaScript gets in the body of `/` and of
 * every blog document (accessibility audit 2026-11-18, G2: the body was an
 * empty `#root`, so a crawler that does not run scripts — most AI search bots —
 * read not one word of a site whose argument is GEO). A line saying what is
 * missing, and real links to the blog and to every post, by title.
 *
 * Inside `#root`, so it is never seen with JavaScript: a `<noscript>` renders
 * nothing then, and React's first commit clears the element anyway. Inline
 * styles: no stylesheet is guaranteed to have loaded for this reader, and the
 * page's black is the inline one in each document.
 */
export function noscriptRegion(posts: readonly { id: string; title: string }[]): string {
  const link = 'color:#fff;text-decoration:underline'
  return [
    `<noscript>`,
    `  <div style="max-width:40rem;margin:0 auto;padding:6rem 1.5rem 3rem;background:#050507;color:#fff;font:1rem/1.6 system-ui,sans-serif">`,
    `    <p>La experiencia 3D de esta web necesita JavaScript. Sin él, puedes leer el blog:</p>`,
    `    <ul>`,
    `      <li><a style="${link}" href="/blog">Blog</a></li>`,
    ...posts.map(
      (post) => `      <li><a style="${link}" href="/blog/${encodeURIComponent(post.id)}">${escapeHtmlText(post.title)}</a></li>`,
    ),
    `    </ul>`,
    `  </div>`,
    `</noscript>`,
  ]
    .map((line) => '    ' + line)
    .join('\n')
}

/** Replaces the noscript region, markers included; throws as `replaceHeadline` does. */
export function replaceNoscript(html: string, region: string, what: string): string {
  const start = html.indexOf(NOSCRIPT_START)
  const end = html.indexOf(NOSCRIPT_END)
  if (start < 0 || end < start) {
    throw new Error(`[site head] ${what}: the noscript markers are missing or out of order`)
  }
  if (html.indexOf(NOSCRIPT_START, start + 1) >= 0 || html.indexOf(NOSCRIPT_END, end + 1) >= 0) {
    throw new Error(`[site head] ${what}: the noscript markers appear more than once`)
  }
  return html.slice(0, start) + region.trimStart() + html.slice(end + NOSCRIPT_END.length)
}
