import type { BlogPost } from '../content/types'

/**
 * The tab title of each blog route (accessibility audit 2026-11-18, B1: it
 * never changed, so an article read in a warm session was titled «Vértigo
 * Marketing® - Web oficial», and the index kept the last article's).
 *
 * The same strings the prerendered documents carry. A post's is built exactly
 * as `postHead` builds it (`scripts/blogShell.ts`). The index's lives in the
 * CMS (`siteSeo.blog.title`), which the runtime may not import
 * (`checks/architecture.ts`): it is read from the document when this document
 * IS the blog index, whose `<title>` the build wrote from that field, and is
 * otherwise the content fallback — `scripts/siteHead.test.ts` holds the two
 * equal.
 */

export const BLOG_TITLE_SUFFIX = ' — Vertigo'
export const BLOG_INDEX_FALLBACK_TITLE = 'Blog — Vertigo'
export const BLOG_NOT_FOUND_TITLE = `Entrada no encontrada${BLOG_TITLE_SUFFIX}`

export function postDocumentTitle(post: Pick<BlogPost, 'seo'>): string {
  return `${post.seo.title}${BLOG_TITLE_SUFFIX}`
}

let indexTitle: string | null = null

/**
 * The index's title, decided once per document: its own `<title>` if this
 * document is the cold `/blog` (its canonical says so), the fallback if not.
 */
export function blogIndexTitle(doc: Document = document): string {
  if (indexTitle !== null) return indexTitle
  // No canonical, no answer: an empty href resolves to the CURRENT url, which
  // is /blog in a warm session that has just navigated there.
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null
  let path = ''
  try {
    if (canonical) path = new URL(canonical, doc.location.href).pathname.replace(/\/+$/, '')
  } catch {
    path = ''
  }
  indexTitle = path === '/blog' && doc.title.trim() !== '' ? doc.title : BLOG_INDEX_FALLBACK_TITLE
  return indexTitle
}

/** For tests: forget the decision. */
export function resetBlogIndexTitle(): void {
  indexTitle = null
}
