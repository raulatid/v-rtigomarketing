import { describe, it, expect } from 'vitest'
import { splitServiceCopy } from './serviceCopy'
import { DISTRICT_CONTENT } from '../../../content/generated/districts'
import { findDistrictContent } from '../../../content/lookup'

describe('splitServiceCopy', () => {
  it('takes the first paragraph when the author wrote two', () => {
    const { summary, detail } = splitServiceCopy('Primera parte.\n\nSegunda parte, más larga.')
    expect(summary).toBe('Primera parte.')
    expect(detail).toBe('Primera parte.\n\nSegunda parte, más larga.')
  })

  it('does not cap an explicit paragraph break', () => {
    const long = `${'Una frase larga que sigue y sigue. '.repeat(8).trim()}\n\nSegunda.`
    const { summary } = splitServiceCopy(long)
    expect(summary.length).toBeGreaterThan(150)
  })

  it('falls back to the leading sentence when the body is one paragraph', () => {
    // Sentence lengths matter here: the second must push the total past the
    // bound, or accumulation correctly takes it too. Shaped like published copy.
    const { summary, detail } = splitServiceCopy(
      'La búsqueda es el único canal que sigue devolviéndote el trabajo que hiciste hace meses. ' +
        'Auditamos lo que frena técnicamente a un sitio y reconstruimos la estructura que los ' +
        'buscadores leen de verdad. Los resultados se miden en ingresos.',
    )
    expect(summary).toBe(
      'La búsqueda es el único canal que sigue devolviéndote el trabajo que hiciste hace meses.',
    )
    expect(detail).toContain('Los resultados se miden en ingresos.')
  })

  it('accumulates short sentences while they fit', () => {
    const { summary } = splitServiceCopy('Corta. Otra corta. Y una tercera.')
    expect(summary).toBe('Corta. Otra corta. Y una tercera.')
  })

  it('keeps the first sentence even when it alone exceeds the bound', () => {
    const one = `${'palabra '.repeat(40).trim()}.`
    expect(splitServiceCopy(one).summary).toBe(one)
  })

  // The guard the sentence rule exists for: a bare /(?<=[.!?])\s+/ splits both
  // of these, and the summary would end mid-thought.
  it('does not break on a decimal or an abbreviation', () => {
    expect(splitServiceCopy('El coste sube 3.5 puntos cada trimestre.').summary).toBe(
      'El coste sube 3.5 puntos cada trimestre.',
    )
    expect(splitServiceCopy('Trabajamos con pymes, ong. y autónomos por igual.').summary).toBe(
      'Trabajamos con pymes, ong. y autónomos por igual.',
    )
  })

  it('normalises CRLF and trims', () => {
    const { summary, detail } = splitServiceCopy('  Primera.\r\n\r\nSegunda.  ')
    expect(summary).toBe('Primera.')
    expect(detail).toBe('Primera.\n\nSegunda.')
  })

  it('survives an empty body', () => {
    expect(splitServiceCopy('')).toEqual({ summary: '', detail: '' })
    expect(splitServiceCopy('   \n  ')).toEqual({ summary: '', detail: '' })
  })
})

// Asserted against what actually shipped, not only against invented strings.
// The whole reason this module is a split rather than a second CMS field is a
// measurement of this copy, and the measurement has to keep holding: the day a
// service is rewritten as one sentence, "saber más" opens a panel showing what
// was already on screen, and this is where that shows up.
describe('the shipped services district copy', () => {
  const content = findDistrictContent(DISTRICT_CONTENT, 'servicios')

  it('has content to split', () => {
    expect(content).not.toBeNull()
    expect(content?.services.length).toBeGreaterThan(0)
  })

  for (const service of content?.services ?? []) {
    it(`gives "${service.id}" a summary shorter than its detail`, () => {
      const { summary, detail } = splitServiceCopy(service.body)
      expect(summary.length).toBeGreaterThan(0)
      expect(summary.length).toBeLessThan(detail.length)
      expect(detail).toContain(summary)
    })
  }
})
