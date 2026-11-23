// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BlogRoute, { type BlogHost } from './BlogRoute'
import { BLOG_POSTS } from '../content/generated/blogPosts'
import { BLOG_INDEX_FALLBACK_TITLE, BLOG_NOT_FOUND_TITLE, postDocumentTitle, resetBlogIndexTitle } from './documentTitle'
import type { Route } from '../app/route'

// Accessibility audit 2026-11-18: B1, the tab title follows the route; B2, a
// new article opens at its top.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

const host: BlogHost = {
  exitToScene: vi.fn(),
  openPost: vi.fn(),
  returnToIndex: vi.fn(),
  replaceTopic: vi.fn(),
  rememberScroll: vi.fn(),
  storedScrollTop: null,
} as unknown as BlogHost

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  resetBlogIndexTitle()
  document.title = 'Vértigo Marketing® - Web oficial'
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

const show = (route: Route) => act(() => root.render(<BlogRoute route={route} host={host} />))
const [first, second] = BLOG_POSTS

describe('the blog tab title', () => {
  it('names each route and gives the scene its title back on the way out', () => {
    show({ name: 'blog-index', topic: null })
    expect(document.title).toBe(BLOG_INDEX_FALLBACK_TITLE)
    show({ name: 'blog-post', slug: first!.id })
    expect(document.title).toBe(postDocumentTitle(first!))
    show({ name: 'blog-post', slug: 'no-such-post' })
    expect(document.title).toBe(BLOG_NOT_FOUND_TITLE)
    show({ name: 'site' } as Route)
    expect(document.title).toBe('Vértigo Marketing® - Web oficial')
  })

  it('keeps the cold /blog shell title for the index when the first route is an article', () => {
    // vercel.json serves the index's shell for a slug without its own document.
    const link = document.createElement('link')
    link.rel = 'canonical'
    link.href = 'https://example.test/blog'
    document.head.append(link)
    document.title = 'Ideas — Vertigo'
    show({ name: 'blog-post', slug: 'no-such-post' })
    expect(document.title).toBe(BLOG_NOT_FOUND_TITLE)
    show({ name: 'blog-index', topic: null })
    expect(document.title).toBe('Ideas — Vertigo')
    link.remove()
  })

  it('puts the title back when the blog unmounts', () => {
    show({ name: 'blog-post', slug: first!.id })
    act(() => root.unmount())
    root = createRoot(container)
    expect(document.title).toBe('Vértigo Marketing® - Web oficial')
  })
})

describe('moving between articles', () => {
  it('opens the next article at its top', () => {
    show({ name: 'blog-post', slug: first!.id })
    const scroller = container.querySelector<HTMLElement>('.blog-root')!
    scroller.scrollTop = 8308
    show({ name: 'blog-post', slug: second!.id })
    expect(container.querySelector<HTMLElement>('.blog-root')!.scrollTop).toBe(0)
  })
})
