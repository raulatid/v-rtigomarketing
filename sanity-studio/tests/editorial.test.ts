import { describe, expect, it } from 'vitest'
import { imageProblem, videoProblem } from '../schemas/lib/editorChecks'
import { previewBody, previewCase, previewImage } from '../components/previewModel'
import { UPDATE_GRACE_MS, parseContentVersion, siteStatusFor } from '../components/siteStatusModel'
import { serviceMembership } from '../schemas/lib/serviceMembership'
import { effectiveOthers, highlightedCaseUnique } from '../schemas/lib/highlightedCase'
import { brandMarkWeight } from '../schemas/lib/brandMarkWeight'
import { brandMarkAdvice, brandMarkErrors } from '../schemas/lib/brandMark'
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
    // The wrong platform and a right platform on a host the site refuses are
    // different mistakes, and the old single message sent the second in a circle.
    expect(videoProblem('https://vimeo.com/12345', 'youtube')).toMatch(/es de Vimeo.*elegido YouTube/)
    expect(videoProblem('https://m.youtube.com/watch?v=abc', 'youtube')).toMatch(/no acepta enlaces de m\.youtube\.com.*youtu\.be/)
    expect(videoProblem('https://youtu.be/abc', 'youtube')).toBe(true)
    expect(videoProblem('https://player.vimeo.com/video/12345', 'vimeo')).toBe(true)
    expect(videoProblem('https://youtube.com.example.org/watch?v=abc', 'youtube')).not.toBe(true)
    expect(videoProblem('https://youtube.com@example.org/watch?v=abc', 'youtube')).not.toBe(true)
    expect(videoProblem('http://youtube.com/watch?v=abc', 'youtube')).not.toBe(true)
  })
  it('lets the editor add, remove and reorder services, and still refuses an unpublished one', async () => {
    const slugs = ['brand-identity', 'paid-campaigns', 'content-strategy', 'web-analysis', 'seo']
    const refs = slugs.map((_slug, i) => ({_ref: 'id-' + i}))
    const rows = slugs.map((slug, i) => ({_id: 'id-' + i, slug}))
    const make = (result: unknown, districtId = 'servicios') =>
      ({document: {slug: {current: districtId}}, getClient: () => ({fetch: async () => result})}) as unknown as ValidationContext
    expect(await serviceMembership(refs, make(rows))).toBe(true)
    expect(await serviceMembership([...refs].reverse(), make(rows))).toBe(true)
    // Removing one was refused until 2026-09-21, when the symbol rows it needed
    // a developer for became fields on the service document. There is nothing
    // technical left to ask about, so the list is the editor's.
    expect(await serviceMembership(refs.slice(0, 4), make(rows.slice(0, 4)))).toBe(true)
    // What still has to be refused, because the build reads published documents
    // only and the stop would go missing where it reads as an editorial choice.
    const oneDraft = [...rows.slice(0, 4), {_id: 'drafts.id-4', slug: 'seo'}]
    expect(await serviceMembership(refs, make(oneDraft))).toMatch(/no está publicado/)
    // A reference to a document that is not there at all needs the other answer.
    expect(await serviceMembership(refs, make(rows.slice(0, 4)))).toMatch(/ya no existe/)
    expect(await serviceMembership(refs, make(rows, 'otra'))).toMatch(/«otra».*no está enlazada/)
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
  it('advises on a brand mark below its atlas box rather than refusing it; shape is still refused', () => {
    const small = {asset: {_ref: 'image-abc-300x300-png'}}
    expect(brandMarkErrors('isotype')(small)).toBe(true)
    // It names what the file will be DRAWN at, which is the number that says
    // how much enlarging is going on — not the box, which is only the ceiling.
    expect(brandMarkAdvice('isotype')(small)).toMatch(/Más pequeña que el hueco.*300×300.*368×368.*Puedes publicar/)
    // 800×400 is DOWNSCALED into the 896×368 box, so it is sharp; what it is,
    // is short of the canonical delivery size. Each dimension was compared
    // against the box until 2026-09-21, which called this one blurry.
    const mid = {asset: {_ref: 'image-abc-800x400-png'}}
    expect(brandMarkErrors('logo')(mid)).toBe(true)
    expect(brandMarkAdvice('logo')(mid)).toMatch(/Por debajo del tamaño ideal.*800×400.*1600×800/)
    expect(brandMarkErrors('isotype')({asset: {_ref: 'image-abc-1500x400-png'}})).toMatch(/apaisado/)
    expect(brandMarkAdvice('isotype')({asset: {_ref: 'image-abc-512x512-png'}})).toBe(true)
  })

  it('judges a landscape isotype on what it draws, not on its aspect', () => {
    // A brand whose symbol is genuinely landscape. Nothing in the renderer
    // minds: `fitInk` contains any aspect and the panel shader contains the
    // cell. The bound is a legibility judgement, and it is the DRAWN HEIGHT —
    // an aspect band was a proxy for it and moved twice in one day, once per
    // brand that landed just outside whatever the number was.
    const wide = {asset: {_ref: 'image-abc-1024x512-png'}}
    expect(brandMarkErrors('isotype')(wide)).toBe(true)
    expect(brandMarkAdvice('isotype')(wide)).toMatch(/Proporción poco habitual.*2,0:1/)

    // THE ASSET THAT PROMPTED THIS: 2.35:1, refused by the 2:1 band, and it
    // draws 432×184 — over the 144 floor with room to spare.
    const real = {asset: {_ref: 'image-abc-512x218-png'}}
    expect(brandMarkErrors('isotype')(real)).toBe(true)
    // And it is SHARP: 512 wide into a 432 box is a downscale. The old advice
    // compared its 218 height against the box's 368 and called it blurry.
    expect(brandMarkAdvice('isotype')(real)).not.toMatch(/borrosa/)

    // The floor: 3:1 draws exactly 144 and passes, past it the mark is a strip.
    expect(brandMarkErrors('isotype')({asset: {_ref: 'image-abc-1296x432-png'}})).toBe(true)
    expect(brandMarkErrors('isotype')({asset: {_ref: 'image-abc-1500x400-png'}})).toMatch(/apaisado/)
    // Symmetric on the portrait side, where a tall mark loses width instead.
    expect(brandMarkErrors('isotype')({asset: {_ref: 'image-abc-500x1000-png'}})).toBe(true)
    expect(brandMarkErrors('isotype')({asset: {_ref: 'image-abc-300x1000-png'}})).toMatch(/estrecho/)
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
    expect(draft.chart?.values).toEqual([0])
    // As many metric cards as rows, up to two — never a padded pair.
    expect(draft.metrics).toEqual([{label: '', value: ''}])
    expect(previewCase({metrics: [{label: 'a'}, {label: 'b'}, {label: 'c'}]}).metrics).toHaveLength(2)
    // An untouched chart — the Studio's `{ type: 'line' }` default — is no chart, as the build reads it.
    expect(previewCase({}).chart).toBeNull()
    expect(previewCase({chart: {type: 'line'}}).chart).toBeNull()
    expect(previewCase({chart: {type: 'line', title: 'x'}}).chart?.values).toEqual([])
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
