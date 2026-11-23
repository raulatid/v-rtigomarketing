import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PageSeo } from '../src/content/types'
import { SITE_SEO_FALLBACKS } from '../content/collections/siteSeo.collection'
import { HEADLINE_FALLBACKS } from '../content/collections/siteSettings.collection'
import { SITE_SETTINGS } from '../src/content/generated/siteSettings'
import { HomeHeadline } from '../src/components/HomeHeadline'
import { SEO_END, SEO_START, replaceRegion } from './blogShell'
import {
  HEADLINE_END,
  HEADLINE_START,
  NOSCRIPT_END,
  NOSCRIPT_START,
  noscriptRegion,
  replaceNoscript,
  blogIndexRegion,
  homeHeadline,
  pageHead,
  replaceFavicon,
  replaceHeadline,
} from './siteHead'

const ORIGIN = 'https://vertigo.example'
const CDN = 'https://cdn.sanity.io/images/p/production/abc-2400x1260.jpg'

const page = (over: Partial<PageSeo> = {}): PageSeo => ({
  title: 'Inicio',
  description: 'Descripción larga',
  shareDescription: 'Descripción corta',
  ...over,
})

/** The text between a document's seo markers, with formatting and comments ignored. */
function region(html: string): string {
  return normalize(html.slice(html.indexOf(SEO_START) + SEO_START.length, html.indexOf(SEO_END)))
}

function normalize(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').replace(/> </g, '><').trim()
}

describe('pageHead', () => {
  it('escapes CMS text in the title and in every attribute', () => {
    const head = pageHead(page({ title: 'A <b> & "c"', description: '"><script>x</script>' }), { origin: ORIGIN })
    expect(head).toContain('<title>A &lt;b&gt; &amp; "c"</title>')
    expect(head).toContain('content="A &lt;b&gt; &amp; &quot;c&quot;"')
    expect(head).not.toContain('<script>')
  })

  it('shares the share line, and describes with the description', () => {
    const head = pageHead(page(), { origin: ORIGIN })
    expect(head).toContain('<meta name="description" content="Descripción larga" />')
    expect(head).toContain('<meta property="og:description" content="Descripción corta" />')
    expect(head).toContain('<meta name="twitter:description" content="Descripción corta" />')
  })

  it('claims the small card and no og:image without an image', () => {
    const head = pageHead(page(), { origin: ORIGIN })
    expect(head).not.toContain('og:image')
    expect(head).toContain('<meta name="twitter:card" content="summary" />')
  })

  it('writes an absolute og:image and claims the large card with one', () => {
    const local = pageHead(page({ image: { src: '/og-default.png', alt: 'x', width: 1200, height: 630 } }), { origin: ORIGIN })
    expect(local).toContain(`<meta property="og:image" content="${ORIGIN}/og-default.png" />`)
    expect(local).toContain('content="summary_large_image"')

    const cdn = pageHead(page({ image: { src: CDN, alt: 'x', width: 2400, height: 1260 } }), { origin: ORIGIN })
    expect(cdn).toMatch(/og:image" content="https:\/\/cdn\.sanity\.io\/[^"]*w=1200&amp;h=630/)
  })
})

describe('the source documents', () => {
  // The dev server serves the source as written; the build writes the region
  // from SITE_SEO. With the CMS fields blank the two must be the same head.
  it('index.html carries exactly the home fallback', () => {
    expect(region(fs.readFileSync('index.html', 'utf8'))).toBe(
      normalize(pageHead(SITE_SEO_FALLBACKS.home, { origin: ORIGIN })),
    )
  })

  it('blog.html carries exactly the blog index fallback, image left relative', () => {
    const built = normalize(pageHead(SITE_SEO_FALLBACKS.blog, { origin: ORIGIN })).replace(ORIGIN, '')
    expect(region(fs.readFileSync('blog.html', 'utf8'))).toBe(built)
  })

  // The 404 document has no CMS head: a fixed title, noindex, and no markers
  // for the build to fill. siteHead() skips it by name for exactly that reason.
  it('404.html carries a fixed, unindexed head and no seo region', () => {
    const html = fs.readFileSync('404.html', 'utf8')
    expect(html).not.toContain(SEO_START)
    expect(html).toContain('<title>Página no encontrada — Vertigo</title>')
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />')
    expect(html).toContain('<meta name="theme-color" content="#050507" />')
    expect(html).toContain('<script type="module" src="/src/entries/not-found.tsx"></script>')
  })

  // The browser's chrome continues the blog's black header bar, not its paper.
  it('blog.html paints the browser chrome in the header bar black', () => {
    const html = fs.readFileSync('blog.html', 'utf8')
    expect(html).toContain('<meta name="theme-color" content="#0b0b0d" />')
  })
})

describe('the home page h1', () => {
  /** The h1's and the line's text, as a browser would read them. */
  const texts = (html: string) => {
    const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&')
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
    const p = html.match(/<p[^>]*>([\s\S]*?)<\/p>/)
    return { headline: decode(h1?.[1] ?? ''), subheadline: decode(p?.[1] ?? '') }
  }
  const headlineRegion = (html: string) =>
    normalize(html.slice(html.indexOf(HEADLINE_START) + HEADLINE_START.length, html.indexOf(HEADLINE_END)))

  // The dev server serves the source as written; the build writes the region
  // from SITE_SETTINGS. With the CMS fields blank the two must be the same h1.
  it('index.html carries exactly the fallback h1, inside #root', () => {
    const html = fs.readFileSync('index.html', 'utf8')
    expect(headlineRegion(html)).toBe(normalize(homeHeadline(HEADLINE_FALLBACKS)))
    const root = html.indexOf('<div id="root">')
    expect(root).toBeGreaterThan(0)
    expect(html.indexOf(HEADLINE_START)).toBeGreaterThan(root)
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
  })

  // React replaces the static copy on its first commit. A crawler reads one,
  // a screen reader the other, and they must say the same thing.
  it('React renders the same text the build writes into index.html', () => {
    const settings = SITE_SETTINGS[0]
    const built = texts(homeHeadline(settings))
    const rendered = texts(renderToStaticMarkup(createElement(HomeHeadline)))
    expect(rendered).toEqual(built)
    expect(rendered).toEqual({ headline: settings.headline, subheadline: settings.subheadline })
    expect(renderToStaticMarkup(createElement(HomeHeadline)).match(/<h1[\s>]/g)).toHaveLength(1)
  })

  it('escapes CMS text', () => {
    const html = homeHeadline({ headline: 'A <b> & c', subheadline: '</p><script>x</script>' })
    expect(html).toContain('<h1>A &lt;b&gt; &amp; c</h1>')
    expect(html).not.toContain('<script>')
  })

  it('fails the build rather than ship the fallback when the markers drift', () => {
    const region = homeHeadline(HEADLINE_FALLBACKS)
    expect(() => replaceHeadline('<div id="root"></div>', region, 'x')).toThrow(/missing/)
    const twice = HEADLINE_START + HEADLINE_END + HEADLINE_START + HEADLINE_END
    expect(() => replaceHeadline(twice, region, 'x')).toThrow(/more than once/)
    const built = replaceHeadline(fs.readFileSync('index.html', 'utf8'), homeHeadline({ headline: 'Nuevo', subheadline: 'Línea' }), 'index.html')
    expect(built).toContain('<h1>Nuevo</h1>')
    expect(built).not.toContain(HEADLINE_FALLBACKS.headline + '</h1>')
    expect(built).not.toContain(HEADLINE_START)
  })
})

describe('blogIndexRegion', () => {
  it('keeps the markers, so every post head can still be cut from the shell', () => {
    const shell = fs.readFileSync('blog.html', 'utf8')
    const once = replaceRegion(shell, blogIndexRegion(page({ title: 'Blog nuevo' }), { origin: ORIGIN }), 'test')
    expect(once).toContain('<title>Blog nuevo</title>')
    const post = replaceRegion(once, '<title>Post</title>', 'test')
    expect(post).toContain('<title>Post</title>')
    expect(post).not.toContain('Blog nuevo')
  })
})

describe('replaceFavicon', () => {
  const href = '/media/site/abc-512x512.png'

  it('swaps the source isotype for the uploaded PNG and its touch icon', () => {
    for (const file of ['index.html', 'blog.html', '404.html']) {
      const html = replaceFavicon(fs.readFileSync(file, 'utf8'), href, file)
      expect(html.match(/rel="icon"/g), file).toHaveLength(1)
      expect(html).toContain(`<link rel="icon" type="image/png" href="${href}" />`)
      expect(html).toContain(`<link rel="apple-touch-icon" href="${href}" />`)
      expect(html).not.toContain('data:image/svg+xml')
    }
  })

  it('fails the build rather than ship the old icon when the anchor drifts', () => {
    expect(() => replaceFavicon('<head></head>', href, 'x')).toThrow(/found 0/)
    const two = '<link rel="icon" href="a" /><link rel="icon" href="b" />'
    expect(() => replaceFavicon(two, href, 'x')).toThrow(/found 2/)
  })
})

// The blog's tab titles at runtime (src/blog/documentTitle.ts, accessibility
// audit 2026-11-18, B1) are the prerendered documents' own.
describe('the blog tab titles the runtime writes', () => {
  it('fall back to the index title the content fallback gives the blog shell', async () => {
    const { BLOG_INDEX_FALLBACK_TITLE } = await import('../src/blog/documentTitle')
    expect(BLOG_INDEX_FALLBACK_TITLE).toBe(SITE_SEO_FALLBACKS.blog.title)
  })

  it('title a post exactly as its prerendered document does', async () => {
    const { postDocumentTitle } = await import('../src/blog/documentTitle')
    const { postHead } = await import('./blogShell')
    const { BLOG_POSTS } = await import('../src/content/generated/blogPosts')
    for (const post of BLOG_POSTS) {
      const head = postHead(post, { origin: 'https://example.test' })
      const written = /<title>([^<]*)<\/title>/.exec(head)![1]!
      const decoded = written.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      expect(postDocumentTitle(post)).toBe(decoded)
    }
  })
})

// Accessibility audit 2026-11-18, G2: without JavaScript the body was empty.
describe('the body without JavaScript', () => {
  const between = (html: string) => {
    const start = html.indexOf(NOSCRIPT_START)
    const end = html.indexOf(NOSCRIPT_END)
    return html.slice(start + NOSCRIPT_START.length, end).trim()
  }

  it('is the same fallback block in index.html and blog.html', () => {
    for (const file of ['index.html', 'blog.html']) {
      const html = fs.readFileSync(file, 'utf8')
      expect(between(html), file).toBe(noscriptRegion([]).trim())
    }
  })

  it('links the blog and every post by title, escaped', () => {
    const region = noscriptRegion([
      { id: 'uno', title: 'Uno' },
      { id: 'dos', title: 'Medir <el> SEO & más' },
    ])
    expect(region).toContain('<noscript>')
    expect(region).toContain('href="/blog"')
    expect(region).toContain('href="/blog/uno">Uno</a>')
    expect(region).toContain('href="/blog/dos">Medir &lt;el&gt; SEO &amp; más</a>')
  })

  it('replaces the marked block exactly once, markers included', () => {
    const html = fs.readFileSync('index.html', 'utf8')
    const out = replaceNoscript(html, noscriptRegion([{ id: 'uno', title: 'Uno' }]), 'index.html')
    expect(out).not.toContain(NOSCRIPT_START)
    expect(out).toContain('href="/blog/uno"')
    expect(() => replaceNoscript(out, 'x', 'twice')).toThrow(/noscript markers/)
  })
})
