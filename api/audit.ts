/**
 * `POST /api/audit` — the audit form's endpoint.
 *
 * A twin of `api/contact.ts`, and duplicated for the same reason the two
 * transports on the client are: `src/app/auditSubmission.ts` records it as "the
 * two forms must be able to get real backends independently, and a common
 * factory would couple their payloads through the one seam that exists to keep
 * them apart". The shared part is `server/`, which both call; the route is not
 * the shared part.
 */

import { respond } from '../server/endpoint'

/**
 * Longer than the 10 s this endpoint allows its own upstream call, so a slow
 * Resend produces our mapped 502 rather than the platform's 504.
 */
export const config = { maxDuration: 15 }

export function POST(request: Request): Promise<Response> {
  return respond('audit', request, process.env)
}

export function OPTIONS(request: Request): Promise<Response> {
  return respond('audit', request, process.env)
}
