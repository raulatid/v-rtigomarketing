/**
 * The vocabulary a form's rejection carries.
 *
 * ── Why this is shared when the two transports are not ──
 *
 * `contactSubmission.ts` records the rule: the two forms are duplicated on
 * purpose, "so the two forms can get real backends independently, and a common
 * factory would couple their payloads through the one seam that exists to keep
 * them apart". That rule is about PAYLOADS and endpoints, and it still holds —
 * each transport names its own URL and its own request type.
 *
 * This is not a payload. It is the alphabet the two panels read a failure in,
 * and duplicating it would give the same sentence two spellings and let them
 * drift apart in a place a visitor can see.
 *
 * ── Why the code rides on a rejection instead of widening the signature ──
 *
 * `SubmitAuditRequest` stays `(data) => Promise<void>`, byte for byte. That is
 * what `AuditSection.tsx` and both presentation test files are written against,
 * and keeping it means those tests pass UNTOUCHED through this change — which
 * is the evidence that the seam the transport was built around actually held.
 */

export type SubmissionErrorCode =
  /** The server refused specific fields. `fields` says which. */
  | 'invalid'
  /** Too many submissions from this sender, or one that arrived impossibly fast. */
  | 'rate_limited'
  /** The endpoint is not configured to send. Never distinguished for a visitor. */
  | 'not_configured'
  /** The mail provider refused or timed out. Never distinguished for a visitor. */
  | 'upstream_failed'
  /** The request never reached the endpoint at all. */
  | 'network'
  /** Anything else, including a rejection thrown by an injected test transport. */
  | 'unknown'

export class SubmissionError extends Error {
  constructor(
    readonly code: SubmissionErrorCode,
    /** Per-field messages, in Spanish, only ever present for `invalid`. */
    readonly fields?: Readonly<Record<string, string>>,
  ) {
    super(code)
    this.name = 'SubmissionError'
  }
}

/**
 * Reads the code off an unknown rejection.
 *
 * Returns `'unknown'` for a plain `Error`, which is what the existing component
 * tests reject with — so they keep passing, and so a panel never has to care
 * where a failure came from.
 */
export function codeOf(error: unknown): SubmissionErrorCode {
  return error instanceof SubmissionError ? error.code : 'unknown'
}

/** The field messages, when the server sent any. */
export function fieldsOf(error: unknown): Readonly<Record<string, string>> | undefined {
  return error instanceof SubmissionError ? error.fields : undefined
}
