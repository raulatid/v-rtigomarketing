import { SubmissionError, type SubmissionErrorCode } from './submissionError'

/** Maps the endpoint's codes onto the vocabulary the panels read. */
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
  // A status with no body of ours — a platform 500, a proxy's 502 — still has
  // to become something the panel can render.
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

/** Both endpoints must confirm delivery explicitly before a form can succeed. */
export async function readSubmissionResponse(response: Response): Promise<void> {
  // Read once, and tolerate a body that is not ours.
  let body: unknown = null
  try {
    body = (await response.json()) as unknown
  } catch {
    body = null
  }

  if (!response.ok) {
    throw new SubmissionError(codeForStatus(response.status, body), fieldsIn(body))
  }

  // A 2xx is NOT enough. A proxy, a captive portal or a stray rewrite can all
  // answer 200 with something that is not this endpoint's answer, and reading
  // that as a delivered enquiry is exactly the lie this module exists to
  // refuse.
  const ok = body !== null && typeof body === 'object' && (body as { ok?: unknown }).ok === true
  if (!ok) throw new SubmissionError('unknown')
}
