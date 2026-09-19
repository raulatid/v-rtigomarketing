import { describe, it, expect } from 'vitest'
import { decodeEntities, plainTextProblem, stripHtml } from './html'

describe('stripHtml', () => {
  it('removes tags and keeps the text', () => {
    expect(stripHtml('<p>Hola <strong>mundo</strong></p>')).toBe('Hola mundo')
  })

  it('separates block elements instead of running them together', () => {
    // WordPress wraps every paragraph, so without this `<p>a</p><p>b</p>` becomes
    // "ab" and two sentences merge into a nonsense word at the join.
    expect(stripHtml('<p>Uno</p><p>Dos</p>')).toBe('Uno Dos')
    expect(stripHtml('primera<br>segunda')).toBe('primera segunda')
  })

  it('drops the text inside script and style, not just their tags', () => {
    // Tag-stripping alone would leave the script BODY as visible copy.
    expect(stripHtml('<script>alert(1)</script>Hola')).toBe('Hola')
    expect(stripHtml('<style>.a{color:red}</style>Hola')).toBe('Hola')
  })

  it('leaves no markup behind for an unclosed or malformed tag', () => {
    expect(plainTextProblem(stripHtml('<p>Hola<'))).toBeNull()
    expect(stripHtml('<div class="x" data-y=\'>\'>Hola</div>')).not.toContain('<')
    expect(stripHtml('Hola <scriptx')).toBe('Hola scriptx')
    expect(stripHtml('Hola </')).toBe('Hola /')
  })

  it('keeps a bracket that is prose, not a tag', () => {
    // Sanity stores what the editor typed. «precio <5%» is copy, and until
    // 2026-09-19 it shipped as «precio 5%» with no error anywhere.
    expect(stripHtml('precio <5% y a<b>c')).toBe('precio <5% y ac')
    expect(stripHtml('de <10 a >40')).toBe('de <10 a >40')
    expect(stripHtml('a < b')).toBe('a < b')
  })

  it('collapses the whitespace the tags left behind', () => {
    expect(stripHtml('<p>  Hola   mundo  </p>')).toBe('Hola mundo')
  })
})

describe('decodeEntities', () => {
  it('decodes the entities WordPress actually emits in Spanish copy', () => {
    // Not hypothetical: WP replaces apostrophes and quotes on save, and the copy
    // is full of them. Leaving these encoded ships literal `&#8217;` on screen.
    expect(decodeEntities('Sant Sadurn&iacute; d&#8217;Anoia')).toBe('Sant Sadurní d’Anoia')
    expect(decodeEntities('&laquo;hola&raquo;')).toBe('«hola»')
    // Faithful decoding gives U+00A0; `stripHtml` is what normalises it, so a
    // non-breaking space never reaches the layout as a character that cannot wrap.
    expect(decodeEntities('a&nbsp;b')).toBe('a\u00A0b')
    expect(stripHtml('a&nbsp;b')).toBe('a b')
  })

  it('decodes hexadecimal numeric entities', () => {
    expect(decodeEntities('&#x2019;')).toBe('’')
  })

  it('decodes only once, so an escaped entity stays escaped', () => {
    // The double-decode hole: `&amp;lt;script&amp;gt;` must become the literal
    // text `&lt;script&gt;`, never `<script>`. An author who escaped something
    // meant it escaped.
    expect(decodeEntities('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;')
  })

  it('leaves an unknown or malformed entity alone rather than guessing', () => {
    expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;')
    expect(decodeEntities('100% & rising')).toBe('100% & rising')
  })

  it('refuses a lone surrogate and an out-of-range code point', () => {
    // Both survive JSON and both break on render; neither is ever intentional.
    expect(decodeEntities('&#xD800;')).toBe('&#xD800;')
    expect(decodeEntities('&#1114112;')).toBe('&#1114112;')
  })
})

describe('plainTextProblem', () => {
  it('accepts genuinely plain text', () => {
    expect(plainTextProblem('Hola mundo, 100% & subiendo')).toBeNull()
  })

  it('catches an entity that survived decoding', () => {
    // The guard on the guard: every rule in the mapper passes trivially if the
    // stripper silently stopped working. This is what would notice.
    expect(plainTextProblem('a &#8217; b')).toMatch(/entity/)
  })

  it('accepts a literal bracket, which is text rather than markup', () => {
    // Deliberate: every consumer renders through a JSX text node, textContent or
    // canvas fillText. None of them parse markup, so a '<' is just a character.
    expect(plainTextProblem('menos de <5%')).toBeNull()
  })
})
