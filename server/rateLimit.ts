/**
 * The cheap controls, and an honest account of what they are worth.
 *
 * ── What this is not ──
 *
 * It is not a rate limiter in the sense that word usually carries. The counters
 * live in ONE function instance's memory. Vercel runs as many instances as it
 * likes and reclaims them when it likes, so a determined flood spread across
 * instances sees a fresh set of counters each time, and a quiet hour empties
 * them by eviction rather than by policy.
 *
 * It was chosen over a durable store (Redis, Vercel KV) deliberately: that is
 * another service, another secret and another runtime dependency, for a
 * marketing site's two forms. The decision and its cost are recorded in
 * adr/014, and the upgrade path is to swap this module for one that awaits a
 * store — the interface is already async-shaped at the call site.
 *
 * ── What it is worth ──
 *
 * The realistic attack on these forms is not a targeted one. It is a script
 * that finds a form and posts to it a few thousand times, which would empty a
 * hundred-a-day Resend quota before anybody noticed and bury one real enquiry
 * under the rest. Against that, an in-memory window plus a honeypot plus a fill
 * time is most of the value for none of the operational weight.
 */

/** Nothing a person can fill in faster than this was filled by a person. */
export const MIN_FILL_MS = 3_000

/** A panel open longer than this is a tab somebody forgot, not a submission. */
export const MAX_FILL_MS = 60 * 60 * 1000

const WINDOW_MS = 60 * 60 * 1000

/** Beyond this many tracked senders, the oldest are dropped. See `size()`. */
const DEFAULT_MAX_ENTRIES = 5_000

export interface LimiterOptions {
  perIpPerHour: number
  perEmailPerHour: number
  /** Injected so a test can move an hour without waiting one. */
  now?: () => number
  maxEntries?: number
}

export interface LimitVerdict {
  allowed: boolean
  /** Whole seconds until the window reopens. Zero when allowed. */
  retryAfterSeconds: number
}

export interface Limiter {
  check(ip: string | null, email: string): LimitVerdict
  /** Tracked senders. Exposed so the bound on memory is testable. */
  size(): number
}

export type FillTimeVerdict = 'ok' | 'too-fast' | 'stale'

/**
 * Whether the form was filled at human speed.
 *
 * FORGEABLE, and worth saying plainly: `startedAt` is a number the client sends,
 * so anything that reads our JavaScript can send a plausible one. It costs a
 * scripted submission one extra step to look human, and that is the whole claim.
 *
 * A missing value is refused rather than waved through. Our own client always
 * sends one, so the only thing that gains from leniency is a caller that left it
 * out — which is precisely the caller this is about.
 */
export function fillTimeVerdict(startedAt: number | null, now: number): FillTimeVerdict {
  if (startedAt === null || !Number.isFinite(startedAt)) return 'too-fast'
  const elapsed = now - startedAt
  // A negative elapsed time means a clock from the future, which is either a
  // badly-set device or a forged value. Neither is a submission to accept.
  if (elapsed < MIN_FILL_MS) return 'too-fast'
  if (elapsed > MAX_FILL_MS) return 'stale'
  return 'ok'
}

/** One bucket for every request that arrives without a usable client address. */
const UNKNOWN_IP = 'ip:unknown'

export function createLimiter(options: LimiterOptions): Limiter {
  const now = options.now ?? Date.now
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES

  /** key → the timestamps inside the current window, oldest first. */
  const hits = new Map<string, number[]>()

  function prune(key: string, at: number): number[] {
    const kept = (hits.get(key) ?? []).filter((stamp) => at - stamp < WINDOW_MS)
    if (kept.length === 0) hits.delete(key)
    else hits.set(key, kept)
    return kept
  }

  /**
   * A Map iterates in insertion order, so the first keys out are the ones least
   * recently created. Good enough, and the point is only that the map cannot
   * grow without bound — an evicted sender gets a fresh allowance, which is the
   * same thing a new instance would give them.
   */
  function evict(): void {
    if (hits.size <= maxEntries) return
    for (const key of hits.keys()) {
      hits.delete(key)
      if (hits.size <= maxEntries) return
    }
  }

  function consider(key: string, cap: number, at: number): LimitVerdict {
    const kept = prune(key, at)
    if (kept.length >= cap) {
      const oldest = kept[0]
      const waitMs = Math.max(0, WINDOW_MS - (at - oldest))
      return { allowed: false, retryAfterSeconds: Math.ceil(waitMs / 1000) }
    }
    return { allowed: true, retryAfterSeconds: 0 }
  }

  return {
    check(ip, email) {
      const at = now()
      const ipKey = 'ip:' + (ip === null || ip.trim().length === 0 ? UNKNOWN_IP : ip.trim())
      // Mail servers treat the local part case-insensitively in practice, so
      // `A@b.com` must not buy a second allowance.
      const emailKey = 'email:' + email.trim().toLowerCase()

      // Both are consulted BEFORE either is recorded: a refusal must not spend
      // the other bucket's allowance.
      const byIp = consider(ipKey, options.perIpPerHour, at)
      if (!byIp.allowed) return byIp
      const byEmail = consider(emailKey, options.perEmailPerHour, at)
      if (!byEmail.allowed) return byEmail

      hits.set(ipKey, [...(hits.get(ipKey) ?? []), at])
      hits.set(emailKey, [...(hits.get(emailKey) ?? []), at])
      evict()

      return { allowed: true, retryAfterSeconds: 0 }
    },

    size() {
      return hits.size
    },
  }
}
