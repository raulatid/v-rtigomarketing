import { describe, expect, it } from 'vitest'
import type { BlogPost } from '../content/types'
import { filterPosts, foldForSearch, topicsOf } from './blogFilter'

const post = (over: Partial<BlogPost> = {}): BlogPost => ({
  id: 'x',
  title: 'Un título',
  excerpt: 'Una entradilla.',
  cover: null,
  publishedAt: '2026-08-01T00:00:00.000Z',
  tags: [],
  body: [],
  category: null,
  readingTime: 1,
  seo: { title: 'Un título', description: 'Una entradilla.', image: { src: '/og-default.png', alt: 'v', width: 1200, height: 630 } },
  ...over,
})

const analitica = { id: 'web-analysis', label: 'Analítica web', shortLabel: 'Analítica' }
const seo = { id: 'seo', label: 'SEO', shortLabel: 'SEO' }

describe('foldForSearch', () => {
  it('folds accents', () => {
    expect(foldForSearch('Analítica')).toBe('analitica')
    expect(foldForSearch('CAMPAÑAS')).toBe('campanas')
    expect(foldForSearch('así, más, según')).toBe('asi, mas, segun')
  })

  it('leaves unaccented text alone', () => {
    expect(foldForSearch('seo')).toBe('seo')
  })
})

describe('topicsOf', () => {
  it('lists each topic once, in the order the posts appear', () => {
    const topics = topicsOf([
      post({ id: 'a', category: analitica }),
      post({ id: 'b', category: seo }),
      post({ id: 'c', category: analitica }),
    ])
    expect([...topics]).toEqual([
      ['web-analysis', 'Analítica'],
      ['seo', 'SEO'],
    ])
  })

  it('skips posts with no topic, so no pill can filter to nothing', () => {
    expect(topicsOf([post({ category: null })]).size).toBe(0)
  })
})

describe('filterPosts', () => {
  const posts = [
    post({ id: 'a', title: 'Cómo medimos el SEO', category: seo, tags: ['seo', 'analitica'] }),
    post({ id: 'b', title: 'Una analítica sobre la que nadie actúa', category: analitica }),
    post({ id: 'c', title: 'La web como activo', category: null }),
  ]

  it('returns everything with no topic and no query', () => {
    expect(filterPosts(posts, null, '').map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('filters by topic', () => {
    expect(filterPosts(posts, 'seo', '').map((p) => p.id)).toEqual(['a'])
  })

  it('excludes uncategorised posts from every topic', () => {
    for (const topic of ['seo', 'web-analysis']) {
      expect(filterPosts(posts, topic, '').map((p) => p.id)).not.toContain('c')
    }
  })

  it('searches without accents', () => {
    // The whole reason foldForSearch exists: nobody types the accent.
    expect(filterPosts(posts, null, 'analitica').map((p) => p.id)).toEqual(['a', 'b'])
    expect(filterPosts(posts, null, 'Analítica').map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('searches the title, the excerpt, the topic label and the tags', () => {
    expect(filterPosts(posts, null, 'medimos').map((p) => p.id)).toEqual(['a'])
    expect(filterPosts(posts, null, 'entradilla').map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(filterPosts(posts, null, 'web').map((p) => p.id)).toEqual(['b', 'c'])
  })

  it('ignores surrounding whitespace', () => {
    expect(filterPosts(posts, null, '   ').map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(filterPosts(posts, null, '  seo  ').map((p) => p.id)).toEqual(['a'])
  })

  it('composes topic and query', () => {
    expect(filterPosts(posts, 'seo', 'medimos').map((p) => p.id)).toEqual(['a'])
    expect(filterPosts(posts, 'seo', 'analitica').map((p) => p.id)).toEqual(['a'])
    expect(filterPosts(posts, 'web-analysis', 'medimos')).toEqual([])
  })

  it('returns nothing rather than everything when nothing matches', () => {
    expect(filterPosts(posts, null, 'zzzznomatch')).toEqual([])
  })
})
