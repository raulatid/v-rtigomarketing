// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { BLOG_INDEX_FALLBACK_TITLE, blogIndexTitle, resetBlogIndexTitle } from './documentTitle'

// The index's tab title comes from the CMS through the prerendered /blog
// document, when this document is that one (B1).

afterEach(() => {
  resetBlogIndexTitle()
  document.head.replaceChildren()
})

const canonical = (href: string) => {
  const link = document.createElement('link')
  link.rel = 'canonical'
  link.href = href
  document.head.append(link)
}

describe('the blog index title', () => {
  it('is the cold /blog document’s own title', () => {
    canonical('https://example.test/blog')
    document.title = 'Ideas — Vertigo'
    expect(blogIndexTitle()).toBe('Ideas — Vertigo')
    document.title = 'something else later'
    expect(blogIndexTitle()).toBe('Ideas — Vertigo')
  })

  it('falls back on any other document: the scene, or a cold article', () => {
    canonical('https://example.test/')
    document.title = 'Vértigo Marketing® - Web oficial'
    expect(blogIndexTitle()).toBe(BLOG_INDEX_FALLBACK_TITLE)
    resetBlogIndexTitle()
    document.head.replaceChildren()
    canonical('https://example.test/blog/diferencias-seo-y-geo')
    expect(blogIndexTitle()).toBe(BLOG_INDEX_FALLBACK_TITLE)
  })

  it('falls back with no canonical at all, wherever the url already is', () => {
    // A warm session has already pushed /blog when the blog mounts; an empty
    // href would resolve to it and take the scene's title for the index's.
    window.history.pushState(null, '', '/blog')
    document.title = 'Vertigo — Marketing que se mide'
    expect(blogIndexTitle()).toBe(BLOG_INDEX_FALLBACK_TITLE)
    window.history.pushState(null, '', '/')
  })
})
