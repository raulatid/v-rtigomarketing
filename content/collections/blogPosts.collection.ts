import type { BlogBlock, BlogPost, EmbedBlock, ImageMedia, VideoBlock } from '../../src/content/types'
import { ID_PATTERN, collectionProblems } from '../../src/content/invariants'
import { BLOG_TEXT_POLICY, richBlocks } from '../lib/portableText'
import { Report, boundedArray, matching, oneOf, slug, text } from '../lib/validate'
import { imageMedia, optionalImageMedia } from './media'
import { collection } from './types'

/**
 * Blog posts: modelled now, rendered later.
 *
 * ── Why model it before there is a blog ──
 * The alternative was a `body: string[]` placeholder, and the client will need
 * headings, links, lists, images and eventually video. Shipping a format already
 * known to be insufficient buys a content migration on live editorial copy in
 * exchange for nothing.
 *
 * ── Nothing imports the generated module, and that is a hard rule ──
 * The application entry chunk has a 320,000 B budget with roughly 2 KB spare
 * (`vite.config.ts`). A static import of the whole blog dataset from the WebGL
 * entry point would blow it, and the failure would look like a bundler problem
 * rather than a content one. `checks/architecture.ts` asserts the absence.
 * When a blog UI arrives it belongs behind route-level lazy loading.
 *
 * ── Video and embeds are boundaries, not features ──
 * There is no transcoding pipeline and no player. What exists is the schema, so
 * an editor who needs video later does not force a migration to get it. An
 * embed is stored as PROVIDER plus url, never as pasted markup, so a renderer
 * builds its own iframe from parts that were validated here.
 */

const TITLE_MAX = 120
const EXCERPT_MAX = 300
const TAGS_MAX = 8
const BODY_BLOCKS_MAX = 400

/** Hosts each provider is allowed to serve from. An allowlist, not a hint. */
const EMBED_HOSTS: Record<EmbedBlock['provider'], readonly string[]> = {
  youtube: ['www.youtube.com', 'youtube.com', 'youtu.be'],
  vimeo: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'],
}

const EMBED_PROVIDERS = ['youtube', 'vimeo'] as const

const VIDEO_URL = /^https:\/\/[\w.-]+\/[\w./%-]+$/

/** Sanity's datetime field, e.g. `2026-08-23T09:30:00.000Z`. */
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

function publishedAt(report: Report, path: string, value: unknown): string | undefined {
  const raw = matching(report, path, value, ISO_DATETIME, 'an ISO 8601 date and time')
  if (raw === undefined) return undefined
  // The pattern accepts month 19 and day 45. A date that parses is the actual
  // requirement, since ordering is `publishedAt desc` and an unparseable value
  // would sort somewhere arbitrary rather than fail.
  if (Number.isNaN(Date.parse(raw))) return report.fail(path, '"' + raw + '" is not a real date')
  return raw
}

function video(report: Report, path: string, source: Record<string, unknown>): VideoBlock | undefined {
  const src = matching(report, path + '.src', source.src, VIDEO_URL, 'an https video url')
  const poster = optionalImageMedia(report, path + '.poster', source.poster)
  if (src === undefined || poster === undefined) return undefined
  return poster === null ? { kind: 'video', src } : { kind: 'video', src, poster }
}

function embed(report: Report, path: string, source: Record<string, unknown>): EmbedBlock | undefined {
  const provider = oneOf(report, path + '.provider', source.provider, EMBED_PROVIDERS)
  if (typeof source.url !== 'string') {
    return report.fail(path + '.url', 'expected a string')
  }
  let url: URL
  try {
    url = new URL(source.url.trim())
  } catch {
    return report.fail(path + '.url', '"' + source.url + '" is not an absolute URL')
  }
  if (url.protocol !== 'https:') return report.fail(path + '.url', 'must be https')
  if (provider === undefined) return undefined
  // Parsed host against an allowlist, never a string prefix: the whole point of
  // storing a provider is that the renderer can build its own iframe, and that
  // is only safe if the url really belongs to the provider it claims.
  if (!EMBED_HOSTS[provider].includes(url.hostname)) {
    return report.fail(
      path + '.url',
      url.hostname + ' is not a ' + provider + ' host (' + EMBED_HOSTS[provider].join(', ') + ')',
    )
  }
  return { kind: 'embed', provider, url: url.toString() }
}

/**
 * The body, which mixes Portable Text blocks with custom objects.
 *
 * Runs of consecutive `_type: 'block'` items go to `richBlocks` together so a
 * list spanning several of them is still grouped into one list; anything else is
 * mapped on its own. Order is preserved exactly.
 */
function body(report: Report, path: string, raw: unknown): BlogBlock[] | undefined {
  if (!Array.isArray(raw)) return report.fail(path, 'expected an array of blocks')
  if (raw.length === 0) return report.fail(path, 'must have at least one block')
  if (raw.length > BODY_BLOCKS_MAX) {
    return report.fail(path, 'has ' + raw.length + ' blocks, over the ' + BODY_BLOCKS_MAX + ' limit')
  }

  const out: BlogBlock[] = []
  let failed = false
  let i = 0

  while (i < raw.length) {
    const item = raw[i]
    const type =
      item !== null && typeof item === 'object'
        ? (item as Record<string, unknown>)._type
        : undefined

    if (type === 'block') {
      const start = i
      while (i < raw.length) {
        const next = raw[i]
        const nextType =
          next !== null && typeof next === 'object'
            ? (next as Record<string, unknown>)._type
            : undefined
        if (nextType !== 'block') break
        i += 1
      }
      // The slice keeps the reported index aligned with the author's array.
      const scoped = new Report('')
      const converted = richBlocks(scoped, path, raw.slice(start, i), BLOG_TEXT_POLICY)
      for (const problem of scoped.problems) report.fail(problem.path, problem.message)
      if (converted === undefined) failed = true
      else out.push(...converted)
      continue
    }

    const at = path + '[' + i + ']'
    i += 1
    if (item === null || typeof item !== 'object') {
      report.fail(at, 'expected a block object')
      failed = true
      continue
    }
    const source = item as Record<string, unknown>

    let mapped: BlogBlock | undefined
    if (type === 'imageMedia') {
      const image = imageMedia(report, at, source.image ?? source)
      mapped = image === undefined ? undefined : { kind: 'image', image }
    } else if (type === 'videoMedia') {
      mapped = video(report, at, source)
    } else if (type === 'embedMedia') {
      mapped = embed(report, at, source)
    } else {
      report.fail(at, 'unsupported block type "' + String(type) + '"')
    }

    if (mapped === undefined) failed = true
    else out.push(mapped)
  }

  if (failed) return undefined
  return out
}

export const blogPostsCollection = collection<BlogPost>({
  key: 'blogPosts',
  source: {
    type: 'blogPost',
    // Newest first, with `_id` breaking ties: two posts scheduled for the same
    // minute would otherwise order arbitrarily and the emitted module would stop
    // being byte-stable across builds.
    orderBy: 'publishedAt desc, _id asc',
    projection: `{
      "id": slug.current,
      title,
      excerpt,
      publishedAt,
      tags,
      cover {
        "src": asset->url,
        "width": asset->metadata.dimensions.width,
        "height": asset->metadata.dimensions.height,
        alt
      },
      body[]{
        ...,
        _type == "imageMedia" => {
          _type,
          "src": asset->url,
          "width": asset->metadata.dimensions.width,
          "height": asset->metadata.dimensions.height,
          alt
        }
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

    const id = slug(report, 'id', source.id, ID_PATTERN)
    const at = id ?? '[' + index + ']'
    const scoped = new Report(at)

    const title = text(scoped, 'title', source.title, { max: TITLE_MAX })
    const excerpt = text(scoped, 'excerpt', source.excerpt, { max: EXCERPT_MAX })
    const published = publishedAt(scoped, 'publishedAt', source.publishedAt)
    const cover: ImageMedia | null | undefined = optionalImageMedia(scoped, 'cover', source.cover)
    // Tags share ID_PATTERN because a tag becomes a url segment and a filter key.
    const tags = boundedArray(scoped, 'tags', source.tags ?? [], TAGS_MAX, (r, p, v) =>
      slug(r, p, v, ID_PATTERN),
    )
    const blocks = body(scoped, 'body', source.body)

    const problems = [...report.problems, ...scoped.problems]
    if (
      problems.length > 0 ||
      id === undefined ||
      title === undefined ||
      excerpt === undefined ||
      published === undefined ||
      cover === undefined ||
      tags === undefined ||
      blocks === undefined
    ) {
      return { ok: false, problems }
    }

    return {
      ok: true,
      value: { id, title, excerpt, cover, publishedAt: published, tags, body: blocks },
    }
  },

  audit(items) {
    return collectionProblems(items, 'blogPosts')
  },

  emit: {
    file: 'blogPosts.ts',
    exportName: 'BLOG_POSTS',
    typeAnnotation: 'BlogPost[]',
    typeImport: { names: ['BlogPost'], from: '../types' },
    description:
      'Blog posts, as published. NOT imported by the application — see content/collections/blogPosts.collection.ts.',
  },
})
