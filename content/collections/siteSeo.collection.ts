import type { ImageMedia, PageSeo, SiteSeo } from '../../src/content/types'
import { DEFAULT_OG_IMAGE_PATH, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '../../src/content/blogPolicy'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'
import { ID_PATTERN, LOCAL_MEDIA_PATH, collectionProblems, siteSeoProblems } from '../../src/content/invariants'
import { Report, sanityImageDimensions, text } from '../lib/validate'
import { optionalImageMedia } from './media'
import { collection, type MediaRule } from './types'

/**
 * The site-wide `<head>`: the home page, the blog index and the favicon.
 *
 * ── Same document as siteSettings, separate module ──
 * The editor sees these fields in «Ajustes del sitio», beside the phones and
 * the form copy. The build reads that document twice: `siteSettings` for what
 * the application renders, and this collection for what only the HTML head
 * needs. `SITE_SETTINGS` is imported by the runtime bundle, so folding these
 * strings into it would ship them to every visitor as JavaScript that never
 * uses them. Only `vite.config.ts` imports `SITE_SEO`.
 *
 * ── Blog posts are not here ──
 * Each post carries its own SEO fields (`blogPost.seoTitle`, …), rendered by
 * `postHead()` in `scripts/blogShell.ts`.
 */

/**
 * Bounded only against the absurd, like a post's SEO fields and for the same
 * reason: 60 and 160 are where Google truncates, which the Studio warns about
 * while the editor types. A build that then refused to deploy would be told it
 * was fine and then broken.
 */
const SEO_FIELD_MAX = 2000

/**
 * What each page's head said before the CMS had these fields, verbatim.
 *
 * The SUCCESS_FALLBACKS reasoning in `siteSettings.collection.ts`: a dataset
 * that predates the fields builds the exact head it built yesterday, and filling
 * one in is an improvement rather than a migration. `index.html` and
 * `blog.html` carry the same text between their seo markers, so the dev server
 * shows it too; `scripts/siteHead.test.ts` keeps the two in step.
 *
 * The home page's share line is shorter than its meta description, as it always
 * was. An editor who writes a description replaces both, because two fields for
 * one sentence is a distinction nobody editing a site should have to hold.
 */
export const SITE_SEO_FALLBACKS = {
  home: {
    title: 'Vertigo — Marketing que se mide',
    description:
      'Vertigo: agencia de marketing orientada a resultados. Casos reales, métricas reales y auditoría gratuita de tu presencia digital.',
    shareDescription: 'Casos reales, métricas reales y auditoría gratuita de tu presencia digital.',
  },
  blog: {
    title: 'Blog — Vertigo',
    description:
      'Lo que aprendemos trabajando con datos reales, escrito para quien firma el presupuesto.',
    shareDescription:
      'Lo que aprendemos trabajando con datos reales, escrito para quien firma el presupuesto.',
    image: {
      src: DEFAULT_OG_IMAGE_PATH,
      alt: 'Vértigo',
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
    },
  },
} as const satisfies { home: PageSeo; blog: PageSeo & { image: ImageMedia } }

const FAVICON_MIN_SIDE = EDITORIAL_BOUNDS.siteSettings.faviconMinSide

/**
 * PNG only, and square. Checked by `content/lib/mirror.ts` before the file is
 * fetched. Not SVG: the pipeline refuses editor-uploaded SVG everywhere,
 * because it is a document that can carry script and this one would be served
 * from the site's own origin. Not WebP: Safari's tab strip and the iOS home
 * screen are where a favicon that fails to decode would go unnoticed longest.
 */
const FAVICON_RULE: MediaRule = { extensions: ['png'], minAspect: 1, maxAspect: 1 }

const blank = (value: unknown): boolean => value === null || value === undefined || value === ''

/** One SEO string: the fallback when blank, validated like any text when present. */
function seoText(report: Report, path: string, raw: unknown, fallback: string): string | undefined {
  if (blank(raw)) return fallback
  return text(report, path, raw, { max: SEO_FIELD_MAX })
}

/**
 * The favicon's mirrored path, or `null` when none was uploaded.
 *
 * The mirror has already refused a non-PNG or non-square file. What is left is
 * the size, read off the Sanity filename (`<hash>-512x512.png`), which the
 * mirror keeps verbatim. A local path that claims no size is a fixture, and is
 * trusted as fixtures are.
 */
function favicon(report: Report, path: string, raw: unknown): string | null | undefined {
  if (blank(raw)) return null
  if (typeof raw !== 'string' || !LOCAL_MEDIA_PATH.test(raw)) {
    return report.fail(path, 'must be a mirrored local path, got ' + JSON.stringify(raw))
  }
  if (!raw.toLowerCase().endsWith('.png')) return report.fail(path, 'must be a PNG')
  const size = sanityImageDimensions(raw)
  if (size !== undefined) {
    if (size.width !== size.height) {
      return report.fail(path, 'must be square, got ' + size.width + 'x' + size.height)
    }
    if (size.width < FAVICON_MIN_SIDE) {
      return report.fail(
        path,
        'is ' + size.width + ' px wide; the smallest usable favicon is ' + FAVICON_MIN_SIDE + ' px',
      )
    }
  }
  return raw
}

export const siteSeoCollection = collection<SiteSeo>({
  key: 'siteSeo',
  source: {
    type: 'siteSettings',
    // The same singleton `siteSettings` reads, ordered for the same reason.
    orderBy: '_id asc',
    mirror: ['favicon'],
    mirrorDir: 'media/site',
    mediaRules: { favicon: FAVICON_RULE },
    // The share images keep the shape a post's `ogImage` has: they stay on the
    // CDN, and `ogImageUrl()` crops them to 1200x630 when the head is written.
    // The favicon is projected to a URL STRING, which is what the mirror needs.
    projection: `{
      "id": "site",
      homeSeoTitle,
      homeMetaDescription,
      homeOgImage {
        "src": asset->url,
        "width": asset->metadata.dimensions.width,
        "height": asset->metadata.dimensions.height,
        alt,
        caption
      },
      blogSeoTitle,
      blogMetaDescription,
      blogOgImage {
        "src": asset->url,
        "width": asset->metadata.dimensions.width,
        "height": asset->metadata.dimensions.height,
        alt,
        caption
      },
      "favicon": favicon.asset->url
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
    const scoped = new Report(id ?? '[' + index + ']')
    if (id !== undefined && !ID_PATTERN.test(id)) {
      scoped.fail('id', '"' + id + '" does not match ' + ID_PATTERN)
    }

    const home = SITE_SEO_FALLBACKS.home
    const homeTitle = seoText(scoped, 'homeSeoTitle', source.homeSeoTitle, home.title)
    const homeDescription = seoText(scoped, 'homeMetaDescription', source.homeMetaDescription, home.description)
    const homeImage = optionalImageMedia(scoped, 'homeOgImage', source.homeOgImage)

    const blog = SITE_SEO_FALLBACKS.blog
    const blogTitle = seoText(scoped, 'blogSeoTitle', source.blogSeoTitle, blog.title)
    const blogDescription = seoText(scoped, 'blogMetaDescription', source.blogMetaDescription, blog.description)
    const blogImage = optionalImageMedia(scoped, 'blogOgImage', source.blogOgImage)

    const icon = favicon(scoped, 'favicon', source.favicon)

    const problems = [...report.problems, ...scoped.problems]
    if (
      problems.length > 0 ||
      id === undefined ||
      homeTitle === undefined ||
      homeDescription === undefined ||
      homeImage === undefined ||
      blogTitle === undefined ||
      blogDescription === undefined ||
      blogImage === undefined ||
      icon === undefined
    ) {
      return { ok: false, problems }
    }

    const value: SiteSeo = {
      id,
      home: {
        title: homeTitle,
        description: homeDescription,
        shareDescription: blank(source.homeMetaDescription) ? home.shareDescription : homeDescription,
        // Spread, so an unset image leaves the key out and the emitted module
        // stays byte-stable.
        ...(homeImage === null ? {} : { image: homeImage }),
      },
      blog: {
        title: blogTitle,
        description: blogDescription,
        shareDescription: blank(source.blogMetaDescription) ? blog.shareDescription : blogDescription,
        image: blogImage ?? { ...blog.image },
      },
      ...(icon === null ? {} : { favicon: icon }),
    }

    const residual = siteSeoProblems(value)
    if (residual.length > 0) return { ok: false, problems: residual }

    return { ok: true, value }
  },

  audit(items) {
    const problems = collectionProblems(items, 'siteSeo')
    // The same singleton guard `siteSettings` has, over the same document type.
    if (items.length > 1) {
      problems.push({
        path: 'siteSeo',
        message: 'found ' + items.length + ' siteSettings documents, expected exactly one',
      })
    }
    return problems
  },

  emit: {
    file: 'siteSeo.ts',
    exportName: 'SITE_SEO',
    typeAnnotation: 'SiteSeo[]',
    typeImport: { names: ['SiteSeo'], from: '../types' },
    description:
      'The home page, blog index and favicon head, as published. Build-only: read by vite.config.ts, never by the runtime bundle. See content/collections/siteSeo.collection.ts.',
  },
})
