/**
 * Everything the endpoint decides, in one place that knows nothing about HTTP.
 *
 * It takes an already-parsed body and a set of injected dependencies, and it
 * returns a status and a body. That shape is not tidiness — it is what lets the
 * SAME code answer a Vercel `Request` in production and a Node
 * `IncomingMessage` in `vite preview`, which is the only way the Playwright
 * suite can exercise the real handler (its web server is `vite preview`, not
 * `vercel dev`).
 *
 * It is also what makes the rules testable. `api/audit.ts` and
 * `api/contact.ts` are left holding nothing but the translation, and they carry
 * no tests of their own on purpose: Vercel deploys every file under `api/` as a
 * route, so `api/handle.test.ts` would answer at a public URL.
 */

import type { MailConfig } from './config'
import type { Limiter } from './rateLimit'
import { fillTimeVerdict } from './rateLimit'
import { renderAuditEmail, renderContactEmail, type RenderedEmail } from './renderEmail'
import type { SendOutcome } from './resend'
import { parseAuditBody, parseContactBody, type ParseResult } from './validate'

export type SubmissionKind = 'audit' | 'contact'

export interface HandleInput {
  kind: SubmissionKind
  /** Already JSON-parsed by the adapter, and not trusted in any other way. */
  body: unknown
  /** The client address, when the platform gave us one. */
  ip: string | null
}

export interface HandleDeps {
  config: MailConfig
  limiter: Limiter
  send: (message: RenderedEmail, to: string) => Promise<SendOutcome>
  now: () => number
  /** The address published in the CMS. A function, so it is read per request. */
  cmsRecipient: () => string
  isProduction: boolean
  /** Server-side only. Never reaches a response body. */
  log?: (line: string) => void
}

/** What actually happened, reported only outside production. */
export type Delivery = 'sent' | 'dry-run' | 'discarded'

export type HandleBody =
  | { ok: true; delivery?: Delivery }
  | { ok: false; code: 'invalid'; fields: Record<string, string> }
  | { ok: false; code: 'rate_limited'; retryAfterSeconds: number }
  | { ok: false; code: 'upstream_failed' }

export interface HandleResult {
  status: 200 | 422 | 429 | 502
  body: HandleBody
}

/** Shown when a submission is refused for arriving impossibly fast. */
const TOO_FAST_RETRY_SECONDS = 30

function parse(kind: SubmissionKind, body: unknown) {
  return kind === 'audit'
    ? (parseAuditBody(body) as ParseResult<unknown>)
    : (parseContactBody(body) as ParseResult<unknown>)
}

export async function handleSubmission(
  input: HandleInput,
  deps: HandleDeps,
): Promise<HandleResult> {
  const { config, limiter, now, isProduction, log } = deps

  /** `delivery` is a development affordance: in production it would tell an
   *  unauthenticated caller whether the endpoint is configured to send. */
  const withDelivery = (delivery: Delivery): HandleBody =>
    isProduction ? { ok: true } : { ok: true, delivery }

  const parsed = parse(input.kind, input.body)
  if (!parsed.ok) {
    // Deliberately BEFORE the limiter is spent: three typos must not lock
    // somebody out of a form they never successfully sent.
    return { status: 422, body: { ok: false, code: 'invalid', fields: parsed.fields } }
  }

  // The honeypot, and the one place this codebase reports a success that did
  // not happen. A hidden input that no person can see was filled in, so there
  // is no person to mislead — and answering 422 here would tell the script
  // exactly which field to leave alone next time. Nothing is sent, and nothing
  // is counted against a human's allowance either.
  if (parsed.meta.honeypot.length > 0) {
    log?.('[mail] discarded: honeypot filled')
    return { status: 200, body: withDelivery('discarded') }
  }

  // Refused rather than silently discarded, because a person could in principle
  // trip this and they must not be handed a receipt for a message nobody will
  // read. A stale form is NOT refused: somebody who opens the panel, thinks
  // about it and comes back an hour later is a lead, not an attack.
  if (fillTimeVerdict(parsed.meta.startedAt, now()) === 'too-fast') {
    log?.('[mail] refused: submitted faster than a person could fill it')
    return {
      status: 429,
      body: { ok: false, code: 'rate_limited', retryAfterSeconds: TOO_FAST_RETRY_SECONDS },
    }
  }

  const value = parsed.value as { email: string }
  const verdict = limiter.check(input.ip, value.email)
  if (!verdict.allowed) {
    log?.('[mail] refused: over the hourly cap')
    return {
      status: 429,
      body: { ok: false, code: 'rate_limited', retryAfterSeconds: verdict.retryAfterSeconds },
    }
  }

  const message =
    input.kind === 'audit'
      ? renderAuditEmail(parsed.value as Parameters<typeof renderAuditEmail>[0])
      : renderContactEmail(parsed.value as Parameters<typeof renderContactEmail>[0])

  if (config.mode === 'dry-run') {
    log?.('[mail] dry run (' + config.reason + '): ' + message.subject)
    return { status: 200, body: withDelivery('dry-run') }
  }

  // The override exists because Resend's sandbox sender can only deliver to the
  // account owner; with a verified domain it is absent and the CMS wins.
  const to = config.toOverride ?? deps.cmsRecipient()
  const outcome = await deps.send(message, to)

  if (!outcome.ok) {
    // The detail is logged and never forwarded: an upstream error body can
    // quote the API key back at us.
    log?.('[mail] not delivered: ' + outcome.detail)
    return { status: 502, body: { ok: false, code: 'upstream_failed' } }
  }

  log?.('[mail] delivered ' + outcome.id)
  return { status: 200, body: withDelivery('sent') }
}
