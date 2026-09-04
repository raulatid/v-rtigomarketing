/**
 * The HTTP shell: a Web `Request` in, a Web `Response` out.
 *
 * Written against the web standard rather than against Vercel's types on
 * purpose. It means `api/audit.ts` and `api/contact.ts` are four lines each, it
 * means this file is unit-testable with nothing but `new Request(...)`, and it
 * means the same function can serve the dev and preview servers through a Vite
 * middleware — which is the only way the Playwright suite ever reaches it,
 * since its web server is `vite preview` and not `vercel dev`.
 */

import { readMailConfig, type MailConfig, type MailEnv } from './config'
import { handleSubmission, type SubmissionKind, type HandleBody } from './handleSubmission'
import { createLimiter, type Limiter } from './rateLimit'
import { cmsRecipient } from './recipient'
import { sendEmail } from './resend'

/**
 * Bigger than any legitimate submission — the message field caps at 2000
 * characters — and small enough that a hostile body is refused before anything
 * tries to parse it.
 */
export const BODY_LIMIT_BYTES = 16 * 1024

/**
 * ONE limiter per function instance, deliberately module-scoped.
 *
 * This is the whole of the "in-memory, best effort" claim: a second instance
 * has its own counters, and a recycled instance starts again. `rateLimit.ts`
 * says what that is and is not worth.
 */
let limiter: Limiter | null = null

function limiterFor(config: MailConfig): Limiter {
  if (limiter === null) {
    limiter = createLimiter({
      perIpPerHour: config.perIpPerHour,
      perEmailPerHour: config.perEmailPerHour,
    })
  }
  return limiter
}

/** The module-scoped limiter is state, and a test needs to start from zero. */
export function resetLimiterForTests(): void {
  limiter = null
}

export interface RespondOptions {
  now?: () => number
  /** Server-side only. Defaults to `console`; a test passes a spy. */
  log?: (line: string) => void
  fetchImpl?: typeof fetch
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // An answer about one person's submission is never a cacheable document.
      'cache-control': 'no-store',
      ...headers,
    },
  })
}

/**
 * The first hop is the client; the rest are proxies that appended themselves.
 * Spoofable by anyone talking to the origin directly, which is why the address
 * is one input to a best-effort limiter and never an identity.
 */
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded !== null && forwarded.trim().length > 0) {
    return forwarded.split(',')[0].trim()
  }
  return request.headers.get('x-real-ip')
}

export async function respond(
  kind: SubmissionKind,
  request: Request,
  env: MailEnv,
  options: RespondOptions = {},
): Promise<Response> {
  const log = options.log ?? ((line: string) => console.log(line))

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { allow: 'POST' } })
  }
  if (request.method !== 'POST') {
    return json(405, { ok: false, code: 'method_not_allowed' }, { allow: 'POST' })
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return json(415, { ok: false, code: 'unsupported_media_type' })
  }

  // Checked before the stream is touched, so an oversized body costs nothing.
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > BODY_LIMIT_BYTES) {
    return json(400, { ok: false, code: 'malformed' })
  }

  let raw: string
  try {
    raw = await request.text()
  } catch {
    return json(400, { ok: false, code: 'malformed' })
  }
  // A content-length header is a claim; this is the measurement.
  if (raw.length > BODY_LIMIT_BYTES) {
    return json(400, { ok: false, code: 'malformed' })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return json(400, { ok: false, code: 'malformed' })
  }

  const configResult = readMailConfig(env)
  if (!configResult.ok) {
    // The message names variables and sometimes quotes values, so it is LOGGED
    // and never returned. A caller learns only that the endpoint is not usable.
    log('[mail] not configured: ' + configResult.message)
    return json(500, { ok: false, code: 'not_configured' })
  }
  const config = configResult.config

  const result = await handleSubmission(
    { kind, body: parsed, ip: clientIp(request) },
    {
      config,
      limiter: limiterFor(config),
      now: options.now ?? Date.now,
      cmsRecipient,
      isProduction: (env.VERCEL_ENV ?? '').trim() === 'production',
      log,
      send: async (message, to) => {
        if (config.mode !== 'send') {
          // Unreachable: handleSubmission answers a dry run before it sends.
          // Kept as a refusal rather than a cast, because the alternative to an
          // impossible branch here is an accidental send.
          return { ok: false, reason: 'upstream_failed', detail: 'not configured to send' }
        }
        return sendEmail(message, {
          apiKey: config.apiKey,
          from: config.from,
          to,
          timeoutMs: config.timeoutMs,
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        })
      },
    },
  )

  const headers: Record<string, string> = {}
  const body = result.body as HandleBody
  if (result.status === 429 && 'retryAfterSeconds' in body) {
    headers['retry-after'] = String(body.retryAfterSeconds)
  }

  return json(result.status, result.body, headers)
}
