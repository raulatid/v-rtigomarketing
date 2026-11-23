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

// Accessibility audit 2026-11-18, G1: internal links are real links, and a
// plain click still opens the page in place.
describe('links between blog pages', () => {
  it('makes every card and Anterior/Siguiente a link to its post', () => {
    show({ name: 'blog-post', slug: second!.id })
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('.blog-prevnext a, .blog-related a'))
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link.getAttribute('href')).toMatch(/^\/blog(\/[\w-]+)?$/)
    show({ name: 'blog-index', topic: null })
    const cards = Array.from(container.querySelectorAll<HTMLAnchorElement>('.blog-card'))
    expect(cards.map((card) => card.tagName)).toEqual(cards.map(() => 'A'))
    expect(cards.map((card) => card.getAttribute('href'))).toEqual(
      expect.arrayContaining(BLOG_POSTS.map((post) => `/blog/${post.id}`)),
    )
  })

  it('opens a post in place on a plain click and leaves a modified one to the browser', () => {
    show({ name: 'blog-index', topic: null })
    const card = container.querySelector<HTMLAnchorElement>('.blog-card')!
    const plain = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    act(() => {
      card.dispatchEvent(plain)
    })
    expect(plain.defaultPrevented).toBe(true)
    expect(host.openPost).toHaveBeenCalledTimes(1)
    const withMeta = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true })
    act(() => {
      card.dispatchEvent(withMeta)
    })
    expect(withMeta.defaultPrevented).toBe(false)
    expect(host.openPost).toHaveBeenCalledTimes(1)
  })
})

// Accessibility audit 2026-11-18: B6, D7 and B4.
describe('where the focus lands in the blog', () => {
  it('lands on the card of the article the reader came back from (B6)', () => {
    show({ name: 'blog-post', slug: second!.id })
    show({ name: 'blog-index', topic: null })
    expect(document.activeElement?.getAttribute('href')).toBe(`/blog/${second!.id}`)
  })

  it('gives the focus back to the scene’s Blog link when a warm blog closes (D7)', async () => {
    const scene = document.body.appendChild(document.createElement('div'))
    scene.className = 'app__scene'
    scene.innerHTML = '<a class="scene-shortcut" data-shortcut="blog" href="/blog">Blog</a>'
    try {
      show({ name: 'blog-index', topic: null })
      act(() => root.unmount())
      ;(document.activeElement as HTMLElement | null)?.blur()
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      expect(document.activeElement?.textContent).toBe('Blog')
    } finally {
      root = createRoot(container)
      scene.remove()
    }
  })

  it('scrolls the reading area with the page keys while the focus is outside it (B4)', () => {
    show({ name: 'blog-post', slug: first!.id })
    const scroller = container.querySelector<HTMLElement>('.blog-root')!
    const scrollBy = vi.fn()
    scroller.scrollBy = scrollBy as unknown as typeof scroller.scrollBy
    ;(document.activeElement as HTMLElement | null)?.blur()
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }))
    })
    expect(scrollBy).toHaveBeenCalledTimes(1)
    // Inside the reading area the browser scrolls it itself.
    act(() => {
      scroller.querySelector('h1')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }))
    })
    expect(scrollBy).toHaveBeenCalledTimes(1)
  })
})
