import { describe, expect, it } from 'vitest'
import { imageProblem, videoProblem } from '../schemas/lib/editorChecks'
import { previewBody, previewCase, previewImage } from '../components/previewModel'
import { serviceMembership } from '../schemas/lib/serviceMembership'
import type { ValidationContext } from 'sanity'

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
