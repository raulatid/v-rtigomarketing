import { DEBUG_TOOLS_ENABLED } from './buildFlags'

// The contact form's submission transport. Same contract, same production
// rule and same demo split as the audit form's — auditSubmission.ts records
// the full reasoning and is the file the real integration lands in first.
// Duplicated rather than shared on purpose: the two forms must be able to get
// real backends independently, and a common factory would couple their
// payloads through the one seam that exists to keep them apart.

export interface ContactRequest {
  name: string
  email: string
  message: string
}

/** Resolves when the message has genuinely been delivered; rejects otherwise. */
export type SubmitContactRequest = (data: ContactRequest) => Promise<void>

export function createContactTransport(
  demoEnabled: boolean,
  demoDelayMs = 700,
): SubmitContactRequest {
  if (!demoEnabled) {
    return () =>
      Promise.reject(
        new Error('contact submission transport not implemented — see src/app/contactSubmission.ts'),
      )
  }
  return () =>
    new Promise((resolve) => {
      setTimeout(resolve, demoDelayMs)
    })
}

/** The transport the application binds. Demo everywhere except production. */
export const submitContactRequest: SubmitContactRequest = createContactTransport(DEBUG_TOOLS_ENABLED)
