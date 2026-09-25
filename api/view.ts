/**
 * `POST /api/view` — where the city reports a camera at rest.
 *
 * The decision lives in `server/view/respond.ts`, where it is tested; this is
 * the translation, as in `api/contact.ts`.
 */

import { respondView } from '../server/view/respond.js'

export const config = { maxDuration: 10 }

export function POST(request: Request): Promise<Response> {
  return respondView(request, process.env)
}

export function OPTIONS(request: Request): Promise<Response> {
  return respondView(request, process.env)
}
