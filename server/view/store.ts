/**
 * The durable state behind the vantage endpoints: rate-limit counters and the
 * one key that says somebody has won.
 *
 * ── Why a store at all ──
 *
 * `server/rateLimit.ts` is per function instance, and says so: a flood spread
 * across instances meets fresh counters each time. That is fine for two forms
 * and useless as the bound on a brute force with a prize behind it. And
 * "first one wins" is a single atomic write that every instance must agree on.
 *
 * ── Why plain fetch ──
 *
 * Upstash exposes Redis over HTTPS, and `server/resend.ts` already argues why
 * forty lines of HTTP beat a vendor client in a function that holds a
 * credential. The upstream body is never passed on: every failure leaves as one
 * flat `StoreError` whose message carries a status, never the response text.
 */

export interface ViewStore {
  /** Increments a counter that expires `ttlSeconds` after its first increment. */
  incr(key: string, ttlSeconds: number): Promise<number>
  exists(key: string): Promise<boolean>
  /** Writes only if absent. True when this call wrote it — the atomic "first one wins". */
  setIfAbsent(key: string, value: string): Promise<boolean>
  get(key: string): Promise<string | null>
}

export class StoreError extends Error {}

export interface UpstashOptions {
  url: string
  token: string
  timeoutMs: number
  fetchImpl?: typeof fetch
}

type Command = Array<string | number>

export function createUpstashStore(options: UpstashOptions): ViewStore {
  const fetchImpl = options.fetchImpl ?? fetch

  async function pipeline(commands: Command[]): Promise<unknown[]> {
    let response: Response
    try {
      response = await fetchImpl(options.url + '/pipeline', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + options.token,
          'content-type': 'application/json',
        },
        body: JSON.stringify(commands),
        signal: AbortSignal.timeout(options.timeoutMs),
      })
    } catch (error) {
      throw new StoreError('store unreachable: ' + (error instanceof Error ? error.name : 'unknown'))
    }
    if (!response.ok) throw new StoreError('store answered ' + response.status)

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new StoreError('store answered with a body that is not JSON')
    }
    if (!Array.isArray(body) || body.length !== commands.length) {
      throw new StoreError('store answered with an unexpected shape')
    }
    return body.map((entry: unknown) => {
      const item = entry as { result?: unknown; error?: unknown } | null
      if (item === null || typeof item !== 'object' || 'error' in item) {
        throw new StoreError('store refused a command')
      }
      return item.result
    })
  }

  return {
    async incr(key, ttlSeconds) {
      // SET NX EX seeds the expiry exactly once, then INCR counts. Works on any
      // Redis version, unlike EXPIRE ... NX.
      const [, count] = await pipeline([
        ['SET', key, 0, 'EX', ttlSeconds, 'NX'],
        ['INCR', key],
      ])
      if (typeof count !== 'number') throw new StoreError('store answered INCR with a non-number')
      return count
    },
    async exists(key) {
      const [result] = await pipeline([['EXISTS', key]])
      return result === 1
    },
    async setIfAbsent(key, value) {
      const [result] = await pipeline([['SET', key, value, 'NX']])
      return result === 'OK'
    },
    async get(key) {
      const [result] = await pipeline([['GET', key]])
      return typeof result === 'string' ? result : null
    },
  }
}

/**
 * Tests, and the dev server with nothing configured. `readViewConfig` refuses
 * it in production: a cold start would forget the winner.
 */
export function createMemoryStore(now: () => number = Date.now): ViewStore {
  const values = new Map<string, { value: string; expiresAt: number }>()

  function read(key: string): string | null {
    const entry = values.get(key)
    if (entry === undefined) return null
    if (entry.expiresAt <= now()) {
      values.delete(key)
      return null
    }
    return entry.value
  }

  return {
    async incr(key, ttlSeconds) {
      const current = read(key)
      const count = (current === null ? 0 : Number(current)) + 1
      const expiresAt = current === null ? now() + ttlSeconds * 1000 : values.get(key)!.expiresAt
      values.set(key, { value: String(count), expiresAt })
      return count
    },
    async exists(key) {
      return read(key) !== null
    },
    async setIfAbsent(key, value) {
      if (read(key) !== null) return false
      values.set(key, { value, expiresAt: Infinity })
      return true
    },
    async get(key) {
      return read(key)
    },
  }
}
