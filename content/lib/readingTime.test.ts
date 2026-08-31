import { describe, expect, it } from 'vitest'
import type { BlogBlock } from '../../src/content/types'
import { readingMinutes } from './readingTime'

const para = (text: string): BlogBlock => ({ kind: 'paragraph', spans: [{ text }] })
const words = (n: number): string => Array.from({ length: n }, (_, i) => 'palabra' + i).join(' ')

describe('readingMinutes', () => {
  it('never returns zero', () => {
    // A two-word post is short, not absent. A 0 in the byline reads as missing
    // data rather than as brevity, which is the whole reason for the floor.
    expect(readingMinutes([para('Dos palabras')])).toBe(1)
  })

  it('rounds to the nearest minute', () => {
    expect(readingMinutes([para(words(200))])).toBe(1)
    expect(readingMinutes([para(words(400))])).toBe(2)
    // 500 words is 2.5 minutes and rounds up, not down.
    expect(readingMinutes([para(words(500))])).toBe(3)
  })

  it('counts headings, quotes and list items as prose', () => {
    const body: BlogBlock[] = [
      { kind: 'heading', level: 2, spans: [{ text: words(100) }] },
      { kind: 'quote', spans: [{ text: words(100) }] },
      { kind: 'list', ordered: false, items: [[{ text: words(100) }], [{ text: words(100) }]] },
    ]
    expect(readingMinutes(body)).toBe(2)
  })

  it('sums every span in a block, not just the first', () => {
    // A paragraph containing a link is three spans, and counting only one of
    // them would silently under-report every post that has a link in it.
    const body: BlogBlock[] = [
      {
        kind: 'paragraph',
        spans: [
          { text: words(100) },
          { text: words(100), href: 'https://example.com' },
          { text: words(100) },
        ],
      },
    ]
    expect(readingMinutes(body)).toBe(2)
  })

  it('counts media as nothing', () => {
    const image = {
      src: 'https://cdn.sanity.io/images/x/y-800x600.webp',
      alt: 'a',
      width: 800,
      height: 600,
    }
    const body: BlogBlock[] = [
      para(words(400)),
      { kind: 'image', image },
      { kind: 'video', src: 'https://example.com/a.mp4' },
      { kind: 'embed', provider: 'youtube', url: 'https://www.youtube.com/watch?v=x' },
    ]
    // Identical to the 400-word paragraph alone: media takes a reader time, but
    // not time this function can estimate, and a per-image constant would make
    // the number look more precise while making it less true.
    expect(readingMinutes(body)).toBe(2)
  })

  it('is deterministic', () => {
    // emit.ts is built around byte-identical output for unchanged content.
    const body = [para(words(350))]
    expect(readingMinutes(body)).toBe(readingMinutes(body))
  })
})
