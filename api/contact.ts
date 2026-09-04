/**
 * `POST /api/contact` — the contact dialog's endpoint.
 *
 * Everything this file could get wrong lives in `server/`, where it is unit
 * tested. What is left here is the translation between Vercel and the web
 * standard, and it is deliberately too small to hold a decision.
 *
 * There are no tests beside this file, and that is not an omission: Vercel
 * deploys EVERY file under `api/` as a route, so `api/contact.test.ts` would
 * answer at `https://…/api/contact.test`. `server/endpoint.test.ts` covers this
 * request path through `new Request(...)` instead.
 */

import { respond } from '../server/endpoint'

/**
 * Longer than the 10 s this endpoint allows its own upstream call, so a slow
 * Resend produces our mapped 502 rather than the platform's 504.
 */
export const config = { maxDuration: 15 }

export function POST(request: Request): Promise<Response> {
  return respond('contact', request, process.env)
}

export function OPTIONS(request: Request): Promise<Response> {
  return respond('contact', request, process.env)
}
