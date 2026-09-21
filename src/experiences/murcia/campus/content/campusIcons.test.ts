import { describe, expect, it } from 'vitest'
import { CAMPUS_ICONS } from './campusIcons'
import { CAMPUS_SYMBOLS, DEFAULT_CAMPUS_SYMBOL } from '../../../../content/campusShapes'
import { FIGURE_KINDS } from './servicesContent'
import { CAMPUS_FIGURES } from '../../../../content/campusShapes'

// The seam between a name and the thing that draws it.
//
// `campusShapes.ts` is the list three places read: the Studio offers it to the
// editor, the content build refuses anything outside it, and the campus draws
// it. The first two are cheap to get right and the third is where a name can
// quietly have nothing behind it — a symbol the editor picks and the particles
// cannot form looks like a choice that did nothing.
//
// This replaces the half of `cityDistrictBindings.test.ts` that was worth
// keeping. That file asserted the artwork existed for every row a DEVELOPER had
// written; the question now is whether it exists for every name an EDITOR is
// offered, which is a wider set and the one that can actually be wrong.

describe('the symbols the editor is offered', () => {
  it('are exactly the ones the library draws', () => {
    expect([...CAMPUS_SYMBOLS].sort()).toEqual(Object.keys(CAMPUS_ICONS).sort())
  })

  it('include the one a service falls back to', () => {
    // Nothing chooses this at runtime except an empty Studio field, so it would
    // fail where nobody is looking.
    expect(CAMPUS_ICONS[DEFAULT_CAMPUS_SYMBOL]).toBeTypeOf('string')
  })

  it('each carry square SVG markup the sampler can read', () => {
    for (const name of CAMPUS_SYMBOLS) {
      const markup = CAMPUS_ICONS[name]!
      expect(markup.startsWith('<svg'), name).toBe(true)
      expect(markup.includes('viewBox="0 0 256 256"'), name).toBe(true)
    }
  })
})

describe('the figures the editor is offered', () => {
  it('are the campus\'s own list, not a second copy of it', () => {
    // `servicesContent.ts` re-exports rather than redeclares. If someone
    // reinstates a literal there, the Studio and the campus can drift and the
    // editor gets an option nothing draws.
    expect(FIGURE_KINDS).toBe(CAMPUS_FIGURES)
  })
})
