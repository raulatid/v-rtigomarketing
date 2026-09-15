import { SubmissionError } from './submissionError'
import { readSubmissionResponse } from './submissionResponse'

// The contact form's submission transport. Same contract, same production rule
// and same shape as the audit form's — `auditSubmission.ts` records the full
// reasoning, including what changed when the backend arrived on 2026-09-04.
//
// Each transport owns its endpoint, payload and request lifetime. Response
// interpretation is shared in submissionResponse.ts so delivery and failure
// semantics stay consistent without coupling the two request types.

export interface ContactRequest {
  name: string
  email: string
  message: string
  /** The honeypot. See auditSubmission.ts. */
  empresa?: string
  /** When the dialog opened, in ms. See auditSubmission.ts. */
  startedAt?: number
}

/** Resolves when the message has genuinely been delivered; rejects otherwise. */
export type SubmitContactRequest = (data: ContactRequest) => Promise<void>

/** Same-origin, so the CSP's `connect-src 'self'` already permits it. */
export const CONTACT_ENDPOINT = '/api/contact'

/** Outlasts the server's own 10s upstream budget and its 15s function ceiling. */
const DEFAULT_TIMEOUT_MS = 20_000

export interface TransportOptions {
  /** Injected so the module is testable without a network. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
  now?: () => number
}

export function createContactTransport(options: TransportOptions = {}): SubmitContactRequest {
  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const now = options.now ?? Date.now
  const openedAt = now()

  return async (data: ContactRequest): Promise<void> => {
    let response: Response
    try {
      response = await doFetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...data,
          empresa: data.empresa ?? '',
          startedAt: data.startedAt ?? openedAt,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch {
      throw new SubmissionError('network')
    }

    await readSubmissionResponse(response)
  }
}

/** The transport the application binds. */
export const submitContactRequest: SubmitContactRequest = createContactTransport()
