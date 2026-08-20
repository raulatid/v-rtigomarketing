import { DEBUG_TOOLS_ENABLED } from './buildFlags'

// The audit form's submission transport — the ONE seam between the form's
// presentation and whatever will eventually deliver a request.
//
// There is no backend yet, deliberately: the real audit-request integration is
// a separate task. What exists now is the CONTRACT the form is built against,
// so the presentation ships its full state model (idle → submitting →
// success | error) today and the integration later replaces one function.
//
// THE PRODUCTION RULE, recorded where the integration will land: the form may
// only enter `success` after a real submission request has resolved. Nothing
// in this module may fake that in a production build — see the demo split
// below. When the real transport is written it replaces the demo branch, keeps
// the signature, and adds the privacy notice the form will then need (the
// legal implementation is deferred with it; see docs/plans).

/** The validated payload the form hands over. Values are already trimmed-ish
 *  user input; the transport owns any wire formatting. */
export interface AuditRequest {
  plan: string
  name: string
  email: string
  website: string
  phone: string
}

/** Resolves when the request has genuinely been delivered; rejects otherwise. */
export type SubmitAuditRequest = (data: AuditRequest) => Promise<void>

/**
 * Builds the transport. Split by `demoEnabled` so the two behaviours are
 * decided at ONE place, at build time, and testable in isolation:
 *
 * - Demo (dev, `vite preview`, Vercel Preview — every build a client demo runs
 *   on): resolves after a short delay so the submitting → success flow can be
 *   demonstrated. Nothing is logged and nothing leaves the browser.
 * - Production: REJECTS, always. No backend exists, so a resolved promise
 *   would show a person "Recibido" for a request nobody will ever read. The
 *   form turns this into its error state, which is the honest answer.
 */
export function createAuditTransport(demoEnabled: boolean, demoDelayMs = 700): SubmitAuditRequest {
  if (!demoEnabled) {
    return () =>
      Promise.reject(
        new Error('audit submission transport not implemented — see src/app/auditSubmission.ts'),
      )
  }
  return () =>
    new Promise((resolve) => {
      setTimeout(resolve, demoDelayMs)
    })
}

/** The transport the application binds. Demo everywhere except production. */
export const submitAuditRequest: SubmitAuditRequest = createAuditTransport(DEBUG_TOOLS_ENABLED)
