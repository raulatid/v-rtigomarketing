import { SubmissionError } from './submissionError'
import { readSubmissionResponse } from './submissionResponse'

// The audit form's submission transport — the ONE seam between the form's
// presentation and what delivers a request.
//
// ── What changed on 2026-09-04, and what did not ──
//
// There is a backend now: `api/audit.ts`, validating through `server/` and
// sending through Resend. This module posts to it.
//
// THE PRODUCTION RULE the previous version recorded is unchanged, and it is the
// reason this file is shaped the way it is: the form may only enter `success`
// after a real submission request has resolved. What moved is WHERE the
// demo/production split lives. It used to be here, keyed off the build flag —
// a demo build resolved after 700ms and a production build always rejected.
// It is now a decision the SERVER makes: it dry-runs when it has no API key,
// and refuses to dry-run in production at all (`server/config.ts`). That is
// strictly stronger, and it means the browser has exactly one code path, which
// is what lets `vite preview` and a Vercel Preview deployment exercise the real
// handler instead of a stub.
//
// The signature is untouched on purpose. `SubmitAuditRequest` is still
// `(data) => Promise<void>`, so `AuditSection.tsx` and its presentation tests
// did not change — the failure code rides on the rejection instead
// (`submissionError.ts`).

/** The validated payload the form hands over. Values are already trimmed-ish
 *  user input; the transport owns any wire formatting. */
export interface AuditRequest {
  /**
   * Which service the visitor is here about. Still `plan` on the wire after the
   * 2026-09-04 relabelling to "Servicio de interés" — the key is shared with
   * `server/validate.ts` and with submissions already in the client's inbox.
   */
  plan: string
  /**
   * Turnover band: one of the client's ranges from Sanity, verbatim — the
   * dropdown's label is its value. Never parsed; it travels as text into an
   * email a human reads.
   */
  revenue: string
  /**
   * Monthly budget: one of the client's brackets from Sanity, verbatim, on the
   * same terms as `revenue` (free text until 2026-09-18).
   */
  budget: string
  name: string
  email: string
  website: string
  phone: string
  /**
   * The honeypot: a field the panel renders but no person can see. Empty from
   * a human, anything else from something filling in every input it finds.
   * OPTIONAL so nothing that builds one of these has to know about it — the
   * transport sends `''` when it is absent, which is what a person produces.
   */
  empresa?: string
  /**
   * When the panel opened, in ms. The server refuses a form filled faster than
   * a person could. Optional for the same reason, and forgeable by anything
   * that reads this file — `server/rateLimit.ts` says what that is worth.
   */
  startedAt?: number
}

/** Resolves when the request has genuinely been delivered; rejects otherwise. */
export type SubmitAuditRequest = (data: AuditRequest) => Promise<void>

/** Same-origin, so the CSP's `connect-src 'self'` already permits it. */
export const AUDIT_ENDPOINT = '/api/audit'

/**
 * Long enough for a cold serverless function plus a mail provider, short enough
 * that a person is not left watching a spinner. The server's own upstream
 * budget is 10s and its function ceiling 15s, so this outlasts both and a
 * timeout here means the request never landed rather than that it was refused.
 */
const DEFAULT_TIMEOUT_MS = 20_000

export interface TransportOptions {
  /** Injected so the module is testable without a network. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Injected so the fill-time value is testable. */
  now?: () => number
}

export function createAuditTransport(options: TransportOptions = {}): SubmitAuditRequest {
  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const now = options.now ?? Date.now
  // When the module was created, which for the singleton below is when the page
  // loaded. The server only asks that a form was not filled impossibly fast.
  const openedAt = now()

  return async (data: AuditRequest): Promise<void> => {
    let response: Response
    try {
      response = await doFetch(AUDIT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...data,
          // Supplied by the panel, which owns both. The fallbacks are what a
          // person produces, so a caller that knows nothing about either — an
          // older test, a future form — still sends a plausible submission.
          empresa: data.empresa ?? '',
          startedAt: data.startedAt ?? openedAt,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch {
      // Includes the timeout. Either way the request did not land, and the one
      // thing that must not happen is a resolution.
      throw new SubmissionError('network')
    }

    await readSubmissionResponse(response)
  }
}

/** The transport the application binds. */
export const submitAuditRequest: SubmitAuditRequest = createAuditTransport()
