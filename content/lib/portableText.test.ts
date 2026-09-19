import { describe, expect, it } from 'vitest'
import { LEGAL_POLICY, richBlocks } from './portableText'
import { Report } from './validate'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'

/**
 * Ingestion is the security boundary for structured content.
 *
 * The renderer switches on `kind` and puts `href` straight into an attribute,
 * which is only safe because everything below fails the build rather than
 * arriving. A test that only checked the happy path would be checking the half
 * that cannot hurt anyone.
 */

const span = (text: string, marks?: string[]) => ({ _type: 'span', text, ...(marks ? { marks } : {}) })
const block = (text: string, extra: Record<string, unknown> = {}) => ({
  _type: 'block',
  style: 'normal',
  children: [span(text)],
  ...extra,
})

function convert(raw: unknown) {
  const report = new Report('')
  const blocks = richBlocks(report, 'body', raw, LEGAL_POLICY)
  return { blocks, problems: report.problems.map((p) => p.message) }
}

describe('converting Portable Text', () => {
  it('turns a normal block into a paragraph', () => {
    const { blocks } = convert([block('Hola')])
    expect(blocks).toEqual([{ kind: 'paragraph', spans: [{ text: 'Hola' }] }])
  })

  it('turns h2 and h3 into headings with a level', () => {
    const { blocks } = convert([block('Dos', { style: 'h2' }), block('Tres', { style: 'h3' })])
    expect(blocks?.map((b) => b.kind === 'heading' && b.level)).toEqual([2, 3])
  })

  it('groups a run of list items into ONE list', () => {
    // Portable Text stores a list as consecutive sibling blocks. A renderer given
    // one list per item produces markup that reads correctly and announces
    // catastrophically to a screen reader.
    const { blocks } = convert([
      block('uno', { listItem: 'bullet' }),
      block('dos', { listItem: 'bullet' }),
      block('tres', { listItem: 'bullet' }),
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks?.[0].kind).toBe('list')
    if (blocks?.[0].kind === 'list') {
      expect(blocks[0].ordered).toBe(false)
      expect(blocks[0].items).toHaveLength(3)
    }
  })

  it('starts a new list when the kind changes', () => {
    const { blocks } = convert([
      block('uno', { listItem: 'bullet' }),
      block('uno', { listItem: 'number' }),
    ])
    expect(blocks?.map((b) => b.kind === 'list' && b.ordered)).toEqual([false, true])
  })

  it('closes a list when ordinary copy resumes', () => {
    const { blocks } = convert([block('uno', { listItem: 'bullet' }), block('después')])
    expect(blocks?.map((b) => b.kind)).toEqual(['list', 'paragraph'])
  })

  it('resolves a markDef reference into a plain href', () => {
    // The renderer must never chase a reference. It gets a string.
    const { blocks } = convert([
      {
        _type: 'block',
        style: 'normal',
        markDefs: [{ _key: 'k1', _type: 'link', href: 'https://www.aepd.es/' }],
        children: [span('la agencia', ['k1'])],
      },
    ])
    expect(blocks?.[0].kind === 'paragraph' && blocks[0].spans[0]).toEqual({
      text: 'la agencia',
      href: 'https://www.aepd.es/',
    })
  })

  it('keeps strong and em', () => {
    const { blocks } = convert([
      { _type: 'block', style: 'normal', children: [span('x', ['strong', 'em'])] },
    ])
    expect(blocks?.[0].kind === 'paragraph' && blocks[0].spans[0].marks).toEqual(['strong', 'em'])
  })

  it('drops an empty block as a blank line, not a clause, and reports a body that is only blank lines', () => {
    // A blank line between paragraphs, or the Enter at the end of a document.
    const { blocks, problems } = convert([block('a'), block(''), block('b'), block('')])
    expect(problems).toEqual([])
    expect(blocks?.map((b) => b.kind)).toEqual(['paragraph', 'paragraph'])
    // Inside a list run the blank line does not end the list either.
    const list = convert([block('a', { listItem: 'bullet' }), block('', { listItem: 'bullet' }), block('b', { listItem: 'bullet' })])
    expect(list.blocks?.[0].kind === 'list' && list.blocks[0].items).toHaveLength(2)
    expect(convert([block(''), block('')]).problems.join()).toMatch(/no renderable content/)
  })

  it('drops the empty spans Portable Text uses as separators', () => {
    const { blocks } = convert([
      { _type: 'block', style: 'normal', children: [span('a'), span(''), span('b')] },
    ])
    expect(blocks?.[0].kind === 'paragraph' && blocks[0].spans).toHaveLength(2)
  })
})

describe('what ingestion refuses', () => {
  it('a block style outside the vocabulary', () => {
    // Silently dropping it would publish a legal document missing a clause an
    // editor believed they had written.
    const { blocks, problems } = convert([block('x', { style: 'h1' })])
    expect(blocks).toBeUndefined()
    expect(problems.join()).toMatch(/unsupported block style "h1"/)
  })

  it('a block type that is not text', () => {
    const { blocks, problems } = convert([{ _type: 'image', asset: { _ref: 'image-abc' } }])
    expect(blocks).toBeUndefined()
    expect(problems.join()).toMatch(/unsupported block type "image"/)
  })

  it('a mark nobody implements', () => {
    const { blocks, problems } = convert([
      { _type: 'block', style: 'normal', children: [span('x', ['underline'])] },
    ])
    expect(blocks).toBeUndefined()
    expect(problems.join()).toMatch(/unsupported mark "underline"/)
  })

  it('an annotation that is not a link', () => {
    const { blocks, problems } = convert([
      {
        _type: 'block',
        style: 'normal',
        markDefs: [{ _key: 'k1', _type: 'internalRef' }],
        children: [span('x', ['k1'])],
      },
    ])
    expect(blocks).toBeUndefined()
    expect(problems.join()).toMatch(/unsupported annotation "internalRef"/)
  })

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'http://plain.example'])(
    'a %s link',
    (href) => {
      // Parsed, not pattern-matched: a parser is immune to the backslash, tab and
      // percent-encoding variants a pattern is not.
      const { blocks, problems } = convert([
        {
          _type: 'block',
          style: 'normal',
          markDefs: [{ _key: 'k1', _type: 'link', href }],
          children: [span('x', ['k1'])],
        },
      ])
      expect(blocks).toBeUndefined()
      expect(problems.join()).toMatch(/links are not allowed/)
    },
  )

  it('markup pasted into a span', () => {
    // Sanity stores text, not markup. A tag arriving here means someone pasted
    // rendered HTML, and it must not survive into a component either way.
    const { blocks } = convert([block('<p>Hola <script>alert(1)</script>mundo</p>')])
    expect(blocks?.[0].kind === 'paragraph' && blocks[0].spans[0].text).toBe('Hola mundo')
  })

  it('an empty body', () => {
    expect(convert([]).blocks).toBeUndefined()
  })

  it('something that is not an array at all', () => {
    expect(convert('<p>hola</p>').blocks).toBeUndefined()
    expect(convert(null).blocks).toBeUndefined()
  })

  it('a body past the block cap', () => {
    const cap = EDITORIAL_BOUNDS.legalDoc.bodyBlocks
    const { blocks, problems } = convert(Array.from({ length: cap + 1 }, () => block('x')))
    expect(blocks).toBeUndefined()
    expect(problems.join()).toMatch(new RegExp('over the ' + cap + ' limit'))
  })

  it('a whole document pasted into one span', () => {
    const { blocks, problems } = convert([block('a'.repeat(2001))])
    expect(blocks).toBeUndefined()
    expect(problems.join()).toMatch(/over the 2000 limit/)
  })
})

describe('whitespace between spans', () => {
  it('keeps the space that separates a run from the mark after it', () => {
    // Portable Text splits a sentence at every mark boundary. stripHtml trims,
    // so without care "escribe a " + "hola@x.com" renders as "escribe ahola@x.com".
    const { blocks } = convert([
      { _type: 'block', style: 'normal', children: [span('escribe a '), span('hola@x.com', ['strong'])] },
    ])
    const rendered = blocks?.[0].kind === 'paragraph' ? blocks[0].spans.map((s) => s.text).join('') : ''
    expect(rendered).toBe('escribe a hola@x.com')
  })

  it('keeps a leading space too', () => {
    const { blocks } = convert([
      { _type: 'block', style: 'normal', children: [span('ver', ['strong']), span(' la agencia')] },
    ])
    const rendered = blocks?.[0].kind === 'paragraph' ? blocks[0].spans.map((s) => s.text).join('') : ''
    expect(rendered).toBe('ver la agencia')
  })

  it('keeps a whitespace-only separator span as a single space', () => {
    const { blocks } = convert([
      { _type: 'block', style: 'normal', children: [span('a', ['strong']), span('   '), span('b', ['em'])] },
    ])
    const rendered = blocks?.[0].kind === 'paragraph' ? blocks[0].spans.map((s) => s.text).join('') : ''
    expect(rendered).toBe('a b')
  })

  it('still collapses runs of whitespace inside a span', () => {
    const { blocks } = convert([block('uno    dos')])
    expect(blocks?.[0].kind === 'paragraph' && blocks[0].spans[0].text).toBe('uno dos')
  })
})
