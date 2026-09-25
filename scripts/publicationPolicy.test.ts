import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { BlogPost } from '../src/content/types'
import { parseRoute, routeToPath } from '../src/app/route'
import { SEO_START, SEO_END } from './blogShell'
import {
  blogDocuments, blogRewrite, blogTreeProblems, documentCanonical, isBlogDocument, isNotFoundDocument, seoFiles,
} from './publicationPolicy'

const origin = 'https://vertigo.example'
const post: BlogPost = {
  id: 'measuring-seo', title: 'Measuring SEO', excerpt: 'A summary.', cover: null,
  publishedAt: '2026-08-18T09:00:00.000Z', tags: ['seo'], body: [],
  category: { id: 'seo', label: 'SEO', shortLabel: 'SEO' }, readingTime: 4,
  seo: { title: 'Measuring SEO', description: 'A summary.',
    image: { src: '/og-default.png', alt: 'Vertigo', width: 1200, height: 630 } },
}
const shell = [
  '<!doctype html><html><head>', SEO_START, '<title>Blog — Vertigo</title>', SEO_END,
  `<link rel="canonical" href="${origin}/blog">`,
  `<meta property="og:url" content="${origin}/blog">`,
  '<script type="module" src="/assets/blog-test.js"></script>',
  '</head><body><div id="root"></div></body></html>',
].join('\n')

describe('publication documents', () => {
  it('publishes the index first and a verified head for each post, retaining the app shell', () => {
    const documents = blogDocuments(shell, [post], origin)
    expect(documents.map((file) => file.fileName)).toEqual(['blog/index.html', 'blog/measuring-seo/index.html'])
    expect(documents[0].source).toBe(shell)
    const article = documents[1].source
    expect(article).toContain(`<link rel="canonical" href="${origin}/blog/measuring-seo">`)
    expect(article).toContain('<title>Measuring SEO — Vertigo</title>')
    expect(article).toContain('<script type="module" src="/assets/blog-test.js"></script>')
    expect(article).not.toContain(SEO_START)
  })

  it.each(['..', '../escape', 'a/b', '%2e%2e', 'a\\b', ''])('refuses unsafe output id %j', (id) => {
    expect(() => blogDocuments(shell, [{ ...post, id }], origin)).toThrow('invalid or duplicate')
  })

  it('refuses duplicate documents and drifted replacement anchors', () => {
    expect(() => blogDocuments(shell, [post, post], origin)).toThrow('duplicate')
    expect(() => blogDocuments(shell.replace('rel="canonical"', 'rel="alternate"'), [post], origin))
      .toThrow('expected exactly one match')
    expect(() => blogDocuments(shell.replace('src="/assets/', 'src="./assets/'), [post], origin))
      .toThrow('asset reference is relative')
  })

  it('detects stale and missing directories, including an empty collection', () => {
    expect(blogTreeProblems([post], [post.id])).toEqual([])
    expect(blogTreeProblems([post], ['retired'])).toEqual([
      'emitted tree does not match the posts — orphans: [retired], missing: [measuring-seo]',
    ])
    expect(blogTreeProblems([], ['retired'])).toHaveLength(1)
    expect(blogDocuments(shell, [], origin)).toEqual([{ fileName: 'blog/index.html', source: shell }])
  })

  it('tells the three documents apart by name', () => {
    expect(isNotFoundDocument('/404.html')).toBe(true)
    expect(isNotFoundDocument('404.html')).toBe(true)
    expect(isNotFoundDocument('blog.html')).toBe(false)
    expect(isNotFoundDocument('/index.html')).toBe(false)
    expect(isBlogDocument('404.html')).toBe(false)
  })

  it('uses the production origin for both entry canonicals', () => {
    expect(documentCanonical('/index.html', origin)).toBe(origin + '/')
    expect(documentCanonical('/blog.html', origin)).toBe(origin + '/blog')
    expect(documentCanonical('blog.html', origin)).toBe(origin + '/blog')
  })

  it('publishes production robots and stable publication dates in the sitemap', () => {
    expect(seoFiles([post], { origin, production: true })).toEqual([
      { fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nDisallow: /debug\n\nSitemap: ${origin}/sitemap.xml\n` },
      { fileName: 'sitemap.xml', source: '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        `  <url><loc>${origin}/</loc></url>\n  <url><loc>${origin}/blog</loc></url>\n` +
        `  <url><loc>${origin}/blog/measuring-seo</loc><lastmod>2026-08-18</lastmod></url>\n</urlset>\n` },
    ])
    expect(seoFiles([post], { origin, production: false })).toEqual([
      { fileName: 'robots.txt', source: 'User-agent: *\nDisallow: /\n' },
    ])
  })
})

describe('hosting, emitted documents and browser route contract', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as {
    rewrites: { source: string; destination: string }[]
  }
  const documents = new Set(blogDocuments(shell, [post], origin).map((file) => file.fileName))

  it('retains both single-segment blog fallbacks in the deployment configuration', () => {
    expect(config.rewrites.filter((rule) => rule.source.startsWith('/blog'))).toEqual([
      { source: '/blog', destination: '/blog.html' },
      { source: '/blog/:slug', destination: '/blog.html' },
    ])
  })

  it.each([
    ['/blog', '/blog/index.html', 'blog-index'],
    ['/blog/?tema=seo', '/blog/index.html', 'blog-index'],
    ['/blog/measuring-seo', '/blog/measuring-seo/index.html', 'blog-post'],
    ['/blog/measuring-seo/?ignored=1', '/blog/measuring-seo/index.html', 'blog-post'],
    ['/blog/unknown-slug', '/blog.html', 'blog-post'],
    ['/blog/%6deasuring-seo', '/blog.html', 'site'],
    ['/blog/a%2Fb', '/blog.html', 'site'],
    ['/blog/%', '/blog.html', 'site'],
  ])('resolves %s consistently with the raw browser path', (url, expected, routeName) => {
    expect(blogRewrite(url, (file) => documents.has(file))).toBe(expected)
    expect(blogRewrite(url, () => false)).toBe('/blog.html')
    const [pathname, query = ''] = url.split('?')
    const route = parseRoute(pathname, query)
    expect(route.name).toBe(routeName)
    if (route.name === 'blog-post' && route.slug === post.id) {
      expect(documents.has(routeToPath(route).slice(1) + '/index.html')).toBe(true)
    }
    // The cold blog intentionally renders its index for malformed route syntax.
    // Encoding is not decoded by the middleware or by the browser router.
  })

  it.each(['/blog/..', '/blog/%2e%2e', '/blog/a\\b'])('never turns %s into a filesystem lookup', (url) => {
    const hasFile = vi.fn(() => true)
    expect(blogRewrite(url, hasFile)).toBe('/blog.html')
    expect(hasFile).not.toHaveBeenCalled()
  })

  it.each([undefined, '/', '/api/audit', '/blog.html', '/blog/a/b'])('leaves unrelated request %s to the next handler', (url) => {
    expect(blogRewrite(url, () => true)).toBeNull()
  })
})
