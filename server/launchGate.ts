/**
 * The launch gate: until the premiere, every request is answered with a
 * countdown instead of the site.
 *
 * It runs in `middleware.ts`, on Vercel, BEFORE the static files — so the
 * scene, the models, the blog and the API are all withheld, not merely hidden
 * behind a script. A countdown drawn by the page itself would be one disabled
 * script away from the whole site.
 *
 * Opening is a comparison against the clock, not a deployment: the real site
 * is deployed ahead of time and nothing has to run at midnight. Once the
 * moment passes the gate is inert, and deleting it is an ordinary change.
 *
 * Written against the web standard (`Request` in, `Response` out) for the same
 * reason as `endpoint.ts`: it is unit-testable with nothing but `new Request`.
 */

/**
 * 2026-09-26 00:00 in Madrid. Madrid is on CEST (UTC+2) until 25 October, so
 * that is 22:00 UTC on the 25th. Stated in UTC because the platform's clock is.
 */
export const LAUNCH_AT = Date.UTC(2026, 8, 25, 22, 0, 0)

/** The query parameter that trades the preview key for a cookie. */
export const KEY_PARAM = 'launch-key'
export const KEY_COOKIE = 'vertigo_launch_key'

/**
 * A key shorter than this is ignored and the gate stays shut for everyone:
 * a guessable key would be a gate in name only, and failing closed is the
 * mistake that can be noticed before midnight.
 */
export const KEY_MIN_LENGTH = 16

/** Served by the gate itself: `public/` publishes nothing outside its fixed roots. */
export const SCRIPT_PATH = '/__launch/countdown.js'

/** A week: enough to review before and after the premiere without re-entering it. */
const COOKIE_MAX_AGE_S = 7 * 24 * 60 * 60

export interface LaunchEnv {
  LAUNCH_PREVIEW_KEY?: string
}

/**
 * `undefined` lets the request through to the site; a `Response` answers it.
 * The same contract as Vercel's middleware, so the adapter is one line.
 */
export function launchGate(request: Request, env: LaunchEnv, now: number): Response | undefined {
  if (now >= LAUNCH_AT) return undefined

  const url = new URL(request.url)
  const key = previewKey(env)

  if (url.pathname === SCRIPT_PATH) return countdownScript()
  // The countdown page draws in the site's own faces. They are not the secret.
  if (url.pathname.startsWith('/fonts/')) return undefined

  if (key !== null) {
    const offered = url.searchParams.get(KEY_PARAM)
    if (offered !== null && sameKey(offered, key)) return unlock(url, key)
    if (sameKey(readCookie(request, KEY_COOKIE) ?? '', key)) return undefined
  }

  return countdownPage(LAUNCH_AT - now)
}

function previewKey(env: LaunchEnv): string | null {
  const key = env.LAUNCH_PREVIEW_KEY?.trim() ?? ''
  return key.length >= KEY_MIN_LENGTH ? key : null
}

/** Length-independent timing, so the key cannot be guessed a character at a time. */
function sameKey(offered: string, key: string): boolean {
  let diff = offered.length ^ key.length
  for (let i = 0; i < key.length; i++) {
    diff |= key.charCodeAt(i) ^ (offered.charCodeAt(i) || 0)
  }
  return diff === 0
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (header === null) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq !== -1 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return null
}

/** Sets the cookie and drops the key from the address bar, so it is not shared with the link. */
function unlock(url: URL, key: string): Response {
  const clean = new URL(url)
  clean.searchParams.delete(KEY_PARAM)
  return new Response(null, {
    status: 303,
    headers: {
      Location: clean.pathname + clean.search + clean.hash,
      'Set-Cookie':
        KEY_COOKIE + '=' + encodeURIComponent(key) +
        '; Path=/; Max-Age=' + COOKIE_MAX_AGE_S + '; HttpOnly; Secure; SameSite=Lax',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

/**
 * `no-store` everywhere: whatever the gate answers must not outlive it in a
 * browser or at the edge, or a visitor would keep the countdown after midnight.
 */
const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * 503 with `Retry-After` is how HTTP says "not yet": a crawler that arrives
 * early keeps nothing and comes back, which `noindex` alone would not promise.
 */
export function countdownPage(remainingMs: number): Response {
  return new Response(renderCountdown(remainingMs), {
    status: 503,
    headers: {
      ...NO_STORE,
      'Content-Type': 'text/html; charset=utf-8',
      'Retry-After': String(Math.max(1, Math.ceil(remainingMs / 1000))),
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  })
}

function countdownScript(): Response {
  return new Response(COUNTDOWN_SCRIPT, {
    headers: { ...NO_STORE, 'Content-Type': 'text/javascript; charset=utf-8' },
  })
}

/** `HH:MM:SS`, hours unbounded: the page may be opened days ahead. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return pad(Math.floor(total / 3600)) + ':' + pad(Math.floor(total / 60) % 60) + ':' + pad(total % 60)
}

/**
 * The remaining time is measured by the SERVER and handed to the page, which
 * only counts it down: a visitor's clock that is five minutes wrong still sees
 * the right number. At zero the page reloads with a little jitter, so every
 * open tab does not arrive in the same second.
 */
const COUNTDOWN_SCRIPT = `(() => {
  const el = document.getElementById('countdown');
  if (!el) return;
  const end = performance.now() + Number(el.dataset.remaining);
  const pad = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const total = Math.max(0, Math.ceil((end - performance.now()) / 1000));
    el.textContent = pad(Math.floor(total / 3600)) + ':' + pad(Math.floor(total / 60) % 60) + ':' + pad(total % 60);
    if (total === 0) {
      setTimeout(() => location.reload(), 1000 + Math.random() * 2000);
      return;
    }
    setTimeout(tick, 1000 - ((end - performance.now()) % 1000));
  };
  tick();
})();
`

function renderCountdown(remainingMs: number): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#050507">
<title>Vertigo · Muy pronto</title>
<style>
@font-face { font-family: 'Vertigo Display'; font-weight: 200 700; font-display: swap; src: url('/fonts/general-sans-variable-49d3fbd2.woff2') format('woff2'); }
* { box-sizing: border-box; margin: 0; }
html, body { height: 100%; }
body { display: grid; place-items: center; padding: 24px; background: #050507; color: #fff; font-family: 'Vertigo Display', system-ui, sans-serif; text-align: center; }
.count { font-weight: 300; font-size: clamp(56px, 14vw, 168px); line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
</style>
</head>
<body>
<main>
<p class="count" id="countdown" data-remaining="${Math.max(0, Math.round(remainingMs))}" role="timer" aria-live="off">${formatRemaining(remainingMs)}</p>
</main>
<script src="${SCRIPT_PATH}" defer></script>
</body>
</html>
`
}
