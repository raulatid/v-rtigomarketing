import type { TowerScreenContent, TowerSlide, TowerSlideImage } from '../../src/content/types'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'
import {
  ID_PATTERN,
  LOCAL_MEDIA_PATH,
  collectionProblems,
  towerScreenProblems,
} from '../../src/content/invariants'
import { Report, boundedArray, num, oneOf, text } from '../lib/validate'
import { collection, type MediaRule } from './types'

/**
 * The Vértigo tower's LED screen: a singleton document of slides, each one a
 * fixed template filled from named slots.
 *
 * ── Slots, not blocks ──
 * The facade renderer takes blocks positioned in design metres
 * (`towerScreen/content/facadeComposition.ts`). None of that reaches the CMS:
 * an editor fills a headline, up to three lines, a figure, three captions and
 * a picture, and `layoutTowerSlides.ts` puts each on the grid the two bundled
 * slides were drawn on. What this mapper holds to is therefore LENGTH — the
 * measured capacity of each slot on a 42.8 m wall — and shape. The numbers
 * are in `EDITORIAL_BOUNDS.towerScreen`, shared with the Studio.
 *
 * ── The picture is mirrored, like a logo, not hotlinked, like a blog cover ──
 * The facade draws it into a canvas that becomes a texture, and a cross-origin
 * draw would taint the canvas. So `mirror` names the slot and the Sanity
 * source brings the file into `public/media/tower/` before this mapper sees
 * it; by then `src` is a local path, and a CDN url reaching here is a
 * pipeline defect, not an editorial one.
 *
 * ── Ids from position ──
 * A slide has no name an editor would recognise, and the rotation only needs
 * an order. `slide-1`, `slide-2`… from array position cannot collide and
 * cannot be forgotten; the Studio's `_key` is not projected.
 *
 * ── A singleton the build does not take on trust ──
 * `sanity.config.ts` shows one document. `audit` proves there is one, because
 * `src/content/tower.ts` reads `[0]` — the same arrangement as `siteSettings`.
 */

const TOWER = EDITORIAL_BOUNDS.towerScreen

/**
 * What an uploaded slide picture has to be, enforced by `content/lib/mirror.ts`
 * before it is fetched. JPEG is allowed here, unlike a logo: the slot is a
 * photograph on a dark wall, feathered into it by the renderer, and it has no
 * transparency to lose. Aspect band per the bounds table.
 */
const SLIDE_IMAGE_RULE: MediaRule = {
  extensions: ['png', 'webp', 'jpg', 'jpeg'],
  minAspect: TOWER.imageMinAspect,
  maxAspect: TOWER.imageMaxAspect,
}

const IMAGE_FITS = ['cover', 'contain'] as const

/** Absent, null or blank: the slot is empty and that is fine. */
const blank = (value: unknown): boolean => value === null || value === undefined || value === ''

/** An optional single-line slot: `null` when left empty, checked when filled. */
function optionalLine(report: Report, path: string, raw: unknown, max: number): string | null | undefined {
  if (blank(raw)) return null
  return text(report, path, raw, { max })
}

/**
 * True when nothing the projection resolves from the asset came back — the
 * same shape `media.ts` names: an editor touched the image field, or removed
 * the upload later, and the projection returns an object of nulls rather than
 * the null it returns for a field never touched.
 */
function assetless(source: Record<string, unknown>): boolean {
  return blank(source.src) && blank(source.width) && blank(source.height)
}

function image(
  report: Report,
  path: string,
  raw: unknown,
  fitRaw: unknown,
): TowerSlideImage | null | undefined {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'object') return report.fail(path, 'expected an image object')
  const source = raw as Record<string, unknown>
  if (assetless(source)) {
    return report.fail(path, 'no image was uploaded — upload one, or clear the whole field in the Studio')
  }

  // Local by the time it gets here: the mirror rewrote it, or the fixture was
  // written that way. Anything else is a picture the facade cannot draw.
  const src = typeof source.src === 'string' && LOCAL_MEDIA_PATH.test(source.src) ? source.src : undefined
  if (src === undefined) report.fail(path + '.src', 'must be a mirrored local path, got ' + JSON.stringify(source.src))
  const width = num(report, path + '.width', source.width, { min: 1, max: TOWER.imageMaxSide })
  const height = num(report, path + '.height', source.height, { min: 1, max: TOWER.imageMaxSide })
  if (width !== undefined && !Number.isInteger(width)) report.fail(path + '.width', 'must be whole pixels')
  if (height !== undefined && !Number.isInteger(height)) report.fail(path + '.height', 'must be whole pixels')
  // The fit is a radio with an initial value, so blank means a document from
  // before the field, or one an import wrote: the default, not a mistake.
  const fit = blank(fitRaw) ? 'cover' : oneOf(report, path + '.fit', fitRaw, IMAGE_FITS)

  if (src === undefined || width === undefined || height === undefined || fit === undefined) return undefined
  return { src, width, height, fit }
}

function slide(report: Report, path: string, raw: unknown, index: number): TowerSlide | undefined {
  if (raw === null || typeof raw !== 'object') return report.fail(path, 'expected an object')
  const source = raw as Record<string, unknown>

  const headline = text(report, path + '.headline', source.headline, { max: TOWER.headline })
  const items = blank(source.items)
    ? []
    : boundedArray(report, path + '.items', source.items, TOWER.listItems, (r, p, v) =>
        text(r, p, v, { max: TOWER.listItem }),
      )

  // The figure: a whole number or nothing. A sign or unit typed beside an empty
  // figure is not "no figure", it is half a figure, and is said so.
  let metric: TowerSlide['metric'] | undefined = null
  const prefix = optionalLine(report, path + '.metricPrefix', source.metricPrefix, TOWER.metricAffix)
  const suffix = optionalLine(report, path + '.metricSuffix', source.metricSuffix, TOWER.metricAffix)
  if (!blank(source.metricValue)) {
    const value = num(report, path + '.metricValue', source.metricValue, {
      min: -TOWER.metricValueMax,
      max: TOWER.metricValueMax,
    })
    if (value !== undefined && !Number.isInteger(value)) {
      report.fail(path + '.metricValue', 'must be a whole number — the screen counts up to it in ones')
    }
    if (value === undefined || prefix === undefined || suffix === undefined) metric = undefined
    else {
      metric = {
        value,
        ...(prefix === null ? {} : { prefix }),
        ...(suffix === null ? {} : { suffix }),
      }
    }
  } else if (prefix !== null || suffix !== null) {
    report.fail(path + '.metricValue', 'a prefix or suffix was given but no figure — add the number, or clear them')
    metric = undefined
  }

  const caption1 = optionalLine(report, path + '.caption1', source.caption1, TOWER.caption1)
  const caption2 = optionalLine(report, path + '.caption2', source.caption2, TOWER.caption)
  const caption3 = optionalLine(report, path + '.caption3', source.caption3, TOWER.caption)
  const picture = image(report, path + '.image', source.image, source.imageFit)

  if (
    headline === undefined ||
    items === undefined ||
    metric === undefined ||
    caption1 === undefined ||
    caption2 === undefined ||
    caption3 === undefined ||
    picture === undefined
  ) {
    return undefined
  }
  return { id: 'slide-' + (index + 1), headline, items, metric, caption1, caption2, caption3, image: picture }
}

export const towerScreenCollection = collection<TowerScreenContent>({
  key: 'towerScreen',
  source: {
    type: 'towerScreen',
    // One document, ordered anyway, for the same reason `siteSettings` is.
    orderBy: '_id asc',
    mirror: ['slides[].image.src'],
    mirrorDir: 'media/tower',
    mediaRules: { 'slides[].image.src': SLIDE_IMAGE_RULE },
    // `select(defined(image.asset) => …)` hands the mapper `null` for a slide
    // with no upload, rather than an object of nulls; an object of nulls is
    // what a field that was TOUCHED and never given a file looks like, and
    // the mapper says so in one sentence. The projection must give the mirror
    // a URL STRING at `image.src`: `asset->url`, not the asset object.
    projection: `{
      "id": "tower",
      rotationSeconds,
      slides[]{
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

    const rotationSeconds = num(scoped, 'rotationSeconds', source.rotationSeconds, {
      min: TOWER.rotationSecondsMin,
      max: TOWER.rotationSecondsMax,
    })
    if (rotationSeconds !== undefined && !Number.isInteger(rotationSeconds)) {
      scoped.fail('rotationSeconds', 'must be a whole number of seconds')
    }

    let slides: TowerSlide[] | undefined
    if (!Array.isArray(source.slides)) {
      slides = scoped.fail('slides', 'expected an array')
    } else if (source.slides.length === 0) {
      slides = scoped.fail('slides', 'at least one required — an empty screen on the landmark reads as a fault')
    } else if (source.slides.length > TOWER.slides) {
      slides = scoped.fail('slides', 'has ' + source.slides.length + ' entries, over the ' + TOWER.slides + ' limit')
    } else {
      const mapped = source.slides.map((entry, i) => slide(scoped, 'slides[' + i + ']', entry, i))
      slides = mapped.every((one): one is TowerSlide => one !== undefined) ? mapped : undefined
    }

    const problems = [...report.problems, ...scoped.problems]
    if (problems.length > 0 || id === undefined || rotationSeconds === undefined || slides === undefined) {
      return { ok: false, problems }
    }

    const value: TowerScreenContent = { id, rotationSeconds, slides }
    const residual = towerScreenProblems(value)
    if (residual.length > 0) return { ok: false, problems: residual }
    return { ok: true, value }
  },

  audit(items) {
    const problems = collectionProblems(items, 'towerScreen')
    if (items.length > 1) {
      problems.push({
        path: 'towerScreen',
        message:
          'found ' +
          items.length +
          ' documents, expected exactly one — src/content/tower.ts reads the first ' +
          'and the rest would be invisible',
      })
    }
    return problems
  },

  emit: {
    file: 'towerScreen.ts',
    exportName: 'TOWER_SCREEN',
    typeAnnotation: 'TowerScreenContent[]',
    typeImport: { names: ['TowerScreenContent'], from: '../types' },
    description:
      'The Vértigo tower screen: its slides and rotation, as published. Exactly one record — see content/collections/towerScreen.collection.ts.',
  },
})
