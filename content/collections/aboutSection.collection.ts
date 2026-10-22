import type { AboutSectionContent, AboutStop } from '../../src/content/types'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'
import { ID_PATTERN, aboutSectionProblems } from '../../src/content/invariants'
import { Report, boundedArray, text } from '../lib/validate'
import { SLIDE_IMAGE_RULE, slide } from './towerScreen.collection'
import { collection } from './types'

/**
 * The Conócenos section: the one slide the tower's screen shows while it is
 * open, which is all stop 1 says, the copy of the other two stops, and the
 * buttons of the last one.
 *
 * ── The slide is the tower screen's ──
 * Same template, same wall, same mapper (`slide` in `towerScreen.collection.ts`)
 * and the same mirrored pictures in `media/tower`. Exactly one: the screen is
 * stop 1's content and holds it for the whole visit. Its id is `about-slide`,
 * not one of the tower's `slide-<n>`, because the screen holds both at once
 * and picks what to show (`towerScreen/carousel.ts`, `setPlaylist`).
 *
 * ── A singleton that may be absent ──
 * Zero documents is allowed, unlike `towerScreen`. The section is new and its
 * copy is the client's to write; a build that failed until the document was
 * published would stop every deployment, code fixes included, on an editorial
 * step. With none, the tower's base names itself and goes nowhere, exactly as
 * before the section existed (`src/content/about.ts`). Two is still a fault.
 */

const ABOUT = EDITORIAL_BOUNDS.aboutSection
/** Apart from the tower's `slide-<n>`: the screen holds both. */
const ABOUT_SLIDE_ID = 'about-slide'

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
    mirror: ['slide.image.src'],
    mirrorDir: 'media/tower',
    mediaRules: { 'slide.image.src': SLIDE_IMAGE_RULE },
    // The slide's projection is `towerScreen`'s, field for field.
    projection: `{
      "id": "about",
      rooftop{ title, paragraphs },
      sky{ title, paragraphs, contactLabel, auditLabel, casesLabel },
      slide{
        headline,
        items,
        metricValue,
        metricPrefix,
        metricSuffix,
        caption1,
        caption2,
        caption3,
        imageFit,
        "image": select(defined(image.asset) => {
          "src": image.asset->url,
          "width": image.asset->metadata.dimensions.width,
          "height": image.asset->metadata.dimensions.height
        })
      }
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

    const rooftop = stop(scoped, 'rooftop', source.rooftop)
    const skyStop = stop(scoped, 'sky', source.sky)
    const skySource = (source.sky ?? {}) as Record<string, unknown>
    const contactLabel = text(scoped, 'sky.contactLabel', skySource.contactLabel, { max: ABOUT.label })
    const auditLabel = text(scoped, 'sky.auditLabel', skySource.auditLabel, { max: ABOUT.label })
    const casesLabel = text(scoped, 'sky.casesLabel', skySource.casesLabel, { max: ABOUT.label })

    const mapped =
      source.slide === undefined || source.slide === null
        ? scoped.fail('slide', 'required — it is stop 1, and the screen would go dark for the visit')
        : slide(scoped, 'slide', source.slide, 0)
    const screenSlide = mapped ? { ...mapped, id: ABOUT_SLIDE_ID } : undefined

    const problems = [...report.problems, ...scoped.problems]
    if (
      problems.length > 0 ||
      id === undefined ||
      rooftop === undefined ||
      skyStop === undefined ||
      contactLabel === undefined ||
      auditLabel === undefined ||
      casesLabel === undefined ||
      screenSlide === undefined
    ) {
      return { ok: false, problems }
    }

    const value: AboutSectionContent = {
      id,
      rooftop,
      sky: { ...skyStop, contactLabel, auditLabel, casesLabel },
      slide: screenSlide,
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
      'The Conócenos section: the screen slide that is its first stop, and the copy of the other two, as published. At most one record — see content/collections/aboutSection.collection.ts.',
  },
})
