/**
 * Google Analytics 4, behind the visitor's analytics consent — the second
 * vendor `consent.ts` gates, alongside Vercel's (`vercelInsights.ts`).
 *
 * ── Why not the snippet Google hands out ──
 *
 * The snippet is an inline `<script>` in `<head>`, and `script-src` carries no
 * `'unsafe-inline'` (`scripts/vercelConfig.test.ts`). It would also load before
 * the visitor answers. So the queue it defines lives here, in the bundle, and
 * the remote script is appended only on the first consenting record.
 *
 * ── Consent, both ways ──
 *
 * Only analytics is ever granted: advertising storage and signals stay denied
 * whatever the banner says, because the banner never asks about them.
 *
 * A loaded script cannot be unloaded. Withdrawal sets Google's documented
 * `ga-disable-<id>` switch, which stops every hit, and removes the `_ga`
 * cookies already written. Consent Mode's `analytics_storage: 'denied'` alone
 * would still send cookieless pings, which is not what "no" means here.
 */

import { GOOGLE_ANALYTICS_ENABLED } from '../platform/buildFlags'
import { subscribeConsent } from './consent'

export const MEASUREMENT_ID = 'G-G3W0LS6QEX'
const SCRIPT_SRC = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`
const DISABLE_KEY = `ga-disable-${MEASUREMENT_ID}`

let loaded = false

type Scope = Record<string, unknown> & { dataLayer?: unknown[] }

/** Google's `gtag`: gtag.js only recognises an `arguments` object on the layer, not an array. */
function gtag(..._params: unknown[]): void {
  const scope = window as unknown as Scope
  scope.dataLayer ??= []
  scope.dataLayer.push(arguments)
}

/**
 * `_ga` and `_ga_<container>` are written on the widest domain the browser
 * accepts, which from here is unknown — so each suffix of the hostname is tried.
 */
function clearCookies() {
  const names = document.cookie
    .split(';')
    .map((part) => part.split('=')[0].trim())
    .filter((name) => name === '_ga' || name.startsWith('_ga_'))
  const labels = location.hostname.split('.')
  for (const name of names) {
    document.cookie = `${name}=; Max-Age=0; path=/`
    for (let i = 0; i < labels.length - 1; i++) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.${labels.slice(i).join('.')}`
    }
  }
}

function load() {
  gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
  gtag('js', new Date())
  gtag('config', MEASUREMENT_ID)
  const script = document.createElement('script')
  script.src = SCRIPT_SRC
  script.async = true
  document.head.appendChild(script)
}

/** Called once per document, by each entry. Loads on the first consenting record. */
export function startGoogleAnalytics(): void {
  if (!GOOGLE_ANALYTICS_ENABLED) return
  subscribeConsent((record) => {
    const scope = window as unknown as Scope
    const granted = record !== null && record.analytics
    scope[DISABLE_KEY] = !granted
    if (!granted) {
      clearCookies()
      return
    }
    if (loaded) return
    loaded = true
    load()
  })
}
