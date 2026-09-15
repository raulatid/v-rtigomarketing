import type { BlogBlock, CaseStudy, ImageMedia } from '../../src/content/types'
import { BLOG_TEXT_POLICY, richBlocks } from '../../content/lib/portableText'
import { Report } from '../../content/lib/validate'
import { videoProblem } from '../schemas/lib/editorChecks'

export type RecordValue = Record<string, unknown>
export const object = (value: unknown): RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
export const text = (value: unknown): string => typeof value === 'string' ? value : ''
export const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : []

export function previewImage(value: unknown, projectId: string, dataset: string): ImageMedia | null {
  const image = object(value)
  const ref = text(object(image.asset)._ref)
  const match = /^image-([a-z0-9]+)-(\d+)x(\d+)-(png|jpg|jpeg|webp)$/i.exec(ref)
  if (!match) return null
  return {
    src: `https://cdn.sanity.io/images/${encodeURIComponent(projectId)}/${encodeURIComponent(dataset)}/${match[1]}-${match[2]}x${match[3]}.${match[4]}`,
    width: +match[2], height: +match[3], alt: text(image.alt),
    ...(text(image.caption) ? {caption: text(image.caption)} : {}),
  }
}

export function previewCase(doc: RecordValue): CaseStudy {
  const chart = object(doc.chart)
  const points = rows(chart.points).map(object).filter((point) => typeof point.value === 'number' && Number.isFinite(point.value))
  const metric = (index: number) => {
    const row = object(rows(doc.metrics)[index])
    return {label: text(row.label), value: text(row.value)}
  }
  return {
    id: text(doc._id), name: text(doc.name), label: text(doc.name), isotype: null, logo: null,
    brandColor: /^#[0-9a-f]{6}$/i.test(text(doc.brandColor)) ? text(doc.brandColor) : '#ffffff',
    sector: text(doc.sector), location: text(doc.location), year: text(doc.year), summary: text(doc.summary),
    metrics: [metric(0), metric(1)], details: rows(doc.details).map(text),
    chart: {
      type: ['line', 'area', 'bars', 'donut'].includes(text(chart.type)) ? chart.type as CaseStudy['chart']['type'] : 'line',
      title: text(chart.title), values: points.map((point) => point.value as number),
      ...(['bars', 'donut'].includes(text(chart.type)) ? {labels: points.map((point) => text(point.label))} : {}),
    },
  }
}

/** Same text converter as production; unfinished/unsupported blocks are identified, never hidden silently. */
export function previewBody(raw: unknown, projectId: string, dataset: string): {body: BlogBlock[]; incomplete: boolean} {
  const blocks = rows(raw), body: BlogBlock[] = []
  let incomplete = false
  for (let i = 0; i < blocks.length;) {
    const item = object(blocks[i])
    if (item._type === 'block') {
      const run: unknown[] = []
      while (i < blocks.length && object(blocks[i])._type === 'block') run.push(blocks[i++])
      const report = new Report('')
      const converted = richBlocks(report, 'body', run, BLOG_TEXT_POLICY)
      if (converted) body.push(...converted)
      else incomplete = true
    } else {
      i++
      if (item._type === 'imageMedia') {
        const image = previewImage(item, projectId, dataset)
        if (image) body.push({kind: 'image', image})
        else incomplete = true
      } else if (item._type === 'embedMedia' && videoProblem(item.url, item.provider) === true && text(item.url)) {
        body.push({kind: 'embed', provider: item.provider as 'youtube' | 'vimeo', url: text(item.url)})
      } else incomplete = true
    }
  }
  return {body, incomplete}
}
