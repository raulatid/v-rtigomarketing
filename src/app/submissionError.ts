/** Shared failure vocabulary; each transport retains its own request contract. */
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
