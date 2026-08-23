import type { SanitySourceSpec } from '../collections/types'
import { SourceError, withTimeout } from './source'

/**
 * Sanity, read once per collection through the Content Lake query API.
 *
 * ── One request, not a pagination loop ──
 * The WordPress adapter this replaces walked pages and asserted `X-WP-Total`
 * against what arrived, because a collection that changed between page 1 and
 * page 2 produced a TORN snapshot. One GROQ request removes that failure class
 * — but it does NOT make the read transactional. Sanity query visibility is
 * eventually consistent with recent mutations, so a build fired by a publish
 * webhook can in principle observe the state just before the publish. That is a
 * publication-freshness concern, documented in `adr/011`, and it is deliberately
 * NOT papered over with a sleep here.
 *
 * ── api.sanity.io, never apicdn.sanity.io ──
 * The build runs immediately after an editor publishes. A CDN-cached query
 * response is the one thing that would make a green deployment carry yesterday's
 * content, which is the exact failure this whole pipeline exists to prevent. The
 * host is hardcoded rather than configurable for that reason.
 *
 * ── No @sanity/client ──
 * The client library exists to solve problems this pipeline does not have:
 * browser caching, live queries, mutations, listeners. One `fetch` behind the
 * existing `ContentSource` interface keeps the dependency graph — and therefore
 * the browser bundle — exactly where it is.
 */

/**
 * Pinned, and changed only by a reviewed code change.
 *
 * This is protocol compatibility policy, not deployment configuration: it decides
 * how a response is SHAPED, and a shape change must be read by a human before it
 * reaches a build. `latest` would let Sanity change the contract between two
 * deployments of unchanged code. `.env.example` holds values a deployment picks;
 * this is not one of them.
 */
const SANITY_API_VERSION = '2026-08-23'

/**
 * The supported ceiling for one collection.
 *
 * The query asks for MAX_RECORDS + 1 and fails if it gets it. Asking for exactly
 * MAX_RECORDS and rejecting a full page would reject a legitimate collection of
 * exactly 1000 documents; the sentinel distinguishes "full" from "overflowing".
 * Silent truncation is not an option — a missing record looks like an editorial
 * decision rather than a bug.
 */
const MAX_RECORDS = 1000

/** Every collection is ordered. A spec that names none still gets a stable one. */
const DEFAULT_ORDER = '_id asc'

/**
 * Both are interpolated into the request URL, and the project id lands in the
 * HOST, so they are asserted rather than trusted. A typo'd or hostile value must
 * not be able to point the build's credentialed request at another origin — the
 * same reasoning `remoteMediaUrl` records under SEC-1: parse and compare, never
 * concatenate and hope.
 */
const PROJECT_ID_PATTERN = /^[a-z0-9]{1,64}$/
const DATASET_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

/** Source-controlled, but it is also the fixture basename, so it is bounded. */
const TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/

export interface SanityOptions {
  /** Sanity project id. Not a secret — it is in the hostname. */
  projectId: string
  /** Dataset name. Never defaulted for the caller; see scripts/build-content.ts. */
  dataset: string
  /** Override for tests only. Production pins SANITY_API_VERSION above. */
  apiVersion?: string
  /** Per request. One request per collection, so this bounds the whole pull. */
  timeoutMs?: number
  /** Injected so the adapter is testable without a network. */
  fetchImpl?: typeof fetch
  /** Read-only token, needed only for a private dataset. Sent as a Bearer header. */
  token?: string
}

export function sanitySource(options: SanityOptions) {
  const { projectId, dataset } = options
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw new SourceError('"' + projectId + '" is not a Sanity project id (lowercase alphanumeric)')
  }
  if (!DATASET_PATTERN.test(dataset)) {
    throw new SourceError('"' + dataset + '" is not a Sanity dataset name')
  }

  const doFetch = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 15_000
  const apiVersion = options.apiVersion ?? SANITY_API_VERSION
  // Composed once. Falsy — undefined OR the empty string a blank environment
  // variable produces — means NO header at all, never a bare `Bearer `.
  const authorization = options.token ? 'Bearer ' + options.token : undefined
  const endpoint = 'https://' + projectId + '.api.sanity.io/v' + apiVersion + '/data/query/' + dataset

  return {
    // Named in the build log by generate(). The token is never part of it.
    describe: 'Sanity (' + projectId + '/' + dataset + ')',

    async fetchAll(spec: SanitySourceSpec): Promise<unknown[]> {
      const query = buildQuery(spec)
      // encodeURIComponent, NOT URLSearchParams: the form-urlencoded serializer
      // writes a space as `+`, which round-trips cleanly back through
      // `searchParams.get` — so a naive test passes — while meaning something
      // else inside a GROQ string literal.
      const url = endpoint + '?query=' + encodeURIComponent(query)

      const response = await withTimeout(doFetch, url, timeoutMs, authorization)

      // A Response body can be read exactly once, so each branch below reads or
      // does not — never both.
      if (!response.ok) {
        const detail = await describeError(response)
        throw new SourceError(
          spec.type + ': ' + response.status + ' ' + response.statusText + ' from Sanity' + detail,
        )
      }

      let body: unknown
      try {
        body = (await response.json()) as unknown
      } catch (error) {
        // Wrapped here rather than left to escape: generate() would otherwise
        // report it as `caseStudies: SyntaxError: ...`, which reads like a mapper
        // bug rather than "the CMS returned an error page".
        throw new SourceError(spec.type + ': the response was not valid JSON (' + String(error) + ')')
      }

      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new SourceError(spec.type + ': expected a JSON object with a `result` field')
      }
      const envelope = body as { result?: unknown; error?: unknown }

      // Sanity reports a bad query as an `error` object. It normally arrives with
      // a non-2xx, but a 200 carrying one must not be read as "no records" — that
      // would empty a collection rather than fail the build.
      if (envelope.error !== undefined && envelope.error !== null) {
        throw new SourceError(spec.type + ': Sanity returned an error — ' + errorText(envelope.error))
      }
      if (!('result' in envelope)) {
        throw new SourceError(spec.type + ': the response had no `result` field')
      }
      if (!Array.isArray(envelope.result)) {
        throw new SourceError(spec.type + ': expected an array in `result`')
      }

      // The sentinel. The query asked for MAX_RECORDS + 1, so anything past the
      // ceiling proves the ceiling was PASSED rather than merely reached.
      if (envelope.result.length > MAX_RECORDS) {
        throw new SourceError(
          spec.type +
            ': more than ' +
            MAX_RECORDS +
            ' documents. Raise the cap deliberately in content/lib/sanity.ts — ' +
            'this build refuses to publish a silently truncated collection.',
        )
      }

      return envelope.result
    },
  }
}

/**
 * One collection, one query.
 *
 *   *[_type == "caseStudy" && !(_id in path("drafts.**"))]
 *     | order(slug.current asc)
 *     { ...projection... }
 *     [0...1001]
 *
 * ── Drafts are excluded in the FILTER ──
 * Not fetched and discarded afterwards. A build that pulls drafts has already put
 * unpublished copy in a Node process one mapping bug away from the emitted
 * module; excluding at the source means the build never holds it.
 *
 * ── The projection is concatenated verbatim ──
 * Whatever the collection wrote is what the server receives. This function does
 * not parse, rewrite or reformat GROQ: the only thing worse than a wrong query is
 * a wrong query that does not match what the collection file says.
 */
function buildQuery(spec: SanitySourceSpec): string {
  if (!TYPE_PATTERN.test(spec.type)) {
    throw new SourceError('"' + spec.type + '" is not a usable Sanity document type')
  }
  const projection = spec.projection.trim()
  if (!projection.startsWith('{') || !projection.endsWith('}')) {
    // Turns a forgotten brace into a named build failure instead of an opaque 400
    // carrying a GROQ parser message.
    throw new SourceError(spec.type + ': the projection must be a { ... } block')
  }
  return (
    '*[_type == "' +
    spec.type +
    '" && !(_id in path("drafts.**"))]' +
    ' | order(' +
    (spec.orderBy ?? DEFAULT_ORDER) +
    ') ' +
    projection +
    '[0...' +
    (MAX_RECORDS + 1) +
    ']'
  )
}

/** The useful head of an error body, bounded, or nothing. Never the URL. */
async function describeError(response: Response): Promise<string> {
  let body: string
  try {
    body = await response.text()
  } catch {
    return ''
  }
  const trimmed = body.trim().slice(0, 300)
  return trimmed.length === 0 ? '' : ' — ' + trimmed
}

function errorText(error: unknown): string {
  if (error !== null && typeof error === 'object') {
    const shaped = error as { description?: unknown; message?: unknown; type?: unknown }
    for (const candidate of [shaped.description, shaped.message, shaped.type]) {
      if (typeof candidate === 'string' && candidate.length > 0) return candidate
    }
  }
  return String(error)
}
