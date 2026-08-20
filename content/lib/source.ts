import fs from 'node:fs'
import path from 'node:path'
import type { SourceSpec } from '../collections/types'

/**
 * Where records come from.
 *
 * One interface, three implementations: fixtures for development and tests, the
 * committed seed for emergency recovery, and WordPress REST for production. The
 * generator holds a `ContentSource` and never learns which one it has, so the
 * whole pipeline — mapping, validation, the transaction — is exercised in CI
 * against fixtures long before a WordPress instance exists.
 */
export interface ContentSource {
  /** Named in the build log, so a deployment says where its content came from. */
  readonly describe: string
  fetchAll(spec: SourceSpec): Promise<unknown[]>
}

export class SourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SourceError'
  }
}

/**
 * Reads `<dir>/<postType>.json`.
 *
 * Used for `--source=fixture` (development, CI, and the hostile-input tests) and
 * for `--source=seed` (the committed emergency snapshot). Same code, different
 * directory: the seed is not a different KIND of source, it is the same records
 * from a different place, and giving it its own adapter would be two code paths
 * where one is exercised constantly and the other only in an emergency.
 */
export function fileSource(dir: string, label: string): ContentSource {
  return {
    describe: label + ' (' + dir + ')',
    async fetchAll(spec) {
      const file = path.join(dir, spec.postType + '.json')
      let raw: string
      try {
        raw = fs.readFileSync(file, 'utf8')
      } catch {
        throw new SourceError('no such file: ' + file)
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch (error) {
        throw new SourceError(file + ' is not valid JSON: ' + String(error))
      }
      if (!Array.isArray(parsed)) {
        throw new SourceError(file + ' must contain an array of records')
      }
      return parsed
    },
  }
}

export interface WordPressOptions {
  /** REST root, e.g. `https://cms.example.com/wp-json/wp/v2`. */
  baseUrl: string
  /** Per request. The whole pull is bounded by the number of pages below. */
  timeoutMs?: number
  /** Injected so the pagination logic is testable without a network. */
  fetchImpl?: typeof fetch
  /** Optional read-only credential, sent as an Authorization header. */
  authorization?: string
}

/** WordPress caps `per_page` at 100. Asking for more is a 400, not a bigger page. */
const PER_PAGE = 100

/**
 * Defensive stop. At 100 per page this is 10,000 records, far past anything this
 * site will hold — it exists so a server that returns a constant `X-WP-TotalPages`
 * cannot spin the build forever.
 */
const MAX_PAGES = 100

/**
 * WordPress REST, paginated.
 *
 * ── Pagination is implemented now, not later ──
 * Today's collections are six records and one. The registry is meant to carry
 * collections that are not, and a source adapter that silently returned the first
 * hundred records would be correct until the day it quietly was not — with the
 * missing content looking like an editorial mistake rather than a bug.
 *
 * ── The count is asserted, not assumed ──
 * `X-WP-Total` is compared against what was actually accumulated. A mismatch
 * means the collection changed between page requests, which produces a TORN
 * snapshot: page 1 from before an edit, page 2 from after, with a record either
 * duplicated across the boundary or missed entirely. That is a failure, not a
 * warning — a build is cheap to retry and a wrong deployment is not.
 *
 * ── Stable ordering ──
 * `orderby=slug` rather than the `date` default, so two pulls over unchanged
 * content produce identical output and a content diff means something. Date
 * ordering would reshuffle the file whenever an editor touched a post.
 */
export function wordPressSource(options: WordPressOptions): ContentSource {
  const doFetch = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 15_000
  const base = options.baseUrl.replace(/\/+$/, '')

  return {
    describe: 'WordPress (' + base + ')',
    async fetchAll(spec) {
      const collected: unknown[] = []
      let page = 1
      let totalPages = 1
      let reportedTotal: number | null = null

      while (page <= totalPages) {
        if (page > MAX_PAGES) {
          throw new SourceError(
            spec.postType + ': exceeded ' + MAX_PAGES + ' pages; the server is not terminating',
          )
        }

        const url = new URL(base + '/' + spec.postType)
        url.searchParams.set('per_page', String(PER_PAGE))
        url.searchParams.set('page', String(page))
        url.searchParams.set('orderby', 'slug')
        url.searchParams.set('order', 'asc')
        if (spec.fields?.length) url.searchParams.set('_fields', spec.fields.join(','))

        const response = await withTimeout(doFetch, url.toString(), timeoutMs, options.authorization)

        if (!response.ok) {
          throw new SourceError(
            spec.postType + ': ' + response.status + ' ' + response.statusText + ' from ' + url.pathname,
          )
        }

        const body = (await response.json()) as unknown
        if (!Array.isArray(body)) {
          throw new SourceError(spec.postType + ': expected an array on page ' + page)
        }
        collected.push(...body)

        if (page === 1) {
          totalPages = readCount(response.headers.get('X-WP-TotalPages'), 1)
          reportedTotal = readCount(response.headers.get('X-WP-Total'), -1)
        }
        page += 1
      }

      if (reportedTotal !== null && reportedTotal >= 0 && reportedTotal !== collected.length) {
        throw new SourceError(
          spec.postType +
            ': X-WP-Total says ' +
            reportedTotal +
            ' but ' +
            collected.length +
            ' were returned. The collection changed mid-pull, so this snapshot would be torn.',
        )
      }
      return collected
    },
  }
}

function readCount(header: string | null, fallback: number): number {
  if (header === null) return fallback
  const parsed = Number.parseInt(header, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

/**
 * Every request carries a deadline.
 *
 * A hung CMS must fail the build, not hold the runner until the platform's own
 * timeout kills it with a less useful message. `AbortController` plus an explicit
 * clear, so a fast response does not leave a timer holding the event loop open.
 */
async function withTimeout(
  doFetch: typeof fetch,
  url: string,
  timeoutMs: number,
  authorization?: string,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await doFetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new SourceError('timed out after ' + timeoutMs + 'ms: ' + url)
    }
    throw new SourceError('request failed: ' + url + ' (' + String(error) + ')')
  } finally {
    clearTimeout(timer)
  }
}
