import fs from 'node:fs'
import path from 'node:path'
import { Report, remoteMediaUrl, sanityImageDimensions } from './validate'
import { SourceError, withTimeout, type ContentSource } from './source'
import type { MediaRule } from '../collections/types'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'

/**
 * Mirrors CMS media into the deployment instead of hotlinking it.
 *
 * ── Why mirror at all ──
 * A logo referenced as `https://cdn.sanity.io/...` would mean an outbound
 * request from every visitor to a third party, a cross-origin draw into the
 * shared brand atlas, and a public site whose artwork depends on Sanity's CDN
 * being up — for content that is otherwise completely decoupled from the CMS at
 * runtime. Mirroring keeps `img-src 'self'` intact in `vercel.json` and keeps
 * ADR 010's promise that the browser never talks to the CMS.
 *
 * ── Why a decorator rather than a step in the mapper ──
 * `Collection.map` is synchronous and `generate()` is a pure loop over it, and
 * neither should learn about the network. `fetchAll` is already the async
 * vendor boundary, so wrapping a `ContentSource` puts the download exactly where
 * "a Sanity document becomes an internal record" already happens. `generate.ts`,
 * `emit.ts` and both mappers are untouched.
 *
 * ── Only the sanity source is wrapped ──
 * Fixtures and the seed already carry local paths. Wrapping them would be a
 * filesystem write in the one code path that is supposed to work offline.
 *
 * ── Determinism ──
 * Sanity asset URLs are content-addressed: the basename carries the asset hash,
 * so the same image always produces the same filename and the emitted module is
 * byte-identical across builds. That is what lets `emit.ts` claim determinism
 * while media is involved at all. It also means an existing file never needs
 * re-downloading — same name, same bytes.
 */

export interface MirrorOptions {
  /** Absolute directory the files land in, e.g. `<root>/public/logos`. */
  dir: string
  /** Public path the emitted reference uses, e.g. `/logos`. */
  publicPath: string
  /** Only media on this origin is fetched. */
  allowedOrigin: string
  timeoutMs?: number
  /** Injected so the mirror is testable without a network. */
  fetchImpl?: typeof fetch
  log?: (message: string) => void
}

/**
 * A mirrored file's name, taken from the CMS URL rather than invented.
 *
 * Asserted rather than trusted even though the origin was already checked: this
 * value becomes a path segment on disk AND a public URL, and `..` in either is a
 * different bug in each place.
 */
const SAFE_BASENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/** Guarded because the whole media library is fetched on a cold build. Shared with the Studio. */
const MAX_BYTES = EDITORIAL_BOUNDS.caseStudy.brandMarkBytes

export function withMediaMirror(inner: ContentSource, options: MirrorOptions): ContentSource {
  const doFetch = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 15_000
  const log = options.log ?? (() => {})

  return {
    describe: inner.describe,

    async fetchAll(spec) {
      const records = await inner.fetchAll(spec)
      const fields = spec.mirror
      if (fields === undefined || fields.length === 0) return records

      for (const [index, record] of records.entries()) {
        if (record === null || typeof record !== 'object') continue
        for (const field of fields) {
          const at = spec.type + '[' + index + '].' + field
          const remote = readPath(record as Record<string, unknown>, field)
          // An absent logo is legal — the atlas draws its own plate. Only a
          // value that is actually there is held to the contract.
          if (remote === null || remote === undefined || remote === '') continue

          const rule = spec.mediaRules?.[field]
          const url = validateRemote(at, remote, options.allowedOrigin, rule)
          if (rule !== undefined) assertGeometry(at, url, rule)
          const local = await mirrorOne(url, at, options, doFetch, timeoutMs, log)
          writePath(record as Record<string, unknown>, field, local)
        }
      }
      return records
    },
  }
}

/**
 * The same check the collections would have run, hoisted to where the fetch
 * happens — deciding whether we are willing to FETCH something is a different
 * question from deciding whether we are willing to SHIP a reference, and this is
 * the first of the two. Rejecting SVG here is the enforcement point of the logo
 * policy in `docs/content/sanity-media-contract.md`.
 */
function validateRemote(
  at: string,
  value: unknown,
  allowedOrigin: string,
  rule: MediaRule | undefined,
): string {
  const report = new Report('')
  const url = remoteMediaUrl(report, at, value, allowedOrigin, rule?.extensions)
  if (url === undefined) {
    const detail = report.problems.map((p) => p.message).join('; ')
    throw new SourceError(at + ': ' + (detail.length > 0 ? detail : 'is not a usable media URL'))
  }
  return url
}

/**
 * The geometry half of the media contract, checked before a byte is downloaded.
 *
 * Sanity puts the dimensions in the asset's own filename, so a logo that is too
 * small or the wrong shape is rejected without a fetch — and the message can
 * name the numbers, which is what makes it actionable in a build log.
 *
 * FAILS on shape, ADVISES on size — and the advice is the Studio's job.
 * Wrong artwork does not break the renderer: the atlas contain-fits anything.
 * A mark outside the aspect band draws too small to read, and no scaling can
 * fix that, so the build stops over it. A mark below its atlas box draws soft
 * — the atlas upscales it — which is a quality trade-off the editor can see
 * in the preview and choose to make; until 2026-09-19 this failed the build
 * too, which refused a brand whose only artwork was small. The Studio warns
 * (`brandMark.ts`); nothing here counts pixels.
 *
 * A URL whose name carries no dimensions is left alone — see
 * `sanityImageDimensions`. Sanity always supplies them; a hand-placed file is
 * not this function's business.
 */
function assertGeometry(at: string, url: string, rule: MediaRule): void {
  const size = sanityImageDimensions(url)
  if (size === undefined) return

  const actual = size.width + 'x' + size.height
  const aspect = size.width / size.height
  if (aspect < rule.minAspect || aspect > rule.maxAspect) {
    throw new SourceError(
      at +
        ': is ' +
        actual +
        ' (' +
        aspect.toFixed(2) +
        ':1), outside the allowed ' +
        rule.minAspect +
        ':1 to ' +
        rule.maxAspect +
        ':1',
    )
  }
}

async function mirrorOne(
  url: string,
  at: string,
  options: MirrorOptions,
  doFetch: typeof fetch,
  timeoutMs: number,
  log: (message: string) => void,
): Promise<string> {
  const name = path.posix.basename(new URL(url).pathname)
  if (!SAFE_BASENAME.test(name)) {
    throw new SourceError(at + ': "' + name + '" is not a usable media file name')
  }

  const file = path.join(options.dir, name)
  const publicRef = options.publicPath.replace(/\/+$/, '') + '/' + name

  // Content-addressed, so a file already here is already the right bytes.
  if (fs.existsSync(file)) return publicRef

  const response = await withTimeout(doFetch, url, timeoutMs)
  if (!response.ok) {
    // A published asset that 404s means the content and the media library
    // disagree. Shipping a silently logo-less case study is the quiet kind of
    // wrong this pipeline exists to prevent, so it fails the build instead.
    throw new SourceError(
      at + ': ' + response.status + ' ' + response.statusText + ' fetching ' + name,
    )
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength === 0) throw new SourceError(at + ': ' + name + ' is empty')
  if (bytes.byteLength > MAX_BYTES) {
    throw new SourceError(
      at + ': ' + name + ' is ' + bytes.byteLength + ' bytes, over the ' + MAX_BYTES + ' cap',
    )
  }

  fs.mkdirSync(options.dir, { recursive: true })
  fs.writeFileSync(file, bytes)
  log('mirrored ' + publicRef + ' (' + bytes.byteLength + ' bytes)')
  return publicRef
}

/**
 * Dotted paths only, no array wildcards.
 *
 * Nothing mirrors into an array today: editorial imagery stays on the CMS CDN by
 * decision, and only the brand logos — which are drawn into a WebGL atlas — are
 * brought in-house. Adding wildcards before there is a caller would be inventing
 * a traversal language nobody has used.
 */
function readPath(record: Record<string, unknown>, field: string): unknown {
  let cursor: unknown = record
  for (const key of field.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[key]
  }
  return cursor
}

function writePath(record: Record<string, unknown>, field: string, value: string): void {
  const keys = field.split('.')
  const last = keys.pop()
  if (last === undefined) return
  let cursor: Record<string, unknown> = record
  for (const key of keys) {
    const next = cursor[key]
    if (next === null || typeof next !== 'object') return
    cursor = next as Record<string, unknown>
  }
  cursor[last] = value
}
