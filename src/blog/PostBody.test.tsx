import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlogBlock, ImageMedia } from '../content/types'
import { PostBody } from './PostBody'

const image: ImageMedia = {
  src: 'https://cdn.sanity.io/images/p/d/abc-1600x900.jpg',
  alt: 'un gráfico de sesiones',
  width: 1600,
  height: 900,
  caption: 'Sesiones frente a ingresos.',
}

const html = (body: BlogBlock[]): string => renderToStaticMarkup(<PostBody body={body} />)

describe('PostBody renders every block kind', () => {
  it('paragraph', () => {
    expect(html([{ kind: 'paragraph', spans: [{ text: 'Hola' }] }])).toContain('<p class="blog-body__p"')
  })

  it('heading, at its real level', () => {
    // The article's own title is the h1, so a level-2 heading is genuinely an
    // h2 — unlike LegalPanel, where the panel owns the h2 and headings shift.
    expect(html([{ kind: 'heading', level: 2, spans: [{ text: 'T' }] }])).toContain('<h2')
    expect(html([{ kind: 'heading', level: 3, spans: [{ text: 'T' }] }])).toContain('<h3')
  })

  it('both kinds of list, as real lists', () => {
    const items = [[{ text: 'uno' }], [{ text: 'dos' }]]
    const bullets = html([{ kind: 'list', ordered: false, items }])
    expect(bullets).toContain('<ul')
    expect(bullets.match(/<li>/g)).toHaveLength(2)
    expect(html([{ kind: 'list', ordered: true, items }])).toContain('<ol')
    // The artboards draw the bullet as a positioned <span>; that is a design-tool
    // artifact and must not reach the markup, or a screen reader reads the dot.
    expect(bullets).not.toContain('<span></span>')
  })

  it('quote', () => {
    expect(html([{ kind: 'quote', spans: [{ text: 'Cita' }] }])).toContain('<blockquote')
  })

  it('image, with its caption and its dimensions', () => {
    const out = html([{ kind: 'image', image }])
    expect(out).toContain('<figure')
    expect(out).toContain('alt="un gráfico de sesiones"')
    expect(out).toContain('width="1600"')
    expect(out).toContain('height="900"')
    expect(out).toContain('<figcaption')
    expect(out).toContain('Sesiones frente a ingresos.')
  })

  it('image without a caption renders no figcaption', () => {
    // A caption is not a second alt; an empty one would be a visible gap.
    const { caption: _drop, ...noCaption } = image
    expect(html([{ kind: 'image', image: noCaption }])).not.toContain('<figcaption')
  })

  it('video and embed, as link cards', () => {
    const out = html([
      { kind: 'video', src: 'https://example.com/a.mp4' },
      { kind: 'embed', provider: 'youtube', url: 'https://www.youtube.com/watch?v=abc' },
    ])
    expect(out).toContain('https://example.com/a.mp4')
    expect(out).toContain('youtube.com')
    expect(out).toContain('rel="noreferrer noopener"')
  })
})

describe('the security posture is asserted, not assumed', () => {
  const everything: BlogBlock[] = [
    { kind: 'paragraph', spans: [{ text: 'a', href: 'https://example.com' }] },
    { kind: 'heading', level: 2, spans: [{ text: 'b' }] },
    { kind: 'list', ordered: false, items: [[{ text: 'c' }]] },
    { kind: 'quote', spans: [{ text: 'd' }] },
    { kind: 'image', image },
    { kind: 'video', src: 'https://example.com/a.mp4' },
    { kind: 'embed', provider: 'vimeo', url: 'https://vimeo.com/123' },
  ]

  it('emits no iframe, so frame-src stays absent from the CSP', () => {
    expect(html(everything)).not.toContain('<iframe')
  })

  it('emits no video element, so media-src stays none', () => {
    expect(html(everything)).not.toContain('<video')
  })

  it('puts rel on every outbound link', () => {
    const out = html(everything)
    for (const anchor of out.match(/<a [^>]*>/g) ?? []) {
      expect(anchor, anchor).toContain('rel="noreferrer')
    }
  })

  it('renders marks as elements rather than as markup from the CMS', () => {
    const out = html([
      { kind: 'paragraph', spans: [{ text: 'x', marks: ['strong'] }, { text: 'y', marks: ['em'] }] },
    ])
    expect(out).toContain('<strong>')
    expect(out).toContain('<em>')
  })

  it('escapes text that looks like markup', () => {
    // Ingestion already rejects HTML, and this is the second half of the same
    // claim: nothing here is ever inserted as markup.
    const out = html([{ kind: 'paragraph', spans: [{ text: '<script>alert(1)</script>' }] }])
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })
})
