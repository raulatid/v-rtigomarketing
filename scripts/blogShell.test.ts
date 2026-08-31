import { describe, expect, it } from 'vitest'
import type { BlogPost } from '../src/content/types'
import {
  SEO_END,
  SEO_START,
  escapeHtmlAttribute,
  escapeHtmlText,
  postHead,
  replaceExactlyOnce,
  replaceRegion,
  shellProblems,
} from './blogShell'

const ORIGIN = 'https://vertigo.example'
const urls = { origin: ORIGIN }

const post = (over: Partial<BlogPost> = {}): BlogPost => ({
  id: 'como-medimos-el-seo',
  title: 'Cómo medimos el SEO',
  excerpt: 'Una entradilla.',
  cover: null,
  publishedAt: '2026-08-18T09:00:00.000Z',
  tags: ['seo'],
  body: [],
  category: { id: 'seo', label: 'SEO', shortLabel: 'SEO' },
  readingTime: 4,
  seo: {
    title: 'Cómo medimos el SEO',
    description: 'Una entradilla.',
    image: { src: '/og-default.png', alt: 'Vértigo', width: 1200, height: 630 },
  },
  ...over,
})

/** A minimal document shaped like the one Vite emits. */
const shellFor = (p: BlogPost): string =>
  [
    '<!doctype html><html lang="es"><head>',
    SEO_START,
    '<title>Blog — Vertigo</title>',
    SEO_END,
    `<link rel="canonical" href="${ORIGIN}/blog">`,
    `<meta property="og:url" content="${ORIGIN}/blog">`,
    '<script type="module" src="/assets/blog-abc.js"></script>',
    '</head><body><div id="root"></div></body></html>',
  ]
    .join('\n')
    .replace(SEO_START + '\n<title>Blog — Vertigo</title>\n' + SEO_END, () =>
      postHead(p, urls),
    )
    .replace(`href="${ORIGIN}/blog"`, `href="${ORIGIN}/blog/${p.id}"`)
    .replace(`content="${ORIGIN}/blog"`, `content="${ORIGIN}/blog/${p.id}"`)

describe('escaping', () => {
  it('escapes a text node', () => {
    expect(escapeHtmlText('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d')
  })

  it('escapes quotes in an attribute, which the text escaper does not', () => {
    // The reason these are two functions: an unescaped double quote closes the
    // attribute early and everything after it becomes markup.
    expect(escapeHtmlAttribute('say "hi"')).toBe('say &quot;hi&quot;')
    expect(escapeHtmlText('say "hi"')).toBe('say "hi"')
  })

  it('escapes the ampersand first, so nothing is double-escaped', () => {
    expect(escapeHtmlAttribute('&lt;')).toBe('&amp;lt;')
  })

  it('survives a title that is trying to be markup', () => {
    const hostile = '"><script>alert(1)</script>'
    const head = postHead(post({ seo: { ...post().seo, title: hostile } }), urls)
    expect(head).not.toContain('<script>alert(1)')
    expect(head).toContain('&quot;&gt;&lt;script&gt;')
  })

  it('escapes < inside the JSON-LD block', () => {
    // A description containing the literal text </script> would otherwise close
    // the block early and turn the rest of the document into markup.
    const head = postHead(
      post({ seo: { ...post().seo, description: 'cierra </script> aquí' } }),
      urls,
    )
    const ld = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(head)?.[1] ?? ''
    expect(ld).not.toContain('</script>')
    expect(ld).toContain('\\u003c/script')
  })
})

describe('replaceExactlyOnce', () => {
  it('replaces a single match', () => {
    expect(replaceExactlyOnce('a b c', 'b', 'X', 'test')).toBe('a X c')
  })

  it('throws when the needle is missing', () => {
    // The whole point: a best-effort replace silently emits a shell carrying
    // the wrong metadata, and it looks completely fine.
    expect(() => replaceExactlyOnce('a c', 'b', 'X', 'test')).toThrow(/found 0/)
  })

  it('throws when the needle appears more than once', () => {
    expect(() => replaceExactlyOnce('a b b', 'b', 'X', 'test')).toThrow(/found 2/)
  })
})

describe('replaceRegion', () => {
  const doc = `A${SEO_START}old${SEO_END}B`

  it('replaces the markers and everything between them', () => {
    expect(replaceRegion(doc, 'NEW', 'x')).toBe('ANEWB')
  })

  it('throws when a marker is missing', () => {
    expect(() => replaceRegion('A B', 'NEW', 'x')).toThrow(/markers are missing/)
  })

  it('throws when the markers are out of order', () => {
    expect(() => replaceRegion(`A${SEO_END}x${SEO_START}B`, 'NEW', 'x')).toThrow(/out of order/)
  })

  it('throws when a marker appears twice', () => {
    expect(() => replaceRegion(`${doc}${SEO_START}`, 'NEW', 'x')).toThrow(/more than once/)
  })
})

describe('postHead', () => {
  it('declares the article type rather than website', () => {
    expect(postHead(post(), urls)).toContain('property="og:type" content="article"')
  })

  it('always emits an og:image, made absolute', () => {
    // Satisfiable only because BlogSeo.image is resolved at ingest and is never
    // null. The default is a local path and must come out absolute.
    expect(postHead(post(), urls)).toContain(`content="${ORIGIN}/og-default.png"`)
  })

  it('carries the publication date', () => {
    expect(postHead(post(), urls)).toContain('article:published_time" content="2026-08-18')
  })
})

describe('shellProblems', () => {
  it('passes a well-formed shell', () => {
    const p = post()
    expect(shellProblems(shellFor(p), p, urls)).toEqual([])
  })

  it('catches a shell whose markers survived', () => {
    // The exact failure mode this exists for: the replacement did not happen,
    // so the shell still carries the index's generic copy and looks fine.
    const p = post()
    const broken = `${SEO_START}<title>Blog — Vertigo</title>${SEO_END}` + shellFor(p)
    expect(shellProblems(broken, p, urls).join(' ')).toMatch(/markers survived/)
  })

  it('catches a canonical still pointing at the index', () => {
    const p = post()
    // Targeted at the canonical TAG, not at the url string: the same url also
    // appears inside the JSON-LD, earlier in the document, so a plain string
    // replace corrupts that instead and the canonical stays correct.
    const broken = shellFor(p).replace(
      /<link rel="canonical" href="[^"]*">/,
      `<link rel="canonical" href="${ORIGIN}/blog">`,
    )
    expect(shellProblems(broken, p, urls).join(' ')).toMatch(/canonical does not point/)
  })

  it('catches a relative og:image', () => {
    const p = post()
    const broken = shellFor(p).replace(/property="og:image" content="[^"]*"/, 'property="og:image" content="/x.png"')
    expect(shellProblems(broken, p, urls).join(' ')).toMatch(/og:image is not absolute/)
  })

  it('catches a duplicated tag', () => {
    const p = post()
    const broken = shellFor(p).replace('<title>', '<title></title><title>')
    expect(shellProblems(broken, p, urls).join(' ')).toMatch(/<title>: found 2/)
  })

  it('catches a missing og:image', () => {
    const p = post()
    const broken = shellFor(p).replace(/<meta property="og:image"[^>]*>/, '')
    expect(shellProblems(broken, p, urls).join(' ')).toMatch(/og:image: found 0/)
  })

  it('catches a relative asset path, which would 404 from this depth', () => {
    // The shell lives at blog/<slug>/index.html, so ./assets/x.js resolves to
    // /blog/<slug>/assets/x.js. A `base` change would break every shell and
    // nothing else would notice.
    const p = post()
    const broken = shellFor(p).replace('src="/assets/blog-abc.js"', 'src="./assets/blog-abc.js"')
    expect(shellProblems(broken, p, urls).join(' ')).toMatch(/relative and would 404/)
  })

  it('catches a shell built for a different post', () => {
    const mine = post()
    const other = post({ id: 'otro', seo: { ...post().seo, title: 'Otro título' } })
    expect(shellProblems(shellFor(other), mine, urls).length).toBeGreaterThan(0)
  })
})
