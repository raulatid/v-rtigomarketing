import { describe, expect, it } from 'vitest'
import { SITE, TOPIC_PARAM, parseRoute, routeToPath } from './route'

describe('parseRoute', () => {
  it('reads the site for everything that is not the blog', () => {
    for (const path of ['/', '', '/debug', '/debug/', '/casos', '/blogs', '/blogx']) {
      expect(parseRoute(path, ''), path).toEqual(SITE)
    }
  })

  it('reads the blog index, with or without a trailing slash', () => {
    for (const path of ['/blog', '/blog/', '/blog//']) {
      expect(parseRoute(path, ''), path).toEqual({ name: 'blog-index', topic: null })
    }
  })

  it('reads a post slug', () => {
    expect(parseRoute('/blog/como-medimos-el-seo', '')).toEqual({
      name: 'blog-post',
      slug: 'como-medimos-el-seo',
    })
    expect(parseRoute('/blog/como-medimos-el-seo/', '')).toEqual({
      name: 'blog-post',
      slug: 'como-medimos-el-seo',
    })
  })

  it('refuses a slug that would not survive being a url segment', () => {
    // Same alphabet every content id uses. A slug is a url segment and a filter
    // key, so anything else is not a post that exists.
    for (const slug of ['Con-Mayúsculas', 'con espacio', '-empieza-con-guion', 'a'.repeat(65)]) {
      expect(parseRoute('/blog/' + slug, ''), slug).toEqual(SITE)
    }
  })

  it('accepts a slug at the length limit and refuses one past it', () => {
    expect(parseRoute('/blog/' + 'a'.repeat(64), '')).toEqual({
      name: 'blog-post',
      slug: 'a'.repeat(64),
    })
    expect(parseRoute('/blog/' + 'a'.repeat(65), '')).toEqual(SITE)
  })

  it('is not a nested route', () => {
    // There is no such thing as a post two levels deep, so this must not render
    // an article for `a`.
    expect(parseRoute('/blog/a/b', '')).toEqual(SITE)
  })

  it('reads the topic from the search string', () => {
    expect(parseRoute('/blog', '?tema=web-analysis')).toEqual({
      name: 'blog-index',
      topic: 'web-analysis',
    })
  })

  it('fails a malformed topic safely to no filter', () => {
    // A query parameter is the least trustworthy input a page takes, and the
    // useful failure is "all topics", never an error page.
    for (const raw of ['Con Mayúsculas', '', '../etc', 'a'.repeat(65), '<script>']) {
      expect(parseRoute('/blog', '?tema=' + encodeURIComponent(raw)), raw).toEqual({
        name: 'blog-index',
        topic: null,
      })
    }
  })

  it('ignores parameters that are not the topic', () => {
    expect(parseRoute('/blog', '?holo=1&stats=1')).toEqual({ name: 'blog-index', topic: null })
  })

  it('is syntax only, and says nothing about whether the topic exists', () => {
    // A well-formed topic naming nothing real is still a valid parse. Deciding
    // it names a real category needs the generated content, which cannot be
    // imported here without putting the dataset in the app entry.
    expect(parseRoute('/blog', '?tema=no-existe')).toEqual({
      name: 'blog-index',
      topic: 'no-existe',
    })
  })
})

describe('routeToPath', () => {
  it('round-trips every route', () => {
    const routes = [
      SITE,
      { name: 'blog-index', topic: null } as const,
      { name: 'blog-index', topic: 'seo' } as const,
      { name: 'blog-post', slug: 'como-medimos-el-seo' } as const,
    ]
    for (const route of routes) {
      const path = routeToPath(route)
      const [pathname, search] = path.split('?')
      expect(parseRoute(pathname, search === undefined ? '' : '?' + search), path).toEqual(route)
    }
  })

  it('uses the Spanish parameter name a visitor sees', () => {
    expect(TOPIC_PARAM).toBe('tema')
    expect(routeToPath({ name: 'blog-index', topic: 'seo' })).toBe('/blog?tema=seo')
  })

  it('carries no scene or debug parameter into a blog url', () => {
    // The previous history entry still holds the scene URL with its flags, and
    // history.back() restores it verbatim. Copying them forward would put debug
    // flags into article URLs that get shared.
    for (const route of [
      { name: 'blog-index', topic: null } as const,
      { name: 'blog-index', topic: 'seo' } as const,
      { name: 'blog-post', slug: 'x' } as const,
    ]) {
      const path = routeToPath(route)
      expect(path, path).not.toMatch(/holo|pinch|stats|debugNavigation/)
    }
  })
})
