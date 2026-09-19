import { describe, expect, it } from 'vitest'
import { contentVersionJson, latestUpdatedAt } from './contentVersion'
import type { ContentSource } from './source'

function source(byType: Record<string, unknown[]>): ContentSource & { specs: string[] } {
  const specs: string[] = []
  return {
    specs,
    describe: 'fake',
    async fetchAll(spec) {
      specs.push(spec.type + ' | ' + spec.orderBy + ' ' + spec.projection)
      return byType[spec.type] ?? []
    },
  }
}

describe('the content version stamp', () => {
  it('is the newest _updatedAt across every type, read newest-first through the source', async () => {
    const fake = source({
      caseStudy: [{ _updatedAt: '2026-09-18T15:43:33Z' }, { _updatedAt: '2026-09-17T14:34:53Z' }],
      legalDoc: [{ _updatedAt: '2026-09-18T12:24:15Z' }],
      blogPost: [],
    })
    expect(await latestUpdatedAt(fake, ['caseStudy', 'legalDoc', 'blogPost'])).toBe('2026-09-18T15:43:33Z')
    expect(fake.specs).toEqual([
      'caseStudy | _updatedAt desc { _updatedAt }',
      'legalDoc | _updatedAt desc { _updatedAt }',
      'blogPost | _updatedAt desc { _updatedAt }',
    ])
  })

  it('is null when nothing carries a stamp — fixtures, or an empty dataset', async () => {
    expect(await latestUpdatedAt(source({ caseStudy: [{ id: 'a' }], legalDoc: [null] }), ['caseStudy', 'legalDoc'])).toBeNull()
    expect(await latestUpdatedAt(source({}), ['caseStudy'])).toBeNull()
  })

  it('serialises the three fields and nothing else', () => {
    expect(JSON.parse(contentVersionJson({ contentUpdatedAt: null, source: 'seed snapshot', builtAt: '2026-09-19T10:00:00.000Z' }))).toEqual({
      contentUpdatedAt: null,
      source: 'seed snapshot',
      builtAt: '2026-09-19T10:00:00.000Z',
    })
  })
})
