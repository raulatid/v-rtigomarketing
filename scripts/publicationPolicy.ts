import type { BlogPost } from '../src/content/types'
import { ID_PATTERN } from '../src/content/editorialBounds'
import { postHead, replaceExactlyOnce, replaceRegion, shellProblems } from './blogShell'

/** Build inputs only: this module reads no environment, filesystem or bundler. */
export interface PublicationOptions {
  readonly origin: string
  readonly production: boolean
}

export interface PublishedFile {
  readonly fileName: string
  readonly source: string
}

export function isBlogDocument(path: string): boolean {
  return path.replace(/^\//, '') === 'blog.html'
}

export function documentCanonical(path: string, origin: string): string {
  return `${origin}${isBlogDocument(path) ? '/blog' : '/'}`
}

export function seoFiles(posts: readonly BlogPost[], options: PublicationOptions): PublishedFile[] {
  const { origin, production } = options
  const robots = production
    ? ['User-agent: *', 'Allow: /', '', 'Disallow: /debug', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n')
    : ['User-agent: *', 'Disallow: /', ''].join('\n')
  const files = [{ fileName: 'robots.txt', source: robots }]
  if (production) {
    const urls = [
      `  <url><loc>${origin}/</loc></url>`,
      `  <url><loc>${origin}/blog</loc></url>`,
      ...posts.map((post) => `  <url><loc>${origin}/blog/${post.id}</loc>` +
        `<lastmod>${post.publishedAt.slice(0, 10)}</lastmod></url>`),
    ]
    files.push({
      fileName: 'sitemap.xml',
      source: '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.join('\n') + '\n</urlset>\n',
    })
  }
  return files
}

/** Validate every document before the adapter writes any of them. */
export function blogDocuments(shell: string, posts: readonly BlogPost[], origin: string): PublishedFile[] {
  const files = [{ fileName: 'blog/index.html', source: shell }]
  const ids = new Set<string>()
  for (const post of posts) {
    if (!ID_PATTERN.test(post.id) || ids.has(post.id)) {
      throw new Error(`[blog shells] invalid or duplicate post id: ${post.id}`)
    }
    ids.add(post.id)
    const url = `${origin}/blog/${post.id}`
    let html = replaceRegion(shell, postHead(post, { origin }), post.id)
    html = replaceExactlyOnce(html, `<link rel="canonical" href="${origin}/blog">`,
      `<link rel="canonical" href="${url}">`, `${post.id} canonical`)
    html = replaceExactlyOnce(html, `<meta property="og:url" content="${origin}/blog">`,
      `<meta property="og:url" content="${url}">`, `${post.id} og:url`)
    const problems = shellProblems(html, post, { origin })
    if (problems.length) {
      throw new Error(`[blog shells] ${post.id} failed verification:\n  - ${problems.join('\n  - ')}`)
    }
    files.push({ fileName: `blog/${post.id}/index.html`, source: html })
  }
  return files
}

/** Compare the observed output with the publication plan in both directions. */
export function blogTreeProblems(posts: readonly Pick<BlogPost, 'id'>[], directories: readonly string[]): string[] {
  const expected = new Set(posts.map((post) => post.id))
  const orphans = directories.filter((name) => !expected.has(name))
  const missing = [...expected].filter((id) => !directories.includes(id))
  return orphans.length || missing.length
    ? [`emitted tree does not match the posts — orphans: [${orphans.join(', ')}], missing: [${missing.join(', ')}]`]
    : []
}

/**
 * Match the existing single-segment hosting rewrite, retaining raw encoding.
 * Only authored slug syntax can become a filesystem candidate. Unknown or
 * encoded slugs use the blog fallback; decoding here would disagree with the
 * browser router and could turn an encoded separator into a filesystem path.
 */
export function blogRewrite(url: string | undefined, hasFile: (fileName: string) => boolean): string | null {
  if (url === undefined) return null
  const clean = url.split('?')[0].replace(/\/+$/, '')
  if (clean !== '/blog' && !/^\/blog\/[^/]+$/.test(clean)) return null
  const slug = clean.slice('/blog/'.length)
  const fileName = clean === '/blog' ? 'blog/index.html'
    : ID_PATTERN.test(slug) ? `blog/${slug}/index.html` : null
  if (fileName !== null && hasFile(fileName)) return `/${fileName}`
  return '/blog.html'
}
