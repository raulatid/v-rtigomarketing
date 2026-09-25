import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { PageSeo } from '../src/content/types'
import { SITE_SEO_FALLBACKS } from '../content/collections/siteSeo.collection'
import { SEO_END, SEO_START, replaceRegion } from './blogShell'
import { blogIndexRegion, pageHead, replaceFavicon } from './siteHead'

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
