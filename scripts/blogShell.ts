import type { BlogPost } from '../src/content/types'
import { ogImageUrl } from '../src/blog/sanityImage'

/**
 * Building the static `<head>` for one blog post, and refusing to emit one that
 * is wrong.
 *
 * ── What v1 does and does not do ──
 *
 * IT PRERENDERS CRAWLER AND SOCIAL METADATA, NOT ARTICLE BODY HTML. Each post
 * gets a real document with its own title, description, canonical and og:* tags;
 * the article itself is still rendered by React in the browser. This is not
 * static site generation and is not described as such anywhere.
 *
 * That scope is deliberate rather than a shortcut. Googlebot renders JavaScript
 * and indexes the body; Bingbot does so partially and later. Facebook, X,
 * LinkedIn, WhatsApp and Slack run no JavaScript at all and read only the head —
 * so the head is exactly the part that cannot be left to the client, and it is
 * the whole of the failure this solves: a shared link rendering as a blank card.
 * Prerendering the body is a separate, later change.
 *
 * ── Why this is a module rather than inline plugin code ──
 *
 * Because it is the one part of the build that takes CMS-authored strings and
 * writes them into HTML. That deserves unit tests with hostile inputs, and
 * `vite.config.ts` is not somewhere tests can reach.
 */

/** Marks the region of `blog.html` that is replaced wholesale, per post. */
export const SEO_START = '<!--vertigo:seo:start-->'
export const SEO_END = '<!--vertigo:seo:end-->'

/**
 * Escapes a string for a TEXT node — `<title>`, and nothing else here.
 *
 * Separate from the attribute escaper on purpose: the rules genuinely differ,
 * and one function doing both is how a quote ends up unescaped in the case that
 * needed it. A title is CMS-authored, so `Cómo medimos <el SEO>` is a thing an
 * editor can type and must not become markup.
 */
export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Escapes a string for a double-quoted ATTRIBUTE value.
 *
 * Quotes matter here and do not in a text node: an unescaped `"` closes the
 * attribute early and everything after it becomes markup. `'` is escaped too so
 * the output is safe if the quoting style ever changes.
 */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Replaces `needle` with `replacement`, and THROWS unless it matched once.
 *
 * The whole point. A best-effort `String.replace` silently does nothing when the
 * needle has drifted, and silently does it once when the needle appears twice —
 * both of which emit a shell that looks fine and carries the wrong metadata.
 * Failing the build is the only outcome that anyone finds out about.
 */
export function replaceExactlyOnce(
  haystack: string,
  needle: string,
  replacement: string,
  what: string,
): string {
  const count = haystack.split(needle).length - 1
  if (count !== 1) {
    throw new Error(
      `[blog shells] ${what}: expected exactly one match, found ${count}. ` +
        `Needle: ${JSON.stringify(needle.slice(0, 120))}`,
    )
  }
  return haystack.replace(needle, replacement)
}

/** Replaces the region between the two markers, markers included. */
export function replaceRegion(haystack: string, replacement: string, what: string): string {
  const start = haystack.indexOf(SEO_START)
  const end = haystack.indexOf(SEO_END)
  if (start < 0 || end < 0 || end < start) {
    throw new Error(
      `[blog shells] ${what}: the ${SEO_START} / ${SEO_END} markers are missing or out of order ` +
        'in blog.html. They are the anchor the per-post head is built on.',
    )
  }
  if (haystack.indexOf(SEO_START, start + 1) >= 0 || haystack.indexOf(SEO_END, end + 1) >= 0) {
    throw new Error(`[blog shells] ${what}: the seo markers appear more than once in blog.html`)
  }
  return haystack.slice(0, start) + replacement + haystack.slice(end + SEO_END.length)
}

/**
 * JSON for a `<script type="application/ld+json">` block.
 *
 * `<` is escaped to `<` rather than trusted: a body containing the literal
 * text `</script>` would otherwise close the block early and turn the rest of
 * the document into markup. This is the one place in the shell where a value is
 * embedded in something other than HTML, so it needs its own rule.
 */
function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export interface ShellUrls {
  /** e.g. `https://vertigo.example` — no trailing slash. */
  origin: string
}

/** The `<head>` region for one post, replacing everything between the markers. */
export function postHead(post: BlogPost, { origin }: ShellUrls): string {
  const url = `${origin}/blog/${post.id}`
  const image = ogImageUrl(post.seo.image, origin)
  const title = `${post.seo.title} — Vertigo`

  const structured = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.seo.title,
    description: post.seo.description,
    image,
    datePublished: post.publishedAt,
    inLanguage: 'es-ES',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    publisher: { '@type': 'Organization', name: 'Vertigo' },
    ...(post.category === null ? {} : { articleSection: post.category.label }),
    ...(post.tags.length === 0 ? {} : { keywords: post.tags.join(', ') }),
  }

  const t = escapeHtmlAttribute(title)
  const d = escapeHtmlAttribute(post.seo.description)

  return [
    `<title>${escapeHtmlText(title)}</title>`,
    `<meta name="description" content="${d}" />`,
    // `article`, not `website`: this is the one difference a social card
    // actually renders differently.
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${escapeHtmlAttribute(image)}" />`,
    `<meta property="article:published_time" content="${escapeHtmlAttribute(post.publishedAt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<script type="application/ld+json">${jsonLd(structured)}</script>`,
  ]
    .map((line) => '    ' + line)
    .join('\n')
}

/**
 * Everything that must be true of an emitted shell, checked before it is
 * written.
 *
 * The verifier is not belt-and-braces on top of the builder: the builder can
 * only guarantee what it wrote, and the shell is the builder's output PLUS
 * whatever Vite put in the document. `og:url` and `canonical` come from
 * `seoAssets`, and asset paths come from Vite's own injection — a `base` change
 * would break every shell and nothing else would notice.
 */
export function shellProblems(html: string, post: BlogPost, { origin }: ShellUrls): string[] {
  const problems: string[] = []
  const url = `${origin}/blog/${post.id}`

  const countOf = (pattern: RegExp): number => (html.match(pattern) ?? []).length

  const exactlyOne = (label: string, pattern: RegExp) => {
    const n = countOf(pattern)
    if (n !== 1) problems.push(`${label}: found ${n}, expected exactly 1`)
  }

  exactlyOne('<title>', /<title>/g)
  exactlyOne('meta description', /<meta name="description"/g)
  exactlyOne('canonical', /rel="canonical"/g)
  exactlyOne('og:url', /property="og:url"/g)
  exactlyOne('og:title', /property="og:title"/g)
  exactlyOne('og:description', /property="og:description"/g)
  // Satisfiable only because `BlogSeo.image` is resolved at ingest and is never
  // null (ogImage -> cover -> site default). Tolerating its absence here would
  // give the whole fallback chain nothing to be for.
  exactlyOne('og:image', /property="og:image"/g)

  if (!html.includes(`href="${url}"`)) problems.push(`canonical does not point at ${url}`)
  if (!html.includes(`content="${url}"`)) problems.push(`og:url does not point at ${url}`)

  // Crawlers resolve neither a relative og:image nor a relative canonical.
  for (const [label, re] of [
    ['og:image', /property="og:image" content="([^"]*)"/],
    ['canonical', /rel="canonical" href="([^"]*)"/],
  ] as const) {
    const value = re.exec(html)?.[1]
    if (value !== undefined && !/^https?:\/\//.test(value)) {
      problems.push(`${label} is not absolute: ${value}`)
    }
  }

  // The shell lives two directories down (`blog/<slug>/index.html`), so a
  // relative asset path would resolve to `/blog/<slug>/assets/…` and 404.
  for (const relative of html.match(/(?:src|href)="\.\/[^"]*"/g) ?? []) {
    problems.push(`asset reference is relative and would 404 from this depth: ${relative}`)
  }

  // The marker region must be gone: its presence means the replacement did not
  // happen and this shell still carries the index's generic copy.
  if (html.includes(SEO_START) || html.includes(SEO_END)) {
    problems.push('the seo markers survived, so the per-post head was not substituted')
  }

  const escapedTitle = escapeHtmlText(`${post.seo.title} — Vertigo`)
  if (!html.includes(`<title>${escapedTitle}</title>`)) {
    problems.push('the title is not this post’s')
  }

  return problems
}
