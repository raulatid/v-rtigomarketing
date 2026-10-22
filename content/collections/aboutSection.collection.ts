import type { AboutSectionContent, AboutStop } from '../../src/content/types'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'
import { ID_PATTERN, aboutSectionProblems } from '../../src/content/invariants'
import { sentenceFits } from '../../src/content/sentenceLines'
import { Report, boundedArray, text } from '../lib/validate'
import { collection } from './types'

/**
 * The Conócenos section: the five sentences the tower's screen writes in while
 * it is open, which are all stop 1 says, the copy of the other two stops, and
 * the buttons of the last one.
 *
 * ── The sentences are the screen's ──
 * Exactly five, plain text, no picture. Each is cut into lines at its spaces
 * the way the screen cuts it (`src/content/sentenceLines.ts`) and must fit in
 * two lines of the tower list's width: the canvas clips what does not fit, in
 * silence. The last one is drawn in the accent colour; that is the layout's
 * choice (`layoutAboutSentences.ts`), not a field.
 *
 * ── A singleton that may be absent ──
 * Zero documents is allowed, unlike `towerScreen`. The section is new and its
 * copy is the client's to write; a build that failed until the document was
 * published would stop every deployment, code fixes included, on an editorial
 * step. With none, the tower's base names itself and goes nowhere, exactly as
 * before the section existed (`src/content/about.ts`). Two is still a fault.
 */

const ABOUT = EDITORIAL_BOUNDS.aboutSection

function sentence(report: Report, path: string, raw: unknown): string | undefined {
  const value = text(report, path, raw)
  if (value === undefined) return undefined
  if (!sentenceFits(value, ABOUT.sentenceLine, ABOUT.sentenceLines)) {
    return report.fail(path, 'does not fit in ' + ABOUT.sentenceLines + ' lines of ' + ABOUT.sentenceLine + ' characters')
  }
  return value
}

function sentences(report: Report, path: string, raw: unknown): string[] | undefined {
  const list = boundedArray(report, path, raw, ABOUT.sentences, sentence)
  if (list !== undefined && list.length !== ABOUT.sentences) {
    return report.fail(path, 'exactly ' + ABOUT.sentences + ' sentences required, got ' + list.length)
  }
  return list
}

function paragraphs(report: Report, path: string, raw: unknown): string[] | undefined {
  const list = boundedArray(report, path, raw, ABOUT.paragraphs, (r, p, v) =>
    text(r, p, v, { max: ABOUT.paragraph }),
  )
  if (list !== undefined && list.length === 0) return report.fail(path, 'at least one paragraph required')
  return list
}

function stop(report: Report, path: string, raw: unknown): AboutStop | undefined {
  if (raw === null || typeof raw !== 'object') return report.fail(path, 'expected an object')
  const source = raw as Record<string, unknown>
  const title = text(report, path + '.title', source.title, { max: ABOUT.title })
  const body = paragraphs(report, path + '.paragraphs', source.paragraphs)
  if (title === undefined || body === undefined) return undefined
  return { title, paragraphs: body }
}

export const aboutSectionCollection = collection<AboutSectionContent>({
  key: 'aboutSection',
  source: {
    type: 'aboutSection',
    // One document at most, ordered anyway, for `towerScreen`'s reason.
    orderBy: '_id asc',
    projection: `{
      "id": "about",
      sentences,
      city{ title, paragraphs },
      sky{ title, paragraphs, contactLabel, auditLabel, casesLabel }
    }`,
  },

  map(raw, index) {
    const report = new Report('')
    if (raw === null || typeof raw !== 'object') {
      report.fail('[' + index + ']', 'expected an object')
      return { ok: false, problems: report.problems }
    }
    const source = raw as Record<string, unknown>

    const id = text(report, 'id', source.id, { max: 64 })
    const at = id ?? '[' + index + ']'
    const scoped = new Report(at)
    if (id !== undefined && !ID_PATTERN.test(id)) {
      scoped.fail('id', '"' + id + '" does not match ' + ID_PATTERN)
    }

    const screenSentences = sentences(scoped, 'sentences', source.sentences)
    const city = stop(scoped, 'city', source.city)
    const skyStop = stop(scoped, 'sky', source.sky)
    const skySource = (source.sky ?? {}) as Record<string, unknown>
    const contactLabel = text(scoped, 'sky.contactLabel', skySource.contactLabel, { max: ABOUT.label })
    const auditLabel = text(scoped, 'sky.auditLabel', skySource.auditLabel, { max: ABOUT.label })
    const casesLabel = text(scoped, 'sky.casesLabel', skySource.casesLabel, { max: ABOUT.label })

    const problems = [...report.problems, ...scoped.problems]
    if (
      problems.length > 0 ||
      id === undefined ||
      screenSentences === undefined ||
      city === undefined ||
      skyStop === undefined ||
      contactLabel === undefined ||
      auditLabel === undefined ||
      casesLabel === undefined
    ) {
      return { ok: false, problems }
    }

    const value: AboutSectionContent = {
      id,
      sentences: screenSentences,
      city,
      sky: { ...skyStop, contactLabel, auditLabel, casesLabel },
    }
    const residual = aboutSectionProblems(value)
    if (residual.length > 0) return { ok: false, problems: residual }
    return { ok: true, value }
  },

  audit(items) {
    if (items.length <= 1) return []
    return [
      {
        path: 'aboutSection',
        message:
          'found ' +
          items.length +
          ' documents, expected at most one — src/content/about.ts reads the first ' +
          'and the rest would be invisible',
      },
    ]
  },

  emit: {
    file: 'aboutSection.ts',
    exportName: 'ABOUT_SECTION',
    typeAnnotation: 'AboutSectionContent[]',
    typeImport: { names: ['AboutSectionContent'], from: '../types' },
    description:
      'The Conócenos section: the five screen sentences that are its first stop, and the copy of the other two, as published. At most one record — see content/collections/aboutSection.collection.ts.',
  },
})
