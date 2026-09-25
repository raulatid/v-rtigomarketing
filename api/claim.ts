/**
 * `POST /api/claim` — the one-time claim behind the final vantage point.
 *
 * The decision lives in `server/view/respond.ts`, where it is tested; this is
 * the translation, as in `api/contact.ts`. Longer than `/api/view` because a
 * winning claim waits on the team notification.
 */

import { respondClaim } from '../server/view/respond.js'

export const config = { maxDuration: 15 }

export function POST(request: Request): Promise<Response> {
  return respondClaim(request, process.env)
}

export function OPTIONS(request: Request): Promise<Response> {
  return respondClaim(request, process.env)
}
