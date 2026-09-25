/**
 * Vercel Routing Middleware: runs before every request, static files included.
 * The decision lives in `server/launchGate.ts`, where it is tested; this is
 * the adapter. Returning `undefined` lets the request through to the site.
 *
 * Not reached by `vite dev` or `vite preview`, so local work and the e2e suite
 * never see the countdown. Delete this file after the premiere.
 */

import { launchGate } from './server/launchGate.js'

export default function middleware(request: Request): Response | undefined {
  return launchGate(request, process.env, Date.now())
}
