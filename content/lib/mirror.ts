import fs from 'node:fs'
import path from 'node:path'
import { Report, remoteMediaUrl, sanityImageDimensions } from './validate'
import { SourceError, withTimeout, type ContentSource } from './source'
import type { MediaRule, SanitySourceSpec } from '../collections/types'
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
  /**
   * The absolute `public/` directory, for a collection that names its own
   * folder (`SanitySourceSpec.mirrorDir`). Optional so the logo mirror's call
   * is unchanged; a collection with a `mirrorDir` and no root here fails the
   * build, since a guessed folder is a file in the wrong place.
   */
  publicRoot?: string
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

      const target = resolveTarget(spec, options)

      for (const [index, record] of records.entries()) {
        if (record === null || typeof record !== 'object') continue
        for (const field of fields) {
          for (const slot of locate(record as Record<string, unknown>, field)) {
            const at = spec.type + '[' + index + '].' + slot.path
            const remote = slot.holder[slot.key]
            // An absent picture is legal — the atlas draws its own plate, the
            // tower draws a text-only slide. Only a value that is actually
            // there is held to the contract.
            if (remote === null || remote === undefined || remote === '') continue

            const rule = spec.mediaRules?.[field]
            const url = validateRemote(at, remote, options.allowedOrigin, rule)
            if (rule !== undefined) assertGeometry(at, url, rule)
            slot.holder[slot.key] = await mirrorOne(url, at, target, doFetch, timeoutMs, log)
          }
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

/** Where one collection's files land and how the emitted reference names them. */
interface MirrorTarget {
  dir: string
  publicPath: string
}

/**
 * A collection that names its own folder gets it under `public/`; one that
 * does not gets the mirror's default, which is how the logos have always been
 * placed. The folder name is asserted for the same reason `SAFE_BASENAME` is:
 * it becomes a path on disk and a public URL, and `..` means a different
 * thing in each.
 */
const SAFE_DIR = /^[A-Za-z0-9][A-Za-z0-9_-]*(\/[A-Za-z0-9][A-Za-z0-9_-]*)*$/

function resolveTarget(spec: SanitySourceSpec, options: MirrorOptions): MirrorTarget {
  const sub = spec.mirrorDir
  if (sub === undefined) return { dir: options.dir, publicPath: options.publicPath }
  if (!SAFE_DIR.test(sub)) {
    throw new SourceError(spec.type + ': mirrorDir "' + sub + '" is not a usable folder name')
  }
  if (options.publicRoot === undefined) {
    throw new SourceError(spec.type + ': names mirrorDir "' + sub + '" but the mirror has no publicRoot')
  }
  return { dir: path.join(options.publicRoot, ...sub.split('/')), publicPath: '/' + sub }
}

async function mirrorOne(
  url: string,
  at: string,
  options: MirrorTarget,
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
 * One place a mirrored value lives: the object that holds it and the key it
 * sits under, so the local path can be written back where the url was read.
 * `path` is the field with every wildcard resolved to its index, for the log.
 */
interface MediaSlot {
  holder: Record<string, unknown>
  key: string
  path: string
}

/**
 * Dotted paths, with `[]` as the one wildcard: `slides[].image.src` is every
 * slide's picture.
 *
 * Until 2026-09-22 this was dotted paths only, on the argument that nothing
 * mirrored into an array and a traversal language with no caller is invented.
 * The tower's slides are the caller. Still no `[n]`, no `*` over object keys:
 * one wildcard for one shape, and the next one can argue for itself.
 *
 * A path that runs into something that is not there — a null slide, a record
 * with no `image` — yields no slot, which the caller reads as "absent, legal".
 */
function locate(record: Record<string, unknown>, field: string): MediaSlot[] {
  const keys = field.split('.')
  const last = keys.pop()
  if (last === undefined) return []
  let holders: Array<{ value: unknown; path: string }> = [{ value: record, path: '' }]
  for (const key of keys) {
    const next: Array<{ value: unknown; path: string }> = []
    const fanOut = key.endsWith('[]')
    const name = fanOut ? key.slice(0, -2) : key
    for (const holder of holders) {
      if (holder.value === null || typeof holder.value !== 'object') continue
      const value = (holder.value as Record<string, unknown>)[name]
      const at = holder.path === '' ? name : holder.path + '.' + name
      if (!fanOut) {
        next.push({ value, path: at })
      } else if (Array.isArray(value)) {
        value.forEach((entry, i) => next.push({ value: entry, path: at + '[' + i + ']' }))
      }
    }
    holders = next
  }
  const slots: MediaSlot[] = []
  for (const holder of holders) {
    if (holder.value === null || typeof holder.value !== 'object' || Array.isArray(holder.value)) continue
    slots.push({
      holder: holder.value as Record<string, unknown>,
      key: last,
      path: holder.path === '' ? last : holder.path + '.' + last,
    })
  }
  return slots
}
