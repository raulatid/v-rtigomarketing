/**
 * Vercel Web Analytics and Speed Insights, behind the visitor's analytics
 * consent — the first vendor `consent.ts` gates (DECISIONS §35).
 *
 * ── Why there is no `@vercel/*` package ──
 *
 * Both packages declare `@remix-run/react@^2` as an optional peer, which pins
 * React 18, so `npm install` — the install Vercel runs on every deploy — fails
 * with ERESOLVE against this project's React 19. And in an app that is not Next,
 * Nuxt or SvelteKit, what they do is this file: a command queue on `window`, a
 * `beforeSend` hook pushed onto it, and a deferred same-origin script that
 * drains the queue. The `server/resend.ts` argument applies: a dependency for
 * forty lines is surface, not help.
 *
 * ── Consent, both ways ──
 *
 * Nothing loads until the stored record says `analytics: true`. A loaded script
 * cannot be unloaded, so withdrawal — in this tab or another, which `consent.ts`
 * relays — is honoured by `beforeSend` reading the live record and dropping
 * every event from then on.
 */

import { VERCEL_INSIGHTS_ENABLED } from '../platform/buildFlags'
import { hasConsent, subscribeConsent } from './consent'

type Command = (...params: unknown[]) => void

/** The queue name each script drains, and where Vercel serves it. */
const SCRIPTS = [
  { queue: 'va', src: '/_vercel/insights/script.js' },
  { queue: 'si', src: '/_vercel/speed-insights/script.js' },
] as const

let loaded = false

/** The packages' `initQueue`: calls made before the script arrives are kept. */
function commandQueue(name: string): Command {
  const scope = window as unknown as Record<string, unknown>
  if (typeof scope[name] !== 'function') {
    scope[name] = (...params: unknown[]) => {
      const pending = (scope[name + 'q'] ??= []) as unknown[][]
      pending.push(params)
    }
  }
  return scope[name] as Command
}

function dropWithoutConsent<T>(event: T): T | null {
  return hasConsent('analytics') ? event : null
}

function load() {
  for (const { queue, src } of SCRIPTS) {
    commandQueue(queue)('beforeSend', dropWithoutConsent)
    const script = document.createElement('script')
    script.src = src
    script.defer = true
    document.head.appendChild(script)
  }
}

/** Called once per document, by each entry. Loads on the first consenting record. */
export function startVercelInsights(): void {
  if (!VERCEL_INSIGHTS_ENABLED) return
  subscribeConsent((record) => {
    if (loaded || record === null || !record.analytics) return
    loaded = true
    load()
  })
}
