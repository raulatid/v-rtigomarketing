import fs from 'node:fs'
import path from 'node:path'
import type { SanitySourceSpec } from '../collections/types'

/**
 * Where records come from.
 *
 * One interface, three implementations: fixtures for development and tests, the
 * committed seed for emergency recovery, and Sanity for production. The
 * generator holds a `ContentSource` and never learns which one it has, so the
 * whole pipeline — mapping, validation, the transaction — is exercised in CI
 * against fixtures without a Sanity project existing at all.
 */
export interface ContentSource {
  /** Named in the build log, so a deployment says where its content came from. */
  readonly describe: string
  fetchAll(spec: SanitySourceSpec): Promise<unknown[]>
}

export class SourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SourceError'
  }
}

/**
 * Reads `<dir>/<type>.json`.
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
      const file = path.join(dir, spec.type + '.json')
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

/**
 * Every request carries a deadline.
 *
 * A hung CMS must fail the build, not hold the runner until the platform's own
 * timeout kills it with a less useful message. `AbortController` plus an explicit
 * clear, so a fast response does not leave a timer holding the event loop open.
 */
export async function withTimeout(
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
