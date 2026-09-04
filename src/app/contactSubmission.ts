import { SubmissionError, type SubmissionErrorCode } from './submissionError'

// The contact form's submission transport. Same contract, same production rule
// and same shape as the audit form's — `auditSubmission.ts` records the full
// reasoning, including what changed when the backend arrived on 2026-09-04.
//
// STILL duplicated rather than shared, and the original reason is unchanged:
// the two forms must be able to get real backends independently, and a common
// factory would couple their payloads through the one seam that exists to keep
// them apart. Each file names its own endpoint and its own request type. What
// they DO share is `submissionError.ts` — the vocabulary a failure is reported
// in, which is not a payload and would be worse for having two spellings.

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

function codeForStatus(status: number, body: unknown): SubmissionErrorCode {
  const declared =
    body !== null && typeof body === 'object' ? (body as { code?: unknown }).code : undefined
  if (typeof declared === 'string') {
    const known: SubmissionErrorCode[] = [
      'invalid',
      'rate_limited',
      'not_configured',
      'upstream_failed',
    ]
    const match = known.find((code) => code === declared)
    if (match !== undefined) return match
  }
  if (status === 422) return 'invalid'
  if (status === 429) return 'rate_limited'
  if (status === 500) return 'not_configured'
  if (status === 502 || status === 503 || status === 504) return 'upstream_failed'
  return 'unknown'
}

function fieldsIn(body: unknown): Record<string, string> | undefined {
  if (body === null || typeof body !== 'object') return undefined
  const fields = (body as { fields?: unknown }).fields
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
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

    let body: unknown = null
    try {
      body = (await response.json()) as unknown
    } catch {
      body = null
    }

    if (!response.ok) {
      throw new SubmissionError(codeForStatus(response.status, body), fieldsIn(body))
    }

    // A 2xx alone is not a delivery. See auditSubmission.ts.
    const ok = body !== null && typeof body === 'object' && (body as { ok?: unknown }).ok === true
    if (!ok) throw new SubmissionError('unknown')
  }
}

/** The transport the application binds. */
export const submitContactRequest: SubmitContactRequest = createContactTransport()
