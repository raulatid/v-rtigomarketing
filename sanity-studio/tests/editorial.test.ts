import { describe, expect, it } from 'vitest'
import { imageProblem, videoProblem } from '../schemas/lib/editorChecks'
import { previewBody, previewCase, previewImage } from '../components/previewModel'
import { UPDATE_GRACE_MS, parseContentVersion, siteStatusFor } from '../components/siteStatusModel'
import { serviceMembership } from '../schemas/lib/serviceMembership'
import { effectiveOthers, highlightedCaseUnique } from '../schemas/lib/highlightedCase'
import { brandMarkWeight } from '../schemas/lib/brandMarkWeight'
import { plainText, richText } from '../schemas/lib/plainText'
import { darkColorAdvice, markupAdvice, serviceOpeningAdvice, singleParagraphAdvice } from '../schemas/lib/advice'
import { ORBIT_CAPACITY, orbitCapacity } from '../schemas/lib/orbitCapacity'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'
import { LEGAL_WORDS_ADVISED, legalHeadingsAdvice, legalLengthAdvice, legalReadingMinutes, legalWordCount } from '../schemas/lib/legalBody'
import type { ValidationContext } from 'sanity'

const legalBlock = (text: string, style = 'normal', marks: string[] = []) =>
  ({_type: 'block', style, markDefs: [], children: [{_type: 'span', text, marks}]})

describe('editorial validation before publishing', () => {
  it('allows empty optional images, rejects unfinished images, SVG and oversized uploads', () => {
    expect(imageProblem(undefined)).toBe(true)
    expect(imageProblem({alt: 'Texto sin archivo'})).not.toBe(true)
    expect(imageProblem({asset: {_ref: 'image-abc123-800x400-svg'}})).not.toBe(true)
    expect(imageProblem({asset: {_ref: 'image-abc123-8193x400-webp'}})).not.toBe(true)
    expect(imageProblem({asset: {_ref: 'image-abc123-800x400-png'}})).toBe(true)
  })
  it('checks platform against the parsed hostname, including deceptive URLs', () => {
    expect(videoProblem('https://vimeo.com/12345', 'youtube')).not.toBe(true)
    expect(videoProblem('https://youtu.be/abc', 'youtube')).toBe(true)
    expect(videoProblem('https://player.vimeo.com/video/12345', 'vimeo')).toBe(true)
    expect(videoProblem('https://youtube.com.example.org/watch?v=abc', 'youtube')).not.toBe(true)
    expect(videoProblem('https://youtube.com@example.org/watch?v=abc', 'youtube')).not.toBe(true)
    expect(videoProblem('http://youtube.com/watch?v=abc', 'youtube')).not.toBe(true)
  })
  it('allows reordering city services but refuses a removed or substituted symbol binding', async () => {
    const slugs = ['brand-identity', 'paid-campaigns', 'content-strategy', 'web-analysis', 'seo']
    const context = {document: {slug: {current: 'servicios'}}, getClient: () => ({fetch: async () => slugs})} as unknown as ValidationContext
    expect(await serviceMembership(slugs.map((_slug, i) => ({_ref: 'id-' + i})), context)).toBe(true)
    slugs.pop()
    expect(await serviceMembership([{_ref: 'id-0'}], context)).not.toBe(true)
  })
  it('keeps exactly one highlighted case: refuses a second, and refuses unticking the only one', async () => {
    type Row = {_id: string; highlighted?: boolean | null; name?: string}
    const make = (rows: Row[]) =>
      ({document: {_id: 'drafts.case-a'}, getClient: () => ({fetch: async () => rows})}) as unknown as ValidationContext
    const mango = {_id: 'case-b', highlighted: true, name: 'Mango'}
    // Own document is excluded, whether as draft or published.
    expect(await highlightedCaseUnique(true, make([{_id: 'case-a', highlighted: true}, {_id: 'drafts.case-a', highlighted: true}]))).toBe(true)
    expect(await highlightedCaseUnique(true, make([mango]))).toContain('Mango')
    expect(await highlightedCaseUnique(false, make([mango]))).toBe(true)
    // The other half: this was the 2026-09-18 gap.
    expect(await highlightedCaseUnique(false, make([{_id: 'case-b', highlighted: null}]))).toMatch(/único caso resaltado/)
    expect(await highlightedCaseUnique(false, make([]))).toMatch(/único caso resaltado/)
    const failing = {document: {_id: 'case-a'}, getClient: () => ({fetch: async () => { throw new Error('offline') }})} as unknown as ValidationContext
    expect(await highlightedCaseUnique(true, failing)).not.toBe(true)
  })
  it('judges another case by its draft when it has one, so the highlight can be moved', async () => {
    // Mango is highlighted in its published copy and unticked in its draft:
    // ticking this case is allowed, and Mango's own unticking (the mirror
    // image) is allowed because this draft is ticked.
    const rows = [{_id: 'case-b', highlighted: true, name: 'Mango'}, {_id: 'drafts.case-b', highlighted: false, name: 'Mango'}]
    expect(effectiveOthers(rows, 'case-a')).toEqual([{_id: 'case-b', highlighted: false, name: 'Mango'}])
    const ctx = {document: {_id: 'drafts.case-a'}, getClient: () => ({fetch: async () => rows})} as unknown as ValidationContext
    expect(await highlightedCaseUnique(true, ctx)).toBe(true)
    const mirror = {document: {_id: 'drafts.case-b'}, getClient: () => ({fetch: async () => [...rows, {_id: 'drafts.case-a', highlighted: true}]})} as unknown as ValidationContext
    expect(await highlightedCaseUnique(false, mirror)).toBe(true)
  })
  it('refuses a brand mark over the shared weight cap, and passes what it cannot weigh', async () => {
    const cap = EDITORIAL_BOUNDS.caseStudy.brandMarkBytes
    const withSize = (size: unknown) => ({getClient: () => ({fetch: async () => size})}) as unknown as ValidationContext
    const value = {asset: {_ref: 'image-abc-512x512-png'}}
    expect(await brandMarkWeight('isotype')(value, withSize(cap))).toBe(true)
    expect(await brandMarkWeight('logo')(value, withSize(cap + 1))).toMatch(/^El logotipo pesa 4,0 MB/)
    expect(await brandMarkWeight('isotype')(value, withSize(null))).toBe(true)
    expect(await brandMarkWeight('isotype')(undefined, withSize(cap * 2))).toBe(true)
    const failing = {getClient: () => ({fetch: async () => { throw new Error('offline') }})} as unknown as ValidationContext
    expect(await brandMarkWeight('isotype')(value, failing)).toMatch(/conexión/)
  })
  it('refuses what the build\'s plain-text pass refuses: whitespace-only and HTML entities', () => {
    expect(plainText(undefined)).toBe(true)
    expect(plainText('')).toBe(true)
    expect(plainText('Moda y retail')).toBe(true)
    expect(plainText('   ')).toMatch(/solo tiene espacios/)
    expect(plainText('&copy; 2026')).toMatch(/código HTML/)
    // Decoded by the build, so accepted here — the same function decides both.
    expect(plainText('Tom &amp; Jerry')).toBe(true)
    expect(richText([legalBlock('Hola &nbsp; mundo')])).toBe(true)
    expect(richText([legalBlock('Hola'), legalBlock('&copy; 2026')])).toMatch(/código HTML/)
    expect(richText([{_type: 'image'}, null, 'x'])).toBe(true)
  })
  it('refuses a case past the planet\'s orbits, counting published cases other than this one', async () => {
    const make = (count: unknown) => ({document: {_id: 'drafts.case-x'}, getClient: () => ({fetch: async () => count})}) as unknown as ValidationContext
    expect(ORBIT_CAPACITY).toBe(6)
    expect(await orbitCapacity(undefined, make(5))).toBe(true)
    expect(await orbitCapacity(undefined, make(6))).toMatch(/6 órbitas/)
    expect(await orbitCapacity(undefined, make(null))).toBe(true)
    const failing = {document: {_id: 'case-x'}, getClient: () => ({fetch: async () => { throw new Error('offline') }})} as unknown as ValidationContext
    expect(await orbitCapacity(undefined, failing)).toMatch(/conexión/)
  })
  it('says what the site will show differently from the Studio: stripped markup, joined lines, a long opening, a dark colour', () => {
    expect(markupAdvice('precio <5%')).toBe(true)
    expect(markupAdvice('Hola <b>mundo</b>')).toMatch(/«Hola mundo»/)
    expect(markupAdvice(undefined)).toBe(true)
    expect(singleParagraphAdvice('una\nlínea más')).toMatch(/un solo párrafo/)
    expect(singleParagraphAdvice('una línea\n')).toBe(true)
    expect(serviceOpeningAdvice('Una línea corta\nOtra línea corta\n\nDetalle largo que no importa')).toBe(true)
    expect(serviceOpeningAdvice('Una\nDos\nTres')).toMatch(/3 líneas/)
    expect(serviceOpeningAdvice('Una línea corta\nUna segunda línea bastante más larga de la cuenta')).toMatch(/caracteres/)
    expect(serviceOpeningAdvice('Una sola frase larguísima que el sitio parte por su cuenta.')).toBe(true)
    expect(darkColorAdvice('#050507')).toMatch(/casi negro/)
    expect(darkColorAdvice('#1c67ff')).toBe(true)
    expect(darkColorAdvice('#ffffff')).toBe(true)
    expect(darkColorAdvice('')).toBe(true)
  })
  it('advises, never refuses, a legal text whose titles are bold paragraphs', () => {
    // The 2026-09-18 shape: every section title typed in bold, no heading block.
    const bold = [legalBlock('1. Objeto', 'normal', ['strong']), legalBlock('Estas condiciones…'), legalBlock('2. Datos', 'normal', ['strong'])]
    expect(legalHeadingsAdvice(bold)).toMatch(/«Título»/)
    expect(legalHeadingsAdvice([legalBlock('1. Objeto', 'h2'), legalBlock('Estas condiciones…')])).toBe(true)
    expect(legalHeadingsAdvice([legalBlock('Subtítulo', 'h3'), legalBlock('…')])).toBe(true)
    // A one-line document, a still-empty one, or garbage: nothing to say yet.
    expect(legalHeadingsAdvice([legalBlock('Solo una línea.')])).toBe(true)
    expect(legalHeadingsAdvice(undefined)).toBe(true)
    expect(legalHeadingsAdvice([null, 'x', {_type: 'image'}])).toBe(true)
  })
  it('counts words across blocks and only advises past the recommended length', () => {
    expect(legalWordCount(undefined)).toBe(0)
    expect(legalWordCount([legalBlock('  uno   dos '), legalBlock('tres'), {_type: 'image'}, legalBlock('')])).toBe(3)
    expect(legalReadingMinutes(0)).toBe(1)
    expect(legalReadingMinutes(1000)).toBe(5)
    const words = (n: number) => [legalBlock(Array.from({length: n}, () => 'palabra').join(' '))]
    expect(legalLengthAdvice(words(LEGAL_WORDS_ADVISED))).toBe(true)
    expect(legalLengthAdvice(words(LEGAL_WORDS_ADVISED + 1))).toMatch(/Se publica igual/)
  })
})

describe('whether the site has caught up with what was published', () => {
  const version = {contentUpdatedAt: '2026-09-18T12:00:00Z', source: 'Sanity (p/d)', builtAt: '2026-09-18T12:03:00Z'}
  const doc = (id: string, at: string) => ({_id: id, _type: 'legalDoc', label: id, _updatedAt: at})
  const T = Date.parse('2026-09-18T12:30:00Z')
  it('is live when nothing newer than the stamp is published', () => {
    expect(siteStatusFor(version, [], T)).toEqual({kind: 'live', builtAt: version.builtAt})
  })
  it('is updating while the newest publish is younger than a build, and stale after that', () => {
    const docs = [doc('a', '2026-09-18T12:10:00Z'), doc('b', '2026-09-18T12:25:00Z')]
    const updating = siteStatusFor(version, docs, T)
    expect(updating.kind).toBe('updating')
    expect(updating.kind === 'updating' && updating.docs.map((d) => d._id)).toEqual(['b', 'a'])
    expect(siteStatusFor(version, docs, T + UPDATE_GRACE_MS).kind).toBe('stale')
    expect(siteStatusFor(version, [doc('a', 'not a date')], T).kind).toBe('stale')
  })
  it('says so when the site could not be read, or was not built from the CMS', () => {
    expect(siteStatusFor(null, [], T)).toEqual({kind: 'unreachable'})
    expect(siteStatusFor({...version, contentUpdatedAt: null, source: 'seed snapshot'}, [], T)).toEqual({kind: 'not-from-cms', source: 'seed snapshot'})
  })
  it('accepts only the JSON the build writes', () => {
    expect(parseContentVersion(version)).toEqual(version)
    expect(parseContentVersion({...version, contentUpdatedAt: null})).toEqual({...version, contentUpdatedAt: null})
    expect(parseContentVersion({...version, contentUpdatedAt: 5})).toBeNull()
    expect(parseContentVersion({contentUpdatedAt: 'x'})).toBeNull()
    expect(parseContentVersion('<!doctype html>')).toBeNull()
  })
})

describe('draft previews', () => {
  it('does not invent metrics or chart data for incomplete drafts', () => {
    const draft = previewCase({_id: 'drafts.example', metrics: [{}], chart: {type: 'area', points: [{value: 0}, {}, {value: '7'}]}})
    expect(draft.chart.values).toEqual([0])
    expect(draft.metrics).toEqual([{label: '', value: ''}, {label: '', value: ''}])
    expect(previewCase({}).chart.values).toEqual([])
  })
  it('derives image URLs only from valid image references', () => {
    expect(previewImage({asset: {_ref: 'javascript:alert(1)'}}, 'project', 'production')).toBeNull()
    expect(previewImage({asset: {_ref: 'image-abc123-800x400-png'}, alt: 'Equipo'}, 'project', 'production'))
      .toMatchObject({src: 'https://cdn.sanity.io/images/project/production/abc123-800x400.png', width: 800, height: 400, alt: 'Equipo'})
  })
  it('uses the production converter for consecutive lists and reports unsupported blocks', () => {
    const block = (value: string) => ({_type: 'block', style: 'normal', listItem: 'bullet', level: 1, markDefs: [], children: [{_type: 'span', text: value, marks: []}]})
    const result = previewBody([block('Uno'), block('Dos'), {_type: 'unknown'}], 'project', 'production')
    expect(result.body).toHaveLength(1)
    expect(result.body[0]).toMatchObject({kind: 'list', ordered: false, items: [[{text: 'Uno'}], [{text: 'Dos'}]]})
    expect(result.incomplete).toBe(true)
  })
  it('never renders an unsafe embed link from an unvalidated draft', () => {
    const result = previewBody([{_type: 'embedMedia', provider: 'youtube', url: 'javascript:alert(1)'}], 'project', 'production')
    expect(result.body).toEqual([])
    expect(result.incomplete).toBe(true)
  })
})
